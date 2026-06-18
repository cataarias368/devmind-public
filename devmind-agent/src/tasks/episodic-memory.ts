// ============================================================
// src/tasks/episodic-memory.ts - Memoria Episódica
// ============================================================

import type { Episode } from './types.js';

/**
 * Almacena episodios completos de ejecución (tarea, plan, resultado, éxito).
 * Permite buscar episodios similares por palabras clave.
 */
export class EpisodicMemory {
  private episodes: Episode[] = [];
  private maxEpisodes: number;

  constructor(maxEpisodes = 100) {
    this.maxEpisodes = maxEpisodes;
  }

  /**
   * Añade un episodio completo.
   */
  add(task: string, plan: string, result: string, success: boolean): void {
    this.episodes.push({
      task,
      plan,
      result,
      success,
      timestamp: Date.now(),
    });

    if (this.episodes.length > this.maxEpisodes) {
      this.episodes.shift();
    }
  }

  /**
   * Busca episodios similares usando Jaccard similarity por palabras clave.
   * Devuelve los 3 más similares con umbral > 0.3.
   */
  findSimilar(task: string): Episode[] {
    const taskWords = new Set(task.toLowerCase().split(/\s+/));
    const scored: Array<{ episode: Episode; similarity: number }> = [];

    for (const ep of this.episodes) {
      const epWords = new Set(ep.task.toLowerCase().split(/\s+/));
      const intersection = [...taskWords].filter(w => epWords.has(w)).length;
      const union = new Set([...taskWords, ...epWords]).size;
      const similarity = union > 0 ? intersection / union : 0;

      if (similarity > 0.3) {
        scored.push({ episode: ep, similarity });
      }
    }

    return scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3)
      .map(s => s.episode);
  }

  /**
   * Devuelve todos los episodios.
   */
  getAll(): Episode[] {
    return this.episodes;
  }

  /**
   * Devuelve estadísticas de episodios.
   */
  getStats(): { total: number; successful: number; failed: number } {
    return {
      total: this.episodes.length,
      successful: this.episodes.filter(e => e.success).length,
      failed: this.episodes.filter(e => !e.success).length,
    };
  }
}
