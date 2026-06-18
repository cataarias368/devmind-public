// ============================================================
// src/tasks/short-term-memory.ts - Memoria de Corto Plazo
// ============================================================

import type { TaskMemoryEntry } from './types.js';

/**
 * Almacena las últimas 20 acciones con su resultado y nivel de importancia.
 * Elimina automáticamente las menos importantes cuando se llena.
 */
export class ShortTermMemory {
  private memories: TaskMemoryEntry[] = [];
  private maxSize: number;

  constructor(maxSize = 20) {
    this.maxSize = maxSize;
  }

  /**
   * Añade una entrada de memoria con su nivel de importancia (1-5).
   */
  add(action: string, result: string, importance: number): void {
    this.memories.push({
      action,
      result,
      timestamp: Date.now(),
      importance: Math.max(1, Math.min(5, importance)),
    });

    if (this.memories.length > this.maxSize) {
      this.evictLeastImportant();
    }
  }

  /**
   * Devuelve las últimas N acciones.
   */
  getRecent(limit: number): TaskMemoryEntry[] {
    return this.memories.slice(-limit);
  }

  /**
   * Devuelve un contexto formateado con las últimas 5 acciones.
   */
  getContext(): string {
    return this.memories
      .slice(-5)
      .map(m => `Acción previa: ${m.action} → Resultado: ${m.result.slice(0, 80)}...`)
      .join('\n');
  }

  /**
   * Elimina la entrada menos importante (o la más antigua en empate).
   */
  private evictLeastImportant(): void {
    let lowestIdx = 0;
    let lowestScore = Infinity;

    for (let i = 0; i < this.memories.length; i++) {
      if (this.memories[i].importance < lowestScore) {
        lowestScore = this.memories[i].importance;
        lowestIdx = i;
      }
    }

    this.memories.splice(lowestIdx, 1);
  }
}
