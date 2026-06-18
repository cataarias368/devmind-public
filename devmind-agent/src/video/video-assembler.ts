// ============================================================
// src/video/video-assembler.ts - Ensambla video con FFmpeg
// ============================================================

import { spawnSync } from 'child_process';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join, resolve } from 'path';

/**
 * VideoAssembler toma una lista de frames en Buffer y los
 * ensambla en un video MP4 usando FFmpeg.
 *
 * Seguridad: usa spawnSync con shell:false para prevenir
 * inyección de comandos en las rutas.
 */
export class VideoAssembler {
  /**
   * Ensambla un video a partir de frames.
   * @param frames Buffers PNG de cada frame
   * @param outputPath Ruta de salida del MP4
   * @param fps Frames por segundo (default 12)
   */
  async assemble(frames: Buffer[], outputPath: string, fps = 12): Promise<string> {
    const absOutputPath = resolve(outputPath);
    const tempDir = join(absOutputPath, '..', '.temp_frames_' + Date.now());
    await mkdir(tempDir, { recursive: true });

    // Guardar frames como PNGs numerados
    for (let i = 0; i < frames.length; i++) {
      const framePath = join(tempDir, `frame_${String(i).padStart(4, '0')}.png`);
      await writeFile(framePath, frames[i]);
    }

    // Usar FFmpeg para ensamblar el video (spawnSync + shell:false)
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    const inputPattern = join(tempDir, 'frame_%04d.png');

    const result = spawnSync(
      ffmpegPath,
      [
        '-r', String(fps),
        '-i', inputPattern,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-y',
        absOutputPath,
      ],
      {
        encoding: 'utf-8',
        timeout: 120000,
        shell: false,
      }
    );

    if (result.status !== 0) {
      const stderr = result.stderr || '';
      // Limpiar archivos temporales aunque falle
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      throw new Error(`FFmpeg falló (exit ${result.status}): ${stderr.slice(0, 500)}`);
    }

    // Limpiar archivos temporales
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});

    return absOutputPath;
  }
}
