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
  // DevMind 3.0
  autoMutation?: boolean;
  a2aEnabled?: boolean;
  nodeId?: string;
  nodeName?: string;
  preferredModel?: string;
}

interface AgentResult {
  success: boolean;
  summary: string;
  stepsCompleted: number;
  filesCreated: string[];
  errors: string[];
  // DevMind 3.0
  modelMutations?: number;
  totalCost?: number;
  a2aNodesUsed?: number;
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
  {
    name: 'generate_video',
    description: 'Genera un video estilo anime/procedural a partir de una idea. Crea guion, dibuja escenas y las ensambla en MP4. No depende de APIs externas.',
    parameters: [
      { name: 'idea', type: 'string', description: 'Descripción de la historia o concepto a convertir en video', required: true },
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
- generate_image: Generar imágenes
- generate_video: Generar videos estilo anime/procedural a partir de una idea`;

export class Agent {
  private readonly config: AgentConfig;
  private readonly state: AgentState;
  private readonly messages: LLMMessage[] = [];
  private readonly filesCreated: string[] = [];
  private readonly errors: string[] = [];
  private stepCount = 0;
  // DevMind 3.0
  private mutationEngine: import('./auto-mutation.js').AutoMutationEngine | null = null;
  private a2aProtocol: import('./a2a-protocol.js').A2AProtocol | null = null;
  private modelRouter: import('./model-router.js').ModelRouter | null = null;
  private totalCost = 0;
  private totalTokens = 0;

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

    // Inicializar DevMind 3.0
    this.initializeV3();
  }

  private async initializeV3(): Promise<void> {
    // Auto-Mutation
    if (this.config.autoMutation || this.config.preferredModel) {
      const { ModelRouter } = await import('./model-router.js');
      this.modelRouter = new ModelRouter({
        defaultModelId: this.config.preferredModel,
        autoMutation: this.config.autoMutation,
      });

      if (this.config.autoMutation) {
        const { AutoMutationEngine } = await import('./auto-mutation.js');
        this.mutationEngine = new AutoMutationEngine(this.modelRouter);
      }
    }

    // A2A Protocol
    if (this.config.a2aEnabled) {
      const { A2AProtocol } = await import('./a2a-protocol.js');
      const { randomUUID } = await import('crypto');
      this.a2aProtocol = new A2AProtocol({
        nodeId: this.config.nodeId || randomUUID(),
        name: this.config.nodeName || 'DevMind-Agent',
        workspace: this.config.workspaceRoot,
        capabilities: ['coding', 'refactoring', 'testing', 'documentation', 'image-generation'],
        port: 3000,
      });
      this.a2aProtocol.startDiscovery();

      // Escuchar mensajes entrantes
      this.a2aProtocol.on('incoming', (msg: import('./a2a-protocol.js').AgentMessage) => {
        console.log(`📩 [A2A] Mensaje de ${msg.from}: ${String(msg.content).slice(0, 100)}`);
      });
    }
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

        // DevMind 3.0: Auto-Mutation (evaluar antes de cada llamada)
        if (this.mutationEngine && this.modelRouter) {
          const { scanAvailableModels } = await import('./llm-scanner.js');
          const mutationResult = await this.mutationEngine.evaluateAndMutate({
            task,
            currentModel: this.modelRouter.getActiveModel(),
            performance: {
              tokens: this.totalTokens,
              time: 0,
              successRate: this.errors.length > 0 ? Math.max(0, 1 - this.errors.length / this.stepCount) : 1,
              cost: this.totalCost,
            },
            availableModels: scanAvailableModels(),
            userPreference: this.config.preferredModel,
            stepNumber: this.stepCount,
            totalSteps: maxSteps,
          });

          if (mutationResult.mutated) {
            console.log(`🔄 [Auto-Mutation] ${mutationResult.reason}: ${mutationResult.previousModel} → ${mutationResult.model.id}`);
          }
        }

        // DevMind 3.0: A2A (buscar colaboración en tareas complejas)
        if (this.a2aProtocol && this.stepCount === 1) {
          const nodes = await this.a2aProtocol.discoverNodes();
          const otherNodes = nodes.filter(n => n.id !== this.a2aProtocol!.getMyNode().id);
          if (otherNodes.length > 0) {
            console.log(`👥 [A2A] ${otherNodes.length} agentes disponibles: ${otherNodes.map(n => n.name).join(', ')}`);

            // Si la tarea es compleja, orquestar equipo
            if (task.length > 200) {
              const team = await this.a2aProtocol.orchestrateTeam(task);
              console.log(`🤝 [A2A] Equipo: líder=${team.leader.name}, asignados=${team.assigned.length}`);
            }
          }
        }

        // Llamar al LLM (con fallback si hay router)
        let response;
        const startTime = Date.now();

        if (this.modelRouter) {
          const routedResult = await this.modelRouter.callWithFallback(this.messages, FILE_TOOLS);
          response = routedResult;
          if (routedResult.fallbackUsed) {
            console.log(`⚠️ [ModelRouter] Fallback usado → ${routedResult.modelUsed}`);
          }
        } else {
          response = await this.config.llmProvider.call(this.messages, FILE_TOOLS);
        }

        const elapsedMs = Date.now() - startTime;
        this.totalTokens += response.usage?.total_tokens || 0;

        // Registrar resultado en auto-mutation
        if (this.mutationEngine && this.modelRouter) {
          const modelId = this.modelRouter.getActiveModel().id;
          this.mutationEngine.recordCallOutcome(modelId, true, elapsedMs);
          const perf = this.modelRouter.getPerformanceSummary(modelId);
          this.totalCost = perf.totalCost;
        }

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

    // Detener A2A si estaba activo
    if (this.a2aProtocol) {
      this.a2aProtocol.stop();
    }

    // Recopilar stats de auto-mutation
    const mutationStats = this.mutationEngine?.getStats();

    return {
      success: this.errors.length === 0,
      summary: this.generateSummary(),
      stepsCompleted: this.stepCount,
      filesCreated: this.filesCreated,
      errors: this.errors,
      modelMutations: mutationStats?.totalMutations,
      totalCost: this.totalCost,
      a2aNodesUsed: this.a2aProtocol?.getStats().activeNodes,
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
        case 'generate_video':
          return await this.toolGenerateVideo(args.idea as string);
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

  private async toolGenerateVideo(idea: string): Promise<ToolResult> {
    try {
      const { VideoGenerator } = await import('./video/video-generator.js');
      const gen = new VideoGenerator(this.config.llmProvider, resolve(this.config.workspaceRoot, 'generated_videos'));
      const result = await gen.generate(idea);
      return {
        success: true,
        output: `Video generado: ${result.path} (${result.scenes} escenas, ${result.duration.toFixed(1)}s)`,
      };
    } catch (err) {
      return { success: false, output: '', error: `Error generando video: ${serializeError(err)}` };
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


