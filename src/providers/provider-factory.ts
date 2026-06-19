// ============================================================
// src/providers/provider-factory.ts - Fábrica de Configuración de Proveedores
// ============================================================

/**
 * ProviderFactory crea configuraciones tipadas para cada proveedor LLM.
 * No instancia clientes directamente — eso lo hace LLMRouter con dynamic import.
 */
export class ProviderFactory {
  static createGoogle(apiKey: string): { type: 'google'; apiKey: string } {
    return { type: 'google', apiKey };
  }

  static createMistral(apiKey: string): { type: 'mistral'; apiKey: string } {
    return { type: 'mistral', apiKey };
  }

  static createGroq(apiKey: string): { type: 'groq'; apiKey: string } {
    return { type: 'groq', apiKey };
  }

  static createOpenRouter(apiKey: string): { type: 'openrouter'; apiKey: string } {
    return { type: 'openrouter', apiKey };
  }

  static createCloudflare(apiKey: string, accountId: string): { type: 'cloudflare'; apiKey: string; accountId: string } {
    return { type: 'cloudflare', apiKey, accountId };
  }

  /**
   * Detecta automáticamente qué proveedores están configurados
   * basándose en las variables de entorno.
   */
  static detectConfigured(): Array<{ type: string; name: string; configured: boolean }> {
    return [
      { type: 'google', name: 'Google AI Studio', configured: !!process.env.GOOGLE_API_KEY },
      { type: 'mistral', name: 'Mistral AI', configured: !!process.env.MISTRAL_API_KEY },
      { type: 'groq', name: 'Groq', configured: !!process.env.GROQ_API_KEY },
      { type: 'openrouter', name: 'OpenRouter', configured: !!process.env.OPENROUTER_API_KEY },
      { type: 'cloudflare', name: 'Cloudflare Workers AI', configured: !!(process.env.CLOUDFLARE_API_KEY && process.env.CLOUDFLARE_ACCOUNT_ID) },
      { type: 'zhipuai', name: 'ZhipuAI GLM-4', configured: !!process.env.GLM_API_KEY },
    ];
  }
}
