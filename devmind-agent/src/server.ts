// ============================================================
// src/server.ts - API REST para Control Externo de DevMind
// ============================================================

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { z } from 'zod';
import type { AgentCore, LLMMessage } from './types.js';

interface ServerConfig {
  port: number;
  agentCore: AgentCore;
  apiKey: string;
  allowedOrigins?: string[];
}

// --- Rate Limiter ---

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimiter = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minuto
const RATE_LIMIT_MAX = 60; // 60 requests por minuto

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimiter.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

// --- Zod Schemas ---

const ChatSchema = z.object({
  message: z.string().min(1).max(5000),
  system: z.string().max(2000).optional(),
});

const ImageSchema = z.object({
  prompt: z.string().min(1).max(2000),
  type: z.enum(['icon', 'diagram', 'mockup', 'general']).optional(),
});

export class RestAPIServer {
  private readonly config: ServerConfig;
  private server: ReturnType<typeof createServer> | null = null;

  constructor(config: ServerConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    this.server = createServer(async (req, res) => {
      await this.handleRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.config.port, () => {
        console.log(`🌐 API REST corriendo en http://localhost:${this.config.port}`);
        resolve();
      });
      this.server!.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close(err => (err ? reject(err) : resolve()));
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url || '/';
    const method = req.method || 'GET';
    const clientIp = req.socket.remoteAddress || 'unknown';

    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // CORS con allowlist
    const allowedOrigins = this.config.allowedOrigins || ['http://localhost:3000', 'http://localhost:3001'];
    const origin = req.headers.origin || '';
    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Vary', 'Origin');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Rate limiting
    if (!checkRateLimit(clientIp)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Demasiadas solicitudes. Intentá de nuevo más tarde.' }));
      return;
    }

    // Autenticación por API Auth Key (separada de GLM_API_KEY)
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${this.config.apiKey}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No autorizado. Incluí Authorization: Bearer <API_AUTH_KEY>' }));
      return;
    }

    try {
      // Routing
      if (url === '/api/v1/chat' && method === 'POST') {
        await this.handleChat(req, res);
      } else if (url === '/api/v1/generate-image' && method === 'POST') {
        await this.handleImageGeneration(req, res);
      } else if (url === '/api/v1/status' && method === 'GET') {
        this.handleStatus(res);
      } else if (url === '/api/v1/memory' && method === 'GET') {
        await this.handleMemory(req, res);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint no encontrado' }));
      }
    } catch (err) {
      // Log detallado solo en servidor
      console.error('API Error:', err instanceof Error ? err.message : String(err));
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Error interno del servidor' }));
    }
  }

  private async handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'JSON inválido' }));
      return;
    }

    const result = ChatSchema.safeParse(parsed);
    if (!result.success) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Datos inválidos', details: result.error.issues.map(i => i.message) }));
      return;
    }

    const { message, system } = result.data;

    const messages: LLMMessage[] = [];
    if (system) {
      // Sandbox: el system prompt del usuario se prefija como contexto, no como instrucción directa
      messages.push({ role: 'system', content: `[Contexto del usuario] ${system}` });
    }
    messages.push({ role: 'user', content: message });

    try {
      const response = await this.config.agentCore.llmProvider.call(messages);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        response: response.choices[0]?.message?.content,
        usage: response.usage,
      }));
    } catch (err) {
      console.error('Chat API error:', err instanceof Error ? err.message : String(err));
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Error procesando la solicitud' }));
    }
  }

  private async handleImageGeneration(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'JSON inválido' }));
      return;
    }

    const result = ImageSchema.safeParse(parsed);
    if (!result.success) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Datos inválidos', details: result.error.issues.map(i => i.message) }));
      return;
    }

    const { prompt, type } = result.data;

    try {
      let imageResult;
      switch (type) {
        case 'icon':
          imageResult = await this.config.agentCore.imageProvider.generateIcon(prompt);
          break;
        case 'diagram':
          imageResult = await this.config.agentCore.imageProvider.generateDiagram(prompt);
          break;
        case 'mockup':
          imageResult = await this.config.agentCore.imageProvider.generateMockup(prompt);
          break;
        default:
          imageResult = await this.config.agentCore.imageProvider.generate(prompt);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(imageResult));
    } catch (err) {
      console.error('Image API error:', err instanceof Error ? err.message : String(err));
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Error generando imagen' }));
    }
  }

  private handleStatus(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'running',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    }));
  }

  private async handleMemory(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const entries = await this.config.agentCore.memoryStore.getByCategory('learning');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ entries, total: entries.length }));
    } catch (err) {
      console.error('Memory API error:', err instanceof Error ? err.message : String(err));
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Error accediendo a la memoria' }));
    }
  }

  private readBody(req: IncomingMessage, maxBytes = 1_000_000): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      let size = 0;
      req.on('data', chunk => {
        size += chunk.length;
        if (size > maxBytes) {
          req.destroy();
          reject(new Error('Body too large'));
          return;
        }
        body += chunk;
      });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }
}
