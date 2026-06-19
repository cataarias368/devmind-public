// ============================================================
// src/tasks/self-evaluation.ts - Autoevaluación del Agente
// ============================================================

import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import type { Metric, TaskResult } from './types.js';

/**
 * Registra métricas de ejecución y evalúa el rendimiento del agente.
 * Guarda métricas persistentemente en .devmind/metrics.json
 */
export class SelfEvaluator {
  private metrics: Metric[] = [];
  private metricsDir: string;

  constructor(workspaceRoot?: string) {
    this.metricsDir = join(workspaceRoot || process.cwd(), '.devmind');
  }

  /**
   * Registra una ejecución con sus métricas.
   */
  async record(_task: string, result: TaskResult, tokens = 0, time = 0): Promise<void> {
    const metric: Metric = {
      timestamp: Date.now(),
      success: result.success,
      steps: result.steps,
      tokens,
      time,
    };
    this.metrics.push(metric);
    await this.save();
  }

  /**
   * Evalúa el rendimiento general del agente.
   */
  async evaluate(): Promise<{
    score: 'excellent' | 'good' | 'needs-improvement' | 'no-data';
    details: { successRate: number; avgSteps: number; avgTokens: number; avgTime: number };
  }> {
    if (this.metrics.length === 0) {
      return { score: 'no-data', details: { successRate: 0, avgSteps: 0, avgTokens: 0, avgTime: 0 } };
    }

    const total = this.metrics.length;
    const successRate = this.metrics.filter(m => m.success).length / total;
    const avgSteps = this.getAvgSteps();
    const avgTokens = this.metrics.reduce((acc, m) => acc + m.tokens, 0) / total;
    const avgTime = this.metrics.reduce((acc, m) => acc + m.time, 0) / total;

    let score: 'excellent' | 'good' | 'needs-improvement' = 'needs-improvement';
    if (successRate > 0.9 && avgSteps < 10) score = 'excellent';
    else if (successRate > 0.7 && avgSteps < 20) score = 'good';

    return { score, details: { successRate, avgSteps, avgTokens, avgTime } };
  }

  /**
   * Devuelve el rendimiento como etiqueta legible.
   */
  async getPerformance(): Promise<string> {
    const { score } = await this.evaluate();
    const labels: Record<string, string> = {
      excellent: '🏆 Excelente',
      good: '👍 Bueno',
      'needs-improvement': '⚠️ Necesita mejora',
      'no-data': '❓ Sin datos',
    };
    return labels[score] || score;
  }

  /**
   * Carga métricas existentes desde disco.
   */
  async load(): Promise<void> {
    try {
      const content = await readFile(join(this.metricsDir, 'metrics.json'), 'utf-8');
      this.metrics = JSON.parse(content) as Metric[];
    } catch {
      this.metrics = [];
    }
  }

  private getAvgSteps(): number {
    if (this.metrics.length === 0) return 0;
    return this.metrics.reduce((acc, m) => acc + m.steps, 0) / this.metrics.length;
  }

  private async save(): Promise<void> {
    await mkdir(this.metricsDir, { recursive: true });
    await writeFile(
      join(this.metricsDir, 'metrics.json'),
      JSON.stringify(this.metrics, null, 2),
      'utf-8'
    );
  }
}
