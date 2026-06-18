// ============================================================
// src/tasks/tool-prioritization.ts - Priorización de Herramientas
// ============================================================

import type { TaskToolDefinition } from './types.js';

type TaskType = 'read' | 'write' | 'search' | 'execute' | 'image' | 'general';

/**
 * Analiza la tarea del usuario y prioriza las herramientas
 * según su relevancia para el tipo de tarea detectado.
 */
export class ToolPrioritizer {
  private typeKeywords: Record<TaskType, string[]> = {
    read: ['leer', 'ver', 'get', 'show', 'list', 'file', 'path', 'read', 'cat', 'head'],
    write: ['escribir', 'crear', 'guardar', 'agregar', 'write', 'create', 'save', 'append', 'mkdir'],
    search: ['buscar', 'find', 'grep', 'search', 'locate', 'where', 'which'],
    execute: ['ejecutar', 'run', 'comando', 'test', 'build', 'npm', 'npx', 'command', 'install'],
    image: ['imagen', 'diagrama', 'generar', 'gráfico', 'icon', 'mockup', 'screenshot'],
    general: [],
  };

  /**
   * Analiza el texto de la tarea para determinar su tipo.
   */
  analyzeTask(task: string): TaskType {
    const lower = task.toLowerCase();
    if (lower.includes('imagen') || lower.includes('gráfico') || lower.includes('diagrama') || lower.includes('icon')) return 'image';
    if (lower.includes('ejecutar') || lower.includes('test') || lower.includes('run') || lower.includes('build') || lower.includes('install')) return 'execute';
    if (lower.includes('buscar') || lower.includes('encuentra') || lower.includes('find') || lower.includes('search')) return 'search';
    if (lower.includes('crear') || lower.includes('escribir') || lower.includes('guardar') || lower.includes('write') || lower.includes('save')) return 'write';
    if (lower.includes('leer') || lower.includes('ver') || lower.includes('list') || lower.includes('read') || lower.includes('show')) return 'read';
    return 'general';
  }

  /**
   * Prioriza las herramientas según el tipo de tarea detectado.
   * Devuelve las herramientas ordenadas por score de relevancia.
   */
  prioritizeTools(tools: TaskToolDefinition[], task: string): TaskToolDefinition[] {
    const type = this.analyzeTask(task);
    const keywords = this.typeKeywords[type] || [];

    return tools
      .map(tool => {
        let score = 0;
        const toolLower = tool.name.toLowerCase();
        const descLower = tool.description.toLowerCase();

        for (const kw of keywords) {
          if (toolLower.includes(kw) || descLower.includes(kw)) score += 5;
          for (const toolKw of tool.keywords) {
            if (toolKw.toLowerCase() === kw) score += 3;
          }
        }

        // Bonus para herramientas que coinciden exactamente con el tipo
        if (toolLower.includes(type)) score += 10;

        return { tool, score };
      })
      .sort((a, b) => b.score - a.score)
      .map(({ tool }) => tool);
  }
}
