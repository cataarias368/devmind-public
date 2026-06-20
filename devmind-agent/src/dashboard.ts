// ============================================================
// src/dashboard.ts - Panel de Control Web (HTML/JS Vanilla)
// ============================================================

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { AgentCore, LLMMessage } from './types.js';
import type { SelfMutationEngine, MutationPlan } from './core/self-mutation.js';
import type { LLMRouter } from './llm-router.js';

interface DashboardConfig {
  port: number;
  agentCore: AgentCore;
  apiKey: string;
  allowedOrigins?: string[];
  mutationEngine?: SelfMutationEngine;
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
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 60;

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
  private mutationEngine: SelfMutationEngine | undefined;
  private llmRouter: LLMRouter | undefined;

  constructor(config: DashboardConfig) {
    this.config = config;
    this.mutationEngine = config.mutationEngine;
    this.llmRouter = config.llmRouter;
  }

  /** Set or update the mutation engine (can be called after construction). */
  setMutationEngine(engine: SelfMutationEngine): void {
    this.mutationEngine = engine;
  }

  /** Set or update the LLM router. */
  setLLMRouter(router: LLMRouter): void {
    this.llmRouter = router;
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

    // CORS
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
      res.end(JSON.stringify({ error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' }));
      return;
    }

    // Auth for API routes
    if (url.startsWith('/api/')) {
      const authHeader = req.headers.authorization;
      if (authHeader !== `Bearer ${this.config.apiKey}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No autorizado. Inclui Authorization: Bearer <API_AUTH_KEY>' }));
        return;
      }
    }

    try {
      // ---- API Routes ----

      // Chat
      if (url === '/api/chat' && method === 'POST') {
        await this.handleChat(req, res);
        return;
      }

      if (url === '/api/chat/history' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.chatHistory));
        return;
      }

      // Logs
      if (url === '/api/logs' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.logs.slice(-100)));
        return;
      }

      // Status
      if (url === '/api/status' && method === 'GET') {
        const routerStats = this.llmRouter ? this.llmRouter.getStats() : {};
        const activeProviders = this.llmRouter ? this.llmRouter.getActiveProviders().map(p => ({ id: p.id, name: p.name, models: p.models })) : [];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'running',
          chatMessages: this.chatHistory.length,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          llmProviders: activeProviders,
          llmStats: routerStats,
          mutationEngine: this.mutationEngine ? 'active' : 'inactive',
        }));
        return;
      }

      // ---- Mutation API Routes ----

      if (url === '/api/mutation/analyze' && method === 'GET') {
        await this.handleMutationAnalyze(res);
        return;
      }

      if (url === '/api/mutation/propose' && method === 'POST') {
        await this.handleMutationPropose(req, res);
        return;
      }

      if (url.startsWith('/api/mutation/approve/') && method === 'POST') {
        const planId = url.replace('/api/mutation/approve/', '');
        this.handleMutationApprove(planId, res);
        return;
      }

      if (url.startsWith('/api/mutation/apply/') && method === 'POST') {
        const planId = url.replace('/api/mutation/apply/', '');
        await this.handleMutationApply(planId, res);
        return;
      }

      if (url.startsWith('/api/mutation/rollback/') && method === 'POST') {
        const planId = url.replace('/api/mutation/rollback/', '');
        this.handleMutationRollback(planId, res);
        return;
      }

      if (url === '/api/mutation/plans' && method === 'GET') {
        this.handleMutationPlans(res);
        return;
      }

      if (url === '/api/mutation/auto' && method === 'POST') {
        await this.handleMutationAuto(req, res);
        return;
      }

      // ---- Image Generation API ----

      if (url === '/api/generate-image' && method === 'POST') {
        await this.handleImageGeneration(req, res);
        return;
      }

      // Serve logo
      if (url === '/logo.png' && method === 'GET') {
        try {
          const logoPath = resolve(this.config.agentCore.workspaceRoot, '..', 'logo.png');
          const logoData = await readFile(logoPath);
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

  // ============================================================
  // Chat Handler
  // ============================================================

  private async handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    let parsed: { message?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'JSON invalido' }));
      return;
    }

    const message = typeof parsed.message === 'string' ? parsed.message.slice(0, 5000) : '';

    if (!message) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Mensaje requerido' }));
      return;
    }

    this.chatHistory.push({ role: 'user', content: message, timestamp: Date.now() });

    try {
      const messages: LLMMessage[] = [
        { role: 'system', content: 'Sos DevMind, un asistente de desarrollo autonomo. Responde en espanol de forma clara y profesional. Podes analizar codigo, generar imagenes, y auto-modificarte.' },
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

  // ============================================================
  // Mutation API Handlers
  // ============================================================

  private async handleMutationAnalyze(res: ServerResponse): Promise<void> {
    if (!this.mutationEngine) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Motor de auto-mutacion no disponible' }));
      return;
    }

    try {
      this.log('info', 'Analizando codigo fuente para auto-mutacion...');
      const targets = this.mutationEngine.analyze();
      this.log('info', `Analisis completo: ${targets.length} archivos con mejoras posibles`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        targets: targets.map(t => ({
          file: t.relativePath,
          lineCount: t.lineCount,
          issues: t.issues,
          improvementAreas: t.improvementAreas,
        })),
        total: targets.length,
      }));
    } catch (err) {
      this.log('error', `Analisis fallido: ${err instanceof Error ? err.message : String(err)}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Error analizando codigo' }));
    }
  }

  private async handleMutationPropose(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.mutationEngine) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Motor de auto-mutacion no disponible' }));
      return;
    }

    try {
      const body = await this.readBody(req);
      let parsed: { autoApply?: boolean } = {};
      try { parsed = JSON.parse(body || '{}'); } catch { /* use defaults */ }

      const targets = this.mutationEngine.analyze();
      if (targets.length === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'No se encontraron mejoras posibles', plan: null }));
        return;
      }

      this.log('info', `Generando propuestas para ${targets.length} archivos...`);
      const plan = await this.mutationEngine.propose(targets);

      if (parsed.autoApply && plan.status === 'proposed') {
        this.mutationEngine.approve(plan.id);
        const result = await this.mutationEngine.apply(plan.id);
        this.log('info', `Auto-mutacion ${result.success ? 'exitosa' : 'fallida'}: ${plan.proposal.length} propuestas`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ plan, result }));
        return;
      }

      this.log('info', `Plan generado: ${plan.proposal.length} propuestas (id: ${plan.id})`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        plan: {
          id: plan.id,
          status: plan.status,
          summary: plan.summary,
          proposalCount: plan.proposal.length,
          proposals: plan.proposal.map(p => ({
            file: p.file,
            description: p.description,
            reasoning: p.reasoning,
            riskLevel: p.riskLevel,
            category: p.category,
          })),
        },
      }));
    } catch (err) {
      this.log('error', `Propuesta fallida: ${err instanceof Error ? err.message : String(err)}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Error generando propuestas: ' + (err instanceof Error ? err.message : String(err)) }));
    }
  }

  private handleMutationApprove(planId: string, res: ServerResponse): void {
    if (!this.mutationEngine) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Motor de auto-mutacion no disponible' }));
      return;
    }

    try {
      const plan = this.mutationEngine.approve(decodeURIComponent(planId));
      this.log('info', `Plan aprobado: ${plan.id}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ plan: { id: plan.id, status: plan.status } }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }

  private async handleMutationApply(planId: string, res: ServerResponse): Promise<void> {
    if (!this.mutationEngine) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Motor de auto-mutacion no disponible' }));
      return;
    }

    try {
      const decodedId = decodeURIComponent(planId);
      // Auto-approve if still in proposed state
      try { this.mutationEngine.approve(decodedId); } catch { /* already approved or other status */ }

      this.log('info', `Aplicando plan: ${decodedId}`);
      const result = await this.mutationEngine.apply(decodedId);
      this.log('info', `Plan ${result.success ? 'aplicado exitosamente' : 'fallo'}: ${result.errors.join(', ') || 'sin errores'}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        result: {
          success: result.success,
          compilationOk: result.compilationOk,
          errors: result.errors,
          planStatus: result.plan.status,
        },
      }));
    } catch (err) {
      this.log('error', `Aplicar plan fallo: ${err instanceof Error ? err.message : String(err)}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }

  private handleMutationRollback(planId: string, res: ServerResponse): void {
    if (!this.mutationEngine) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Motor de auto-mutacion no disponible' }));
      return;
    }

    try {
      const plan = this.mutationEngine.rollback(decodeURIComponent(planId));
      this.log('info', `Plan revertido: ${plan.id}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ plan: { id: plan.id, status: plan.status } }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }

  private handleMutationPlans(res: ServerResponse): void {
    if (!this.mutationEngine) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Motor de auto-mutacion no disponible' }));
      return;
    }

    try {
      // Access plans from the engine via getPlans if available, otherwise return empty
      const plans = (this.mutationEngine as unknown as { getPlans?: () => MutationPlan[] }).getPlans?.() ?? [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ plans: plans.map(p => ({
        id: p.id,
        status: p.status,
        summary: p.summary,
        proposalCount: p.proposal.length,
        timestamp: p.timestamp,
      }))}));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }

  private async handleMutationAuto(_req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.mutationEngine) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Motor de auto-mutacion no disponible' }));
      return;
    }

    try {
      this.log('info', 'Iniciando auto-mutacion completamente autonoma...');
      const targets = this.mutationEngine.analyze();

      if (targets.length === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'No se encontraron mejoras posibles', applied: 0 }));
        return;
      }

      const plan = await this.mutationEngine.propose(targets);

      if (plan.status === 'proposed') {
        this.mutationEngine.approve(plan.id);
      }

      const result = await this.mutationEngine.apply(plan.id);
      this.log('info', `Auto-mutacion autonoma ${result.success ? 'exitosa' : 'fallida'}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        applied: plan.proposal.length,
        success: result.success,
        errors: result.errors,
        compilationOk: result.compilationOk,
        planId: plan.id,
      }));
    } catch (err) {
      this.log('error', `Auto-mutacion fallo: ${err instanceof Error ? err.message : String(err)}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }

  // ============================================================
  // Image Generation Handler
  // ============================================================

  private async handleImageGeneration(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    let parsed: { prompt?: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'JSON invalido' }));
      return;
    }

    const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.slice(0, 2000) : '';
    if (!prompt) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Prompt requerido' }));
      return;
    }

    try {
      const result = await this.config.agentCore.imageProvider.generate(prompt);
      this.log('info', `Imagen generada: ${prompt.slice(0, 50)}...`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      this.log('error', `Error generando imagen: ${err instanceof Error ? err.message : String(err)}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Error generando imagen' }));
    }
  }

  // ============================================================
  // Utility Methods
  // ============================================================

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

  // ============================================================
  // Dashboard HTML
  // ============================================================

  private getDashboardHTML(): string {
    return `<!DOCTYPE html>
<html lang="es" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DevMind Agent v3.0 - Dashboard</title>
  <style>
    :root {
      --bg: #0f172a; --surface: #1e293b; --surface2: #334155;
      --text: #e2e8f0; --text2: #94a3b8; --accent: #818cf8;
      --accent2: #6366f1; --success: #34d399; --error: #f87171;
      --warning: #fbbf24; --border: #475569; --radius: 8px;
    }
    [data-theme="light"] {
      --bg: #f8fafc; --surface: #ffffff; --surface2: #f1f5f9;
      --text: #1e293b; --text2: #64748b; --accent: #6366f1;
      --accent2: #4f46e5; --success: #10b981; --error: #ef4444;
      --warning: #f59e0b; --border: #cbd5e1;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); display: flex; height: 100vh; }

    /* Sidebar */
    .sidebar { width: 260px; background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; }
    .sidebar .logo { padding: 1.25rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 0.75rem; }
    .sidebar .logo img { width: 36px; height: 36px; border-radius: 8px; }
    .sidebar .logo h1 { font-size: 1.15rem; color: var(--accent); }
    .sidebar .logo .ver { font-size: 0.7rem; color: var(--text2); margin-left: 0.5rem; }
    .sidebar nav { flex: 1; padding: 0.5rem 0; overflow-y: auto; }
    .sidebar nav a { display: flex; align-items: center; gap: 0.75rem; padding: 0.7rem 1.25rem; color: var(--text2); text-decoration: none; transition: all 0.2s; cursor: pointer; font-size: 0.9rem; }
    .sidebar nav a:hover, .sidebar nav a.active { color: var(--accent); background: var(--surface2); }
    .sidebar nav a .icon { font-size: 1.1rem; width: 1.5rem; text-align: center; }
    .sidebar .section-label { padding: 0.75rem 1.25rem 0.25rem; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text2); font-weight: 600; }
    .theme-toggle { margin-top: auto; padding: 1rem 1.25rem; border-top: 1px solid var(--border); cursor: pointer; color: var(--text2); background: none; border-left: none; border-right: none; border-bottom: none; text-align: left; font-size: 0.9rem; display: flex; align-items: center; gap: 0.75rem; }
    .theme-toggle:hover { color: var(--accent); }

    /* Main */
    .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .tab-content { flex: 1; overflow-y: auto; padding: 1.5rem; display: none; }
    .tab-content.active { display: flex; flex-direction: column; }

    /* Chat */
    .chat-messages { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.75rem; padding-bottom: 1rem; }
    .msg { max-width: 75%; padding: 0.75rem 1rem; border-radius: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
    .msg.user { align-self: flex-end; background: var(--accent2); color: #fff; }
    .msg.assistant { align-self: flex-start; background: var(--surface2); }
    .chat-input { display: flex; gap: 0.5rem; padding-top: 1rem; border-top: 1px solid var(--border); }
    .chat-input input { flex: 1; padding: 0.75rem 1rem; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 0.95rem; outline: none; }
    .chat-input input:focus { border-color: var(--accent); }
    .chat-input button { padding: 0.75rem 1.5rem; border-radius: var(--radius); border: none; background: var(--accent2); color: #fff; font-weight: 600; cursor: pointer; transition: opacity 0.2s; }
    .chat-input button:hover { opacity: 0.9; }
    .chat-input button:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Mutation Panel */
    .mutation-panel { display: flex; flex-direction: column; gap: 1rem; }
    .mutation-header { display: flex; justify-content: space-between; align-items: center; }
    .mutation-header h2 { font-size: 1.3rem; color: var(--accent); }
    .mutation-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .btn { padding: 0.5rem 1rem; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; font-size: 0.85rem; transition: all 0.2s; display: inline-flex; align-items: center; gap: 0.4rem; }
    .btn:hover { border-color: var(--accent); color: var(--accent); }
    .btn-primary { background: var(--accent2); color: #fff; border-color: var(--accent2); }
    .btn-primary:hover { opacity: 0.9; }
    .btn-success { background: var(--success); color: #fff; border-color: var(--success); }
    .btn-danger { background: var(--error); color: #fff; border-color: var(--error); }
    .btn-warning { background: var(--warning); color: #000; border-color: var(--warning); }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .mutation-log { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; max-height: 400px; overflow-y: auto; font-family: monospace; font-size: 0.82rem; line-height: 1.6; }
    .mutation-log .log-line { padding: 0.15rem 0; }
    .mutation-log .log-line.success { color: var(--success); }
    .mutation-log .log-line.error { color: var(--error); }
    .mutation-log .log-line.warning { color: var(--warning); }
    .mutation-log .log-line.info { color: var(--accent); }
    .proposal-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; margin-bottom: 0.75rem; }
    .proposal-card .prop-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
    .proposal-card .prop-category { padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
    .prop-category.bugfix { background: #f8717120; color: var(--error); }
    .prop-category.performance { background: #818cf820; color: var(--accent); }
    .prop-category.reliability { background: #34d39920; color: var(--success); }
    .prop-category.refactor { background: #fbbf2420; color: var(--warning); }
    .prop-category.security { background: #f8717140; color: var(--error); }
    .prop-category.feature { background: #818cf830; color: var(--accent); }
    .prop-category.dependency { background: #94a3b820; color: var(--text2); }
    .prop-risk { padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600; }
    .prop-risk.low { background: #34d39920; color: var(--success); }
    .prop-risk.medium { background: #fbbf2420; color: var(--warning); }
    .prop-risk.high { background: #f8717120; color: var(--error); }

    /* Image Gallery */
    .image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1rem; }
    .image-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
    .image-card img { width: 100%; aspect-ratio: 1; object-fit: cover; }
    .image-card .caption { padding: 0.75rem; font-size: 0.85rem; color: var(--text2); }
    .image-gen-form { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
    .image-gen-form input { flex: 1; padding: 0.75rem 1rem; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 0.95rem; outline: none; }
    .image-gen-form input:focus { border-color: var(--accent); }

    /* Video */
    .video-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }
    .video-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
    .video-card video { width: 100%; }
    .video-card .caption { padding: 0.75rem; }

    /* Logs */
    .log-entry { padding: 0.5rem 0; border-bottom: 1px solid var(--border); font-family: monospace; font-size: 0.85rem; }
    .log-entry .level { font-weight: 700; margin-right: 0.5rem; }
    .log-entry .level.info { color: var(--accent); }
    .log-entry .level.error { color: var(--error); }
    .log-entry .level.warn, .log-entry .level.warning { color: var(--warning); }
    .log-entry .time { color: var(--text2); margin-right: 0.5rem; }

    /* Status */
    .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; }
    .status-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; }
    .status-card h3 { color: var(--text2); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .status-card .value { font-size: 1.75rem; font-weight: 700; color: var(--accent); }
    .status-card .sub { font-size: 0.8rem; color: var(--text2); margin-top: 0.25rem; }
    .provider-list { margin-top: 1.5rem; }
    .provider-item { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 0.5rem; }
    .provider-item .p-name { font-weight: 600; }
    .provider-item .p-status { padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.75rem; }
    .provider-item .p-status.active { background: #34d39920; color: var(--success); }
    .provider-item .p-status.inactive { background: #f8717120; color: var(--error); }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--text2); }

    /* Loading spinner */
    .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Empty state */
    .empty-state { text-align: center; padding: 3rem 1rem; color: var(--text2); }
    .empty-state .icon { font-size: 3rem; margin-bottom: 1rem; }
    .empty-state p { font-size: 0.95rem; }
  </style>
</head>
<body>
  <aside class="sidebar">
    <div class="logo">
      <img src="/logo.png" alt="DevMind" onerror="this.style.display='none'">
      <h1>DevMind<span class="ver">v3.0</span></h1>
    </div>
    <nav>
      <div class="section-label">Principal</div>
      <a class="active" onclick="showTab('chat', this)"><span class="icon">\\u{1F4AC}</span> Chat</a>
      <a onclick="showTab('mutation', this)"><span class="icon">\\u{1F9EC}</span> Auto-Mutacion</a>
      <a onclick="showTab('images', this)"><span class="icon">\\u{1F5BC}</span> Imagenes</a>
      <a onclick="showTab('videos', this)"><span class="icon">\\u{1F3AC}</span> Videos</a>
      <div class="section-label">Sistema</div>
      <a onclick="showTab('logs', this)"><span class="icon">\\u{1F4CB}</span> Logs</a>
      <a onclick="showTab('status', this)"><span class="icon">\\u{1F4CA}</span> Status</a>
    </nav>
    <button class="theme-toggle" onclick="toggleTheme()">\\u{1F313} Cambiar Tema</button>
  </aside>

  <div class="main">
    <!-- Chat Tab -->
    <div id="tab-chat" class="tab-content active">
      <div class="chat-messages" id="messages"></div>
      <div class="chat-input">
        <input id="chatInput" placeholder="Escribe un mensaje..." onkeydown="if(event.key==='Enter')sendChat()">
        <button id="chatSendBtn" onclick="sendChat()">Enviar</button>
      </div>
    </div>

    <!-- Auto-Mutation Tab -->
    <div id="tab-mutation" class="tab-content">
      <div class="mutation-panel">
        <div class="mutation-header">
          <h2>\\u{1F9EC} Panel de Auto-Mutacion</h2>
          <div class="mutation-actions">
            <button class="btn" onclick="mutationAnalyze()">\\u{1F50D} Analizar</button>
            <button class="btn btn-primary" onclick="mutationPropose()">\\u{1F4A1} Proponer</button>
            <button class="btn btn-success" onclick="mutationAutoApply()">\\u{26A1} Auto-Aplicar</button>
            <button class="btn btn-danger" onclick="mutationClearLog()">\\u{1F5D1} Limpiar</button>
          </div>
        </div>
        <div id="mutationTargets" style="display:none;">
          <h3 style="margin-bottom:0.5rem;color:var(--text2);font-size:0.9rem;">Archivos analizados:</h3>
          <div id="targetsList"></div>
        </div>
        <div id="mutationProposals" style="display:none;">
          <h3 style="margin-bottom:0.5rem;color:var(--text2);font-size:0.9rem;">Propuestas:</h3>
          <div id="proposalsList"></div>
        </div>
        <div class="mutation-log" id="mutationLog">
          <div class="log-line info">[DevMind] Panel de Auto-Mutacion listo. Hace clic en "Analizar" para comenzar.</div>
        </div>
      </div>
    </div>

    <!-- Images Tab -->
    <div id="tab-images" class="tab-content">
      <div class="image-gen-form">
        <input id="imagePrompt" placeholder="Describe la imagen que queres generar..." onkeydown="if(event.key==='Enter')generateImage()">
        <button class="btn btn-primary" id="imgGenBtn" onclick="generateImage()">Generar</button>
      </div>
      <div class="image-grid" id="imageGrid">
        <div class="empty-state">
          <div class="icon">\\u{1F5BC}</div>
          <p>Escribe un prompt y genera imagenes con IA</p>
        </div>
      </div>
    </div>

    <!-- Videos Tab -->
    <div id="tab-videos" class="tab-content">
      <div class="image-gen-form">
        <input id="videoPrompt" placeholder="Describe la idea para un video..." onkeydown="if(event.key==='Enter')generateVideo()">
        <button class="btn btn-primary" onclick="generateVideo()">Generar Video</button>
      </div>
      <div class="video-grid" id="videoGrid">
        <div class="empty-state">
          <div class="icon">\\u{1F3AC}</div>
          <p>Genera videos estilo anime/procedural con IA</p>
        </div>
      </div>
    </div>

    <!-- Logs Tab -->
    <div id="tab-logs" class="tab-content">
      <div id="logList"></div>
    </div>

    <!-- Status Tab -->
    <div id="tab-status" class="tab-content">
      <div class="status-grid" id="statusGrid"></div>
      <div class="provider-list" id="providerList"></div>
    </div>
  </div>

  <script>
    // ==========================================
    // Auth
    // ==========================================
    const authToken = localStorage.getItem('devmind_auth') || '';

    function authHeaders() {
      const h = { 'Content-Type': 'application/json' };
      if (authToken) h['Authorization'] = 'Bearer ' + authToken;
      return h;
    }

    // ==========================================
    // Navigation
    // ==========================================
    function showTab(name, el) {
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
      document.getElementById('tab-' + name).classList.add('active');
      if (el) el.classList.add('active');
      else document.querySelector('.sidebar nav a:nth-child(2)')?.classList.add('active');

      if (name === 'logs') loadLogs();
      if (name === 'status') loadStatus();
    }

    function toggleTheme() {
      const html = document.documentElement;
      html.dataset.theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
    }

    // ==========================================
    // Chat
    // ==========================================
    async function sendChat() {
      const input = document.getElementById('chatInput');
      const btn = document.getElementById('chatSendBtn');
      const msg = input.value.trim();
      if (!msg) return;
      input.value = '';
      addMessage('user', msg);
      btn.disabled = true;
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ message: msg })
        });
        if (res.status === 401) {
          addMessage('assistant', 'No autorizado. Configura tu token de autenticacion.');
          return;
        }
        const data = await res.json();
        addMessage('assistant', data.response || data.error || 'Sin respuesta');
      } catch (e) {
        addMessage('assistant', 'Error de conexion: ' + e.message);
      } finally {
        btn.disabled = false;
      }
    }

    function addMessage(role, content) {
      const el = document.createElement('div');
      el.className = 'msg ' + role;
      el.textContent = content;
      document.getElementById('messages').appendChild(el);
      document.getElementById('messages').scrollTop = 999999;
    }

    // ==========================================
    // Mutation Panel
    // ==========================================
    let currentPlanId = null;

    function mutationLog(text, type) {
      type = type || 'info';
      const logEl = document.getElementById('mutationLog');
      const line = document.createElement('div');
      line.className = 'log-line ' + type;
      const ts = new Date().toLocaleTimeString();
      line.textContent = '[' + ts + '] ' + text;
      logEl.appendChild(line);
      logEl.scrollTop = 999999;
    }

    function mutationClearLog() {
      document.getElementById('mutationLog').innerHTML = '';
      document.getElementById('mutationTargets').style.display = 'none';
      document.getElementById('mutationProposals').style.display = 'none';
      mutationLog('Log limpiado.', 'info');
    }

    async function mutationAnalyze() {
      mutationLog('Analizando codigo fuente...', 'info');
      try {
        const res = await fetch('/api/mutation/analyze', { headers: authHeaders() });
        if (!res.ok) { const e = await res.json(); mutationLog('Error: ' + (e.error || res.status), 'error'); return; }
        const data = await res.json();
        mutationLog('Analisis completo: ' + data.total + ' archivos con mejoras posibles.', data.total > 0 ? 'success' : 'warning');

        const targetsDiv = document.getElementById('mutationTargets');
        const listDiv = document.getElementById('targetsList');
        targetsDiv.style.display = 'block';
        listDiv.innerHTML = '';

        for (const t of data.targets) {
          const card = document.createElement('div');
          card.className = 'proposal-card';
          card.innerHTML = '<div class="prop-header"><strong>' + esc(t.file) + '</strong><span style="color:var(--text2);font-size:0.8rem">' + t.lineCount + ' lineas</span></div>' +
            '<div style="font-size:0.85rem;">' +
            (t.issues.length > 0 ? '<div style="color:var(--error);margin-bottom:0.3rem;">Issues: ' + t.issues.map(i => esc(i)).join(', ') + '</div>' : '') +
            (t.improvementAreas.length > 0 ? '<div style="color:var(--warning);">Mejoras: ' + t.improvementAreas.map(i => esc(i)).join(', ') + '</div>' : '') +
            '</div>';
          listDiv.appendChild(card);
        }
      } catch (e) {
        mutationLog('Error de conexion: ' + e.message, 'error');
      }
    }

    async function mutationPropose() {
      mutationLog('Generando propuestas de mutacion...', 'info');
      try {
        const res = await fetch('/api/mutation/propose', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({})
        });
        if (!res.ok) { const e = await res.json(); mutationLog('Error: ' + (e.error || res.status), 'error'); return; }
        const data = await res.json();

        if (!data.plan) {
          mutationLog('No se encontraron mejoras posibles.', 'warning');
          return;
        }

        currentPlanId = data.plan.id;
        mutationLog('Plan generado: ' + data.plan.proposalCount + ' propuestas (id: ' + data.plan.id + ')', 'success');

        const propDiv = document.getElementById('mutationProposals');
        const listDiv = document.getElementById('proposalsList');
        propDiv.style.display = 'block';
        listDiv.innerHTML = '';

        for (const p of data.plan.proposals) {
          const card = document.createElement('div');
          card.className = 'proposal-card';
          card.innerHTML =
            '<div class="prop-header">' +
              '<span class="prop-category ' + esc(p.category) + '">' + esc(p.category) + '</span>' +
              '<span class="prop-risk ' + esc(p.riskLevel) + '">Riesgo: ' + esc(p.riskLevel) + '</span>' +
            '</div>' +
            '<div style="font-weight:600;margin-bottom:0.3rem;">' + esc(p.description) + '</div>' +
            '<div style="font-size:0.85rem;color:var(--text2);">' + esc(p.reasoning) + '</div>' +
            '<div style="font-size:0.8rem;color:var(--text2);margin-top:0.3rem;">Archivo: ' + esc(p.file) + '</div>' +
            '<div style="margin-top:0.5rem;"><button class="btn btn-success btn-sm" onclick="mutationApplyOne(\\'' + esc(p.file) + '\\')">Aplicar</button></div>';
          listDiv.appendChild(card);
        }

        // Add "Apply All" button
        const applyAllBtn = document.createElement('button');
        applyAllBtn.className = 'btn btn-primary';
        applyAllBtn.style.marginTop = '0.75rem';
        applyAllBtn.textContent = 'Aplicar Todas las Propuestas';
        applyAllBtn.onclick = function() { mutationApply(currentPlanId); };
        listDiv.appendChild(applyAllBtn);
      } catch (e) {
        mutationLog('Error de conexion: ' + e.message, 'error');
      }
    }

    async function mutationApply(planId) {
      if (!planId) { mutationLog('No hay plan para aplicar. Genera propuestas primero.', 'warning'); return; }
      mutationLog('Aplicando plan: ' + planId + '...', 'info');
      try {
        const res = await fetch('/api/mutation/apply/' + encodeURIComponent(planId), {
          method: 'POST',
          headers: authHeaders()
        });
        if (!res.ok) { const e = await res.json(); mutationLog('Error: ' + (e.error || res.status), 'error'); return; }
        const data = await res.json();
        const r = data.result;
        if (r.success) {
          mutationLog('Mutacion aplicada exitosamente! Compilacion: ' + (r.compilationOk ? 'OK' : 'FALLO'), 'success');
        } else {
          mutationLog('Mutacion fallo. Errores: ' + r.errors.join('; '), 'error');
          if (!r.compilationOk) {
            mutationLog('Compilacion fallo - se ejecuto rollback automatico.', 'warning');
          }
        }
      } catch (e) {
        mutationLog('Error de conexion: ' + e.message, 'error');
      }
    }

    async function mutationApplyOne(file) {
      mutationLog('Aplicando mutacion para: ' + file, 'info');
      // Apply the whole plan since we can't apply individual proposals via API
      if (currentPlanId) {
        await mutationApply(currentPlanId);
      } else {
        mutationLog('No hay plan activo. Genera propuestas primero.', 'warning');
      }
    }

    async function mutationAutoApply() {
      mutationLog('Iniciando auto-mutacion completamente autonoma...', 'info');
      try {
        const res = await fetch('/api/mutation/auto', {
          method: 'POST',
          headers: authHeaders()
        });
        if (!res.ok) { const e = await res.json(); mutationLog('Error: ' + (e.error || res.status), 'error'); return; }
        const data = await res.json();
        if (data.applied > 0) {
          mutationLog('Auto-mutacion completada! ' + data.applied + ' mutaciones aplicadas. Exito: ' + data.success, data.success ? 'success' : 'error');
        } else {
          mutationLog('No se encontraron mejoras para aplicar.', 'warning');
        }
        if (data.errors && data.errors.length > 0) {
          for (const e of data.errors) mutationLog('  Error: ' + e, 'error');
        }
      } catch (e) {
        mutationLog('Error de conexion: ' + e.message, 'error');
      }
    }

    // ==========================================
    // Image Generation
    // ==========================================
    async function generateImage() {
      const input = document.getElementById('imagePrompt');
      const prompt = input.value.trim();
      if (!prompt) return;
      input.value = '';

      const grid = document.getElementById('imageGrid');
      // Remove empty state
      const empty = grid.querySelector('.empty-state');
      if (empty) empty.remove();

      // Add loading card
      const card = document.createElement('div');
      card.className = 'image-card';
      card.innerHTML = '<div style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;background:var(--surface2);"><div class="spinner"></div></div><div class="caption">Generando: ' + esc(prompt.slice(0, 50)) + '...</div>';
      grid.insertBefore(card, grid.firstChild);

      try {
        const res = await fetch('/api/generate-image', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ prompt })
        });
        const data = await res.json();
        if (data.url) {
          card.innerHTML = '<img src="' + esc(data.url) + '" alt="' + esc(prompt) + '" onerror="this.parentElement.innerHTML=\\'<div style=\\\\'aspect-ratio:1;display:flex;align-items:center;justify-content:center;color:var(--text2)\\\\'>Error cargando imagen</div>\\'"><div class="caption">' + esc(prompt.slice(0, 100)) + '</div>';
        } else if (data.error) {
          card.innerHTML = '<div style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;color:var(--error);padding:1rem;text-align:center;">' + esc(data.error) + '</div><div class="caption">Error</div>';
        }
      } catch (e) {
        card.innerHTML = '<div style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;color:var(--error);padding:1rem;">Error de conexion</div><div class="caption">Error</div>';
      }
    }

    // ==========================================
    // Video Generation
    // ==========================================
    async function generateVideo() {
      const input = document.getElementById('videoPrompt');
      const prompt = input.value.trim();
      if (!prompt) return;
      input.value = '';
      // Video generation is handled through chat for now
      addMessage('user', 'Genera un video: ' + prompt);
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ message: 'Genera un video con esta idea: ' + prompt })
        });
        const data = await res.json();
        addMessage('assistant', data.response || data.error || 'Sin respuesta');
      } catch (e) {
        addMessage('assistant', 'Error: ' + e.message);
      }
      // Switch to chat tab
      showTab('chat', document.querySelector('.sidebar nav a'));
    }

    // ==========================================
    // Logs
    // ==========================================
    async function loadLogs() {
      try {
        const headers = {};
        if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
        const res = await fetch('/api/logs', { headers });
        if (res.status === 401) return;
        const logs = await res.json();
        const container = document.getElementById('logList');
        container.innerHTML = '';
        logs.forEach(l => {
          const div = document.createElement('div');
          div.className = 'log-entry';
          const timeSpan = document.createElement('span');
          timeSpan.className = 'time';
          timeSpan.textContent = new Date(l.timestamp).toLocaleTimeString();
          const levelSpan = document.createElement('span');
          levelSpan.className = 'level ' + l.level;
          levelSpan.textContent = l.level.toUpperCase();
          const msgSpan = document.createElement('span');
          msgSpan.textContent = l.message;
          div.appendChild(timeSpan);
          div.appendChild(levelSpan);
          div.appendChild(msgSpan);
          container.appendChild(div);
        });
        if (logs.length === 0) {
          container.innerHTML = '<div class="empty-state"><p>Sin logs aun.</p></div>';
        }
      } catch {}
    }

    // ==========================================
    // Status
    // ==========================================
    async function loadStatus() {
      try {
        const headers = {};
        if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
        const res = await fetch('/api/status', { headers });
        if (res.status === 401) return;
        const s = await res.json();

        document.getElementById('statusGrid').innerHTML =
          '<div class="status-card"><h3>Estado</h3><div class="value" style="color:var(--success)">' + esc(s.status) + '</div></div>' +
          '<div class="status-card"><h3>Mensajes</h3><div class="value">' + s.chatMessages + '</div></div>' +
          '<div class="status-card"><h3>Uptime</h3><div class="value">' + Math.floor(s.uptime / 60) + ' min</div><div class="sub">' + Math.floor(s.uptime / 3600) + ' horas</div></div>' +
          '<div class="status-card"><h3>Memoria</h3><div class="value">' + Math.round(s.memory.heapUsed / 1024 / 1024) + ' MB</div></div>' +
          '<div class="status-card"><h3>Motor Mutacion</h3><div class="value" style="color:' + (s.mutationEngine === 'active' ? 'var(--success)' : 'var(--text2)') + '">' + esc(s.mutationEngine || 'N/A') + '</div></div>';

        // Provider list
        const pList = document.getElementById('providerList');
        if (s.llmProviders && s.llmProviders.length > 0) {
          pList.innerHTML = '<h3 style="margin-bottom:0.75rem;color:var(--text2);font-size:0.9rem;">Proveedores LLM</h3>';
          for (const p of s.llmProviders) {
            pList.innerHTML += '<div class="provider-item"><div><span class="p-name">' + esc(p.name) + '</span><div style="font-size:0.8rem;color:var(--text2);">' + p.models.join(', ') + '</div></div><span class="p-status active">Activo</span></div>';
          }
        } else {
          pList.innerHTML = '<div class="empty-state"><p>No hay proveedores LLM activos</p></div>';
        }
      } catch {}
    }

    // ==========================================
    // Utils
    // ==========================================
    function esc(str) {
      if (str == null) return '';
      return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ==========================================
    // Auto-refresh
    // ==========================================
    setInterval(loadLogs, 5000);
    setInterval(loadStatus, 10000);

    // ==========================================
    // Auth prompt
    // ==========================================
    if (!authToken) {
      const token = prompt('Ingresa tu API Auth Key para acceder al Dashboard (por defecto: devmind-local-dev):');
      if (token) {
        localStorage.setItem('devmind_auth', token);
        location.reload();
      }
    }
  </script>
</body>
</html>`;
  }
}
