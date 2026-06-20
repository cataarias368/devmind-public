// ============================================================
// src/multi-agent.ts - Orquestador Multi-Agente con Ejecución Paralela
// ============================================================

import type { GLM47Provider } from './llm-provider.js';
import type { CogViewProvider } from './image-provider.js';
import type { AgentDefinition, AgentRole, MultiAgentResult, SubTask, LLMMessage } from './types.js';
import { serializeError } from './types.js';

interface OrchestratorConfig {
  llmProvider: GLM47Provider;
  imageProvider: CogViewProvider;
  workspaceRoot: string;
  maxParallel: number;
  agents: AgentDefinition[];
}

type EventCallback = (data: Record<string, unknown>) => void;

export class MultiAgentOrchestrator {
  private readonly config: OrchestratorConfig;
  private readonly eventHandlers: Map<string, EventCallback[]> = new Map();

  constructor(config: OrchestratorConfig) {
    this.config = config;
  }

  /**
   * Suscribe a eventos del orquestador.
   */
  on(event: string, callback: EventCallback): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(callback);
  }

  private emit(event: string, data: Record<string, unknown>): void {
    const handlers = this.eventHandlers.get(event) || [];
    for (const handler of handlers) {
      handler(data);
    }
  }

  /**
   * Ejecuta una tarea compleja descomponiéndola en subtareas para agentes especializados.
   */
  async execute(task: string): Promise<MultiAgentResult> {
    const startTime = Date.now();

    // Paso 1: Descomponer la tarea en subtareas
    const subTasks = await this.decomposeTask(task);

    // Paso 2: Analizar dependencias entre subtareas
    this.resolveDependencies(subTasks);

    // Paso 3: Ejecutar en orden de dependencias con paralelismo
    await this.executeSubTasks(subTasks);

    const totalTime = Date.now() - startTime;

    return {
      taskId: `task_${Date.now()}`,
      summary: this.generateSummary(subTasks, totalTime),
      subTasks,
      totalTime,
      success: subTasks.every(st => st.status === 'completed'),
    };
  }

  /**
   * Descompone una tarea compleja usando el LLM.
   */
  private async decomposeTask(task: string): Promise<SubTask[]> {
    const agentsDescription = this.config.agents
      .map(a => `- ${a.role} (${a.name}): ${a.systemPrompt.slice(0, 80)}...`)
      .join('\n');

    const prompt = `Descomponé esta tarea de desarrollo en subtareas para agentes especializados.

Tarea: "${task}"

Agentes disponibles:
${agentsDescription}

Reglas:
- Cada subtarea debe ser ejecutable por un solo agente
- Asigná el agente más apropiado para cada subtarea
- Indicá dependencias entre subtareas (IDs de subtareas previas requeridas)
- Mantené las subtareas específicas y accionables
- Ordená de forma lógica (arquitectura antes que implementación)

Respondé en JSON con este formato:
[
  {
    "id": "subtask_1",
    "description": "Descripción específica de la subtarea",
    "agentRole": "architect",
    "dependencies": []
  }
]`;

    const response = await this.config.llmProvider.call([
      { role: 'system', content: 'Sos un arquitecto de software experto en descomponer tareas. Respondé SOLO con JSON válido.' },
      { role: 'user', content: prompt },
    ]);

    const content = response.choices[0]?.message?.content || '[]';
    const cleaned = content.replace(/```json\n?|```/g, '').trim();

    try {
      const parsed = JSON.parse(cleaned) as Array<{
        id: string;
        description: string;
        agentRole: AgentRole;
        dependencies: string[];
      }>;

      return parsed.map(item => ({
        ...item,
        status: 'pending' as const,
      }));
    } catch {
      // Fallback: crear subtareas básicas
      return this.createFallbackSubTasks(task);
    }
  }

  /**
   * Crea subtareas de fallback si la descomposición del LLM falla.
   */
  private createFallbackSubTasks(task: string): SubTask[] {
    return [
      { id: 'subtask_1', description: `Diseñar la arquitectura para: ${task}`, agentRole: 'architect', dependencies: [], status: 'pending' },
      { id: 'subtask_2', description: `Implementar el backend para: ${task}`, agentRole: 'backend', dependencies: ['subtask_1'], status: 'pending' },
      { id: 'subtask_3', description: `Implementar el frontend para: ${task}`, agentRole: 'frontend', dependencies: ['subtask_1'], status: 'pending' },
      { id: 'subtask_4', description: `Configurar infraestructura y despliegue para: ${task}`, agentRole: 'devops', dependencies: ['subtask_2', 'subtask_3'], status: 'pending' },
      { id: 'subtask_5', description: `Escribir tests y verificar calidad para: ${task}`, agentRole: 'qa', dependencies: ['subtask_2', 'subtask_3'], status: 'pending' },
    ];
  }

  /**
   * Resuelve dependencias y valida que sean coherentes.
   */
  private resolveDependencies(subTasks: SubTask[]): void {
    const taskIds = new Set(subTasks.map(st => st.id));

    for (const task of subTasks) {
      // Eliminar dependencias a tareas inexistentes
      task.dependencies = task.dependencies.filter(depId => taskIds.has(depId));
    }
  }

  /**
   * Ejecuta las subtareas respetando dependencias y paralelismo.
   */
  private async executeSubTasks(subTasks: SubTask[]): Promise<void> {
    const completed = new Set<string>();
    const failed = new Set<string>();

    while (true) {
      // Encontrar tareas listas para ejecutar
      const ready = subTasks.filter(
        st =>
          st.status === 'pending' &&
          st.dependencies.every(dep => completed.has(dep)) &&
          !st.dependencies.some(dep => failed.has(dep))
      );

      if (ready.length === 0) {
        // Verificar si quedan tareas pendientes bloqueadas
        const blocked = subTasks.filter(st => st.status === 'pending');
        if (blocked.length > 0) {
          for (const task of blocked) {
            task.status = 'failed';
            task.error = 'Bloqueada por dependencia fallida';
          }
        }
        break;
      }

      // Ejecutar en paralelo (hasta maxParallel)
      const batch = ready.slice(0, this.config.maxParallel);

      await Promise.all(
        batch.map(async (task) => {
          task.status = 'running';
          this.emit('task-start', {
            taskId: task.id,
            agent: task.agentRole,
            description: task.description,
          });

          try {
            const result = await this.executeAgentTask(task);
            task.status = 'completed';
            task.result = result;
            completed.add(task.id);

            this.emit('task-done', {
              taskId: task.id,
              agent: task.agentRole,
              result,
            });
          } catch (err) {
            task.status = 'failed';
            task.error = serializeError(err);
            failed.add(task.id);

            this.emit('task-failed', {
              taskId: task.id,
              agent: task.agentRole,
              error: task.error,
            });
          }
        })
      );
    }
  }

  /**
   * Ejecuta una subtarea con un agente especializado.
   */
  private async executeAgentTask(subTask: SubTask): Promise<string> {
    const agentDef = this.config.agents.find(a => a.role === subTask.agentRole);
    if (!agentDef) {
      throw new Error(`Agente no encontrado para rol: ${subTask.agentRole}`);
    }

    // Construir contexto con resultados de dependencias
    const depResults = subTask.dependencies
      .map(depId => {
        const dep = this.config.agents.find(a => a.role === subTask.agentRole);
        return dep ? `Resultado de ${depId}: (contexto disponible)` : '';
      })
      .filter(Boolean)
      .join('\n');

    const messages: LLMMessage[] = [
      { role: 'system', content: agentDef.systemPrompt },
      {
        role: 'user',
        content: `Tarea: ${subTask.description}\n\nWorkspace: ${this.config.workspaceRoot}${depResults ? '\n\nContexto de dependencias:\n' + depResults : ''}\n\nCompletá esta tarea de forma específica y profesional.`,
      },
    ];

    const response = await this.config.llmProvider.call(messages);
    return response.choices[0]?.message?.content || 'Sin resultado';
  }

  /**
   * Genera un resumen de la ejecución multi-agente.
   */
  private generateSummary(subTasks: SubTask[], totalTime: number): string {
    const completed = subTasks.filter(st => st.status === 'completed').length;
    const failed = subTasks.filter(st => st.status === 'failed').length;
    const total = subTasks.length;

    const lines: string[] = [
      `Ejecución completada en ${(totalTime / 1000).toFixed(1)}s`,
      `Tareas: ${completed}/${total} completadas, ${failed} fallidas`,
      '',
    ];

    for (const task of subTasks) {
      const icon = task.status === 'completed' ? '✅' : task.status === 'failed' ? '❌' : '⏳';
      lines.push(`${icon} [${task.agentRole}] ${task.description.slice(0, 60)}...`);
      if (task.result) {
        lines.push(`   → ${task.result.slice(0, 100)}...`);
      }
      if (task.error) {
        lines.push(`   → Error: ${task.error.slice(0, 80)}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Definición por defecto de agentes especializados.
   */
  static defaultAgents(): AgentDefinition[] {
    return [
      {
        role: 'architect',
        name: 'Arquitecto',
        systemPrompt: 'Sos un arquitecto de software senior. Diseñás soluciones técnicas claras, definís estructuras de archivos, APIs y patrones de diseño. Respondé con planes concretos y específicos.',
        tools: ['read_file', 'write_file', 'list_files'],
      },
      {
        role: 'frontend',
        name: 'Frontend Dev',
        systemPrompt: 'Sos un desarrollador frontend experto en React, TypeScript y CSS moderno. Creás componentes limpios, accesibles y bien tipados. Priorizás la experiencia de usuario.',
        tools: ['read_file', 'write_file', 'search_code', 'run_command'],
      },
      {
        role: 'backend',
        name: 'Backend Dev',
        systemPrompt: 'Sos un desarrollador backend experto en Node.js, APIs REST y bases de datos. Escribís código robusto, bien testeado y documentado. Seguís principios SOLID.',
        tools: ['read_file', 'write_file', 'search_code', 'run_command'],
      },
      {
        role: 'devops',
        name: 'DevOps Engineer',
        systemPrompt: 'Sos un ingeniero DevOps experto en CI/CD, Docker, Kubernetes y automatización. Creás configuraciones de infraestructura como código seguras y escalables.',
        tools: ['read_file', 'write_file', 'run_command'],
      },
      {
        role: 'qa',
        name: 'QA Engineer',
        systemPrompt: 'Sos un ingeniero de QA experto en testing automatizado. Escribís tests unitarios, de integración y E2E con cobertura completa. Identificás edge cases y posibles fallos.',
        tools: ['read_file', 'write_file', 'search_code', 'run_command'],
      },
    ];
  }
}
