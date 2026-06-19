// ============================================================
// src/dashboard.ts - Panel de Control Web (HTML/JS Vanilla)
// ============================================================

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFile as readFileAsync, writeFile as writeFileAsync } from 'fs/promises';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { AgentCore, LLMMessage } from './types.js';
import type { LLMRouter } from './llm-router.js';

// Obtener __dirname en ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  private readonly generatedImages: Array<{ prompt: string; url: string; filePath: string; timestamp: number; provider: string }> = [];

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
    // /api/config/apikey tampoco requiere auth — es el punto de entrada
    // para que el usuario configure su primera API Key desde la UI.
    const publicEndpoints = [
      '/api/status', '/api/logs', '/api/providers/status',
      '/api/config/status', '/api/config/providers', '/api/config/apikey',
      '/api/images', '/api/images/generate',
    ];
    const apiKeyConfigured = !!this.config.apiKey && this.config.apiKey !== 'devmind';
    if (url.startsWith('/api/') && !publicEndpoints.includes(url) && apiKeyConfigured) {
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
        let parsed: { apiKey?: string; provider?: string };
        try {
          parsed = JSON.parse(body);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'JSON invalido' }));
          return;
        }
        const apiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '';
        const provider = typeof parsed.provider === 'string' ? parsed.provider : 'zhipuai';
        if (!apiKey) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'API Key requerida' }));
          return;
        }

        // Mapear provider a variable de entorno
        const envKeyMap: Record<string, string> = {
          'zhipuai': 'GLM_API_KEY',
          'google-ai-studio': 'GOOGLE_API_KEY',
          'mistral': 'MISTRAL_API_KEY',
          'groq': 'GROQ_API_KEY',
          'openrouter': 'OPENROUTER_API_KEY',
          'cloudflare': 'CLOUDFLARE_API_KEY',
        };
        const envKey = envKeyMap[provider] || 'GLM_API_KEY';

        // 1. Actualizar en memoria
        process.env[envKey] = apiKey;

        // 2. Persistir en .env
        try {
          const envPath = join(process.cwd(), '.env');
          let envContent = '';
          if (existsSync(envPath)) {
            envContent = readFileSync(envPath, 'utf-8');
          }
          const keyRegex = new RegExp(`^${envKey}=.*$`, 'm');
          if (keyRegex.test(envContent)) {
            envContent = envContent.replace(keyRegex, `${envKey}=${apiKey}`);
          } else {
            envContent += `\n${envKey}=${apiKey}\n`;
          }
          await writeFileAsync(envPath, envContent, 'utf-8');
          this.log('info', `API Key para ${provider} guardada en .env (${envKey})`);
        } catch (envErr) {
          this.log('warn', `No se pudo escribir .env: ${envErr instanceof Error ? envErr.message : String(envErr)}. Key en memoria.`);
        }

        // 3. Re-inyectar AgentCore si no existe aún
        if (!this.config.agentCore) {
          try {
            const { CogViewProvider } = await import('./image-provider.js');
            const { CheckpointManager } = await import('./checkpoint.js');
            const { MemoryStore } = await import('./memory.js');
            const { LLMRouter } = await import('./llm-router.js');

            const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();
            const llmRouter = new LLMRouter(process.env.GLM_API_KEY || '');

            // GLM47Provider solo si la key es de ZhipuAI, si no usar RouterBackedProvider
            let llmProvider;
            if (provider === 'zhipuai' && apiKey.includes('.')) {
              const { GLM47Provider } = await import('./llm-provider.js');
              llmProvider = new GLM47Provider({ apiKey });
            } else {
              const { RouterBackedProvider } = await import('./llm-router.js');
              llmProvider = new RouterBackedProvider(llmRouter);
            }
            const imageProvider = new CogViewProvider({ apiKey: apiKey || 'placeholder', outputDir: resolve(workspaceRoot, 'generated_images') });
            const checkpointManager = new CheckpointManager(workspaceRoot);
            const memoryStore = new MemoryStore(workspaceRoot);
            await checkpointManager.init();
            await memoryStore.init();

            this.setAgentCore({ llmProvider, imageProvider, checkpointManager, memoryStore, workspaceRoot });
            this.setLLMRouter(llmRouter);

            const routerStats = llmRouter.getStats();
            this.log('info', `AgentCore inyectado. Router: ${routerStats.active}/${routerStats.providers} proveedores activos`);
          } catch (injectErr) {
            this.log('error', `Error inyectando AgentCore: ${injectErr instanceof Error ? injectErr.message : String(injectErr)}`);
          }
        }

        // 4. Crear/re-registrar router si no existe o si se agregó un provider nuevo
        if (provider !== 'zhipuai' || !this.config.llmRouter) {
          try {
            const { LLMRouter } = await import('./llm-router.js');
            const glmKey = process.env.GLM_API_KEY || 'placeholder';
            const newRouter = new LLMRouter(glmKey);
            this.setLLMRouter(newRouter);
            const routerStats = newRouter.getStats();
            this.log('info', `Router creado/re-inicializado: ${routerStats.active}/${routerStats.providers} proveedores activos`);
          } catch (routerErr) {
            this.log('warn', `Error creando/re-inicializando router: ${routerErr instanceof Error ? routerErr.message : String(routerErr)}`);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: `API Key para ${provider} configurada correctamente`, provider }));
        return;
      }

      // API: Verificar si API Key esta configurada
      if (url === '/api/config/status' && method === 'GET') {
        const hasAnyKey = !!(
          process.env.GLM_API_KEY ||
          process.env.OPENROUTER_API_KEY ||
          process.env.GOOGLE_API_KEY ||
          process.env.MISTRAL_API_KEY ||
          process.env.GROQ_API_KEY ||
          process.env.CLOUDFLARE_API_KEY
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          hasApiKey: hasAnyKey,
          version: '3.0.0',
          workspace: process.env.WORKSPACE_ROOT || './workspace',
          environment: process.env.NODE_ENV || 'development',
          llmAvailable: !!this.config.agentCore?.llmProvider,
          routerAvailable: !!this.config.llmRouter,
        }));
        return;
      }

      // API: Estado de todos los proveedores LLM
      if (url === '/api/providers/status' && method === 'GET') {
        try {
          if (!this.config.llmRouter) {
            // Sin router: devolver proveedores conocidos como no configurados
            const defaultProviders = [
              { id: 'zhipuai', name: 'GLM-4 (ZhipuAI)', active: false, models: ['glm-4'], speed: 'medium', quality: 'high', type: 'free', configured: !!process.env.GLM_API_KEY },
              { id: 'google-ai-studio', name: 'Google AI Studio', active: false, models: ['gemini-2.5-flash', 'gemini-2.5-pro'], speed: 'fast', quality: 'high', type: 'free', configured: !!process.env.GOOGLE_API_KEY },
              { id: 'mistral', name: 'Mistral AI', active: false, models: ['mistral-small-latest', 'mistral-medium-latest'], speed: 'medium', quality: 'high', type: 'free', configured: !!process.env.MISTRAL_API_KEY },
              { id: 'groq', name: 'Groq', active: false, models: ['llama-3.3-70b-versatile'], speed: 'fast', quality: 'medium', type: 'free', configured: !!process.env.GROQ_API_KEY },
              { id: 'openrouter', name: 'OpenRouter', active: false, models: ['meta-llama/llama-3.3-70b-instruct:free'], speed: 'medium', quality: 'medium', type: 'free', configured: !!process.env.OPENROUTER_API_KEY },
              { id: 'cloudflare', name: 'Cloudflare Workers AI', active: false, models: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast'], speed: 'medium', quality: 'medium', type: 'free', configured: !!(process.env.CLOUDFLARE_API_KEY && process.env.CLOUDFLARE_ACCOUNT_ID) },
            ];
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, data: defaultProviders, timestamp: new Date().toISOString() }));
            return;
          }

          // Con router: obtener estado real
          const stats = this.config.llmRouter.getStats();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, data: stats.providerList, timestamp: new Date().toISOString() }));
        } catch (err) {
          this.log('error', `Providers status error: ${err instanceof Error ? err.message : String(err)}`);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Error obteniendo estado de proveedores', success: false }));
        }
        return;
      }

      // API: Lista de proveedores disponibles (para configuración)
      if (url === '/api/config/providers' && method === 'GET') {
        const providers = [
          { id: 'zhipuai', name: 'GLM-4 (ZhipuAI)', requiresKey: true, keyEnvVar: 'GLM_API_KEY', configured: !!process.env.GLM_API_KEY },
          { id: 'google-ai-studio', name: 'Google AI Studio', requiresKey: true, keyEnvVar: 'GOOGLE_API_KEY', configured: !!process.env.GOOGLE_API_KEY },
          { id: 'mistral', name: 'Mistral AI', requiresKey: true, keyEnvVar: 'MISTRAL_API_KEY', configured: !!process.env.MISTRAL_API_KEY },
          { id: 'groq', name: 'Groq', requiresKey: true, keyEnvVar: 'GROQ_API_KEY', configured: !!process.env.GROQ_API_KEY },
          { id: 'openrouter', name: 'OpenRouter', requiresKey: true, keyEnvVar: 'OPENROUTER_API_KEY', configured: !!process.env.OPENROUTER_API_KEY },
          { id: 'cloudflare', name: 'Cloudflare Workers AI', requiresKey: true, keyEnvVar: 'CLOUDFLARE_API_KEY', configured: !!(process.env.CLOUDFLARE_API_KEY && process.env.CLOUDFLARE_ACCOUNT_ID) },
        ];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ providers }));
        return;
      }

      // Health check
      if (url === '/health' && method === 'GET') {
        const hasLLM = !!this.config.agentCore?.llmProvider;
        const hasRouter = !!this.config.llmRouter;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          uptime: process.uptime(),
          llm: hasLLM ? 'connected' : 'not_configured',
          router: hasRouter ? 'active' : 'inactive',
          memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
          timestamp: new Date().toISOString(),
        }));
        return;
      }

      // API: Generar imagen
      if (url === '/api/images/generate' && method === 'POST') {
        const body = await this.readBody(req);
        let parsed: { prompt?: string; style?: string; width?: number; height?: number };
        try {
          parsed = JSON.parse(body);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'JSON invalido' }));
          return;
        }
        const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : '';
        if (!prompt) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Prompt requerido' }));
          return;
        }

        try {
          // Intentar CogView (ZhipuAI) primero
          if (this.config.agentCore?.imageProvider) {
            const result = await this.config.agentCore.imageProvider.generate(prompt, {
              size: '1024x1024',
              style: parsed.style,
            });
            if (result.success) {
              const imageUrl = result.url || `/generated_images/${resolve(result.filePath || '').split(/[/\\]/).pop()}`;
              this.generatedImages.push({ prompt, url: imageUrl, filePath: result.filePath || '', timestamp: Date.now(), provider: 'cogview' });
              this.log('info', `Imagen generada via CogView: "${prompt.slice(0, 40)}..."`);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, url: imageUrl, provider: 'cogview', prompt }));
              return;
            }
          }

          // Fallback: Pollinations.ai (GRATIS, sin API key)
          const { PollinationsProvider } = await import('./image-providers/pollinations.js');
          const outputDir = resolve(this.config.agentCore?.workspaceRoot || process.cwd(), 'generated_images');
          const pollinations = new PollinationsProvider({ outputDir });
          const result = await pollinations.generate(prompt, {
            width: parsed.width || 1024,
            height: parsed.height || 1024,
          });

          if (result.success) {
            const imageUrl = result.url || `/generated_images/${resolve(result.filePath || '').split(/[/\\]/).pop()}`;
            this.generatedImages.push({ prompt, url: imageUrl, filePath: result.filePath || '', timestamp: Date.now(), provider: 'pollinations' });
            this.log('info', `Imagen generada via Pollinations: "${prompt.slice(0, 40)}..."`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, url: imageUrl, provider: 'pollinations', prompt }));
          } else {
            this.log('error', `Error generando imagen: ${result.error}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: result.error }));
          }
        } catch (imgErr) {
          this.log('error', `Image generation error: ${imgErr instanceof Error ? imgErr.message : String(imgErr)}`);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Error generando imagen' }));
        }
        return;
      }

      // API: Listar imágenes generadas
      if (url === '/api/images' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ images: this.generatedImages.slice(-50) }));
        return;
      }

      // Servir imágenes generadas
      if (url.startsWith('/generated_images/') && method === 'GET') {
        try {
          const imageName = url.replace('/generated_images/', '');
          const imagePath = resolve(this.config.agentCore?.workspaceRoot || process.cwd(), 'generated_images', imageName);
          const imageData = await readFileAsync(imagePath);
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
          res.end(imageData);
        } catch {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
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

    // Verificar si hay LLM disponible (router o provider directo)
    const hasRouter = !!this.config.llmRouter;
    const hasDirectProvider = !!this.config.agentCore?.llmProvider;

    if (!hasRouter && !hasDirectProvider) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API Key no configurada. Configurala desde el panel de Configuracion.' }));
      return;
    }

    try {
      // Construir mensajes para el LLM
      const messages: LLMMessage[] = [
        { role: 'system', content: 'Sos DevMind, un asistente de desarrollo. Respondé en español de forma clara y profesional.' },
        ...this.chatHistory.slice(-20).map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ];

      let assistantContent: string;

      if (hasRouter) {
        // Usar el router (soporta GLM, Groq, OpenRouter, Google, Mistral, Cloudflare)
        const response = await this.config.llmRouter!.callWithFallback(messages, message);
        assistantContent = response.choices[0]?.message?.content || 'Sin respuesta';
        this.log('info', `Chat respondido via ${response.providerUsed}${response.fallbackUsed ? ' (fallback)' : ''}`);
      } else {
        // Fallback directo a GLM47Provider (solo si hay key de ZhipuAI)
        const response = await this.config.agentCore!.llmProvider!.call(messages);
        assistantContent = response.choices[0]?.message?.content || 'Sin respuesta';
      }

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
    // Buscar dashboard.html en varias rutas posibles
    // Importante: tsx puede resolver __dirname a un caché temporal,
    // así que buscamos exhaustivamente en múltiples ubicaciones
    const searchPaths = [
      resolve(__dirname, 'ui', 'dashboard.html'),              // dist/ui/dashboard.html (compilado)
      resolve(__dirname, '..', 'src', 'ui', 'dashboard.html'), // src/ui/dashboard.html (desarrollo tsx)
      resolve(process.cwd(), 'src', 'ui', 'dashboard.html'),   // cwd/src/ui/dashboard.html
      resolve(process.cwd(), 'ui', 'dashboard.html'),          // cwd/ui/dashboard.html (alternativa)
      resolve(__dirname, '..', '..', 'src', 'ui', 'dashboard.html'), // 2 niveles arriba
    ];

    // Diagnóstico: mostrar qué rutas se buscan y dónde está __dirname
    console.log(`[Dashboard] __dirname = ${__dirname}`);
    console.log(`[Dashboard] cwd = ${process.cwd()}`);
    console.log(`[Dashboard] Buscando dashboard.html en:`);
    for (const p of searchPaths) {
      console.log(`  → ${p} (${existsSync(p) ? '✅ existe' : '❌ no existe'})`);
    }

    for (const htmlPath of searchPaths) {
      if (existsSync(htmlPath)) {
        try {
          console.log(`[Dashboard] Cargando desde: ${htmlPath}`);
          return readFileSync(htmlPath, 'utf-8');
        } catch (e) {
          console.error(`[Dashboard] Error leyendo ${htmlPath}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    // Fallback: HTML mínimo si no se encuentra
    console.error('[Dashboard] No se encontro dashboard.html en ninguna ruta:');
    for (const p of searchPaths) {
      console.error(`  → ${p} (${existsSync(p) ? 'existe' : 'no existe'})`);
    }
    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>DevMind Agent</title></head>
<body style="background:#0a0e17;color:#e6edf5;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">
<div style="text-align:center;max-width:600px;padding:2rem">
<h1 style="color:#58a6ff">🧠 DevMind Agent</h1>
<p style="font-size:1.2rem;margin:1rem 0">Dashboard no encontrado</p>
<p style="color:#8b9bb5">El archivo dashboard.html no se encuentra. Verifica que src/ui/dashboard.html existe.</p>
<p style="color:#8b9bb5;font-size:0.85em">Rutas buscadas:</p>
<ul style="color:#8b9bb5;text-align:left;font-size:0.8em;list-style:none;padding:0">
${searchPaths.map(p => `<li>${p}</li>`).join('\n')}
</ul>
</div></body></html>`;
  }
}
