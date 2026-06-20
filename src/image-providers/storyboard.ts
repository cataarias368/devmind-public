// ============================================================
// src/image-providers/storyboard.ts - Generación de Storyboards con frames consistentes
// Usa Pollinations.ai — 100% GRATIS, sin API key
// Genera frames con estilo consistente usando seeds correlacionados
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
  duration: number;
  // Efectos Ken Burns para el motor de video
  kenBurns: {
    startScale: number;
    endScale: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  };
  transition: 'crossfade' | 'dissolve' | 'slide-left' | 'zoom-in' | 'fade-black';
}

export interface StoryboardResult {
  success: boolean;
  scenes?: StoryboardScene[];
  title?: string;
  totalDuration?: number;
  fps?: number;
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

  async generate(
    idea: string,
    options?: {
      sceneCount?: number;
      style?: string;
      width?: number;
      height?: number;
      fps?: number;
    }
  ): Promise<StoryboardResult> {
    try {
      await mkdir(this.outputDir, { recursive: true });

      const sceneCount = Math.min(options?.sceneCount || 4, 8);
      const style = options?.style || 'cinematic';
      const width = options?.width || 1344;
      const height = options?.height || 768;
      const fps = options?.fps || 24;
      const baseSeed = Math.floor(Math.random() * 10000);

      const scenes = this.generateSceneDescriptions(idea, sceneCount, style);
      const storyboard: StoryboardScene[] = [];
      const title = this.generateTitle(idea);

      const transitions: StoryboardScene['transition'][] = [
        'crossfade', 'dissolve', 'slide-left', 'zoom-in', 'fade-black',
        'crossfade', 'dissolve', 'slide-left',
      ];

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        console.log(`[Storyboard] Generando escena ${i + 1}/${scenes.length}: "${scene.slice(0, 50)}..."`);

        // Usar seeds correlacionados para consistencia visual
        const result = await this.pollinations.generate(scene, {
          width, height,
          seed: baseSeed + i, // Seed correlacionado = estilo consistente
        });

        if (result.success) {
          // Generar efecto Ken Burns automático basado en la posición narrativa
          const kenBurns = this.generateKenBurns(i, scenes.length);

          storyboard.push({
            description: scene,
            imageUrl: result.url || '',
            filePath: result.filePath || '',
            duration: 4, // 4 segundos por escena para video fluido
            kenBurns,
            transition: transitions[i % transitions.length],
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
        fps,
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
   * Genera descripciones de escenas con narrativa cinematográfica
   * y variaciones de pose/ángulo para simular movimiento
   */
  private generateSceneDescriptions(idea: string, count: number, style: string): string[] {
    const scenes: string[] = [];

    // Fases narrativas con ángulos de cámara específicos
    const phases = [
      {
        prefix: 'Wide establishing shot, camera slowly panning right:',
        camera: 'aerial view, epic scale, depth of field',
        mood: 'peaceful, mysterious atmosphere',
      },
      {
        prefix: 'Medium shot, character enters frame from left:',
        camera: 'tracking shot, shallow depth of field, bokeh background',
        mood: 'curious, determined expression',
      },
      {
        prefix: 'Close-up reaction shot, camera pushing in slowly:',
        camera: 'macro lens detail, dramatic lighting from side',
        mood: 'intense emotion, eyes wide with wonder',
      },
      {
        prefix: 'Action shot, dynamic movement, motion blur:',
        camera: 'dutch angle, fast tracking, motion lines',
        mood: 'energy, speed, determination',
      },
      {
        prefix: 'Dramatic low angle shot, camera tilting up:',
        camera: 'hero pose, rim lighting, lens flare',
        mood: 'powerful moment, revelation',
      },
      {
        prefix: 'Over-the-shoulder shot, two characters:',
        camera: 'soft focus foreground, clear subject',
        mood: 'connection, dialogue, tension',
      },
      {
        prefix: 'Aerial pull-back shot, camera rising:',
        camera: 'bird eye view, vast landscape, god rays',
        mood: 'freedom, resolution, peace',
      },
      {
        prefix: 'Final portrait shot, camera static, shallow DOF:',
        camera: 'golden hour lighting, lens flare, bokeh',
        mood: 'contemplation, hope, ending',
      },
    ];

    for (let i = 0; i < count; i++) {
      const phase = phases[i % phases.length];
      // Misma idea + misma semilla de estilo = consistencia visual
      const sceneDesc = `${phase.prefix} ${idea}. ${phase.camera}, ${phase.mood}, ${style} style, consistent character design, high quality, 16:9 aspect ratio`;
      scenes.push(sceneDesc);
    }

    return scenes;
  }

  /**
   * Genera efecto Ken Burns automático — crea ilusión de movimiento
   * en imágenes estáticas (pan, zoom, rotación sutil)
   */
  private generateKenBurns(
    sceneIndex: number,
    _totalScenes: number
  ): StoryboardScene['kenBurns'] {
    // Patrones de movimiento variados por posición narrativa
    const patterns: StoryboardScene['kenBurns'][] = [
      // Escena 1: Zoom in lento (establecimiento)
      { startScale: 1.0, endScale: 1.15, startX: 0, startY: 0, endX: -0.05, endY: -0.03 },
      // Escena 2: Pan derecha
      { startScale: 1.1, endScale: 1.1, startX: -0.08, startY: 0, endX: 0.08, endY: 0 },
      // Escena 3: Zoom in dramático
      { startScale: 1.0, endScale: 1.3, startX: 0, startY: -0.05, endX: 0, endY: -0.1 },
      // Escena 4: Pan izquierda + zoom
      { startScale: 1.15, endScale: 1.25, startX: 0.08, startY: 0, endX: -0.05, endY: -0.03 },
      // Escena 5: Zoom out revelador
      { startScale: 1.3, endScale: 1.0, startX: 0, startY: -0.1, endX: 0, endY: 0 },
      // Escena 6: Pan sutil
      { startScale: 1.05, endScale: 1.1, startX: -0.03, startY: 0.02, endX: 0.03, endY: -0.02 },
      // Escena 7: Zoom out épico
      { startScale: 1.2, endScale: 1.0, startX: 0, startY: 0, endX: 0, endY: 0 },
      // Escena 8: Zoom in final
      { startScale: 1.0, endScale: 1.2, startX: 0, startY: 0, endX: 0, endY: -0.05 },
    ];

    return patterns[sceneIndex % patterns.length];
  }

  private generateTitle(idea: string): string {
    const words = idea.split(' ').slice(0, 5).join(' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
}
