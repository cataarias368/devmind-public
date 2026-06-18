// ============================================================
// src/dashboard.ts - Panel de Control Web (HTML/JS Vanilla)
// ============================================================

import { createServer, IncomingMessage, ServerResponse } from 'http';
import type { AgentCore, LLMMessage } from './types.js';

interface DashboardConfig {
  port: number;
  agentCore: AgentCore;
  apiKey: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export class DashboardServer {
  private readonly config: DashboardConfig;
  private server: ReturnType<typeof createServer> | null = null;
  private readonly chatHistory: ChatMessage[] = [];
  private readonly logs: Array<{ level: string; message: string; timestamp: number }> = [];

  constructor(config: DashboardConfig) {
    this.config = config;
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

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
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
          workspaceRoot: this.config.agentCore.workspaceRoot,
          chatMessages: this.chatHistory.length,
          uptime: process.uptime(),
        }));
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
      this.log('error', `Request error: ${err}`);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  }

  private async handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { message } = JSON.parse(body) as { message: string };

    if (!message) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Mensaje requerido' }));
      return;
    }

    // Registrar mensaje del usuario
    this.chatHistory.push({ role: 'user', content: message, timestamp: Date.now() });

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
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.log('error', `Chat error: ${errorMsg}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: errorMsg }));
    }
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => (body += chunk));
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
   */
  private getDashboardHTML(): string {
    return `<!DOCTYPE html>
<html lang="es" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DevMind Agent - Dashboard</title>
  <style>
    :root {
      --bg: #0f172a; --surface: #1e293b; --surface2: #334155;
      --text: #e2e8f0; --text2: #94a3b8; --accent: #818cf8;
      --accent2: #6366f1; --success: #34d399; --error: #f87171;
      --border: #475569;
    }
    [data-theme="light"] {
      --bg: #f8fafc; --surface: #ffffff; --surface2: #f1f5f9;
      --text: #1e293b; --text2: #64748b; --accent: #6366f1;
      --accent2: #4f46e5; --success: #10b981; --error: #ef4444;
      --border: #cbd5e1;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); display: flex; height: 100vh; }
    .sidebar { width: 240px; background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; }
    .sidebar h1 { padding: 1.25rem; font-size: 1.1rem; color: var(--accent); border-bottom: 1px solid var(--border); }
    .sidebar nav a { display: block; padding: 0.75rem 1.25rem; color: var(--text2); text-decoration: none; transition: all 0.2s; cursor: pointer; }
    .sidebar nav a:hover, .sidebar nav a.active { color: var(--accent); background: var(--surface2); }
    .theme-toggle { margin-top: auto; padding: 1rem 1.25rem; border-top: 1px solid var(--border); cursor: pointer; color: var(--text2); background: none; border-left: none; border-right: none; border-bottom: none; text-align: left; font-size: 0.9rem; }
    .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .tab-content { flex: 1; overflow-y: auto; padding: 1.5rem; display: none; }
    .tab-content.active { display: flex; flex-direction: column; }
    /* Chat */
    .chat-messages { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.75rem; padding-bottom: 1rem; }
    .msg { max-width: 75%; padding: 0.75rem 1rem; border-radius: 12px; line-height: 1.5; white-space: pre-wrap; }
    .msg.user { align-self: flex-end; background: var(--accent2); color: #fff; }
    .msg.assistant { align-self: flex-start; background: var(--surface2); }
    .chat-input { display: flex; gap: 0.5rem; padding-top: 1rem; border-top: 1px solid var(--border); }
    .chat-input input { flex: 1; padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 0.95rem; outline: none; }
    .chat-input input:focus { border-color: var(--accent); }
    .chat-input button { padding: 0.75rem 1.5rem; border-radius: 8px; border: none; background: var(--accent2); color: #fff; font-weight: 600; cursor: pointer; }
    /* Logs */
    .log-entry { padding: 0.5rem 0; border-bottom: 1px solid var(--border); font-family: monospace; font-size: 0.85rem; }
    .log-entry .level { font-weight: 700; margin-right: 0.5rem; }
    .log-entry .level.info { color: var(--accent); }
    .log-entry .level.error { color: var(--error); }
    .log-entry .time { color: var(--text2); margin-right: 0.5rem; }
    /* Status */
    .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
    .status-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; }
    .status-card h3 { color: var(--text2); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .status-card .value { font-size: 1.75rem; font-weight: 700; color: var(--accent); }
  </style>
</head>
<body>
  <aside class="sidebar">
    <h1>🧠 DevMind</h1>
    <nav>
      <a class="active" onclick="showTab('chat')">💬 Chat</a>
      <a onclick="showTab('logs')">📋 Logs</a>
      <a onclick="showTab('status')">📊 Status</a>
    </nav>
    <button class="theme-toggle" onclick="toggleTheme()">🌓 Cambiar Tema</button>
  </aside>
  <div class="main">
    <div id="tab-chat" class="tab-content active">
      <div class="chat-messages" id="messages"></div>
      <div class="chat-input">
        <input id="chatInput" placeholder="Escribí un mensaje..." onkeydown="if(event.key==='Enter')sendChat()">
        <button onclick="sendChat()">Enviar</button>
      </div>
    </div>
    <div id="tab-logs" class="tab-content"><div id="logList"></div></div>
    <div id="tab-status" class="tab-content"><div class="status-grid" id="statusGrid"></div></div>
  </div>
  <script>
    function showTab(name) {
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
      document.getElementById('tab-' + name).classList.add('active');
      event.target.classList.add('active');
    }
    function toggleTheme() {
      const html = document.documentElement;
      html.dataset.theme = html.dataset.theme === 'dark' ? 'light' : 'dark';
    }
    async function sendChat() {
      const input = document.getElementById('chatInput');
      const msg = input.value.trim();
      if (!msg) return;
      input.value = '';
      addMessage('user', msg);
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg })
        });
        const data = await res.json();
        addMessage('assistant', data.response || data.error || 'Sin respuesta');
      } catch (e) {
        addMessage('assistant', 'Error de conexión: ' + e.message);
      }
    }
    function addMessage(role, content) {
      const el = document.createElement('div');
      el.className = 'msg ' + role;
      el.textContent = content;
      document.getElementById('messages').appendChild(el);
      document.getElementById('messages').scrollTop = 999999;
    }
    async function loadLogs() {
      try {
        const res = await fetch('/api/logs');
        const logs = await res.json();
        const html = logs.map(l => {
          const t = new Date(l.timestamp).toLocaleTimeString();
          return '<div class="log-entry"><span class="time">' + t + '</span><span class="level ' + l.level + '">' + l.level.toUpperCase() + '</span>' + l.message + '</div>';
        }).join('');
        document.getElementById('logList').innerHTML = html || '<p style="color:var(--text2)">Sin logs aún.</p>';
      } catch {}
    }
    async function loadStatus() {
      try {
        const res = await fetch('/api/status');
        const s = await res.json();
        document.getElementById('statusGrid').innerHTML =
          '<div class="status-card"><h3>Estado</h3><div class="value" style="color:var(--success)">' + s.status + '</div></div>' +
          '<div class="status-card"><h3>Mensajes</h3><div class="value">' + s.chatMessages + '</div></div>' +
          '<div class="status-card"><h3>Uptime</h3><div class="value">' + Math.floor(s.uptime / 60) + ' min</div></div>';
      } catch {}
    }
    setInterval(loadLogs, 5000);
    setInterval(loadStatus, 10000);
    loadLogs(); loadStatus();
  </script>
</body>
</html>`;
  }
}
