// ============================================================
// src/dashboard.ts - Panel de Control Web (HTML/JS Vanilla)
// ============================================================

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFile as readFileAsync } from 'fs/promises';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { AgentCore, LLMMessage } from './types.js';
import type { LLMRouter } from './llm-router.js';

interface DashboardConfig {
  port: number;
  agentCore?: AgentCore; // Opcional: el dashboard funciona sin API key
  apiKey: string;
  allowedOrigins?: string[];
  llmRouter?: LLMRouter;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
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

export class DashboardServer {
  private readonly config: DashboardConfig;
  private server: ReturnType<typeof createServer> | null = null;
  private readonly chatHistory: ChatMessage[] = [];
  private readonly logs: Array<{ level: string; message: string; timestamp: number }> = [];

  constructor(config: DashboardConfig) {
    this.config = config;
  }

  /**
   * Inyecta o actualiza el AgentCore después de que el usuario
   * configura la API Key desde la UI. Permite que el dashboard
   * arranque sin API key y luego la reciba dinámicamente.
   */
  setAgentCore(agentCore: AgentCore): void {
    this.config.agentCore = agentCore;
    this.log('info', 'AgentCore configurado — LLM disponible para chat');
  }

  /**
   * Inyecta o actualiza el LLMRouter después de que el usuario
   * configura la API Key desde la UI.
   */
  setLLMRouter(llmRouter: LLMRouter): void {
    this.config.llmRouter = llmRouter;
  }

  async start(): Promise<void> {
    this.server = createServer(async (req, res) => {
      await this.handleRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.config.port, () => {
        this.log('info', `Dashboard iniciado en http://localhost:${this.config.port}`);
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
      res.end(JSON.stringify({ error: 'Demasiadas solicitudes. Intentá de nuevo en un momento.' }));
      return;
    }

    // Autenticación para rutas API de escritura (chat)
    // Las rutas de solo lectura (status, logs, providers) no requieren auth
    // para que el dashboard funcione sin configuración previa.
    if (url.startsWith('/api/') && url !== '/api/status' && url !== '/api/logs' && url !== '/api/providers/status') {
      const authHeader = req.headers.authorization;
      if (authHeader !== `Bearer ${this.config.apiKey}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No autorizado. Incluí Authorization: Bearer <API_AUTH_KEY>' }));
        return;
      }
    }

    try {
      // API Routes
      if (url === '/api/chat' && method === 'POST') {
        await this.handleChat(req, res);
        return;
      }

      if (url === '/api/chat/history' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.chatHistory));
        return;
      }

      if (url === '/api/logs' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.logs.slice(-100)));
        return;
      }

      if (url === '/api/status' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'running',
          chatMessages: this.chatHistory.length,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        }));
        return;
      }

      // API: Guardar API Key (desde el dashboard, sin auth previa)
      if (url === '/api/config/apikey' && method === 'POST') {
        const body = await this.readBody(req);
        let parsed: { apiKey?: string };
        try {
          parsed = JSON.parse(body);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'JSON invalido' }));
          return;
        }
        const apiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '';
        if (!apiKey) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'API Key requerida' }));
          return;
        }
        // Actualizar en memoria para esta sesion
        process.env.GLM_API_KEY = apiKey;
        this.log('info', 'API Key configurada desde el dashboard');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'API Key configurada correctamente' }));
        return;
      }

      // API: Verificar si API Key esta configurada
      if (url === '/api/config/status' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          hasApiKey: !!process.env.GLM_API_KEY && process.env.GLM_API_KEY.length > 5,
          version: '3.0.0'
        }));
        return;
      }

      // Serve logo
      if (url === '/logo.png' && method === 'GET') {
        try {
          const logoPath = resolve(this.config.agentCore?.workspaceRoot || process.cwd(), '..', 'logo.png');
          const logoData = await readFileAsync(logoPath);
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
          res.end(logoData);
        } catch {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
        return;
      }

      // Serve dashboard HTML
      if (url === '/' || url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.getDashboardHTML());
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    } catch (err) {
      this.log('error', `Request error: ${err instanceof Error ? err.message : String(err)}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Error interno del servidor' }));
    }
  }

  private async handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    let parsed: { message?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'JSON inválido' }));
      return;
    }

    const message = typeof parsed.message === 'string' ? parsed.message.slice(0, 5000) : '';

    if (!message) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Mensaje requerido' }));
      return;
    }

    // Registrar mensaje del usuario
    this.chatHistory.push({ role: 'user', content: message, timestamp: Date.now() });

    // Verificar si hay LLM disponible
    if (!this.config.agentCore?.llmProvider) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API Key no configurada. Configurala desde el panel de Configuracion.' }));
      return;
    }

    try {
      // Llamar al LLM
      const messages: LLMMessage[] = [
        { role: 'system', content: 'Sos DevMind, un asistente de desarrollo. Respondé en español de forma clara y profesional.' },
        ...this.chatHistory.slice(-20).map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ];

      const response = await this.config.agentCore.llmProvider.call(messages);
      const assistantContent = response.choices[0]?.message?.content || 'Sin respuesta';

      this.chatHistory.push({ role: 'assistant', content: assistantContent, timestamp: Date.now() });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ response: assistantContent }));
    } catch (err) {
      this.log('error', `Chat error: ${err instanceof Error ? err.message : String(err)}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Error procesando el mensaje' }));
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

  private log(level: string, message: string): void {
    this.logs.push({ level, message, timestamp: Date.now() });
  }

  /**
   * Devuelve el HTML completo del dashboard (sin React, vanilla JS).
   * Incluye: Chat, Galería de imágenes, Logs, Tema claro/oscuro.
   * XSS-safe: usa textContent en vez de innerHTML para datos dinámicos.
   */
  private getDashboardHTML(): string {
    try {
      const htmlPath = resolve(__dirname, 'ui', 'dashboard.html');
      return readFileSync(htmlPath, 'utf-8');
    } catch {
      return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>DevMind Agent</title></head>
<body style="background:#0a0e17;color:#e6edf5;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">
<div style="text-align:center"><h1>🧠 DevMind Agent</h1><p>Cargando dashboard...</p>
<p style="color:#8b9bb5;font-size:0.85em">No se encontro src/ui/dashboard.html</p></div></body></html>`;
    }
  }
}
