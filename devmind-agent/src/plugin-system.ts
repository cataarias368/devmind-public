// ============================================================
// src/plugin-system.ts - Sistema de Plugins con Permisos Granular
// ============================================================

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import type { AgentCore, ToolDefinition } from './types.js';

// --- Permisos ---

export type Permission =
  | 'read:files'
  | 'write:files'
  | 'write:temp'
  | 'execute:command'
  | 'execute:npm'
  | 'execute:git'
  | 'network:http'
  | 'network:https'
  | 'storage:memory'
  | 'storage:persistent';

const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  'read:files': 'Leer archivos del workspace',
  'write:files': 'Escribir archivos del workspace',
  'write:temp': 'Escribir en archivos temporales',
  'execute:command': 'Ejecutar comandos del sistema',
  'execute:npm': 'Ejecutar comandos npm',
  'execute:git': 'Ejecutar comandos git',
  'network:http': 'Hacer peticiones HTTP',
  'network:https': 'Hacer peticiones HTTPS',
  'storage:memory': 'Leer/escribir memoria de corto plazo',
  'storage:persistent': 'Leer/escribir almacenamiento persistente',
};

// --- Interfaces ---

export interface PluginTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
  handler: (args: Record<string, unknown>, core: AgentCore, permissions: Permission[]) => Promise<string>;
}

export interface Plugin {
  name: string;
  version: string;
  description?: string;
  permissions: Permission[];
  tools?: PluginTool[];
  onLoad?: (core: AgentCore) => void | Promise<void>;
  onUnload?: () => void | Promise<void>;
}

interface PluginManifest {
  approvedPermissions: Permission[];
  plugins: Array<{
    name: string;
    version: string;
    description?: string;
    permissions: Permission[];
    loadedAt: number;
  }>;
}

// --- Plugin Manager ---

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private loaded: Set<string> = new Set();
  private core: AgentCore;
  private manifestPath: string;

  constructor(core: AgentCore) {
    this.core = core;
    this.manifestPath = join(core.workspaceRoot, '.devmind', 'plugins', 'manifest.json');
  }

  // ============================================================
  // CARGA DE PLUGINS
  // ============================================================

  /**
   * Carga un plugin validando sus permisos.
   */
  async load(plugin: Plugin): Promise<void> {
    if (this.loaded.has(plugin.name)) {
      console.warn(`[Plugin] ${plugin.name} ya está cargado`);
      return;
    }

    // Validar permisos
    const hasAllPermissions = await this.validatePermissions(plugin.permissions);
    if (!hasAllPermissions) {
      console.warn(`[Plugin] ${plugin.name} no tiene permisos suficientes`);
      return;
    }

    try {
      if (plugin.onLoad) {
        await plugin.onLoad(this.core);
      }
      this.plugins.set(plugin.name, plugin);
      this.loaded.add(plugin.name);
      console.log(`[Plugin] ✅ Cargado: ${plugin.name} v${plugin.version}`);
      await this.saveManifest();
    } catch (err) {
      console.error(`[Plugin] ❌ Error cargando ${plugin.name}:`, err);
      throw err;
    }
  }

  /**
   * Carga un plugin desde un archivo.
   */
  async loadPluginFromFile(filePath: string): Promise<void> {
    const fullPath = resolve(filePath);
    try {
      const module = await import(fullPath);
      const plugin: Plugin = module.default || module;
      if (!plugin.name || !plugin.version) {
        throw new Error('El plugin debe exportar { name, version }');
      }
      await this.load(plugin);
    } catch (err) {
      console.error(`[Plugin] ❌ Error cargando desde ${filePath}:`, err);
      throw err;
    }
  }

  /**
   * Carga todos los plugins de un directorio.
   */
  async loadPluginsFromDirectory(dir: string): Promise<number> {
    let count = 0;
    try {
      const { readdir } = await import('fs/promises');
      const files = await readdir(dir);
      for (const file of files) {
        if (file.endsWith('.js') || file.endsWith('.ts')) {
          await this.loadPluginFromFile(join(dir, file));
          count++;
        }
      }
    } catch (err) {
      console.warn(`[Plugin] No se pudo leer el directorio ${dir}:`, err);
    }
    return count;
  }

  /**
   * Descarga un plugin.
   */
  async unload(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      console.warn(`[Plugin] ${name} no está cargado`);
      return;
    }
    if (plugin.onUnload) {
      await plugin.onUnload();
    }
    this.plugins.delete(name);
    this.loaded.delete(name);
    console.log(`[Plugin] ⬇️ Descargado: ${name}`);
    await this.saveManifest();
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

  // ============================================================
  // VALIDACIÓN DE PERMISOS
  // ============================================================

  private async validatePermissions(permissions: Permission[]): Promise<boolean> {
    const userApproved = await this.getUserApprovedPermissions();

    for (const perm of permissions) {
      if (!userApproved.includes(perm)) {
        const approval = await this.requestPermission(perm);
        if (!approval) {
          console.warn(`[Plugin] Permiso denegado: ${perm}`);
          return false;
        }
        userApproved.push(perm);
        await this.saveApprovedPermissions(userApproved);
      }
    }

    return true;
  }

  private async getUserApprovedPermissions(): Promise<Permission[]> {
    try {
      const data = await readFile(this.manifestPath, 'utf-8');
      const manifest = JSON.parse(data) as PluginManifest;
      return manifest.approvedPermissions || [];
    } catch {
      return [];
    }
  }

  private async saveApprovedPermissions(permissions: Permission[]): Promise<void> {
    const dir = join(this.core.workspaceRoot, '.devmind', 'plugins');
    await mkdir(dir, { recursive: true });
    const existing = await this.getUserApprovedPermissions();
    await writeFile(
      this.manifestPath,
      JSON.stringify({
        approvedPermissions: [...new Set([...existing, ...permissions])],
        plugins: this.listPlugins(),
      }, null, 2),
      'utf-8'
    );
  }

  /**
   * Solicita permiso al usuario (CLI interactiva).
   */
  private async requestPermission(permission: Permission): Promise<boolean> {
    console.log(`\n🔐 El plugin solicita el permiso: ${permission}`);
    console.log(`   Descripción: ${PERMISSION_DESCRIPTIONS[permission]}`);
    console.log(`   ¿Permitir? (y/N)`);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, 30000); // 30s timeout

      process.stdin.once('data', (data) => {
        clearTimeout(timeout);
        const answer = data.toString().trim().toLowerCase();
        resolve(answer === 'y' || answer === 'yes');
      });
    });
  }

  // ============================================================
  // EJECUCIÓN DE HERRAMIENTAS CON PERMISOS
  // ============================================================

  /**
   * Ejecuta una herramienta de un plugin con validación de permisos.
   */
  async executeTool(
    pluginName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<string> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin ${pluginName} no cargado`);
    }

    const tool = plugin.tools?.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Herramienta ${toolName} no encontrada en ${pluginName}`);
    }

    return await tool.handler(args, this.core, plugin.permissions);
  }

  // ============================================================
  // UTILIDADES
  // ============================================================

  /**
   * Devuelve todas las herramientas de todos los plugins.
   */
  getAllTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.tools) {
        for (const tool of plugin.tools) {
          tools.push({
            name: `${plugin.name}__${tool.name}`,
            description: tool.description,
            parameters: [],
          });
        }
      }
    }
    return tools;
  }

  /**
   * Lista plugins cargados.
   */
  listPlugins(): Array<{ name: string; version: string; description?: string; permissions: Permission[]; loadedAt: number }> {
    return Array.from(this.plugins.values()).map(p => ({
      name: p.name,
      version: p.version,
      description: p.description,
      permissions: p.permissions,
      loadedAt: Date.now(),
    }));
  }

  /**
   * Obtiene un plugin por nombre.
   */
  get(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Verifica si un plugin está cargado.
   */
  isLoaded(name: string): boolean {
    return this.loaded.has(name);
  }

  private async saveManifest(): Promise<void> {
    try {
      const dir = join(this.core.workspaceRoot, '.devmind', 'plugins');
      await mkdir(dir, { recursive: true });
      const approved = await this.getUserApprovedPermissions();
      await writeFile(
        this.manifestPath,
        JSON.stringify({
          approvedPermissions: approved,
          plugins: this.listPlugins(),
        }, null, 2),
        'utf-8'
      );
    } catch {
      // No bloquear
    }
  }
}

// ============================================================
// PLUGIN DE EJEMPLO
// ============================================================

export const ExamplePlugin: Plugin = {
  name: 'example-plugin',
  version: '1.0.0',
  description: 'Plugin de ejemplo con herramientas útiles',
  permissions: ['read:files', 'write:temp'],

  tools: [
    {
      name: 'summarize_file',
      description: 'Resume el contenido de un archivo',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string', description: 'Ruta del archivo' }
        },
        required: ['file_path']
      },
      handler: async (args, _core, _permissions) => {
        const content = await readFile(args.file_path as string, 'utf-8');
        return `Resumen del archivo (primeras 200 caracteres):\n${content.slice(0, 200)}...`;
      }
    }
  ],

  onLoad: (_core) => {
    console.log('📦 Plugin de ejemplo cargado correctamente');
  },

  onUnload: () => {
    console.log('📦 Plugin de ejemplo descargado');
  }
};
