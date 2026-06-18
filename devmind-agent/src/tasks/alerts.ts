// ============================================================
// src/tasks/alerts.ts - Sistema de Alertas Automáticas
// ============================================================

import { mkdir, writeFile, appendFile } from 'fs/promises';
import { join } from 'path';

interface AlertEntry {
  level: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: number;
}

/**
 * Sistema de alertas con tres niveles: info, warning, critical.
 * Envía notificaciones por consola y opcionalmente a Slack webhook.
 * Persiste el historial en .devmind/alerts.log
 */
export class Alerts {
  private alerts: AlertEntry[] = [];
  private workspaceRoot: string;
  private warningBuffer: AlertEntry[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor(workspaceRoot?: string) {
    this.workspaceRoot = workspaceRoot || process.cwd();
  }

  /**
   * Envía una alerta con el nivel especificado.
   * Las alertas critical se envían inmediatamente.
   * Las warning se acumulan y se envían cada 5 minutos.
   */
  async send(level: AlertEntry['level'], message: string): Promise<void> {
    const alert: AlertEntry = { level, message, timestamp: Date.now() };
    this.alerts.push(alert);

    // Console output
    if (level === 'critical') {
      console.error(`🚨 [CRITICAL] ${message}`);
    } else if (level === 'warning') {
      console.warn(`⚠️ [WARNING] ${message}`);
    } else {
      console.log(`ℹ️ [INFO] ${message}`);
    }

    // Persistir inmediatamente
    await this.persist(alert);

    // Slack Webhook para critical
    if (level === 'critical' && process.env.SLACK_WEBHOOK_URL) {
      await this.notifySlack(alert);
    }

    // Acumular warnings para flush periódico
    if (level === 'warning' && process.env.SLACK_WEBHOOK_URL) {
      this.warningBuffer.push(alert);
    }
  }

  /**
   * Inicia el flush periódico de warnings a Slack.
   */
  startPeriodicFlush(intervalMs = 300000): void {
    if (this.flushInterval) return;
    this.flushInterval = setInterval(async () => {
      if (this.warningBuffer.length > 0 && process.env.SLACK_WEBHOOK_URL) {
        const messages = this.warningBuffer.map(a => a.message).join('\n');
        await this.notifySlack({
          level: 'warning',
          message: `Alertas acumuladas (${this.warningBuffer.length}):\n${messages}`,
          timestamp: Date.now(),
        });
        this.warningBuffer = [];
      }
    }, intervalMs);
  }

  /**
   * Detiene el flush periódico.
   */
  stopPeriodicFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /**
   * Devuelve todas las alertas.
   */
  getAlerts(): AlertEntry[] {
    return this.alerts;
  }

  /**
   * Devuelve alertas de un nivel específico.
   */
  getByLevel(level: AlertEntry['level']): AlertEntry[] {
    return this.alerts.filter(a => a.level === level);
  }

  /**
   * Persiste una alerta en el archivo de logs.
   */
  private async persist(alert: AlertEntry): Promise<void> {
    try {
      const dir = join(this.workspaceRoot, '.devmind');
      await mkdir(dir, { recursive: true });
      const logLine = `[${new Date(alert.timestamp).toISOString()}] [${alert.level.toUpperCase()}] ${alert.message}\n`;
      await appendFile(join(dir, 'alerts.log'), logLine, 'utf-8');

      // También guardar como JSON
      const allAlerts = [...this.alerts];
      await writeFile(
        join(dir, 'alerts.json'),
        JSON.stringify(allAlerts.slice(-100), null, 2),
        'utf-8'
      );
    } catch {
      // No bloquear si falla la persistencia
    }
  }

  /**
   * Envía notificación a Slack via webhook.
   */
  private async notifySlack(alert: AlertEntry): Promise<void> {
    try {
      const webhookUrl = process.env.SLACK_WEBHOOK_URL;
      if (!webhookUrl) return;

      // SSRF protection: validar que el dominio esté en la allowlist
      const allowedDomains = ['hooks.slack.com', 'discord.com', 'discordapp.com'];
      let url: URL;
      try {
        url = new URL(webhookUrl);
      } catch {
        console.warn('[Alerts] SLACK_WEBHOOK_URL inválida');
        return;
      }
      if (!allowedDomains.some(d => url.hostname.endsWith(d))) {
        console.warn(`[Alerts] Dominio de webhook no permitido: ${url.hostname}`);
        return;
      }

      const emoji = alert.level === 'critical' ? '🚨' : alert.level === 'warning' ? '⚠️' : 'ℹ️';
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${emoji} DevMind Alert (${alert.level.toUpperCase()}): ${alert.message}`,
        }),
      });
    } catch {
      // No bloquear si falla Slack
    }
  }
}
