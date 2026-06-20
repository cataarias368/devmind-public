// ============================================================
// src/providers/provider-factory.ts - Simple Provider Factory
// ============================================================

export interface ProviderConfig {
  [key: string]: unknown;
}

export interface ProviderInstance {
  type: string;
  config: ProviderConfig;
  createdAt: number;
}

export class ProviderFactory {
  /**
   * Create a provider instance of the given type with the provided config.
   */
  create(type: string, config: ProviderConfig = {}): ProviderInstance {
    if (!type || typeof type !== 'string') {
      throw new Error('Provider type must be a non-empty string');
    }

    const instance: ProviderInstance = {
      type,
      config,
      createdAt: Date.now(),
    };

    console.log(`🏭 ProviderFactory: Created provider of type "${type}"`);

    return instance;
  }
}
