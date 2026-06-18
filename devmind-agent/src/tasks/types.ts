// ============================================================
// src/tasks/types.ts - Tipos Compartidos del Módulo de Tareas
// ============================================================

export interface AgentMessage {
  role: string;
  content: string;
  timestamp: number;
  priority?: number;
}

export interface TaskToolDefinition {
  name: string;
  description: string;
  keywords: string[];
}

export interface TaskMemoryEntry {
  action: string;
  result: string;
  timestamp: number;
  importance: number;
}

export interface Episode {
  task: string;
  plan: string;
  result: string;
  success: boolean;
  timestamp: number;
}

export interface Metric {
  timestamp: number;
  success: boolean;
  steps: number;
  tokens: number;
  time: number;
}

export interface TaskResult {
  success: boolean;
  summary: string;
  steps: number;
}

export interface SystemState {
  uptime: number;
  memory: { totalUsage: number; usedByType: Record<string, number> };
  checkpoints: number;
  imagesGenerated: number;
  tasksCompleted: number;
  tokensUsed: number;
  ads: { totalImpressions: number; totalClicks: number; overallCTR: number };
}

export interface LLMProvider {
  call(messages: unknown[], tools?: unknown[]): Promise<unknown>;
}

export interface AdBanner {
  id: string;
  type: 'banner' | 'sidebar' | 'footer';
  title: string;
  description: string;
  imageUrl: string;
  linkUrl: string;
  ctaText: string;
  priority: number;
  isActive: boolean;
  impressions: number;
  clicks: number;
  conversionRate: number;
  startDate: string;
  endDate: string;
  targetAudience: string[];
  placement: string;
}
