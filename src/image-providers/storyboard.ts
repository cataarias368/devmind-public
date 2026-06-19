// ============================================================
// src/image-providers/storyboard.ts - Generación de Storyboards/Video animado
// Usa Pollinations.ai para generar frames — 100% GRATIS, sin API key
// ============================================================

import { mkdir } from 'fs/promises';
import { resolve } from 'path';
import { PollinationsProvider } from './pollinations.js';

export interface StoryboardConfig {
  outputDir: string;
}

export interface StoryboardScene {
  description: string;
  imageUrl: string;
  filePath: string;
  duration: number; // segundos
}

export interface StoryboardResult {
  success: boolean;
  scenes?: StoryboardScene[];
  title?: string;
  totalDuration?: number;
  error?: string;
  provider?: string;
}

export class StoryboardProvider {
  private readonly outputDir: string;
  private readonly pollinations: PollinationsProvider;

  constructor(config: StoryboardConfig) {
    this.outputDir = resolve(config.outputDir);
    this.pollinations = new PollinationsProvider({ outputDir: config.outputDir });
  }

  /**
   * Genera un storyboard completo a partir de una idea.
   * Crea múltiples escenas (frames) con Pollinations.
   */
  async generate(
    idea: string,
    options?: {
      sceneCount?: number;
      style?: string;
      width?: number;
      height?: number;
    }
  ): Promise<StoryboardResult> {
    try {
      await mkdir(this.outputDir, { recursive: true });

      const sceneCount = Math.min(options?.sceneCount || 4, 8);
      const style = options?.style || 'cinematic';
      const width = options?.width || 1344;
      const height = options?.height || 768;

      // Generar descripciones de escenas
      const scenes = this.generateSceneDescriptions(idea, sceneCount, style);

      const storyboard: StoryboardScene[] = [];
      const title = this.generateTitle(idea);

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        console.log(`[Storyboard] Generando escena ${i + 1}/${scenes.length}: "${scene.slice(0, 50)}..."`);

        const result = await this.pollinations.generate(scene, { width, height, seed: 1000 + i });

        if (result.success) {
          storyboard.push({
            description: scene,
            imageUrl: result.url || '',
            filePath: result.filePath || '',
            duration: 3, // 3 segundos por escena
          });
        } else {
          console.warn(`[Storyboard] Escena ${i + 1} falló: ${result.error}`);
        }
      }

      if (storyboard.length === 0) {
        return { success: false, error: 'No se pudo generar ninguna escena', provider: 'storyboard' };
      }

      const totalDuration = storyboard.reduce((sum, s) => sum + s.duration, 0);

      return {
        success: true,
        scenes: storyboard,
        title,
        totalDuration,
        provider: 'storyboard',
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        provider: 'storyboard',
      };
    }
  }

  /**
   * Genera descripciones de escenas a partir de una idea central.
   * Usa patrones narrativos para crear variaciones coherentes.
   */
  private generateSceneDescriptions(idea: string, count: number, style: string): string[] {
    const scenes: string[] = [];

    // Patrones narrativos para crear variaciones
    const phases = [
      { prefix: 'Opening shot, establishing scene:', mood: 'wide angle, atmospheric' },
      { prefix: 'Close-up introduction:', mood: 'dramatic lighting, focus on subject' },
      { prefix: 'Action scene, movement and energy:', mood: 'dynamic angle, motion blur' },
      { prefix: 'Climactic moment, peak intensity:', mood: 'dramatic composition, vibrant colors' },
      { prefix: 'Transition, change of perspective:', mood: 'creative angle, ethereal' },
      { prefix: 'Development, deeper exploration:', mood: 'detailed, rich textures' },
      { prefix: 'Resolution, calm after climax:', mood: 'soft lighting, peaceful' },
      { prefix: 'Final shot, memorable ending:', mood: 'iconic composition, cinematic' },
    ];

    for (let i = 0; i < count; i++) {
      const phase = phases[i % phases.length];
      const sceneDesc = `${phase.prefix} ${idea}. ${phase.mood}, ${style} style, high quality, 16:9`;
      scenes.push(sceneDesc);
    }

    return scenes;
  }

  /**
   * Genera un título a partir de la idea
   */
  private generateTitle(idea: string): string {
    const words = idea.split(' ').slice(0, 5).join(' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
}
