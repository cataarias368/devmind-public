// ============================================================
// src/server.ts - API REST para Control Externo de DevMind
// ============================================================

import { createServer, IncomingMessage, ServerResponse } from 'http';
import type { AgentCore, LLMMessage } from './types.js';

interface ServerConfig {
  port: number;
  agentCore: AgentCore;
  apiKey: string;
}

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

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Autenticación por API Key
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${this.config.apiKey}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No autorizado. Incluí Authorization: Bearer <API_KEY>' }));
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
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Error interno del servidor' }));
    }
  }

  private async handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { message, system } = JSON.parse(body) as { message: string; system?: string };

    if (!message) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Campo "message" requerido' }));
      return;
    }

    const messages: LLMMessage[] = [];
    if (system) {
      messages.push({ role: 'system', content: system });
    }
    messages.push({ role: 'user', content: message });

    const response = await this.config.agentCore.llmProvider.call(messages);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      response: response.choices[0]?.message?.content,
      usage: response.usage,
    }));
  }

  private async handleImageGeneration(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { prompt, type } = JSON.parse(body) as { prompt: string; type?: 'icon' | 'diagram' | 'mockup' | 'general' };

    if (!prompt) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Campo "prompt" requerido' }));
      return;
    }

    let result;
    switch (type) {
      case 'icon':
        result = await this.config.agentCore.imageProvider.generateIcon(prompt);
        break;
      case 'diagram':
        result = await this.config.agentCore.imageProvider.generateDiagram(prompt);
        break;
      case 'mockup':
        result = await this.config.agentCore.imageProvider.generateMockup(prompt);
        break;
      default:
        result = await this.config.agentCore.imageProvider.generate(prompt);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  }

  private handleStatus(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'running',
      workspaceRoot: this.config.agentCore.workspaceRoot,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    }));
  }

  private async handleMemory(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    const entries = await this.config.agentCore.memoryStore.getByCategory('learning');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ entries, total: entries.length }));
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }
}
