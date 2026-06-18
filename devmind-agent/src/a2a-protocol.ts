// ============================================================
// src/a2a-protocol.ts - Protocolo Agent-to-Agent (A2A)
// ============================================================
// Permite que múltiples instancias de DevMind se descubran,
// comuniquen y colaboren entre sí en tareas complejas.

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { mkdir, readdir, readFile as fsReadFile, writeFile, rm } from 'fs/promises';
import { join } from 'path';

// --- Interfaces ---

export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  type: 'request' | 'response' | 'broadcast' | 'discovery';
  content: unknown;
  timestamp: string;
  ttl: number;
  context: {
    task: string;
    priority: 'low' | 'medium' | 'high';
    requiresApproval: boolean;
  };
}

export interface AgentNode {
  id: string;
  name: string;
  workspace: string;
  capabilities: string[];
  status: 'active' | 'idle' | 'busy' | 'offline';
  lastSeen: string;
  address: string;
  port: number;
}

export interface TeamOrchestration {
  leader: AgentNode;
  assigned: AgentNode[];
  task: string;
  createdAt: string;
}

// --- Protocolo A2A ---

/**
 * El A2AProtocol permite la comunicación y colaboración entre
 * múltiples agentes DevMind distribuidos.
 *
 * Mecanismos:
 * 1. Discovery: los agentes se anuncian y descubren mutuamente
 *    mediante archivos en un directorio compartido (.devmind/a2a/)
 * 2. Messaging: envío de mensajes directos, broadcast y respuestas
 * 3. Orchestration: selección de líder y asignación de subtareas
 *    basada en capacidades declaradas de cada agente
 *
 * Seguridad:
 * - Los mensajes se persisten solo en el filesystem local
 * - Los agentes se identifican por UUID y nombre
 * - Se verifica TTL para descartar mensajes expirados
 * - Los nodos muertos se limpian automáticamente
 */
export class A2AProtocol extends EventEmitter {
  private nodes: Map<string, AgentNode> = new Map();
  private messages: Map<string, AgentMessage> = new Map();
  private myNode: AgentNode;
  private discoveryInterval: ReturnType<typeof setInterval> | null = null;
  private messageDir: string;
  private cleanUpInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: {
    nodeId: string;
    name: string;
    workspace: string;
    capabilities: string[];
    port: number;
  }) {
    super();
    this.myNode = {
      id: config.nodeId,
      name: config.name,
      workspace: config.workspace,
      capabilities: config.capabilities,
      status: 'active',
      lastSeen: new Date().toISOString(),
      address: 'localhost',
      port: config.port,
    };
    this.messageDir = join(config.workspace, '.devmind', 'a2a');
    this.initMessageDir();
  }

  private async initMessageDir(): Promise<void> {
    try {
      await mkdir(this.messageDir, { recursive: true });
    } catch {
      // No bloquear
    }
  }

  // ============================================================
  // DESCUBRIMIENTO DE AGENTES (Discovery)
  // ============================================================

  /**
   * Inicia el proceso de discovery que anuncia la presencia
   * de este agente y detecta otros agentes en la red local.
   */
  startDiscovery(intervalSeconds = 30): void {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
    }

    // Anunciar presencia inmediatamente
    this.broadcastPresence();

    this.discoveryInterval = setInterval(() => {
      this.broadcastPresence();
    }, intervalSeconds * 1000);

    // Limpieza periódica de nodos muertos y mensajes expirados
    this.cleanUpInterval = setInterval(() => {
      this.cleanUpDeadNodes();
      this.cleanUpExpiredMessages();
    }, 60000); // Cada minuto

    console.log(`🔍 [A2A] Discovery iniciado cada ${intervalSeconds}s (node: ${this.myNode.name})`);
  }

  private async broadcastPresence(): Promise<void> {
    this.myNode.lastSeen = new Date().toISOString();
    this.myNode.status = 'active';

    const message: AgentMessage = {
      id: randomUUID(),
      from: this.myNode.id,
      to: '*',
      type: 'discovery',
      content: this.myNode,
      timestamp: new Date().toISOString(),
      ttl: 120, // 2 minutos
      context: {
        task: 'discovery',
        priority: 'low',
        requiresApproval: false,
      },
    };
    this.emit('message', message);
    await this.saveMessage(message);
  }

  /**
   * Descubre todos los agentes activos en la red.
   * Lee los mensajes de discovery del directorio compartido.
   */
  async discoverNodes(): Promise<AgentNode[]> {
    const nodes: AgentNode[] = [];

    try {
      const files = await readdir(this.messageDir);

      for (const file of files) {
        try {
          const data = await fsReadFile(join(this.messageDir, file), 'utf-8');
          const message = JSON.parse(data) as AgentMessage;
          if (message.type === 'discovery' && message.from !== this.myNode.id) {
            const node = message.content as AgentNode;
            if (this.isNodeAlive(node)) {
              this.nodes.set(node.id, node);
              nodes.push(node);
            }
          }
        } catch {
          // Ignorar archivos corruptos
        }
      }
    } catch {
      // Directorio no existe todavía
    }

    // Agregar este nodo
    this.nodes.set(this.myNode.id, this.myNode);

    return nodes;
  }

  private isNodeAlive(node: AgentNode): boolean {
    const lastSeen = new Date(node.lastSeen);
    const now = new Date();
    const diffSeconds = (now.getTime() - lastSeen.getTime()) / 1000;
    return diffSeconds < 120; // 2 minutos de tolerancia
  }

  private async cleanUpDeadNodes(): Promise<void> {
    for (const [id, node] of this.nodes) {
      if (id !== this.myNode.id && !this.isNodeAlive(node)) {
        this.nodes.delete(id);
        this.emit('node-offline', node);
      }
    }
  }

  private async cleanUpExpiredMessages(): Promise<void> {
    const now = Date.now();
    try {
      const files = await readdir(this.messageDir);
      for (const file of files) {
        try {
          const data = await fsReadFile(join(this.messageDir, file), 'utf-8');
          const message = JSON.parse(data) as AgentMessage;
          const msgTime = new Date(message.timestamp).getTime();
          const ageSeconds = (now - msgTime) / 1000;
          if (ageSeconds > message.ttl) {
            await rm(join(this.messageDir, file));
          }
        } catch {
          // Ignorar
        }
      }
    } catch {
      // Ignorar
    }
  }

  // ============================================================
  // COMUNICACIÓN ENTRE AGENTES
  // ============================================================

  /**
   * Envía un mensaje directo a un agente específico.
   */
  async sendMessage(target: string, content: unknown, context?: Partial<AgentMessage['context']>): Promise<AgentMessage> {
    const message: AgentMessage = {
      id: randomUUID(),
      from: this.myNode.id,
      to: target,
      type: 'request',
      content,
      timestamp: new Date().toISOString(),
      ttl: 300, // 5 minutos
      context: {
        task: context?.task || 'unknown',
        priority: context?.priority || 'medium',
        requiresApproval: context?.requiresApproval || false,
      },
    };

    this.messages.set(message.id, message);
    this.emit('message', message);
    await this.saveMessage(message);

    return message;
  }

  /**
   * Responde a un mensaje recibido.
   */
  async respondToMessage(messageId: string, content: unknown): Promise<AgentMessage> {
    const original = this.messages.get(messageId);
    if (!original) {
      throw new Error(`Mensaje ${messageId} no encontrado`);
    }

    const response: AgentMessage = {
      id: randomUUID(),
      from: this.myNode.id,
      to: original.from,
      type: 'response',
      content,
      timestamp: new Date().toISOString(),
      ttl: 300,
      context: original.context,
    };

    this.messages.set(response.id, response);
    this.emit('message', response);
    await this.saveMessage(response);

    return response;
  }

  /**
   * Envía un mensaje broadcast a todos los agentes conocidos.
   */
  async broadcast(content: unknown, context?: Partial<AgentMessage['context']>): Promise<void> {
    const nodes = await this.discoverNodes();
    const otherNodes = nodes.filter(n => n.id !== this.myNode.id);

    for (const node of otherNodes) {
      await this.sendMessage(node.id, content, context);
    }

    console.log(`📡 [A2A] Broadcast enviado a ${otherNodes.length} agentes`);
  }

  // ============================================================
  // ORQUESTACIÓN DE EQUIPO (Agent HQ)
  // ============================================================

  /**
   * Orquesta un equipo de agentes para una tarea compleja.
   *
   * Algoritmo:
   * 1. Descubrir todos los nodos activos
   * 2. Seleccionar líder (más capacidades)
   * 3. Asignar agentes según capacidades relevantes a la tarea
   * 4. Emitir evento de orquestación
   */
  async orchestrateTeam(task: string): Promise<TeamOrchestration> {
    const nodes = await this.discoverNodes();
    const otherNodes = nodes.filter(n => n.id !== this.myNode.id);

    // Si no hay otros agentes, este nodo es el líder
    if (otherNodes.length === 0) {
      const orchestration: TeamOrchestration = {
        leader: this.myNode,
        assigned: [],
        task,
        createdAt: new Date().toISOString(),
      };
      this.emit('team-orchestrated', orchestration);
      return orchestration;
    }

    // Encontrar el líder (el que tiene más capacidades)
    const leader = otherNodes
      .sort((a, b) => b.capabilities.length - a.capabilities.length)[0];

    // Asignar agentes según capacidades relevantes a la tarea
    const assigned: AgentNode[] = [];
    const taskLower = task.toLowerCase();

    for (const node of otherNodes) {
      if (node.id === leader.id) continue;

      const hasRelevantCapability = node.capabilities.some(cap =>
        taskLower.includes(cap.toLowerCase())
      );

      if (hasRelevantCapability) {
        assigned.push(node);
      }
    }

    // Si no hay coincidencia exacta, asignar todos disponibles (excepto líder)
    if (assigned.length === 0) {
      assigned.push(...otherNodes.filter(n => n.id !== leader.id));
    }

    const orchestration: TeamOrchestration = {
      leader,
      assigned,
      task,
      createdAt: new Date().toISOString(),
    };

    this.emit('team-orchestrated', orchestration);
    return orchestration;
  }

  // ============================================================
  // RECEPCIÓN DE MENSAJES (Polling)
  // ============================================================

  /**
   * Verifica si hay mensajes dirigidos a este agente.
   * Se llama periódicamente para procesar mensajes entrantes.
   */
  async checkIncomingMessages(): Promise<AgentMessage[]> {
    const incoming: AgentMessage[] = [];

    try {
      const files = await readdir(this.messageDir);

      for (const file of files) {
        try {
          const data = await fsReadFile(join(this.messageDir, file), 'utf-8');
          const message = JSON.parse(data) as AgentMessage;

          // Filtrar: mensajes dirigidos a este nodo o broadcast
          if (
            (message.to === this.myNode.id || message.to === '*') &&
            message.from !== this.myNode.id &&
            message.type !== 'discovery'
          ) {
            // Verificar TTL
            const age = (Date.now() - new Date(message.timestamp).getTime()) / 1000;
            if (age <= message.ttl) {
              incoming.push(message);
              this.messages.set(message.id, message);
              this.emit('incoming', message);
            }
          }
        } catch {
          // Ignorar
        }
      }
    } catch {
      // Directorio no existe
    }

    return incoming;
  }

  // ============================================================
  // PERSISTENCIA
  // ============================================================

  private async saveMessage(message: AgentMessage): Promise<void> {
    try {
      const filePath = join(this.messageDir, `${message.id}.json`);
      await writeFile(filePath, JSON.stringify(message, null, 2), 'utf-8');
    } catch {
      // No bloquear
    }
  }

  async getMessageHistory(limit = 100): Promise<AgentMessage[]> {
    const messages: AgentMessage[] = [];

    try {
      const files = await readdir(this.messageDir);

      for (const file of files.slice(-limit)) {
        try {
          const data = await fsReadFile(join(this.messageDir, file), 'utf-8');
          messages.push(JSON.parse(data));
        } catch {
          // Ignorar
        }
      }
    } catch {
      // Ignorar
    }

    return messages.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  // ============================================================
  // ESTADÍSTICAS Y ESTADO
  // ============================================================

  getStats(): { nodes: number; activeNodes: number; messages: number; myNode: AgentNode } {
    const activeNodes = Array.from(this.nodes.values()).filter(n => this.isNodeAlive(n));
    return {
      nodes: this.nodes.size,
      activeNodes: activeNodes.length,
      messages: this.messages.size,
      myNode: this.myNode,
    };
  }

  getMyNode(): AgentNode {
    return this.myNode;
  }

  getNodes(): AgentNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Detiene el discovery y la limpieza periódica.
   */
  stop(): void {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
    if (this.cleanUpInterval) {
      clearInterval(this.cleanUpInterval);
      this.cleanUpInterval = null;
    }
    this.myNode.status = 'offline';
    console.log(`🛑 [A2A] Protocolo detenido (node: ${this.myNode.name})`);
  }
}
