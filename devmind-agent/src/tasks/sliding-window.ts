// ============================================================
// src/tasks/sliding-window.ts - Ventana Deslizante de Mensajes
// ============================================================

import type { AgentMessage } from './types.js';

interface WindowedMessage extends AgentMessage {
  id: string;
  priority: number;
}

/**
 * Mantiene una ventana deslizante de mensajes con prioridad.
 * Cuando se excede el tamaño máximo, elimina los de menor prioridad.
 */
export class SlidingWindow {
  private window: Map<string, WindowedMessage> = new Map();
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  /**
   * Añade un mensaje a la ventana con una prioridad dada.
   */
  addMessage(message: AgentMessage, priority = 1): void {
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const windowed: WindowedMessage = {
      ...message,
      id,
      priority: message.priority ?? priority,
    };
    this.window.set(id, windowed);

    if (this.window.size > this.maxSize) {
      this.evictLowestPriority();
    }
  }

  /**
   * Devuelve los mensajes activos ordenados por timestamp (más reciente primero).
   */
  getActiveWindow(): AgentMessage[] {
    return Array.from(this.window.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(({ id: _id, priority: _priority, ...rest }) => rest);
  }

  /**
   * Devuelve el número de mensajes en la ventana.
   */
  get size(): number {
    return this.window.size;
  }

  /**
   * Elimina el mensaje con menor prioridad.
   * En caso de empate, elimina el más antiguo.
   */
  private evictLowestPriority(): void {
    let lowestId: string | null = null;
    let lowestScore = Infinity;
    let oldestTimestamp = Infinity;

    for (const [id, msg] of this.window) {
      const score = msg.priority;
      if (score < lowestScore || (score === lowestScore && msg.timestamp < oldestTimestamp)) {
        lowestScore = score;
        oldestTimestamp = msg.timestamp;
        lowestId = id;
      }
    }

    if (lowestId) {
      this.window.delete(lowestId);
    }
  }
}
