// ============================================================
// src/config.ts - Configuración Validada con Zod + dotenv
// ============================================================

import { z } from 'zod';
import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Cargar .env si existe
const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const ConfigSchema = z.object({
  // --- Obligatorios ---
  // GLM_API_KEY es opcional al arrancar. El dashboard funciona sin ella.
  // El usuario puede configurarla desde la UI del dashboard.
  GLM_API_KEY: z.string().default(''),

  // --- Cloudflare Workers AI (Gratis - Llama 3.3 70B) ---
  CLOUDFLARE_API_KEY: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),

  // --- Otros proveedores LLM gratuitos ---
  GROQ_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),

  // --- Autenticación separada ---
  // API_AUTH_KEY se usa para autenticar Dashboard y REST API.
  // Si no se configura, se usa GLM_API_KEY como fallback (no recomendado para producción).
  API_AUTH_KEY: z.string().min(1).optional(),

  // --- CORS ---
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),

  // --- General con defaults ---
  WORKSPACE_ROOT: z.string().default(resolve(process.cwd(), 'workspace')),
  AGENT_DRY_RUN: z
    .enum(['true', 'false'])
    .default('false')
    .transform(v => v === 'true'),
  AGENT_MAX_STEPS: z.coerce.number().int().min(1).max(100).default(25),
  DASHBOARD_PORT: z.coerce.number().int().min(1024).max(65535).default(3001),
  API_PORT: z.coerce.number().int().min(1024).max(65535).default(3000),

  // --- GitHub (Opcional) ---
  GITHUB_OWNER: z.string().optional(),
  GITHUB_REPO: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),

  // --- Slack (Opcional) ---
  SLACK_TOKEN: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),

  // --- Discord (Opcional) ---
  DISCORD_TOKEN: z.string().optional(),
  DISCORD_CLIENT_ID: z.string().optional(),

  // --- Telegram (Opcional) ---
  TELEGRAM_TOKEN: z.string().optional(),

  // --- Slack Webhook (Opcional) ---
  SLACK_WEBHOOK_URL: z.string().url().optional(),

  // --- DevMind 3.0: Multi-Modelo (Opcional) ---
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  OLLAMA_HOST: z.string().optional(),
  PREFERRED_MODEL: z.string().optional(),
  AUTO_MUTATION: z
    .enum(['true', 'false'])
    .default('false')
    .transform(v => v === 'true'),

  // --- DevMind 3.0: A2A Protocol (Opcional) ---
  A2A_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform(v => v === 'true'),
  A2A_NODE_NAME: z.string().default('DevMind-Agent'),
  A2A_PORT: z.coerce.number().int().min(1024).max(65535).default(4000),
});

export type DevMindConfig = z.infer<typeof ConfigSchema>;

let _config: DevMindConfig | null = null;

/**
 * Obtiene la configuración validada. Solo parsea una vez.
 * Lanza un error claro si falta alguna variable obligatoria.
 */
export function getConfig(): DevMindConfig {
  if (_config) return _config;

  try {
    _config = ConfigSchema.parse(process.env);
    return _config;
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.issues.map(i => `  ${i.path.join('.')}: ${i.message}`).join('\n');
      console.error(`\n❌ Configuración inválida:\n${issues}\n`);
      console.error('💡 Creá un archivo .env basado en .env.example con tus valores.');
      process.exit(1);
    }
    throw err;
  }
}

/**
 * Verifica si hay configuración de GitHub completa
 */
export function hasGitHubConfig(config: DevMindConfig): boolean {
  return !!(config.GITHUB_OWNER && config.GITHUB_REPO && config.GITHUB_TOKEN);
}

/**
 * Verifica si hay al menos un bot configurado
 */
export function hasBotConfig(config: DevMindConfig): boolean {
  return !!(config.SLACK_TOKEN || config.DISCORD_TOKEN || config.TELEGRAM_TOKEN);
}
