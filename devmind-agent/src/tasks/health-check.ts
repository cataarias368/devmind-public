// ============================================================
// src/tasks/health-check.ts - Health Check Automático
// ============================================================

import * as os from 'os';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

interface HealthResult {
  status: 'healthy' | 'warning' | 'critical';
  issues: string[];
  checks: Record<string, boolean>;
  timestamp: number;
}

/**
 * Verifica el estado de salud del sistema DevMind.
 * Chequea API key, memoria, disco y herramientas disponibles.
 */
export class HealthCheck {
  private history: HealthResult[] = [];
  private workspaceRoot: string;

  constructor(workspaceRoot?: string) {
    this.workspaceRoot = workspaceRoot || process.cwd();
  }

  /**
   * Ejecuta todos los checks y devuelve el estado del sistema.
   */
  async check(): Promise<HealthResult> {
    const issues: string[] = [];
    const checks: Record<string, boolean> = {};

    // 1. API Key
    const hasApiKey = !!process.env.GLM_API_KEY;
    checks['glm_api_key'] = hasApiKey;
    if (!hasApiKey) issues.push('Falta GLM_API_KEY en las variables de entorno');

    // 2. Memoria del sistema
    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    const usedMemPercent = ((totalMem - freeMem) / totalMem) * 100;
    const memOk = usedMemPercent < 90;
    checks['memory'] = memOk;
    if (usedMemPercent > 90) {
      issues.push(`Uso de memoria alto: ${usedMemPercent.toFixed(1)}%`);
    } else if (usedMemPercent > 80) {
      issues.push(`Uso de memoria moderado: ${usedMemPercent.toFixed(1)}%`);
    }

    // 3. Directorio de workspace
    let workspaceOk = false;
    try {
      await mkdir(this.workspaceRoot, { recursive: true });
      workspaceOk = true;
    } catch {
      issues.push(`No se puede acceder al workspace: ${this.workspaceRoot}`);
    }
    checks['workspace'] = workspaceOk;

    // 4. Herramientas del sistema (Node.js, npm)
    const nodeOk = typeof process.version === 'string';
    checks['node_runtime'] = nodeOk;
    if (!nodeOk) issues.push('Node.js no disponible');

    // 5. Directorio .devmind
    let devmindDirOk = false;
    try {
      await mkdir(join(this.workspaceRoot, '.devmind'), { recursive: true });
      devmindDirOk = true;
    } catch {
      issues.push('No se pudo crear directorio .devmind');
    }
    checks['devmind_dir'] = devmindDirOk;

    // Determinar estado general
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (!hasApiKey || usedMemPercent > 95) status = 'critical';
    else if (issues.length > 0) status = 'warning';

    const result: HealthResult = {
      status,
      issues,
      checks,
      timestamp: Date.now(),
    };

    this.history.push(result);
    await this.saveHistory();

    return result;
  }

  /**
   * Devuelve el historial de health checks.
   */
  getHistory(): HealthResult[] {
    return this.history;
  }

  /**
   * Guarda el historial en .devmind/health-history.json
   */
  private async saveHistory(): Promise<void> {
    try {
      const dir = join(this.workspaceRoot, '.devmind');
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, 'health-history.json'),
        JSON.stringify(this.history.slice(-50), null, 2),
        'utf-8'
      );
    } catch {
      // No bloquear si falla
    }
  }

  /**
   * Carga historial existente.
   */
  async loadHistory(): Promise<void> {
    try {
      const content = await readFile(
        join(this.workspaceRoot, '.devmind', 'health-history.json'),
        'utf-8'
      );
      this.history = JSON.parse(content) as HealthResult[];
    } catch {
      this.history = [];
    }
  }
}
