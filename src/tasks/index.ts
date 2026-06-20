// ============================================================
// src/tasks/index.ts - TaskManager (Orquestador Central)
// ============================================================

import { compressContext } from './context-compression.js';
import { SlidingWindow } from './sliding-window.js';
import { ToolPrioritizer } from './tool-prioritization.js';
import { SemanticCache } from './semantic-cache.js';
import { ShortTermMemory } from './short-term-memory.js';
import { EpisodicMemory } from './episodic-memory.js';
import { StepAnticipator } from './step-anticipation.js';
import { DynamicPlanning } from './dynamic-planning.js';
import { BatchProcessor } from './batch-processing.js';
import { SelfEvaluator } from './self-evaluation.js';
import { ImprovementSuggestions } from './improvement-suggestions.js';
import { IndependentExecution } from './independent-execution.js';
import { ParallelPipeline } from './parallel-pipeline.js';
import { HealthCheck } from './health-check.js';
import { Alerts } from './alerts.js';

export type { AgentMessage, TaskToolDefinition, TaskMemoryEntry, Episode, Metric, TaskResult, SystemState, AdBanner } from './types.js';

/**
 * TaskManager es el orquestador central de todas las tareas de rendimiento.
 * Inicializa y coordina los 15 módulos de tareas.
 */
export class TaskManager {
  readonly window: SlidingWindow;
  readonly prioritizer: ToolPrioritizer;
  readonly cache: SemanticCache;
  readonly shortTermMemory: ShortTermMemory;
  readonly episodicMemory: EpisodicMemory;
  readonly anticipator: StepAnticipator;
  readonly planning: DynamicPlanning;
  readonly batcher: BatchProcessor;
  readonly evaluator: SelfEvaluator;
  readonly suggestions: ImprovementSuggestions;
  readonly independentExecution: IndependentExecution;
  readonly pipeline: ParallelPipeline;
  readonly healthCheck: HealthCheck;
  readonly alerts: Alerts;

  private isRunning = false;

  constructor(workspaceRoot?: string) {
    this.window = new SlidingWindow();
    this.prioritizer = new ToolPrioritizer();
    this.cache = new SemanticCache();
    this.shortTermMemory = new ShortTermMemory();
    this.episodicMemory = new EpisodicMemory();
    this.anticipator = new StepAnticipator();
    this.planning = new DynamicPlanning();
    this.batcher = new BatchProcessor();
    this.evaluator = new SelfEvaluator(workspaceRoot);
    this.suggestions = new ImprovementSuggestions();
    this.independentExecution = new IndependentExecution();
    this.pipeline = new ParallelPipeline();
    this.healthCheck = new HealthCheck(workspaceRoot);
    this.alerts = new Alerts(workspaceRoot);
  }

  /**
   * Inicia todas las tareas de fondo (health check periódico, flush de alertas, etc.).
   */
  async startAllTasks(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Cargar métricas existentes
    await this.evaluator.load();
    await this.healthCheck.loadHistory();

    // Iniciar flush periódico de alertas
    this.alerts.startPeriodicFlush();

    // Ejecutar health check inicial
    const health = await this.healthCheck.check();
    if (health.status === 'critical') {
      await this.alerts.send('critical', `Health check crítico: ${health.issues.join(', ')}`);
    } else if (health.status === 'warning') {
      await this.alerts.send('warning', `Health check con advertencias: ${health.issues.join(', ')}`);
    } else {
      await this.alerts.send('info', 'DevMind Agent iniciado - todos los sistemas operativos');
    }

    console.log('🔧 TaskManager iniciado con 15 módulos de rendimiento');
  }

  /**
   * Detiene todas las tareas de fondo.
   */
  async stopAllTasks(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    // Procesar lotes pendientes
    await this.batcher.processAll();

    // Detener flush de alertas
    this.alerts.stopPeriodicFlush();

    // Limpiar caché expirado
    this.cache.clearExpired();

    await this.alerts.send('info', 'DevMind Agent detenido');
  }

  /**
   * Devuelve un resumen del estado de todas las tareas.
   */
  async getStatus(): Promise<Record<string, unknown>> {
    const health = await this.healthCheck.check();
    const evaluation = await this.evaluator.evaluate();
    const cacheStats = this.cache.getStats();
    const batchStats = this.batcher.getStats();
    const episodeStats = this.episodicMemory.getStats();

    return {
      health: health.status,
      healthIssues: health.issues,
      performance: evaluation.score,
      performanceDetails: evaluation.details,
      cacheSize: cacheStats.size,
      pendingBatches: batchStats.pendingBatches,
      totalBatchProcessed: batchStats.totalProcessed,
      episodes: episodeStats,
      shortTermMemories: this.shortTermMemory.getRecent(5).length,
      alerts: {
        total: this.alerts.getAlerts().length,
        critical: this.alerts.getByLevel('critical').length,
        warning: this.alerts.getByLevel('warning').length,
      },
      isRunning: this.isRunning,
    };
  }

  /**
   * Compresión de contexto expuesta como método conveniente.
   */
  async compressContext(messages: Array<{ role: string; content: string; timestamp: number }>, llmProvider?: unknown): Promise<Array<{ role: string; content: string; timestamp: number }>> {
    return compressContext(messages, llmProvider as never);
  }
}

// Re-exportar todos los módulos
export { compressContext } from './context-compression.js';
export { SlidingWindow } from './sliding-window.js';
export { ToolPrioritizer } from './tool-prioritization.js';
export { SemanticCache } from './semantic-cache.js';
export { ShortTermMemory } from './short-term-memory.js';
export { EpisodicMemory } from './episodic-memory.js';
export { StepAnticipator } from './step-anticipation.js';
export { DynamicPlanning } from './dynamic-planning.js';
export { BatchProcessor } from './batch-processing.js';
export { SelfEvaluator } from './self-evaluation.js';
export { ImprovementSuggestions } from './improvement-suggestions.js';
export { IndependentExecution } from './independent-execution.js';
export { ParallelPipeline } from './parallel-pipeline.js';
export { HealthCheck } from './health-check.js';
export { Alerts } from './alerts.js';
