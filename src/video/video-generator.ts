// ============================================================
// src/video/video-generator.ts - Orquestador Principal de Video
// ============================================================

import { ScriptGenerator } from './script-generator.js';
import { SceneComposer } from './scene-composer.js';
import { AnimationEngine } from './animation-engine.js';
import { VideoAssembler } from './video-assembler.js';
import { resolve } from 'path';
import type { GLM47Provider } from '../llm-provider.js';

export interface VideoResult {
  path: string;
  scenes: number;
  duration: number;
  title: string;
}

/**
 * VideoGenerator es el orquestador principal del sistema de video.
 *
 * Pipeline:
 * 1. Genera guion con GLM-4 (ScriptGenerator)
 * 2. Dibuja cada escena con Canvas vectorial (SceneComposer)
 * 3. Interpola frames para animación suave (AnimationEngine)
 * 4. Aplica efectos post-producción (zoom en última escena)
 * 5. Ensambla el video MP4 con FFmpeg (VideoAssembler)
 *
 * Todo el proceso es 100% propio: no usa APIs externas ni modelos
 * de difusión de terceros.
 */
export class VideoGenerator {
  private llm: GLM47Provider;
  private outputDir: string;

  constructor(llm: GLM47Provider, outputDir?: string) {
    this.llm = llm;
    this.outputDir = outputDir || resolve(process.cwd(), 'generated_videos');
  }

  async generate(idea: string): Promise<VideoResult> {
    console.log(`🎬 Generando video: "${idea}"`);

    // 1. Generar guion
    const scriptGen = new ScriptGenerator(this.llm);
    const script = await scriptGen.generate(idea);
    console.log(`  📝 Script: "${script.title}" - ${script.scenes.length} escenas`);

    // 2. Generar frames (escenas estáticas)
    const composer = new SceneComposer(1280, 720);
    const sceneBuffers: Buffer[] = [];

    for (let i = 0; i < script.scenes.length; i++) {
      const sceneData = script.scenes[i];
      console.log(`  🎨 Dibujando escena ${i + 1}/${script.scenes.length}: ${sceneData.title}`);
      const frame = await composer.composeScene(sceneData);
      sceneBuffers.push(frame);
    }

    // 3. Interpolar frames para animación suave
    console.log('  ✨ Interpolando frames...');
    const engine = new AnimationEngine();
    const allFrames: Buffer[] = [];
    const numInterpolated = 6; // Frames interpolados entre cada escena

    for (let i = 0; i < sceneBuffers.length - 1; i++) {
      const start = sceneBuffers[i];
      const end = sceneBuffers[i + 1];
      const interpolated = await engine.interpolateFrames(start, end, numInterpolated);
      allFrames.push(start);
      allFrames.push(...interpolated);
    }
    allFrames.push(sceneBuffers[sceneBuffers.length - 1]);

    // 4. Aplicar efecto de zoom a la última escena
    console.log('  🔍 Aplicando efecto zoom...');
    const lastScene = allFrames[allFrames.length - 1];
    const zoomed = await engine.applyZoom([lastScene], 1.15);
    allFrames[allFrames.length - 1] = zoomed[0];

    // 5. Ensamblar video
    const { mkdir } = await import('fs/promises');
    await mkdir(this.outputDir, { recursive: true });

    const outputPath = resolve(this.outputDir, `video_${Date.now()}.mp4`);
    console.log(`  🎞️ Ensamblando video (${allFrames.length} frames)...`);

    const assembler = new VideoAssembler();
    await assembler.assemble(allFrames, outputPath, 12);

    const duration = allFrames.length / 12;
    console.log(`✅ Video generado: ${outputPath}`);

    return {
      path: outputPath,
      scenes: script.scenes.length,
      duration,
      title: script.title,
    };
  }
}
