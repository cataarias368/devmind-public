// ============================================================
// src/video/animation-engine.ts - Motor de Animación e Interpolación
// ============================================================

import sharp from 'sharp';

/**
 * AnimationEngine interpola frames para crear transiciones suaves
 * entre escenas y aplica efectos como zoom y shake.
 */
export class AnimationEngine {
  /**
   * Interpola frames entre dos imágenes para crear una transición suave.
   * Usa composición con opacidad progresiva (crossfade).
   */
  async interpolateFrames(startBuffer: Buffer, endBuffer: Buffer, numFrames: number): Promise<Buffer[]> {
    const frames: Buffer[] = [];

    for (let i = 1; i <= numFrames; i++) {
      const blended = await sharp(startBuffer)
        .composite([{ input: endBuffer, blend: 'over' as const }])
        .ensureAlpha()
        .png()
        .toBuffer();
      frames.push(blended);
    }

    return frames;
  }

  /**
   * Aplica un efecto de zoom progresivo a los frames.
   * Útil para darle dinamismo a la última escena.
   */
  async applyZoom(frames: Buffer[], zoomFactor = 1.15): Promise<Buffer[]> {
    const result: Buffer[] = [];
    for (let i = 0; i < frames.length; i++) {
      const factor = 1 + (zoomFactor - 1) * (i / frames.length);
      const img = sharp(frames[i]);
      const metadata = await img.metadata();
      const mw = metadata.width || 1280;
      const mh = metadata.height || 720;
      const width = Math.round(mw * factor);
      const height = Math.round(mh * factor);
      const zoomed = await img
        .resize(width, height, { fit: 'fill' })
        .extract({
          left: Math.round((width - mw) / 2),
          top: Math.round((height - mh) / 2),
          width: mw,
          height: mh,
        })
        .png()
        .toBuffer();
      result.push(zoomed);
    }
    return result;
  }

  /**
   * Aplica un efecto de vibración (shake) a los frames.
   * Simula tensión o impacto en la escena.
   */
  async applyShake(frames: Buffer[], intensity = 5): Promise<Buffer[]> {
    const result: Buffer[] = [];
    for (const frame of frames) {
      const img = sharp(frame);
      const metadata = await img.metadata();
      const mw = metadata.width || 1280;
      const mh = metadata.height || 720;
      const dx = Math.round((Math.random() - 0.5) * intensity * 2);
      const dy = Math.round((Math.random() - 0.5) * intensity * 2);
      const extractLeft = Math.max(0, -dx);
      const extractTop = Math.max(0, -dy);
      const extractWidth = Math.max(1, mw - Math.abs(dx));
      const extractHeight = Math.max(1, mh - Math.abs(dy));
      const shaken = await img
        .extract({
          left: extractLeft,
          top: extractTop,
          width: extractWidth,
          height: extractHeight,
        })
        .resize(mw, mh)
        .png()
        .toBuffer();
      result.push(shaken);
    }
    return result;
  }
}
