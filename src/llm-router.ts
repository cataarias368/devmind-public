// ============================================================
// src/llm-router.ts - Enrutador Inteligente de Proveedores API
// ============================================================

import type { LLMMessage, LLMResponse, ToolDefinition } from './types.js';
import { GLM47Provider } from './llm-provider.js';

export interface LLMProviderInfo {
  id: string;
  name: string;
  type: 'free' | 'trial' | 'paid';
  models: string[];
  isAvailable: () => boolean;
  call: (messages: LLMMessage[], tools?: ToolDefinition[]) => Promise<LLMResponse>;
  costPer1kTokens: number;
  speed: 'fast' | 'medium' | 'slow';
  quality: 'low' | 'medium' | 'high';
  limits: { requestsPerDay: number; tokensPerMinute: number };
}

export interface ProviderStatus {
  id: string;
  name: string;
  active: boolean;
  models: string[];
  speed: string;
  quality: string;
  type: string;
}

export class LLMRouter {
  private providers: Map<string, LLMProviderInfo> = new Map();
  private glmProvider: GLM47Provider;
  private defaultProviderId: string = 'zhipuai';

  constructor(glmApiKey: string) {
    this.glmProvider = new GLM47Provider({ apiKey: glmApiKey });
    this.registerProviders();
  }

  private registerProviders(): void {
    if (process.env.GOOGLE_API_KEY) {
      this.providers.set('google-ai-studio', {
        id: 'google-ai-studio', name: 'Google AI Studio', type: 'free',
        models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemma-3-27b-it'],
        isAvailable: () => !!process.env.GOOGLE_API_KEY,
        call: async (messages, _tools) => {
          const { GoogleGenerativeAI } = await import('@google/generative-ai');
          const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
          const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
          const contents = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' as const : 'user' as const, parts: [{ text: m.content }] }));
          const systemInstruction = messages.find(m => m.role === 'system')?.content;
          const result = await model.generateContent({ contents, ...(systemInstruction ? { systemInstruction } : {}) });
          return { id: `google-${Date.now()}`, choices: [{ index: 0, message: { role: 'assistant', content: result.response.text() }, finish_reason: 'stop' }] } as LLMResponse;
        },
        costPer1kTokens: 0, speed: 'fast', quality: 'high',
        limits: { requestsPerDay: 1500, tokensPerMinute: 250000 },
      });
    }

    if (process.env.MISTRAL_API_KEY) {
      this.providers.set('mistral', {
        id: 'mistral', name: 'Mistral AI', type: 'free',
        models: ['mistral-small-latest', 'mistral-medium-latest', 'codestral-latest'],
        isAvailable: () => !!process.env.MISTRAL_API_KEY,
        call: async (messages, _tools) => {
          const { Mistral } = await import('@mistralai/mistralai');
          const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY! });
          const formattedMessages = messages.map(m => ({ role: m.role as 'system' | 'user' | 'assistant' | 'tool', content: m.content }));
          const response = await client.chat.complete({ model: 'mistral-small-latest', messages: formattedMessages });
          return { id: `mistral-${Date.now()}`, choices: [{ index: 0, message: { role: 'assistant', content: response.choices?.[0]?.message?.content || '' }, finish_reason: response.choices?.[0]?.finishReason || 'stop' }], } as LLMResponse;
        },
        costPer1kTokens: 0, speed: 'medium', quality: 'high',
        limits: { requestsPerDay: 2000, tokensPerMinute: 500000 },
      });
    }

    if (process.env.GROQ_API_KEY) {
      this.providers.set('groq', {
        id: 'groq', name: 'Groq', type: 'free',
        models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
        isAvailable: () => !!process.env.GROQ_API_KEY,
        call: async (messages, tools) => {
          const Groq = await import('groq-sdk');
          const client = new Groq.default({ apiKey: process.env.GROQ_API_KEY! });
          const formattedMessages = messages.filter(m => m.role !== 'tool').map(m => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content }));
          const response = await client.chat.completions.create({
            model: 'llama-3.3-70b-versatile', messages: formattedMessages,
            ...(tools ? { tools: tools.map(t => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: { type: 'object' as const, properties: Object.fromEntries(t.parameters.map(p => [p.name, { type: p.type, description: p.description }])), required: t.parameters.filter(p => p.required).map(p => p.name) } } })) } : {}),
          });
          return { id: `groq-${response.id}`, choices: response.choices.map(c => ({ index: c.index, message: { role: c.message.role, content: c.message.content, ...(c.message.tool_calls ? { tool_calls: c.message.tool_calls } : {}) }, finish_reason: c.finish_reason || 'stop' })), usage: response.usage ? { prompt_tokens: response.usage.prompt_tokens, completion_tokens: response.usage.completion_tokens, total_tokens: response.usage.total_tokens } : undefined } as LLMResponse;
        },
        costPer1kTokens: 0, speed: 'fast', quality: 'medium',
        limits: { requestsPerDay: 1000, tokensPerMinute: 12000 },
      });
    }

    if (process.env.OPENROUTER_API_KEY) {
      this.providers.set('openrouter', {
        id: 'openrouter', name: 'OpenRouter', type: 'free',
        models: ['meta-llama/llama-3.3-70b-instruct:free', 'qwen/qwen3-coder:free'],
        isAvailable: () => !!process.env.OPENROUTER_API_KEY,
        call: async (messages, _tools) => {
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST', headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://devmind.agent', 'X-Title': 'DevMind Agent' },
            body: JSON.stringify({ model: 'meta-llama/llama-3.3-70b-instruct:free', messages: messages.map(m => ({ role: m.role, content: m.content })) }),
          });
          if (!response.ok) throw new Error(`OpenRouter error: ${response.status}`);
          return (await response.json()) as LLMResponse;
        },
        costPer1kTokens: 0, speed: 'medium', quality: 'medium',
        limits: { requestsPerDay: 100, tokensPerMinute: 1000 },
      });
    }

    if (process.env.CLOUDFLARE_API_KEY && process.env.CLOUDFLARE_ACCOUNT_ID) {
      this.providers.set('cloudflare', {
        id: 'cloudflare', name: 'Cloudflare Workers AI', type: 'free',
        models: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
        isAvailable: () => !!(process.env.CLOUDFLARE_API_KEY && process.env.CLOUDFLARE_ACCOUNT_ID),
        call: async (messages, _tools) => {
          const accountId = process.env.CLOUDFLARE_ACCOUNT_ID!;
          const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast`, {
            method: 'POST', headers: { 'Authorization': `Bearer ${process.env.CLOUDFLARE_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: messages.map(m => ({ role: m.role, content: m.content })) }),
          });
          if (!response.ok) throw new Error(`Cloudflare error: ${response.status}`);
          const data = await response.json() as { result?: { response?: string } };
          return { id: `cf-${Date.now()}`, choices: [{ index: 0, message: { role: 'assistant', content: data.result?.response || '' }, finish_reason: 'stop' }] } as LLMResponse;
        },
        costPer1kTokens: 0, speed: 'medium', quality: 'medium',
        limits: { requestsPerDay: 100, tokensPerMinute: 10000 },
      });
    }
  }

  async getBestProvider(task: string): Promise<LLMProviderInfo | null> {
    const lower = task.toLowerCase();
    const available = Array.from(this.providers.values()).filter(p => p.isAvailable());
    if (available.length === 0) return null;
    if (lower.includes('codigo') || lower.includes('code') || lower.includes('programar') || lower.includes('refactor') || lower.includes('implementar') || lower.includes('api')) {
      const mistral = available.find(p => p.id === 'mistral');
      if (mistral) return mistral;
      const groq = available.find(p => p.id === 'groq');
      if (groq) return groq;
    }
    if (lower.includes('razonar') || lower.includes('analizar') || lower.includes('arquitectura') || lower.includes('disenar') || lower.includes('planificar') || lower.includes('estrategia')) {
      const google = available.find(p => p.id === 'google-ai-studio');
      if (google) return google;
    }
    if (lower.length < 100) {
      const groq = available.find(p => p.id === 'groq');
      if (groq) return groq;
    }
    const sorted = available.sort((a, b) => {
      if (a.type === 'free' && b.type !== 'free') return -1;
      if (a.type !== 'free' && b.type === 'free') return 1;
      const speedOrder = { fast: 0, medium: 1, slow: 2 };
      return speedOrder[a.speed] - speedOrder[b.speed];
    });
    return sorted[0];
  }

  async callWithFallback(messages: LLMMessage[], task: string, tools?: ToolDefinition[], maxRetries = 3): Promise<LLMResponse & { providerUsed: string; fallbackUsed: boolean }> {
    const provider = await this.getBestProvider(task);
    if (!provider) {
      const response = await this.glmProvider.call(messages, tools);
      return { ...response, providerUsed: 'zhipuai', fallbackUsed: false };
    }
    let lastError: Error | null = null;
    const tried = new Set<string>();
    for (let attempt = 0; attempt < Math.min(maxRetries, this.providers.size + 1); attempt++) {
      const currentProvider = attempt === 0 ? provider : Array.from(this.providers.values()).filter(p => p.isAvailable() && !tried.has(p.id)).sort((a, b) => { const speedOrder = { fast: 0, medium: 1, slow: 2 }; return speedOrder[a.speed] - speedOrder[b.speed]; })[0];
      if (!currentProvider) break;
      tried.add(currentProvider.id);
      try {
        const response = await currentProvider.call(messages, tools);
        return { ...response, providerUsed: currentProvider.id, fallbackUsed: attempt > 0 };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`[LLMRouter] ${currentProvider.name} fallo (intento ${attempt + 1}): ${lastError.message}`);
      }
    }
    console.warn('[LLMRouter] Todos los proveedores externos fallaron. Usando GLM-4 como fallback.');
    try {
      const response = await this.glmProvider.call(messages, tools);
      return { ...response, providerUsed: 'zhipuai', fallbackUsed: true };
    } catch (glmErr) {
      throw new Error(`Todos los proveedores fallaron (incluido GLM-4): ${lastError?.message}; GLM-4: ${glmErr instanceof Error ? glmErr.message : String(glmErr)}`);
    }
  }

  getStats(): { providers: number; active: number; providerList: ProviderStatus[] } {
    const all = Array.from(this.providers.values());
    const active = all.filter(p => p.isAvailable());
    return { providers: all.length, active: active.length, providerList: all.map(p => ({ id: p.id, name: p.name, active: p.isAvailable(), models: p.models, speed: p.speed, quality: p.quality, type: p.type })) };
  }

  getActiveProviders(): ProviderStatus[] {
    return Array.from(this.providers.values()).filter(p => p.isAvailable()).map(p => ({ id: p.id, name: p.name, active: true, models: p.models, speed: p.speed, quality: p.quality, type: p.type }));
  }

  setDefaultProvider(providerId: string): boolean {
    const provider = this.providers.get(providerId);
    if (provider && provider.isAvailable()) { this.defaultProviderId = providerId; return true; }
    return false;
  }

  getDefaultProviderId(): string { return this.defaultProviderId; }
  getGLMProvider(): GLM47Provider { return this.glmProvider; }
}
