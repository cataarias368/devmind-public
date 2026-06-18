// ============================================================
// src/model-router.ts - Router Multi-Modelo con Fallback y Métricas
// ============================================================

import type { LLMMessage, LLMResponse, ToolDefinition } from './types.js';
import {
  type LLMModel,
  scanAvailableModels,
  findModelById,
  rankModelsForTask,
} from './llm-scanner.js';
import { GLM47Provider } from './llm-provider.js';

/**
 * Interfaz genérica que cualquier proveedor LLM debe implementar
 * para poder ser utilizado por el ModelRouter.
 */
export interface LLMProviderAdapter {
  model: LLMModel;
  call(messages: LLMMessage[], tools?: ToolDefinition[]): Promise<LLMResponse>;
  callStream?(messages: LLMMessage[]): AsyncGenerator<string>;
}

/**
 * Configuración del ModelRouter.
 */
export interface ModelRouterConfig {
  /** Modelo preferido por defecto */
  defaultModelId?: string;
  /** Activar auto-mutación basada en rendimiento */
  autoMutation?: boolean;
  /** Modelo activo actual (se puede cambiar dinámicamente) */
  activeModelId?: string;
  /** Priority weights para ranking */
  priorities?: { quality: number; cost: number; speed: number };
}

/**
 * Métricas de rendimiento acumuladas por modelo.
 */
interface ModelMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  totalTokensUsed: number;
  totalCostUsd: number;
  totalLatencyMs: number;
  lastUsed: string;
}

/**
 * Resultado de una operación de routing.
 */
export interface RoutingResult {
  model: LLMModel;
  provider: LLMProviderAdapter;
  reason: string;
}

/**
 * El ModelRouter es el cerebro de selección de modelos de DevMind 3.0.
 *
 * Responsabilidades:
 * 1. Mantener un registro de modelos disponibles y sus proveedores
 * 2. Seleccionar el mejor modelo para cada tarea
 * 3. Cambiar de modelo dinámicamente (auto-mutación)
 * 4. Acumular métricas de rendimiento para decisiones informadas
 * 5. Hacer fallback a modelos alternativos si el primario falla
 */
export class ModelRouter {
  private providers: Map<string, LLMProviderAdapter> = new Map();
  private availableModels: LLMModel[] = [];
  private activeModel: LLMModel;
  private config: ModelRouterConfig;
  private metrics: Map<string, ModelMetrics> = new Map();

  constructor(config: ModelRouterConfig = {}) {
    this.config = config;
    this.availableModels = scanAvailableModels();

    // Determinar modelo activo
    const modelId = config.activeModelId || config.defaultModelId;
    const found = modelId ? findModelById(modelId) : undefined;
    this.activeModel = found || this.availableModels[0] || findModelById('glm-4')!;

    // Inicializar proveedores disponibles
    this.initializeProviders();
  }

  // ============================================================
  // INICIALIZACIÓN
  // ============================================================

  private initializeProviders(): void {
    for (const model of this.availableModels) {
      const provider = this.createProvider(model);
      if (provider) {
        this.providers.set(model.id, provider);
        this.metrics.set(model.id, {
          totalCalls: 0,
          successfulCalls: 0,
          failedCalls: 0,
          totalTokensUsed: 0,
          totalCostUsd: 0,
          totalLatencyMs: 0,
          lastUsed: '',
        });
      }
    }
  }

  /**
   * Crea un adaptador de proveedor para el modelo dado.
   * Actualmente solo ZhipuAI está implementado; los demás son stubs.
   */
  private createProvider(model: LLMModel): LLMProviderAdapter | null {
    switch (model.provider) {
      case 'zhipuai': {
        const apiKey = process.env.GLM_API_KEY;
        if (!apiKey) return null;
        const glmProvider = new GLM47Provider({ apiKey, model: model.modelId });
        return {
          model,
          call: (messages, tools) => glmProvider.call(messages, tools),
        };
      }
      case 'openai':
      case 'anthropic':
      case 'google':
      case 'local':
        // TODO: Implementar adaptadores para otros proveedores
        return null;
      default:
        return null;
    }
  }

  // ============================================================
  // ROUTING
  // ============================================================

  /**
   * Selecciona el mejor modelo para una tarea y devuelve
   * el proveedor listo para usar.
   */
  route(task: string): RoutingResult {
    // Si solo hay un modelo disponible, usarlo directamente
    if (this.availableModels.length <= 1 || this.providers.size <= 1) {
      const provider = this.providers.get(this.activeModel.id);
      if (provider) {
        return { model: this.activeModel, provider, reason: 'Único modelo disponible' };
      }
    }

    // Rankear modelos para la tarea
    const priorities = this.config.priorities || { quality: 0.5, cost: 0.3, speed: 0.2 };
    const ranked = rankModelsForTask(task, this.availableModels, priorities);

    // Seleccionar el mejor que tenga proveedor disponible
    for (const model of ranked) {
      const provider = this.providers.get(model.id);
      if (provider) {
        const reason = model.id === this.activeModel.id
          ? 'Modelo activo es el mejor para esta tarea'
          : `Mejor modelo para la tarea: ${model.name} (score: calidad=${model.popularity}/100)`;

        this.activeModel = model;
        return { model, provider, reason };
      }
    }

    // Fallback: usar modelo activo actual
    const fallbackProvider = this.providers.get(this.activeModel.id);
    if (fallbackProvider) {
      return { model: this.activeModel, provider: fallbackProvider, reason: 'Fallback a modelo activo' };
    }

    // Último recurso: primer proveedor disponible
    const firstProvider = this.providers.values().next().value;
    if (firstProvider) {
      return { model: firstProvider.model, provider: firstProvider, reason: 'Último recurso: primer proveedor' };
    }

    throw new Error('No hay proveedores LLM disponibles. Verificá tus API keys en .env');
  }

  /**
   * Ejecuta una llamada LLM con fallback automático.
   * Si el modelo primario falla, intenta con el siguiente mejor.
   */
  async callWithFallback(
    messages: LLMMessage[],
    tools?: ToolDefinition[],
    maxRetries: number = 2
  ): Promise<LLMResponse & { modelUsed: string; fallbackUsed: boolean }> {
    const ranked = rankModelsForTask(
      messages.map(m => m.content).join(' '),
      this.availableModels,
      this.config.priorities
    );

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < Math.min(maxRetries + 1, ranked.length); attempt++) {
      const model = ranked[attempt];
      const provider = this.providers.get(model.id);
      if (!provider) continue;

      const startTime = Date.now();

      try {
        const response = await provider.call(messages, tools);
        const latencyMs = Date.now() - startTime;

        // Registrar métricas exitosas
        this.recordMetrics(model.id, true, response.usage?.total_tokens || 0, latencyMs, model);

        this.activeModel = model;
        return {
          ...response,
          modelUsed: model.id,
          fallbackUsed: attempt > 0,
        };
      } catch (err) {
        const latencyMs = Date.now() - startTime;
        lastError = err instanceof Error ? err : new Error(String(err));

        // Registrar métricas de fallo
        this.recordMetrics(model.id, false, 0, latencyMs, model);

        console.warn(`⚠️ [ModelRouter] ${model.name} falló (${attempt + 1}/${maxRetries + 1}): ${lastError.message}`);

        if (attempt < maxRetries) {
          console.log(`🔄 [ModelRouter] Intentando con siguiente modelo...`);
        }
      }
    }

    throw new Error(`Todos los modelos fallaron. Último error: ${lastError?.message || 'Desconocido'}`);
  }

  // ============================================================
  // GESTIÓN DE MODELO ACTIVO
  // ============================================================

  /**
   * Cambia el modelo activo manualmente.
   */
  setActiveModel(model: LLMModel): void {
    if (!this.providers.has(model.id)) {
      console.warn(`[ModelRouter] Modelo ${model.id} no tiene proveedor disponible`);
    }
    this.activeModel = model;
  }

  /**
   * Cambia el modelo activo por ID.
   */
  setActiveModelById(modelId: string): boolean {
    const model = findModelById(modelId);
    if (model) {
      this.setActiveModel(model);
      return true;
    }
    return false;
  }

  getActiveModel(): LLMModel {
    return this.activeModel;
  }

  getAvailableModels(): LLMModel[] {
    return this.availableModels;
  }

  getConfiguredProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  // ============================================================
  // MÉTRICAS
  // ============================================================

  private recordMetrics(
    modelId: string,
    success: boolean,
    tokens: number,
    latencyMs: number,
    model: LLMModel
  ): void {
    const metrics = this.metrics.get(modelId);
    if (!metrics) return;

    metrics.totalCalls++;
    if (success) metrics.successfulCalls++;
    else metrics.failedCalls++;
    metrics.totalTokensUsed += tokens;
    metrics.totalCostUsd += (tokens / 1000) * (model.costPer1kInput + model.costPer1kOutput) / 2;
    metrics.totalLatencyMs += latencyMs;
    metrics.lastUsed = new Date().toISOString();
  }

  getMetrics(modelId?: string): Record<string, ModelMetrics> | ModelMetrics | undefined {
    if (modelId) return this.metrics.get(modelId);

    const result: Record<string, ModelMetrics> = {};
    for (const [id, m] of this.metrics) {
      result[id] = m;
    }
    return result;
  }

  /**
   * Devuelve un resumen de rendimiento para el AutoMutationEngine.
   */
  getPerformanceSummary(modelId: string): {
    successRate: number;
    avgLatencyMs: number;
    avgCostPerCall: number;
    totalCost: number;
  } {
    const m = this.metrics.get(modelId);
    if (!m || m.totalCalls === 0) {
      return { successRate: 0, avgLatencyMs: 0, avgCostPerCall: 0, totalCost: 0 };
    }
    return {
      successRate: m.successfulCalls / m.totalCalls,
      avgLatencyMs: Math.round(m.totalLatencyMs / m.totalCalls),
      avgCostPerCall: m.totalCalls > 0 ? m.totalCostUsd / m.totalCalls : 0,
      totalCost: m.totalCostUsd,
    };
  }
}
