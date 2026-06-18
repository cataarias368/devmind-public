// ============================================================
// src/monitor.ts - Monitor del Sistema con SystemState
// ============================================================

import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import type { SystemState } from './tasks/types.js';

/**
 * Monitor central que trackea el estado completo del sistema DevMind.
 * Mide uptime, memoria, checkpoints, imágenes, tareas, tokens y métricas de ads.
 */
export class Monitor {
  private state: SystemState;
  private startTime: number;
  private dataDir: string;

  constructor(workspaceRoot?: string) {
    this.startTime = Date.now();
    this.dataDir = join(workspaceRoot || process.cwd(), '.devmind');

    this.state = {
      uptime: 0,
      memory: { totalUsage: 0, usedByType: {} },
      checkpoints: 0,
      imagesGenerated: 0,
      tasksCompleted: 0,
      tokensUsed: 0,
      ads: { totalImpressions: 0, totalClicks: 0, overallCTR: 0 },
    };
  }

  /**
   * Inicializa el monitor y carga estado previo.
   */
  async init(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    await this.load();
  }

  /**
   * Actualiza el uptime y devuelve el estado actual.
   */
  getState(): SystemState {
    this.state.uptime = Date.now() - this.startTime;
    return { ...this.state };
  }

  /**
   * Registra un checkpoint creado.
   */
  recordCheckpoint(): void {
    this.state.checkpoints++;
    this.save().catch(() => {});
  }

  /**
   * Registra una imagen generada.
   */
  recordImage(): void {
    this.state.imagesGenerated++;
    this.save().catch(() => {});
  }

  /**
   * Registra una tarea completada.
   */
  recordTask(success: boolean): void {
    if (success) this.state.tasksCompleted++;
    this.save().catch(() => {});
  }

  /**
   * Registra tokens consumidos.
   */
  recordTokens(count: number): void {
    this.state.tokensUsed += count;
    this.save().catch(() => {});
  }

  /**
   * Registra métricas de publicidad.
   */
  recordAdMetrics(impressions: number, clicks: number): void {
    this.state.ads.totalImpressions += impressions;
    this.state.ads.totalClicks += clicks;
    this.state.ads.overallCTR = this.state.ads.totalImpressions > 0
      ? this.state.ads.totalClicks / this.state.ads.totalImpressions
      : 0;
    this.save().catch(() => {});
  }

  /**
   * Registra uso de memoria por tipo.
   */
  recordMemoryUsage(type: string, bytes: number): void {
    this.state.memory.usedByType[type] = (this.state.memory.usedByType[type] || 0) + bytes;
    this.state.memory.totalUsage = Object.values(this.state.memory.usedByType).reduce((a, b) => a + b, 0);
  }

  /**
   * Devuelve un resumen legible del estado del sistema.
   */
  getSummary(): string {
    const s = this.getState();
    const uptimeMin = Math.floor(s.uptime / 60000);
    const lines = [
      `⏱️ Uptime: ${uptimeMin} min`,
      `📊 Tareas completadas: ${s.tasksCompleted}`,
      `🖼️ Imágenes generadas: ${s.imagesGenerated}`,
      `💾 Checkpoints: ${s.checkpoints}`,
      `🔤 Tokens usados: ${s.tokensUsed.toLocaleString()}`,
      `📢 Ads - Impresiones: ${s.ads.totalImpressions}, Clicks: ${s.ads.totalClicks}, CTR: ${(s.ads.overallCTR * 100).toFixed(2)}%`,
      `🧠 Memoria: ${(s.memory.totalUsage / 1024).toFixed(1)} KB`,
    ];
    return lines.join('\n');
  }

  /**
   * Carga el estado desde disco.
   */
  private async load(): Promise<void> {
    try {
      const content = await readFile(join(this.dataDir, 'stats.json'), 'utf-8');
      const saved = JSON.parse(content) as SystemState;
      // Restaurar contadores pero resetear uptime
      this.state = { ...saved, uptime: 0 };
    } catch {
      // Estado nuevo
    }
  }

  /**
   * Persiste el estado en disco.
   */
  private async save(): Promise<void> {
    try {
      await mkdir(this.dataDir, { recursive: true });
      await writeFile(
        join(this.dataDir, 'stats.json'),
        JSON.stringify(this.getState(), null, 2),
        'utf-8'
      );
    } catch {
      // No bloquear
    }
  }
}
