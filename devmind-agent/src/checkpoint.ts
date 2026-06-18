// ============================================================
// src/checkpoint.ts - Sistema de Checkpoints para Reanudar Tareas
// ============================================================

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import type { Checkpoint, AgentState } from './types.js';

export class CheckpointManager {
  private readonly checkpointDir: string;
  private readonly maxCheckpoints: number;

  constructor(workspaceRoot: string, maxCheckpoints = 50) {
    this.checkpointDir = resolve(join(workspaceRoot, '.devmind', 'checkpoints'));
    this.maxCheckpoints = maxCheckpoints;
  }

  /**
   * Inicializa el directorio de checkpoints.
   */
  async init(): Promise<void> {
    await mkdir(this.checkpointDir, { recursive: true });
  }

  /**
   * Guarda un checkpoint del estado actual del agente.
   */
  async save(taskId: string, step: number, state: AgentState): Promise<Checkpoint> {
    await this.init();

    const checkpoint: Checkpoint = {
      id: `cp_${Date.now()}_${step}`,
      taskId,
      step,
      state,
      timestamp: Date.now(),
    };

    const filePath = join(this.checkpointDir, `${checkpoint.id}.json`);
    await writeFile(filePath, JSON.stringify(checkpoint, null, 2), 'utf-8');

    // Limpiar checkpoints antiguos si excedemos el límite
    await this.pruneOldCheckpoints();

    return checkpoint;
  }

  /**
   * Carga el último checkpoint disponible para una tarea.
   */
  async loadLatest(taskId: string): Promise<Checkpoint | null> {
    try {
      await this.init();
      const { readdir } = await import('fs/promises');
      const files = await readdir(this.checkpointDir);

      const checkpoints: Checkpoint[] = [];
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const content = await readFile(join(this.checkpointDir, file), 'utf-8');
          const cp = JSON.parse(content) as Checkpoint;
          if (cp.taskId === taskId) {
            checkpoints.push(cp);
          }
        } catch {
          // Ignorar archivos corruptos
        }
      }

      if (checkpoints.length === 0) return null;

      // Retornar el más reciente
      checkpoints.sort((a, b) => b.timestamp - a.timestamp);
      return checkpoints[0];
    } catch {
      return null;
    }
  }

  /**
   * Carga un checkpoint específico por su ID.
   */
  async loadById(checkpointId: string): Promise<Checkpoint | null> {
    try {
      const filePath = join(this.checkpointDir, `${checkpointId}.json`);
      const content = await readFile(filePath, 'utf-8');
      return JSON.parse(content) as Checkpoint;
    } catch {
      return null;
    }
  }

  /**
   * Elimina checkpoints antiguos para no exceder el límite.
   */
  private async pruneOldCheckpoints(): Promise<void> {
    try {
      const { readdir, unlink } = await import('fs/promises');
      const files = await readdir(this.checkpointDir);
      const jsonFiles = files.filter(f => f.endsWith('.json')).sort();

      if (jsonFiles.length <= this.maxCheckpoints) return;

      const toDelete = jsonFiles.slice(0, jsonFiles.length - this.maxCheckpoints);
      await Promise.all(
        toDelete.map(f => unlink(join(this.checkpointDir, f)))
      );
    } catch {
      // No bloquear si falla la limpieza
    }
  }
}
