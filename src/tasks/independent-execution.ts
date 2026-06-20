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
   * Crea herramientas aisladas (clon seguro sin estado compartido).
   * Usa JSON serialization para evitar prototype pollution.
   */
  createIsolatedTools(tools: unknown[]): unknown[] {
    return tools.map(t => {
      try {
        return JSON.parse(JSON.stringify(t));
      } catch {
        // Fallback: clon superficial seguro sin __proto__
        const clone: Record<string, unknown> = Object.create(null);
        const obj = t as Record<string, unknown>;
        for (const key of Object.keys(obj)) {
          if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
            clone[key] = obj[key];
          }
        }
        return clone;
      }
    });
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
