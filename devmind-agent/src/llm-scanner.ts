// ============================================================
// src/llm-scanner.ts - Catálogo de Modelos y Escaneo de Disponibilidad
// ============================================================

/**
 * Representa un modelo LLM disponible para DevMind.
 * Incluye metadatos de costo, capacidades y rendimiento para
 * que el ModelRouter y AutoMutationEngine tomen decisiones inteligentes.
 */
export interface LLMModel {
  id: string;
  name: string;
  provider: 'zhipuai' | 'openai' | 'anthropic' | 'google' | 'local';
  modelId: string;           // ID real de la API (ej: 'glm-4')
  costPer1kInput: number;    // Costo USD por 1K tokens de input
  costPer1kOutput: number;   // Costo USD por 1K tokens de output
  maxTokens: number;         // Ventana de contexto máxima
  capabilities: ModelCapability[];
  popularity: number;        // Score 0-100 de calidad general
  averageLatencyMs: number;  // Latencia promedio en ms
  supportsToolCalling: boolean;
  supportsStreaming: boolean;
  supportsVision: boolean;
}

export type ModelCapability =
  | 'coding'
  | 'reasoning'
  | 'creative'
  | 'analysis'
  | 'math'
  | 'vision'
  | 'translation'
  | 'summarization'
  | 'architecture'
  | 'refactoring'
  | 'testing'
  | 'documentation';

/**
 * Resultado del escaneo de disponibilidad de un modelo.
 */
export interface ModelAvailability {
  model: LLMModel;
  available: boolean;
  latencyMs: number;
  error?: string;
}

// --- Catálogo de Modelos Conocidos ---

export const MODEL_CATALOG: LLMModel[] = [
  // ZhipuAI (GLM)
  {
    id: 'glm-4',
    name: 'GLM-4',
    provider: 'zhipuai',
    modelId: 'glm-4',
    costPer1kInput: 0.015,
    costPer1kOutput: 0.015,
    maxTokens: 128000,
    capabilities: ['coding', 'reasoning', 'creative', 'analysis', 'translation', 'summarization', 'architecture', 'refactoring', 'testing', 'documentation'],
    popularity: 85,
    averageLatencyMs: 1500,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    id: 'glm-4-flash',
    name: 'GLM-4 Flash',
    provider: 'zhipuai',
    modelId: 'glm-4-flash',
    costPer1kInput: 0.001,
    costPer1kOutput: 0.001,
    maxTokens: 128000,
    capabilities: ['coding', 'summarization', 'translation'],
    popularity: 70,
    averageLatencyMs: 500,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    id: 'glm-4v',
    name: 'GLM-4V',
    provider: 'zhipuai',
    modelId: 'glm-4v',
    costPer1kInput: 0.02,
    costPer1kOutput: 0.02,
    maxTokens: 128000,
    capabilities: ['coding', 'reasoning', 'vision', 'analysis'],
    popularity: 80,
    averageLatencyMs: 2000,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  // OpenAI
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    modelId: 'gpt-4o',
    costPer1kInput: 0.005,
    costPer1kOutput: 0.015,
    maxTokens: 128000,
    capabilities: ['coding', 'reasoning', 'creative', 'analysis', 'vision', 'translation', 'architecture'],
    popularity: 92,
    averageLatencyMs: 1800,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0006,
    maxTokens: 128000,
    capabilities: ['coding', 'summarization', 'translation'],
    popularity: 75,
    averageLatencyMs: 600,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  // Anthropic
  {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-20250514',
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    maxTokens: 200000,
    capabilities: ['coding', 'reasoning', 'creative', 'analysis', 'architecture', 'refactoring', 'testing', 'documentation'],
    popularity: 90,
    averageLatencyMs: 1600,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  // Google
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'google',
    modelId: 'gemini-2.5-pro',
    costPer1kInput: 0.00125,
    costPer1kOutput: 0.005,
    maxTokens: 1000000,
    capabilities: ['coding', 'reasoning', 'creative', 'analysis', 'vision', 'math', 'architecture'],
    popularity: 88,
    averageLatencyMs: 2000,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  // Local (Ollama)
  {
    id: 'local-codeqwen',
    name: 'CodeQwen (Local)',
    provider: 'local',
    modelId: 'codeqwen',
    costPer1kInput: 0,
    costPer1kOutput: 0,
    maxTokens: 32768,
    capabilities: ['coding', 'refactoring', 'testing'],
    popularity: 60,
    averageLatencyMs: 3000,
    supportsToolCalling: false,
    supportsStreaming: true,
    supportsVision: false,
  },
];

/**
 * Escanea y determina qué modelos están disponibles
 * según las API keys configuradas en el entorno.
 */
export function scanAvailableModels(): LLMModel[] {
  const available: LLMModel[] = [];

  for (const model of MODEL_CATALOG) {
    if (isProviderConfigured(model.provider)) {
      available.push(model);
    }
  }

  return available;
}

/**
 * Verifica si un proveedor tiene sus credenciales configuradas.
 */
function isProviderConfigured(provider: LLMModel['provider']): boolean {
  switch (provider) {
    case 'zhipuai':
      return !!process.env.GLM_API_KEY;
    case 'openai':
      return !!process.env.OPENAI_API_KEY;
    case 'anthropic':
      return !!process.env.ANTHROPIC_API_KEY;
    case 'google':
      return !!process.env.GOOGLE_API_KEY;
    case 'local':
      return !!process.env.OLLAMA_HOST;
    default:
      return false;
  }
}

/**
 * Busca un modelo por ID en el catálogo.
 */
export function findModelById(id: string): LLMModel | undefined {
  return MODEL_CATALOG.find(m => m.id === id);
}

/**
 * Busca modelos que tengan una capability específica.
 */
export function findModelsByCapability(capability: ModelCapability): LLMModel[] {
  return MODEL_CATALOG.filter(m =>
    m.capabilities.includes(capability) && isProviderConfigured(m.provider)
  );
}

/**
 * Rankea modelos para una tarea específica basándose en capacidades,
 * costo y latencia. Devuelve los modelos ordenados de mejor a peor.
 */
export function rankModelsForTask(
  task: string,
  availableModels: LLMModel[],
  priorities: { quality: number; cost: number; speed: number } = { quality: 0.5, cost: 0.3, speed: 0.2 }
): LLMModel[] {
  const taskLower = task.toLowerCase();

  // Detectar capacidades requeridas por la tarea
  const requiredCapabilities: ModelCapability[] = [];
  const capabilityKeywords: Record<ModelCapability, string[]> = {
    coding: ['código', 'code', 'programar', 'función', 'implementar', 'api', 'clase'],
    reasoning: ['analizar', 'razonar', 'lógica', 'deducir', 'reasoning', 'debug'],
    creative: ['crear', 'diseñar', 'generar', 'creative', 'innovar', 'escribir'],
    analysis: ['analizar', 'analysis', 'revisar', 'evaluar', 'optimizar', 'auditoría'],
    math: ['cálculo', 'math', 'estadística', 'fórmula', 'algoritmo'],
    vision: ['imagen', 'diagrama', 'visual', 'screenshot', 'mockup', 'diseño'],
    translation: ['traducir', 'translate', 'i18n', 'localización'],
    summarization: ['resumir', 'summarize', 'síntesis', 'abstract'],
    architecture: ['arquitectura', 'architecture', 'diseño del sistema', 'microservicio'],
    refactoring: ['refactor', 'reestructurar', 'limpiar', 'simplificar'],
    testing: ['test', 'testing', 'prueba', 'coverage', 'vitest', 'jest'],
    documentation: ['documentación', 'docs', 'readme', 'documentar', 'guía'],
  };

  for (const [cap, keywords] of Object.entries(capabilityKeywords)) {
    if (keywords.some(kw => taskLower.includes(kw))) {
      requiredCapabilities.push(cap as ModelCapability);
    }
  }

  // Default: coding si no se detecta nada
  if (requiredCapabilities.length === 0) {
    requiredCapabilities.push('coding');
  }

  // Calcular score para cada modelo
  const scored = availableModels.map(model => {
    // Score de capacidad: cuántas de las requeridas tiene
    const capScore = requiredCapabilities.filter(c => model.capabilities.includes(c)).length
      / Math.max(requiredCapabilities.length, 1);

    // Score de calidad (normalizado 0-1)
    const qualityScore = model.popularity / 100;

    // Score de costo (inverso: menor costo = mayor score, normalizado)
    const maxCost = Math.max(...availableModels.map(m => m.costPer1kInput));
    const costScore = maxCost > 0 ? 1 - (model.costPer1kInput / maxCost) : 1;

    // Score de velocidad (inverso: menor latencia = mayor score, normalizado)
    const maxLatency = Math.max(...availableModels.map(m => m.averageLatencyMs));
    const speedScore = maxLatency > 0 ? 1 - (model.averageLatencyMs / maxLatency) : 1;

    // Score total ponderado
    const totalScore =
      capScore * 0.4 +
      qualityScore * priorities.quality * 0.3 +
      costScore * priorities.cost * 0.2 +
      speedScore * priorities.speed * 0.1;

    return { model, totalScore };
  });

  scored.sort((a, b) => b.totalScore - a.totalScore);
  return scored.map(s => s.model);
}
