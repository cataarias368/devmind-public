// ============================================================
// src/llm-provider.ts - Proveedor LLM GLM-4 con JWT, Reintentos y Streaming
// ============================================================

import crypto from 'crypto';
import type { LLMMessage, LLMResponse, LLMCallOptions, ToolDefinition } from './types.js';

interface GLM47Config {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxRetries?: number;
  retryDelay?: number;
}

interface JWTHeader {
  alg: string;
  sign_type: string;
}

interface JWTPayload {
  api_key: string;
  exp: number;
  timestamp: number;
}

export class GLM47Provider {
  private readonly apiKeyId: string;
  private readonly apiKeySecret: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly retryDelay: number;

  constructor(config: GLM47Config) {
    const parts = config.apiKey.split('.');
    if (parts.length !== 2) {
      throw new Error('GLM_API_KEY debe tener formato "id.secret". Verificá tu clave en https://open.bigmodel.cn');
    }
    this.apiKeyId = parts[0];
    this.apiKeySecret = parts[1];

    this.model = config.model || 'glm-4';
    this.baseUrl = config.baseUrl || 'https://open.bigmodel.cn/api/paas/v4';
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelay = config.retryDelay ?? 1000;
  }

  /**
   * Genera un JWT para autenticación con la API de ZhipuAI.
   * El token tiene validez de 1 hora.
   */
  private generateToken(): string {
    const now = Date.now();
    const header: JWTHeader = { alg: 'HS256', sign_type: 'SIGN' };
    const payload: JWTPayload = {
      api_key: this.apiKeyId,
      exp: now + 3600 * 1000,
      timestamp: now,
    };

    const encode = (obj: object) =>
      Buffer.from(JSON.stringify(obj)).toString('base64url');

    const headerB64 = encode(header);
    const payloadB64 = encode(payload);
    const content = `${headerB64}.${payloadB64}`;

    const signature = crypto
      .createHmac('sha256', this.apiKeySecret)
      .update(content)
      .digest('base64url');

    return `${content}.${signature}`;
  }

  /**
   * Llamada principal al LLM con reintentos automáticos y manejo de errores.
   */
  async call(
    messages: LLMMessage[],
    tools?: ToolDefinition[],
    options?: LLMCallOptions
  ): Promise<LLMResponse> {
    const token = this.generateToken();
    const url = `${this.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      top_p: options?.topP ?? 0.9,
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: this.buildParametersSchema(t.parameters),
        },
      }));
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          const isRetryable = response.status === 429 || response.status >= 500;

          if (isRetryable && attempt < this.maxRetries) {
            const delay = this.retryDelay * Math.pow(2, attempt - 1);
            console.warn(`⏳ Reintento ${attempt}/${this.maxRetries} tras ${response.status}. Esperando ${delay}ms...`);
            await this.sleep(delay);
            continue;
          }

          throw new Error(`API error ${response.status}: ${errorText}`);
        }

        const data = (await response.json()) as LLMResponse;
        return data;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < this.maxRetries && this.isRetryableError(lastError)) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          console.warn(`⏳ Reintento ${attempt}/${this.maxRetries}. Esperando ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`Falló tras ${this.maxRetries} reintentos: ${lastError?.message}`);
  }

  /**
   * Llamada streaming al LLM. Devuelve un AsyncGenerator de chunks.
   */
  async *callStream(
    messages: LLMMessage[],
    tools?: ToolDefinition[],
    options?: LLMCallOptions
  ): AsyncGenerator<string> {
    const token = this.generateToken();
    const url = `${this.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      stream: true,
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: this.buildParametersSchema(t.parameters),
        },
      }));
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Stream API error ${response.status}: ${await response.text()}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No se pudo obtener el stream de respuesta');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const chunk = JSON.parse(trimmed.slice(6));
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // Ignorar chunks malformados
        }
      }
    }
  }

  /**
   * Convierte los parámetros de herramientas al schema JSON esperado por la API.
   */
  private buildParametersSchema(
    params: ToolDefinition['parameters']
  ): Record<string, unknown> {
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

  private isRetryableError(err: Error): boolean {
    const msg = err.message.toLowerCase();
    return (
      msg.includes('429') ||
      msg.includes('500') ||
      msg.includes('502') ||
      msg.includes('503') ||
      msg.includes('timeout') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
