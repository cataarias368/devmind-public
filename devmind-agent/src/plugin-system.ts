// ============================================================
// src/plugin-system.ts - Sistema de Plugins Extensible
// ============================================================

import type { Plugin, AgentCore, ToolDefinition } from './types.js';

interface PluginManifest {
  name: string;
  version: string;
  description: string;
  enabled: boolean;
}

export class PluginManager {
  private readonly plugins: Map<string, Plugin> = new Map();
  private readonly manifests: Map<string, PluginManifest> = new Map();
  private readonly core: AgentCore;

  constructor(core: AgentCore) {
    this.core = core;
  }

  /**
   * Registra y carga un plugin.
   */
  async load(plugin: Plugin): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      console.warn(`⚠️ Plugin "${plugin.name}" ya está cargado. Saltando.`);
      return;
    }

    // Registrar el plugin
    this.plugins.set(plugin.name, plugin);
    this.manifests.set(plugin.name, {
      name: plugin.name,
      version: plugin.version,
      description: plugin.description || '',
      enabled: true,
    });

    // Ejecutar hook de carga
    if (plugin.onLoad) {
      try {
        await plugin.onLoad(this.core);
        console.log(`🔌 Plugin "${plugin.name}" v${plugin.version} cargado exitosamente`);
      } catch (err) {
        console.error(`❌ Error cargando plugin "${plugin.name}":`, err);
        this.plugins.delete(plugin.name);
        this.manifests.delete(plugin.name);
      }
    } else {
      console.log(`🔌 Plugin "${plugin.name}" v${plugin.version} registrado`);
    }
  }

  /**
   * Descarga un plugin.
   */
  async unload(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      console.warn(`⚠️ Plugin "${pluginName}" no encontrado.`);
      return;
    }

    // Ejecutar hook de descarga
    if (plugin.onUnload) {
      try {
        await plugin.onUnload();
      } catch (err) {
        console.error(`Error en onUnload de "${pluginName}":`, err);
      }
    }

    this.plugins.delete(pluginName);
    this.manifests.delete(pluginName);
    console.log(`🔌 Plugin "${pluginName}" descargado`);
  }

  /**
   * Descarga todos los plugins.
   */
  async unloadAll(): Promise<void> {
    const names = Array.from(this.plugins.keys());
    for (const name of names) {
      await this.unload(name);
    }
  }

  /**
   * Obtiene todas las herramientas aportadas por los plugins.
   */
  getAllTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    for (const [, plugin] of this.plugins) {
      if (plugin.tools) {
        // Prefijar las herramientas con el nombre del plugin para evitar colisiones
        const prefixedTools = plugin.tools.map(t => ({
          ...t,
          name: `${plugin.name}__${t.name}`,
        }));
        tools.push(...prefixedTools);
      }
    }

    return tools;
  }

  /**
   * Obtiene un plugin por nombre.
   */
  get(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Lista todos los plugins registrados.
   */
  list(): PluginManifest[] {
    return Array.from(this.manifests.values());
  }

  /**
   * Verifica si un plugin está cargado.
   */
  isLoaded(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Habilita o deshabilita un plugin (sin descargarlo).
   */
  setEnabled(name: string, enabled: boolean): void {
    const manifest = this.manifests.get(name);
    if (manifest) {
      manifest.enabled = enabled;
    }
  }
}
