// ============================================================
// src/agent.ts - Bucle Principal del Agente con Tools y Memoria
// ============================================================

import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { spawnSync } from 'child_process';
import { resolve } from 'path';
import type { GLM47Provider } from './llm-provider.js';
import type { CogViewProvider } from './image-provider.js';
import type { CheckpointManager } from './checkpoint.js';
import type { MemoryStore } from './memory.js';
import type { AgentState, LLMMessage, LLMToolCall, ToolDefinition, ToolResult } from './types.js';
import { isSafePath, isWithinWorkspace, serializeError } from './types.js';

interface AgentConfig {
  llmProvider: GLM47Provider;
  imageProvider: CogViewProvider;
  checkpointManager: CheckpointManager;
  memoryStore: MemoryStore;
  workspaceRoot: string;
  maxSteps?: number;
  dryRun?: boolean;
  onStep?: (step: number, message: string) => void;
}

interface AgentResult {
  success: boolean;
  summary: string;
  stepsCompleted: number;
  filesCreated: string[];
  errors: string[];
}

// --- Definición de Herramientas ---

const FILE_TOOLS: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Lee el contenido de un archivo del workspace',
    parameters: [
      { name: 'path', type: 'string', description: 'Ruta relativa al archivo', required: true },
    ],
  },
  {
    name: 'write_file',
    description: 'Escribe contenido en un archivo del workspace',
    parameters: [
      { name: 'path', type: 'string', description: 'Ruta relativa al archivo', required: true },
      { name: 'content', type: 'string', description: 'Contenido a escribir', required: true },
    ],
  },
  {
    name: 'list_files',
    description: 'Lista archivos en un directorio del workspace',
    parameters: [
      { name: 'path', type: 'string', description: 'Ruta relativa al directorio', required: true },
    ],
  },
  {
    name: 'search_code',
    description: 'Busca un patrón de texto en los archivos del workspace',
    parameters: [
      { name: 'pattern', type: 'string', description: 'Patrón de búsqueda', required: true },
      { name: 'directory', type: 'string', description: 'Directorio base para buscar', required: false },
    ],
  },
  {
    name: 'run_command',
    description: 'Ejecuta un comando en la terminal del workspace',
    parameters: [
      { name: 'command', type: 'string', description: 'Comando a ejecutar', required: true },
      { name: 'args', type: 'string', description: 'Argumentos del comando (separados por espacio)', required: false },
    ],
  },
  {
    name: 'generate_image',
    description: 'Genera una imagen con CogView a partir de una descripción',
    parameters: [
      { name: 'prompt', type: 'string', description: 'Descripción de la imagen', required: true },
      { name: 'type', type: 'string', description: 'Tipo: icon, diagram, mockup, general', required: false, enum: ['icon', 'diagram', 'mockup', 'general'] },
    ],
  },
];

const SYSTEM_PROMPT = `Eres DevMind, un agente de ingeniería de software autónomo de alto nivel.

Tu trabajo es completar tareas de desarrollo de software de forma autónoma usando las herramientas disponibles.

FLUJO DE TRABAJO:
1. Analizá la tarea y creá un plan de acción
2. Ejecutá cada paso del plan usando las herramientas
3. Verificá los resultados después de cada paso
4. Corregí errores si los hay
5. Confirmá que la tarea está completa

REGLAS IMPORTANTES:
- Siempre usá rutas relativas al workspace
- Verificá que los archivos se crearon correctamente
- No ejecutés comandos destructivos sin confirmación
- Si algo falla, analizá el error y corregí antes de continuar
- Informá progreso claro en cada paso

HERRAMIENTAS DISPONIBLES:
- read_file: Leer archivos
- write_file: Crear/escribir archivos
- list_files: Listar directorios
- search_code: Buscar en el código
- run_command: Ejecutar comandos
- generate_image: Generar imágenes`;

export class Agent {
  private readonly config: AgentConfig;
  private readonly state: AgentState;
  private readonly messages: LLMMessage[] = [];
  private readonly filesCreated: string[] = [];
  private readonly errors: string[] = [];
  private stepCount = 0;

  constructor(config: AgentConfig) {
    this.config = config;

    this.state = {
      task: '',
      plan: [],
      currentStep: 0,
      completedSteps: [],
      files: [],
      errors: [],
    };
  }

  /**
   * Ejecuta una tarea completa de forma autónoma.
   */
  async execute(task: string): Promise<AgentResult> {
    this.state.task = task;

    // Cargar memoria relevante
    const memoryContext = await this.config.memoryStore.getContextForTask(task);

    // Inicializar mensajes
    const fullSystemPrompt = memoryContext
      ? `${SYSTEM_PROMPT}\n\n${memoryContext}`
      : SYSTEM_PROMPT;

    this.messages.push({ role: 'system', content: fullSystemPrompt });
    this.messages.push({
      role: 'user',
      content: `Tarea: ${task}\n\nWorkspace: ${this.config.workspaceRoot}\n\nCompletá esta tarea paso a paso.`,
    });

    const maxSteps = this.config.maxSteps ?? 25;

    while (this.stepCount < maxSteps) {
      this.stepCount++;

      try {
        // Guardar checkpoint cada 5 pasos
        if (this.stepCount % 5 === 0) {
          await this.config.checkpointManager.save(
            `task_${Date.now()}`,
            this.stepCount,
            this.state
          );
        }

        // Llamar al LLM
        const response = await this.config.llmProvider.call(
          this.messages,
          FILE_TOOLS
        );

        const choice = response.choices[0];
        if (!choice) break;

        const assistantMessage = choice.message;
        this.messages.push({
          role: 'assistant',
          content: assistantMessage.content || '',
          ...(assistantMessage.tool_calls ? {} : {}),
        });

        // Si no hay tool calls, verificar si terminó
        if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
          const content = assistantMessage.content || '';
          if (content.toLowerCase().includes('tarea completada') || content.toLowerCase().includes('task complete')) {
            // Almacenar aprendizaje en memoria
            await this.config.memoryStore.store(
              'learning',
              `Tarea completada: ${task}`,
              `Pasos: ${this.stepCount}, Archivos: ${this.filesCreated.join(', ')}`,
              1.0
            );
            break;
          }
          continue;
        }

        // Procesar tool calls
        for (const toolCall of assistantMessage.tool_calls) {
          const result = await this.executeTool(toolCall);

          this.messages.push({
            role: 'tool',
            content: result.output,
            tool_call_id: toolCall.id,
          });

          if (result.success) {
            this.config.onStep?.(this.stepCount, `${toolCall.function.name}: OK`);
          } else {
            this.config.onStep?.(this.stepCount, `${toolCall.function.name}: FALLÓ - ${result.error}`);
            this.errors.push(`${toolCall.function.name}: ${result.error}`);
          }
        }
      } catch (err) {
        const errMsg = serializeError(err);
        this.errors.push(`Step ${this.stepCount}: ${errMsg}`);
        this.config.onStep?.(this.stepCount, `Error: ${errMsg}`);

        // Almacenar error en memoria para evitar repetirlo
        await this.config.memoryStore.store(
          'error',
          errMsg,
          `Tarea: ${task}, Paso: ${this.stepCount}`,
          0.5
        );
      }
    }

    // Guardar checkpoint final
    await this.config.checkpointManager.save(
      `task_${Date.now()}_final`,
      this.stepCount,
      this.state
    );

    return {
      success: this.errors.length === 0,
      summary: this.generateSummary(),
      stepsCompleted: this.stepCount,
      filesCreated: this.filesCreated,
      errors: this.errors,
    };
  }

  /**
   * Ejecuta una herramienta individual de forma segura.
   */
  private async executeTool(toolCall: LLMToolCall): Promise<ToolResult> {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch {
      return { success: false, output: '', error: 'Argumentos JSON inválidos' };
    }

    if (this.config.dryRun) {
      return {
        success: true,
        output: `[DRY RUN] ${toolCall.function.name}(${JSON.stringify(args)})`,
      };
    }

    try {
      switch (toolCall.function.name) {
        case 'read_file':
          return await this.toolReadFile(args.path as string);
        case 'write_file':
          return await this.toolWriteFile(args.path as string, args.content as string);
        case 'list_files':
          return await this.toolListFiles(args.path as string);
        case 'search_code':
          return await this.toolSearchCode(args.pattern as string, args.directory as string);
        case 'run_command':
          return await this.toolRunCommand(args.command as string, args.args as string);
        case 'generate_image':
          return await this.toolGenerateImage(args.prompt as string, args.type as string);
        default:
          return { success: false, output: '', error: `Herramienta desconocida: ${toolCall.function.name}` };
      }
    } catch (err) {
      return { success: false, output: '', error: serializeError(err) };
    }
  }

  // --- Implementaciones de Herramientas ---

  private async toolReadFile(relativePath: string): Promise<ToolResult> {
    if (!isSafePath(relativePath)) {
      return { success: false, output: '', error: 'Ruta no permitida por seguridad' };
    }

    try {
      const fullPath = resolve(this.config.workspaceRoot, relativePath);
      if (!isWithinWorkspace(fullPath, this.config.workspaceRoot)) {
        return { success: false, output: '', error: 'Ruta fuera del workspace' };
      }
      const content = await readFile(fullPath, 'utf-8');
      this.state.files.push(relativePath);
      return { success: true, output: content.slice(0, 10000) }; // Limitar output
    } catch (err) {
      return { success: false, output: '', error: `No se pudo leer ${relativePath}: ${serializeError(err)}` };
    }
  }

  private async toolWriteFile(relativePath: string, content: string): Promise<ToolResult> {
    if (!isSafePath(relativePath)) {
      return { success: false, output: '', error: 'Ruta no permitida por seguridad' };
    }

    try {
      const fullPath = resolve(this.config.workspaceRoot, relativePath);
      if (!isWithinWorkspace(fullPath, this.config.workspaceRoot)) {
        return { success: false, output: '', error: 'Ruta fuera del workspace' };
      }
      await mkdir(resolve(fullPath, '..'), { recursive: true });
      await writeFile(fullPath, content, 'utf-8');
      this.filesCreated.push(relativePath);
      this.state.files.push(relativePath);
      this.state.completedSteps.push(`write:${relativePath}`);
      return { success: true, output: `Archivo creado: ${relativePath} (${content.length} bytes)` };
    } catch (err) {
      return { success: false, output: '', error: `No se pudo escribir ${relativePath}: ${serializeError(err)}` };
    }
  }

  private async toolListFiles(dirPath: string): Promise<ToolResult> {
    if (!isSafePath(dirPath)) {
      return { success: false, output: '', error: 'Ruta no permitida por seguridad' };
    }

    try {
      const fullPath = resolve(this.config.workspaceRoot, dirPath);
      if (!isWithinWorkspace(fullPath, this.config.workspaceRoot)) {
        return { success: false, output: '', error: 'Ruta fuera del workspace' };
      }
      const entries = await readdir(fullPath, { withFileTypes: true });
      const listing = entries.map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`);
      return { success: true, output: listing.join('\n') || '(directorio vacío)' };
    } catch (err) {
      return { success: false, output: '', error: `No se pudo listar ${dirPath}: ${serializeError(err)}` };
    }
  }

  private async toolSearchCode(pattern: string, directory?: string): Promise<ToolResult> {
    const dir = directory || '.';
    if (!isSafePath(dir)) {
      return { success: false, output: '', error: 'Ruta no permitida por seguridad' };
    }

    try {
      const fullPath = resolve(this.config.workspaceRoot, dir);
      if (!isWithinWorkspace(fullPath, this.config.workspaceRoot)) {
        return { success: false, output: '', error: 'Ruta fuera del workspace' };
      }
      const result = spawnSync('rg', [pattern, fullPath, '--max-count', '20', '--no-heading'], {
        encoding: 'utf-8',
        timeout: 15000,
        shell: false,
      });

      const output = result.stdout || 'Sin resultados';
      return { success: true, output: output.slice(0, 5000) };
    } catch (err) {
      return { success: false, output: '', error: `Búsqueda fallida: ${serializeError(err)}` };
    }
  }

  private async toolRunCommand(command: string, args?: string): Promise<ToolResult> {
    // Lista blanca de comandos seguros (sin node/cat que permiten ejecución arbitraria)
    const SAFE_COMMANDS = ['npm', 'npx', 'git', 'ls', 'echo', 'mkdir', 'cp', 'mv', 'tsc', 'eslint', 'rg', 'pwd'];

    const baseCommand = command.split('/')[0].split('\\')[0];
    if (!SAFE_COMMANDS.includes(baseCommand)) {
      return {
        success: false,
        output: '',
        error: `Comando "${baseCommand}" no permitido. Comandos seguros: ${SAFE_COMMANDS.join(', ')}`,
      };
    }

    try {
      const allArgs = args ? args.split(' ') : [];

      // Restringir subcomandos peligrosos de git
      if (baseCommand === 'git' && allArgs.length > 0) {
        const gitSub = allArgs[0];
        const BLOCKED_GIT_SUBCMDS = ['push', 'reset', 'clean', 'checkout', 'cherry-pick'];
        if (BLOCKED_GIT_SUBCMDS.includes(gitSub)) {
          return { success: false, output: '', error: `Subcomando git "${gitSub}" no permitido por seguridad` };
        }
      }

      const result = spawnSync(command, allArgs, {
        cwd: this.config.workspaceRoot,
        encoding: 'utf-8',
        timeout: 60000,
        shell: false,
      });

      const output = (result.stdout || '') + (result.stderr || '');
      const success = result.status === 0;

      return {
        success,
        output: output.slice(0, 5000),
        ...(success ? {} : { error: `Exit code ${result.status}` }),
      };
    } catch (err) {
      return { success: false, output: '', error: `Comando fallido: ${serializeError(err)}` };
    }
  }

  private async toolGenerateImage(prompt: string, type?: string): Promise<ToolResult> {
    try {
      let result;

      switch (type) {
        case 'icon':
          result = await this.config.imageProvider.generateIcon(prompt);
          break;
        case 'diagram':
          result = await this.config.imageProvider.generateDiagram(prompt);
          break;
        case 'mockup':
          result = await this.config.imageProvider.generateMockup(prompt);
          break;
        default:
          result = await this.config.imageProvider.generate(prompt);
      }

      if (result.success) {
        return {
          success: true,
          output: `Imagen generada: ${result.filePath || result.url}`,
        };
      }

      return { success: false, output: '', error: result.error || 'Error generando imagen' };
    } catch (err) {
      return { success: false, output: '', error: serializeError(err) };
    }
  }

  /**
   * Genera un resumen de la ejecución.
   */
  private generateSummary(): string {
    const parts: string[] = [];
    parts.push(`Tarea: ${this.state.task}`);
    parts.push(`Pasos ejecutados: ${this.stepCount}`);

    if (this.filesCreated.length > 0) {
      parts.push(`Archivos creados: ${this.filesCreated.join(', ')}`);
    }

    if (this.errors.length > 0) {
      parts.push(`Errores: ${this.errors.length}`);
      for (const err of this.errors.slice(0, 5)) {
        parts.push(`  - ${err}`);
      }
    }

    parts.push(`Estado: ${this.errors.length === 0 ? 'Completado exitosamente' : 'Completado con errores'}`);

    return parts.join('\n');
  }
}

/**
 * Función helper para ejecutar el agente con configuración simple.
 */
export async function agentLoop(
  task: string,
  config: Omit<AgentConfig, 'checkpointManager' | 'memoryStore'> & {
    checkpointManager?: CheckpointManager;
    memoryStore?: MemoryStore;
  }
): Promise<AgentResult> {
  const { checkpointManager, memoryStore, ...rest } = config;

  const cp = checkpointManager || new (await import('./checkpoint.js')).CheckpointManager(rest.workspaceRoot);
  const mem = memoryStore || new (await import('./memory.js')).MemoryStore(rest.workspaceRoot);

  await cp.init();
  await mem.init();

  const agent = new Agent({
    ...rest,
    checkpointManager: cp,
    memoryStore: mem,
  });

  return agent.execute(task);
}


