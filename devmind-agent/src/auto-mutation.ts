// ============================================================
// src/auto-mutation.ts - Motor de Auto-Mutación Inteligente
// ============================================================

import type { LLMModel } from './llm-scanner.js';
import { ModelRouter } from './model-router.js';

// --- Interfaces ---

export interface MutationStrategy {
  name: string;
  description: string;
  condition: (context: MutationContext) => boolean;
  action: (context: MutationContext) => Promise<LLMModel>;
}

export interface MutationContext {
  task: string;
  currentModel: LLMModel;
  performance: {
    tokens: number;
    time: number;
    successRate: number;
    cost: number;
  };
  availableModels: LLMModel[];
  userPreference?: string;
  stepNumber: number;
  totalSteps: number;
}

export interface MutationResult {
  model: LLMModel;
  reason: string;
  mutated: boolean;
  strategyUsed: string;
  previousModel: string;
}

interface MutationHistoryEntry {
  from: string;
  to: string;
  reason: string;
  strategy: string;
  timestamp: string;
  taskSnippet: string;
}

// --- Motor de Auto-Mutación ---

/**
 * El AutoMutationEngine evalúa dinámicamente si el modelo LLM actual
 * es el más adecuado para la tarea en curso y, si no lo es, cambia
 * automáticamente a un modelo mejor.
 *
 * Estrategias incorporadas:
 * 1. Performance-based: cambia a modelo más rápido para tareas simples
 * 2. Quality-based: cambia a modelo más potente para tareas complejas
 * 3. Cost-based: cambia a modelo más barato cuando el costo acumulado es alto
 * 4. User-preference: usa el modelo que el usuario prefiere
 * 5. Adaptive: aprende de mutaciones pasadas para mejorar decisiones
 */
export class AutoMutationEngine {
  private strategies: MutationStrategy[] = [];
  private router: ModelRouter;
  private mutationHistory: MutationHistoryEntry[] = [];
  private adaptiveScores: Map<string, number> = new Map();

  constructor(router: ModelRouter) {
    this.router = router;
    this.registerStrategies();
  }

  private registerStrategies(): void {
    // Estrategia 1: Cambio por rendimiento (tareas simples → modelo rápido)
    this.strategies.push({
      name: 'performance-based',
      description: 'Cambia a un modelo más rápido si la tarea es simple',
      condition: (ctx) => {
        const isSimple = ctx.task.split(/\s+/).length < 50;
        const hasFasterModel = ctx.availableModels.some(m =>
          m.id !== ctx.currentModel.id &&
          m.averageLatencyMs < ctx.currentModel.averageLatencyMs * 0.6
        );
        return isSimple && hasFasterModel && ctx.performance.time > 5000;
      },
      action: async (ctx) => {
        const faster = ctx.availableModels
          .filter(m => m.id !== ctx.currentModel.id)
          .sort((a, b) => a.averageLatencyMs - b.averageLatencyMs)[0];
        return faster || ctx.currentModel;
      }
    });

    // Estrategia 2: Cambio por calidad (tareas complejas → modelo potente)
    this.strategies.push({
      name: 'quality-based',
      description: 'Cambia a un modelo más potente para tareas complejas',
      condition: (ctx) => {
        const isComplex = ctx.task.split(/\s+/).length > 200 || ctx.stepNumber > 5;
        const hasBetterModel = ctx.availableModels.some(m =>
          m.id !== ctx.currentModel.id &&
          m.popularity > ctx.currentModel.popularity * 1.1
        );
        return isComplex && hasBetterModel && ctx.performance.successRate < 0.8;
      },
      action: async (ctx) => {
        const better = ctx.availableModels
          .filter(m => m.id !== ctx.currentModel.id)
          .sort((a, b) => b.popularity - a.popularity)[0];
        return better || ctx.currentModel;
      }
    });

    // Estrategia 3: Cambio por costo (costo acumulado alto → modelo barato)
    this.strategies.push({
      name: 'cost-based',
      description: 'Cambia a un modelo más barato si el costo acumulado es alto',
      condition: (ctx) => {
        const isExpensive = ctx.performance.cost > 0.10;
        const hasCheaperModel = ctx.availableModels.some(m =>
          m.id !== ctx.currentModel.id &&
          m.costPer1kInput < ctx.currentModel.costPer1kInput * 0.5
        );
        return isExpensive && hasCheaperModel;
      },
      action: async (ctx) => {
        const cheaper = ctx.availableModels
          .filter(m => m.id !== ctx.currentModel.id)
          .sort((a, b) => a.costPer1kInput - b.costPer1kInput)[0];
        return cheaper || ctx.currentModel;
      }
    });

    // Estrategia 4: Preferencia del usuario
    this.strategies.push({
      name: 'user-preference',
      description: 'Cambia al modelo preferido por el usuario',
      condition: (ctx) => !!ctx.userPreference && ctx.userPreference !== ctx.currentModel.id,
      action: async (ctx) => {
        const preferred = ctx.availableModels.find(m =>
          m.id === ctx.userPreference || m.name === ctx.userPreference
        );
        return preferred || ctx.currentModel;
      }
    });

    // Estrategia 5: Adaptativa (aprende de mutaciones pasadas)
    this.strategies.push({
      name: 'adaptive',
      description: 'Usa aprendizaje de mutaciones pasadas para optimizar selección',
      condition: (_ctx) => {
        if (this.mutationHistory.length < 3) return false;
        const recentMutations = this.mutationHistory.slice(-5);
        const successfulMutations = recentMutations.filter(m => {
          const score = this.adaptiveScores.get(m.to) || 0;
          return score > 0.7;
        });
        return successfulMutations.length > 0;
      },
      action: async (ctx) => {
        // Buscar el modelo con mejor score adaptativo
        let bestModel = ctx.currentModel;
        let bestScore = this.adaptiveScores.get(ctx.currentModel.id) || 0.5;

        for (const model of ctx.availableModels) {
          const score = this.adaptiveScores.get(model.id) || 0;
          if (score > bestScore) {
            bestScore = score;
            bestModel = model;
          }
        }

        return bestModel;
      }
    });
  }

  /**
   * Evalúa si se debe mutar el modelo y, si es así, realiza la mutación.
   *
   * Este es el método principal que se llama en cada paso del agent loop.
   */
  async evaluateAndMutate(context: MutationContext): Promise<MutationResult> {
    const originalModel = context.currentModel;

    // Evaluar estrategias en orden de prioridad
    for (const strategy of this.strategies) {
      try {
        if (strategy.condition(context)) {
          const newModel = await strategy.action(context);
          if (newModel.id !== originalModel.id) {
            // Registrar la mutación
            const entry: MutationHistoryEntry = {
              from: originalModel.id,
              to: newModel.id,
              reason: strategy.description,
              strategy: strategy.name,
              timestamp: new Date().toISOString(),
              taskSnippet: context.task.slice(0, 100),
            };
            this.mutationHistory.push(entry);

            // Actualizar el router
            this.router.setActiveModel(newModel);

            return {
              model: newModel,
              reason: strategy.description,
              mutated: true,
              strategyUsed: strategy.name,
              previousModel: originalModel.id,
            };
          }
        }
      } catch (err) {
        console.warn(`[AutoMutation] Error en estrategia ${strategy.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return {
      model: originalModel,
      reason: 'No se detectaron condiciones para mutación',
      mutated: false,
      strategyUsed: 'none',
      previousModel: originalModel.id,
    };
  }

  /**
   * Registra el resultado de una llamada para actualizar scores adaptativos.
   * Llamar después de cada llamada LLM exitosa o fallida.
   */
  recordCallOutcome(modelId: string, success: boolean, latencyMs: number): void {
    const currentScore = this.adaptiveScores.get(modelId) || 0.5;
    const latencyFactor = Math.max(0, 1 - latencyMs / 10000); // Penalizar >10s
    const outcome = success ? 1 : 0;

    // Media móvil exponencial
    const alpha = 0.3;
    const newScore = alpha * (outcome * 0.7 + latencyFactor * 0.3) + (1 - alpha) * currentScore;
    this.adaptiveScores.set(modelId, newScore);
  }

  // ============================================================
  // CONSULTAS
  // ============================================================

  getMutationHistory(): MutationHistoryEntry[] {
    return [...this.mutationHistory];
  }

  getStats(): {
    totalMutations: number;
    mostCommonStrategy: string;
    mostCommonReason: string;
    adaptiveScores: Record<string, number>;
  } {
    const strategies = this.mutationHistory.map(m => m.strategy);
    const mostCommonStrategy = this.getMostFrequent(strategies);

    const reasons = this.mutationHistory.map(m => m.reason);
    const mostCommonReason = this.getMostFrequent(reasons);

    const scores: Record<string, number> = {};
    for (const [id, score] of this.adaptiveScores) {
      scores[id] = Math.round(score * 100) / 100;
    }

    return {
      totalMutations: this.mutationHistory.length,
      mostCommonStrategy,
      mostCommonReason,
      adaptiveScores: scores,
    };
  }

  private getMostFrequent(arr: string[]): string {
    if (arr.length === 0) return '';
    const counts = new Map<string, number>();
    for (const item of arr) {
      counts.set(item, (counts.get(item) || 0) + 1);
    }
    let maxCount = 0;
    let maxItem = '';
    for (const [item, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        maxItem = item;
      }
    }
    return maxItem;
  }
}
