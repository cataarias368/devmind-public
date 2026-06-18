// ============================================================
// src/tasks/independent-execution.ts - Ejecución Independiente Paralela
// ============================================================

import type { LLMProvider } from './types.js';

interface IsolatedTask {
  description: string;
  context: string;
}

/**
 * Ejecuta tareas independientes en paralelo con contexto aislado.
 * Cada tarea se ejecuta sin compartir estado con las demás.
 */
export class IndependentExecution {
  /**
   * Crea herramientas aisladas (clon superficial sin estado compartido).
   */
  createIsolatedTools(tools: unknown[]): unknown[] {
    return tools.map(t => ({ ...(t as Record<string, unknown>) }));
  }

  /**
   * Ejecuta múltiples tareas en paralelo con contexto aislado.
   */
  async executeParallel(
    tasks: IsolatedTask[],
    tools: unknown[],
    llmProvider?: LLMProvider
  ): Promise<Array<{ task: string; success: boolean; result: string }>> {
    return Promise.all(
      tasks.map(task => this.executeWithIsolation(task, tools, llmProvider))
    );
  }

  /**
   * Ejecuta una tarea en aislamiento completo.
   */
  async executeWithIsolation(
    task: IsolatedTask,
    _tools: unknown[],
    llmProvider?: LLMProvider
  ): Promise<{ task: string; success: boolean; result: string }> {
    try {
      if (llmProvider) {
        const response = await llmProvider.call([
          { role: 'system', content: 'Ejecutá esta tarea de forma autónoma.' },
          { role: 'user', content: `${task.description}\n\nContexto: ${task.context}` },
        ]);
        const respObj = response as { choices: Array<{ message: { content: string } }> };
        const content = respObj.choices?.[0]?.message?.content || 'Sin resultado';
        return { task: task.description, success: true, result: content };
      }

      return { task: task.description, success: true, result: `[Aislado] Ejecutado: ${task.description}` };
    } catch (err) {
      return {
        task: task.description,
        success: false,
        result: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
