// ============================================================
// src/llm-router.ts - Multi-Provider LLM Router with Fallback
// ============================================================

import { GLM47Provider } from './llm-provider.js';
import type { LLMMessage, LLMResponse, ToolDefinition } from './types.js';

// --- Provider Info Interface ---

export type ProviderType = 'free' | 'trial' | 'paid';
export type TaskType = 'code' | 'reasoning' | 'simple' | 'creative' | 'tools';

export interface LLMProviderInfo {
  id: string;
  name: string;
  type: ProviderType;
  models: string[];
  isAvailable(): boolean;
  call(messages: LLMMessage[], tools?: ToolDefinition[]): Promise<LLMResponse>;
  costPer1kTokens: number;
  speed: number;     // 1-10 scale
  quality: number;   // 1-10 scale
  limits?: {
    rpm?: number;
    tpm?: number;
    daily?: number;
  };
}

// --- Google AI Studio Provider ---

class GoogleAIProvider implements LLMProviderInfo {
  id = 'google-ai';
  name = 'Google AI Studio';
  type: ProviderType = 'free';
  models = ['gemini-2.5-flash', 'gemini-2.5-pro'];
  costPer1kTokens = 0;
  speed = 8;
  quality = 9;
  limits = { rpm: 15, tpm: 1000000, daily: 1500 };

  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.GOOGLE_AI_API_KEY;
  }

  isAvailable(): boolean {
    return typeof this.apiKey === 'string' && this.apiKey.length > 0;
  }

  async call(messages: LLMMessage[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    // @ts-expect-error - optional runtime dependency
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(this.apiKey!);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : m.role === 'system' ? 'user' : m.role,
      parts: [{ text: m.content }],
    }));

    const request: Record<string, unknown> = { contents };

    if (tools && tools.length > 0) {
      request.tools = [{
        functionDeclarations: tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: this.buildSchema(t.parameters),
        })),
      }];
    }

    const result = await model.generateContent(request);
    const response = result.response;
    const text = response.text();

    return {
      id: `google-${Date.now()}`,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };
  }

  private buildSchema(params: ToolDefinition['parameters']): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const p of params) {
      properties[p.name] = {
        type: p.type,
        description: p.description,
        ...(p.enum ? { enum: p.enum } : {}),
      };
      if (p.required) required.push(p.name);
    }

    return {
      type: 'object',
      properties,
      required,
    };
  }
}

// --- Mistral AI Provider ---

class MistralProvider implements LLMProviderInfo {
  id = 'mistral';
  name = 'Mistral AI';
  type: ProviderType = 'free';
  models = ['mistral-small-latest'];
  costPer1kTokens = 0;
  speed = 9;
  quality = 7;
  limits = { rpm: 60, tpm: 500000 };

  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.MISTRAL_API_KEY;
  }

  isAvailable(): boolean {
    return typeof this.apiKey === 'string' && this.apiKey.length > 0;
  }

  async call(messages: LLMMessage[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    // @ts-expect-error - optional runtime dependency
    const { Mistral } = await import('mistralai');
    const client = new Mistral({ apiKey: this.apiKey! });

    const body: Record<string, unknown> = {
      model: 'mistral-small-latest',
      messages,
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: {
            type: 'object' as const,
            properties: Object.fromEntries(
              t.parameters.map(p => [p.name, {
                type: p.type,
                description: p.description,
                ...(p.enum ? { enum: p.enum } : {}),
              }])
            ),
            required: t.parameters.filter(p => p.required).map(p => p.name),
          },
        },
      }));
    }

    const result = await client.chat.complete(body);
    const choice = result.choices?.[0];

    return {
      id: result.id ?? `mistral-${Date.now()}`,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: choice?.message?.content ?? '',
          tool_calls: choice?.message?.tool_calls as LLMResponse['choices'][0]['message']['tool_calls'],
        },
        finish_reason: choice?.finish_reason ?? 'stop',
      }],
      usage: result.usage as LLMResponse['usage'],
    };
  }
}

// --- Groq Provider ---

class GroqProvider implements LLMProviderInfo {
  id = 'groq';
  name = 'Groq';
  type: ProviderType = 'free';
  models = ['llama-3.3-70b-versatile'];
  costPer1kTokens = 0;
  speed = 10;
  quality = 8;
  limits = { rpm: 30, tpm: 6000 };

  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.GROQ_API_KEY;
  }

  isAvailable(): boolean {
    return typeof this.apiKey === 'string' && this.apiKey.length > 0;
  }

  async call(messages: LLMMessage[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    // @ts-expect-error - optional runtime dependency
    const Groq = (await import('groq-sdk')).default;
    const client = new Groq({ apiKey: this.apiKey! });

    const body: Record<string, unknown> = {
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.7,
      max_tokens: 4096,
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: {
            type: 'object' as const,
            properties: Object.fromEntries(
              t.parameters.map(p => [p.name, {
                type: p.type,
                description: p.description,
                ...(p.enum ? { enum: p.enum } : {}),
              }])
            ),
            required: t.parameters.filter(p => p.required).map(p => p.name),
          },
        },
      }));
    }

    const result = await client.chat.completions.create(body as Parameters<typeof client.chat.completions.create>[0]);

    return {
      id: result.id ?? `groq-${Date.now()}`,
      choices: result.choices.map((c: { index: number; message: { role: string; content: string | null; tool_calls?: unknown }; finish_reason?: string }) => ({
        index: c.index,
        message: {
          role: c.message.role,
          content: c.message.content,
          tool_calls: c.message.tool_calls as LLMResponse['choices'][0]['message']['tool_calls'],
        },
        finish_reason: c.finish_reason ?? 'stop',
      })),
      usage: result.usage as LLMResponse['usage'],
    };
  }
}

// --- OpenRouter Provider ---

class OpenRouterProvider implements LLMProviderInfo {
  id = 'openrouter';
  name = 'OpenRouter';
  type: ProviderType = 'free';
  models = ['meta-llama/llama-3.3-70b-instruct:free'];
  costPer1kTokens = 0;
  speed = 7;
  quality = 7;
  limits = { rpm: 20, tpm: 100000 };

  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
  }

  isAvailable(): boolean {
    return typeof this.apiKey === 'string' && this.apiKey.length > 0;
  }

  async call(messages: LLMMessage[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      messages,
      temperature: 0.7,
      max_tokens: 4096,
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: {
            type: 'object',
            properties: Object.fromEntries(
              t.parameters.map(p => [p.name, {
                type: p.type,
                description: p.description,
                ...(p.enum ? { enum: p.enum } : {}),
              }])
            ),
            required: t.parameters.filter(p => p.required).map(p => p.name),
          },
        },
      }));
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://devmind-agent.dev',
        'X-Title': 'DevMind Agent',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as LLMResponse;
    return data;
  }
}

// --- Cloudflare Workers AI Provider ---

class CloudflareAIProvider implements LLMProviderInfo {
  id = 'cloudflare-ai';
  name = 'Cloudflare Workers AI';
  type: ProviderType = 'free';
  models = ['@cf/meta/llama-3.3-70b-instruct'];
  costPer1kTokens = 0;
  speed = 7;
  quality = 7;
  limits = { rpm: 50, tpm: 100000 };

  private apiKey: string | undefined;
  private accountId: string | undefined;

  constructor() {
    this.apiKey = process.env.CLOUDFLARE_API_KEY;
    this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  }

  isAvailable(): boolean {
    return (
      typeof this.apiKey === 'string' && this.apiKey.length > 0 &&
      typeof this.accountId === 'string' && this.accountId.length > 0
    );
  }

  async call(messages: LLMMessage[], _tools?: ToolDefinition[]): Promise<LLMResponse> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/@cf/meta/llama-3.3-70b-instruct`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        messages,
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Cloudflare AI error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as { result: { response: string } };
    const text = data.result?.response ?? '';

    return {
      id: `cf-${Date.now()}`,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };
  }
}

// --- Router-Backed Provider (extends GLM47Provider, delegates to router) ---

export class RouterBackedProvider extends GLM47Provider {
  private router: LLMRouter;

  constructor(router: LLMRouter) {
    // Dummy apiKey '0.0' satisfies the id.secret format required by GLM47Provider
    super({ apiKey: '0.0' });
    this.router = router;
  }

  override async call(messages: LLMMessage[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    return this.router.callWithFallback(messages, 'simple', tools);
  }
}

// --- LLM Router ---

export class LLMRouter {
  private providers: LLMProviderInfo[] = [];
  private defaultProviderId: string | null = null;
  private callStats: Map<string, { calls: number; errors: number; totalMs: number }> = new Map();
  public glmProvider: GLM47Provider | null;

  constructor(glmApiKey?: string) {
    // GLM-4 provider is optional
    if (glmApiKey && glmApiKey.includes('.')) {
      this.glmProvider = new GLM47Provider({ apiKey: glmApiKey });
    } else {
      this.glmProvider = null;
    }

    this.registerProviders();
  }

  private registerProviders(): void {
    // Google AI Studio (Gemini 2.5 Flash/Pro, free)
    const googleProvider = new GoogleAIProvider();
    if (googleProvider.isAvailable()) {
      this.providers.push(googleProvider);
      console.log(`✅ LLM Router: Google AI Studio disponible`);
    }

    // Mistral AI (Mistral Small, free)
    const mistralProvider = new MistralProvider();
    if (mistralProvider.isAvailable()) {
      this.providers.push(mistralProvider);
      console.log(`✅ LLM Router: Mistral AI disponible`);
    }

    // Groq (Llama 3.3 70B, free, supports tools)
    const groqProvider = new GroqProvider();
    if (groqProvider.isAvailable()) {
      this.providers.push(groqProvider);
      console.log(`✅ LLM Router: Groq disponible`);
    }

    // OpenRouter (Llama 3.3 70B free, free)
    const openRouterProvider = new OpenRouterProvider();
    if (openRouterProvider.isAvailable()) {
      this.providers.push(openRouterProvider);
      console.log(`✅ LLM Router: OpenRouter disponible`);
    }

    // Cloudflare Workers AI (Llama 3.3 70B, free)
    const cloudflareProvider = new CloudflareAIProvider();
    if (cloudflareProvider.isAvailable()) {
      this.providers.push(cloudflareProvider);
      console.log(`✅ LLM Router: Cloudflare Workers AI disponible`);
    }

    if (this.glmProvider) {
      console.log(`✅ LLM Router: GLM-4 disponible (fallback)`);
    }

    const totalProviders = this.providers.length + (this.glmProvider ? 1 : 0);
    console.log(`🔗 LLM Router: ${totalProviders} proveedor(es) registrado(s)`);
  }

  /**
   * Task-aware routing: select the best provider for a given task type.
   */
  getBestProvider(task: TaskType = 'simple'): LLMProviderInfo | null {
    // If a default provider is set and available, return it
    if (this.defaultProviderId) {
      const defaultProvider = this.providers.find(p => p.id === this.defaultProviderId && p.isAvailable());
      if (defaultProvider) return defaultProvider;
    }

    const available = this.providers.filter(p => p.isAvailable());
    if (available.length === 0) return null;

    const providerScores = available.map(provider => {
      let score = 0;

      switch (task) {
        case 'code':
          // Code tasks: prefer Mistral or Groq (fast, good at code)
          if (provider.id === 'mistral') score = provider.quality + provider.speed + 2;
          else if (provider.id === 'groq') score = provider.quality + provider.speed + 1;
          else score = provider.quality + provider.speed;
          break;

        case 'reasoning':
          // Reasoning tasks: prefer Google (highest quality)
          if (provider.id === 'google-ai') score = provider.quality + provider.speed + 3;
          else if (provider.id === 'groq') score = provider.quality + provider.speed + 1;
          else score = provider.quality + provider.speed;
          break;

        case 'tools':
          // Tool use: prefer Groq (supports tools well)
          if (provider.id === 'groq') score = provider.quality + provider.speed + 3;
          else if (provider.id === 'google-ai') score = provider.quality + provider.speed + 1;
          else score = provider.quality + provider.speed;
          break;

        case 'creative':
          // Creative: prefer high-quality models
          score = provider.quality * 2 + provider.speed;
          break;

        case 'simple':
        default:
          // Simple tasks: prefer speed
          if (provider.id === 'groq') score = provider.speed * 2 + provider.quality;
          else score = provider.speed + provider.quality;
          break;
      }

      return { provider, score };
    });

    providerScores.sort((a, b) => b.score - a.score);
    return providerScores[0]?.provider ?? null;
  }

  /**
   * Call with fallback: tries the best provider for the task,
   * falls back through other available providers, and uses
   * GLM-4 as a last resort.
   */
  async callWithFallback(
    messages: LLMMessage[],
    task: TaskType = 'simple',
    tools?: ToolDefinition[]
  ): Promise<LLMResponse> {
    const available = this.providers.filter(p => p.isAvailable());

    if (available.length === 0 && !this.glmProvider) {
      throw new Error(
        'No LLM providers available. Configure at least one provider via environment variables: ' +
        'GOOGLE_AI_API_KEY, MISTRAL_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, CLOUDFLARE_API_KEY, or GLM_API_KEY'
      );
    }

    // Build ordered list of providers to try
    const orderedProviders: LLMProviderInfo[] = [];

    // Start with the best provider for this task
    const best = this.getBestProvider(task);
    if (best) {
      orderedProviders.push(best);
    }

    // Add remaining available providers (excluding the best, already added)
    for (const provider of available) {
      if (!orderedProviders.find(p => p.id === provider.id)) {
        orderedProviders.push(provider);
      }
    }

    // Try each provider in order
    const errors: string[] = [];

    for (const provider of orderedProviders) {
      const startTime = Date.now();
      try {
        console.log(`🔄 LLM Router: Intentando ${provider.name} (${provider.models[0]}) para tarea "${task}"`);
        const result = await provider.call(messages, tools);
        const elapsed = Date.now() - startTime;
        this.recordSuccess(provider.id, elapsed);
        console.log(`✅ LLM Router: Éxito con ${provider.name} en ${elapsed}ms`);
        return result;
      } catch (err) {
        const elapsed = Date.now() - startTime;
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.recordError(provider.id, elapsed);
        errors.push(`${provider.name}: ${errorMsg}`);
        console.warn(`⚠️ LLM Router: ${provider.name} falló - ${errorMsg}`);
      }
    }

    // Last resort: GLM-4
    if (this.glmProvider) {
      const startTime = Date.now();
      try {
        console.log(`🔄 LLM Router: Usando GLM-4 como último recurso`);
        const result = await this.glmProvider.call(messages, tools);
        const elapsed = Date.now() - startTime;
        this.recordSuccess('glm-4', elapsed);
        console.log(`✅ LLM Router: Éxito con GLM-4 en ${elapsed}ms`);
        return result;
      } catch (err) {
        const elapsed = Date.now() - startTime;
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.recordError('glm-4', elapsed);
        errors.push(`GLM-4: ${errorMsg}`);
        console.warn(`⚠️ LLM Router: GLM-4 también falló - ${errorMsg}`);
      }
    }

    throw new Error(
      `All LLM providers failed:\n${errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n')}`
    );
  }

  /**
   * Get statistics for all providers.
   */
  getStats(): Record<string, { calls: number; errors: number; avgMs: number }> {
    const stats: Record<string, { calls: number; errors: number; avgMs: number }> = {};

    for (const [id, stat] of this.callStats) {
      stats[id] = {
        calls: stat.calls,
        errors: stat.errors,
        avgMs: stat.calls > 0 ? Math.round(stat.totalMs / stat.calls) : 0,
      };
    }

    return stats;
  }

  /**
   * Get list of currently active (available) providers.
   */
  getActiveProviders(): LLMProviderInfo[] {
    return this.providers.filter(p => p.isAvailable());
  }

  /**
   * Set the default provider by ID.
   */
  setDefaultProvider(providerId: string): void {
    const provider = this.providers.find(p => p.id === providerId);
    if (!provider) {
      throw new Error(`Provider "${providerId}" not found. Available: ${this.providers.map(p => p.id).join(', ')}`);
    }
    this.defaultProviderId = providerId;
    console.log(`🔗 LLM Router: Default provider set to ${provider.name}`);
  }

  private recordSuccess(providerId: string, elapsedMs: number): void {
    const stat = this.callStats.get(providerId) ?? { calls: 0, errors: 0, totalMs: 0 };
    stat.calls++;
    stat.totalMs += elapsedMs;
    this.callStats.set(providerId, stat);
  }

  private recordError(providerId: string, elapsedMs: number): void {
    const stat = this.callStats.get(providerId) ?? { calls: 0, errors: 0, totalMs: 0 };
    stat.calls++;
    stat.errors++;
    stat.totalMs += elapsedMs;
    this.callStats.set(providerId, stat);
  }
}
