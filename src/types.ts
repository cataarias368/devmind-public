// ============================================================
// src/types.ts - Interfaces y Tipos Compartidos de DevMind
// ============================================================

import { resolve } from 'path';
import type { GLM47Provider } from './llm-provider.js';
import type { CogViewProvider } from './image-provider.js';
import type { CheckpointManager } from './checkpoint.js';
import type { MemoryStore } from './memory.js';

// --- Núcleo del Agente ---

export interface AgentCore {
  llmProvider: GLM47Provider;
  imageProvider: CogViewProvider;
  checkpointManager: CheckpointManager;
  memoryStore: MemoryStore;
  workspaceRoot: string;
}

// --- Herramientas ---

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];
}

export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string>;

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

// --- LLM ---

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
}

export interface LLMToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMResponse {
  id: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: LLMToolCall[];
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface LLMCallOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
}

// --- Checkpoints & Memoria ---

export interface Checkpoint {
  id: string;
  taskId: string;
  step: number;
  state: AgentState;
  timestamp: number;
}

export interface AgentState {
  task: string;
  plan: string[];
  currentStep: number;
  completedSteps: string[];
  files: string[];
  errors: string[];
}

export interface MemoryEntry {
  id: string;
  category: 'learning' | 'pattern' | 'error' | 'preference';
  content: string;
  context: string;
  timestamp: number;
  relevance: number;
}

// --- Multi-Agente ---

export type AgentRole = 'architect' | 'frontend' | 'backend' | 'devops' | 'qa';

export interface AgentDefinition {
  role: AgentRole;
  name: string;
  systemPrompt: string;
  tools: string[];
  dependencies?: AgentRole[];
}

export interface SubTask {
  id: string;
  description: string;
  agentRole: AgentRole;
  dependencies: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
}

export interface MultiAgentResult {
  taskId: string;
  summary: string;
  subTasks: SubTask[];
  totalTime: number;
  success: boolean;
}

// --- Testing ---

export interface TestSuite {
  fileName: string;
  content: string;
  type: 'unit' | 'integration' | 'e2e';
}

export interface TestConfig {
  framework: 'vitest' | 'jest' | 'playwright';
  language: 'typescript' | 'javascript';
  outputDir: string;
  coverage: boolean;
  workspaceRoot: string;
}

// --- Bots ---

export interface BotConfig {
  slack?: { token: string; signingSecret: string };
  discord?: { token: string; clientId: string };
  telegram?: { token: string };
  agentInstance: Pick<AgentCore, 'llmProvider' | 'imageProvider'>;
}

// --- Dashboard ---

export interface DashboardConfig {
  port: number;
  agentCore: AgentCore;
  apiKey: string;
}

// --- Plugins ---

export interface Plugin {
  name: string;
  version: string;
  description?: string;
  tools?: ToolDefinition[];
  onLoad?: (core: AgentCore) => void | Promise<void>;
  onUnload?: () => void | Promise<void>;
}

// --- GitHub ---

export interface GitHubConfig {
  owner: string;
  repo: string;
  token: string;
}

// --- Documentación ---

export type DocFormat = 'markdown' | 'html' | 'pdf';

export interface DocOptions {
  format: DocFormat;
  style?: 'professional' | 'minimal' | 'academic';
  includeTableOfContents?: boolean;
}

// --- Seguridad ---

/**
 * Valida que una ruta de archivo no contenga caracteres peligrosos
 * para prevenir command injection y path traversal.
 *
 * Bloquea:
 *  - Secuencias de path traversal (..)
 *  - Rutas absolutas (que comienzan con /)
 *  - Caracteres no permitidos (null bytes, etc.)
 */
export function isSafePath(input: string): boolean {
  // Bloquear path traversal
  if (input.includes('..')) return false;
  // Bloquear rutas absolutas
  if (input.startsWith('/')) return false;
  // Bloquear null bytes
  if (input.includes('\0')) return false;
  // Solo permitir caracteres seguros
  if (!/^[a-zA-Z0-9/._-]+$/.test(input)) return false;
  return true;
}

/**
 * Verifica que una ruta resuelta esté dentro del workspace.
 * Segunda capa de defensa contra path traversal.
 */
export function isWithinWorkspace(resolvedPath: string, workspaceRoot: string): boolean {
  const normalizedWorkspace = resolve(workspaceRoot);
  const normalizedPath = resolve(resolvedPath);
  return normalizedPath.startsWith(normalizedWorkspace + '/') || normalizedPath === normalizedWorkspace;
}

/**
 * Escapa caracteres HTML para prevenir XSS.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Serializa un error de forma recursiva, manejando
 * estructuras anidadas de Playwright y otros runners.
 */
export function serializeError(err: unknown): string {
  if (err === null || err === undefined) return 'Error desconocido';

  if (typeof err === 'string') return err;

  if (err instanceof Error) {
    const anyErr = err as unknown as Record<string, unknown>;
    if (anyErr.result) return serializeError(anyErr.result);
    return err.message || err.stack || String(err);
  }

  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (obj.result) return serializeError(obj.result);
    if (obj.message) return String(obj.message);
    if (obj.stdout) return String(obj.stdout);
    if (obj.stderr) return String(obj.stderr);
    try {
      return JSON.stringify(err, null, 2);
    } catch {
      return String(err);
    }
  }

  return String(err);
}
