// ============================================================
// src/memory.ts - Sistema de Memoria Persistente del Agente
// ============================================================

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import type { MemoryEntry } from './types.js';

export class MemoryStore {
  private readonly memoryDir: string;
  private entries: MemoryEntry[] = [];
  private dirty = false;

  constructor(workspaceRoot: string) {
    this.memoryDir = resolve(join(workspaceRoot, '.devmind', 'memory'));
  }

  /**
   * Inicializa el store y carga entradas existentes.
   */
  async init(): Promise<void> {
    await mkdir(this.memoryDir, { recursive: true });
    await this.load();
  }

  /**
   * Almacena un nuevo aprendizaje o patrón.
   */
  async store(
    category: MemoryEntry['category'],
    content: string,
    context: string,
    relevance = 1.0
  ): Promise<MemoryEntry> {
    const entry: MemoryEntry = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      category,
      content,
      context,
      timestamp: Date.now(),
      relevance,
    };

    this.entries.push(entry);
    this.dirty = true;
    await this.persist();
    return entry;
  }

  /**
   * Busca entradas relevantes para un contexto dado.
   * Usa matching simple por palabras clave con scoring por relevancia.
   */
  async search(query: string, limit = 5): Promise<MemoryEntry[]> {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    const scored = this.entries.map(entry => {
      const contentLower = entry.content.toLowerCase();
      const contextLower = entry.context.toLowerCase();

      let score = entry.relevance;
      for (const term of queryTerms) {
        if (contentLower.includes(term)) score += 2;
        if (contextLower.includes(term)) score += 1;
      }

      // Bonus por recencia (entradas más recientes obtienen un ligero boost)
      const ageHours = (Date.now() - entry.timestamp) / (1000 * 60 * 60);
      score *= Math.max(0.5, 1 - ageHours / 720); // Decae a 0.5 tras 30 días

      return { entry, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.entry);
  }

  /**
   * Obtiene todas las entradas de una categoría.
   */
  async getByCategory(category: MemoryEntry['category']): Promise<MemoryEntry[]> {
    return this.entries.filter(e => e.category === category);
  }

  /**
   * Obtiene aprendizajes relevantes como contexto para el LLM.
   */
  async getContextForTask(task: string): Promise<string> {
    const relevant = await this.search(task, 10);
    if (relevant.length === 0) return '';

    const lines = relevant.map(e => {
      const categoryLabel = {
        learning: 'Aprendizaje',
        pattern: 'Patrón',
        error: 'Error previo',
        preference: 'Preferencia',
      }[e.category];

      return `[${categoryLabel}] ${e.content} (Contexto: ${e.context})`;
    });

    return `Memoria relevante del agente:\n${lines.join('\n')}`;
  }

  /**
   * Elimina entradas con relevancia muy baja que ya no son útiles.
   */
  async prune(minRelevance = 0.1): Promise<number> {
    const before = this.entries.length;
    this.entries = this.entries.filter(e => e.relevance >= minRelevance);
    const removed = before - this.entries.length;

    if (removed > 0) {
      this.dirty = true;
      await this.persist();
    }

    return removed;
  }

  /**
   * Carga las entradas desde disco.
   */
  private async load(): Promise<void> {
    try {
      const filePath = join(this.memoryDir, 'memory.json');
      const content = await readFile(filePath, 'utf-8');
      this.entries = JSON.parse(content) as MemoryEntry[];
    } catch {
      this.entries = [];
    }
  }

  /**
   * Persiste las entradas a disco (solo si hubo cambios).
   */
  private async persist(): Promise<void> {
    if (!this.dirty) return;
    const filePath = join(this.memoryDir, 'memory.json');
    await writeFile(filePath, JSON.stringify(this.entries, null, 2), 'utf-8');
    this.dirty = false;
  }
}
