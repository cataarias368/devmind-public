// ============================================================
// src/image-providers/pollinations.ts - Generación de Imágenes con Pollinations.ai
// Servicio 100% GRATIS, sin API key requerida
// ============================================================

import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import crypto from 'crypto';

export interface PollinationsConfig {
  outputDir: string;
}

export interface ImageGenerationResult {
  success: boolean;
  filePath?: string;
  url?: string;
  error?: string;
  provider?: string;
}

export class PollinationsProvider {
  private readonly outputDir: string;
  private readonly baseUrl = 'https://image.pollinations.ai/prompt';

  constructor(config: PollinationsConfig) {
    this.outputDir = resolve(config.outputDir);
  }

  isAvailable(): boolean {
    return true; // Siempre disponible, no requiere API key
  }

  /**
   * Genera una imagen a partir de un prompt usando Pollinations.ai
   * Servicio gratuito, sin API key, sin límites estrictos
   */
  async generate(
    prompt: string,
    options?: {
      width?: number;
      height?: number;
      seed?: number;
      model?: string;
      nologo?: boolean;
    }
  ): Promise<ImageGenerationResult> {
    try {
      await mkdir(this.outputDir, { recursive: true });

      const width = options?.width || 1024;
      const height = options?.height || 1024;
      const seed = options?.seed || Math.floor(Math.random() * 999999);
      const model = options?.model || 'flux';
      const nologo = options?.nologo !== false;

      // Construir URL de Pollinations
      const encodedPrompt = encodeURIComponent(prompt);
      const url = `${this.baseUrl}/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&model=${model}${nologo ? '&nologo=true' : ''}`;

      console.log(`[Pollinations] Generando imagen: "${prompt.slice(0, 60)}..."`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'image/*',
        },
      });

      if (!response.ok) {
        return { success: false, error: `Pollinations API error: ${response.status}`, provider: 'pollinations' };
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) {
        return { success: false, error: `Respuesta inesperada: ${contentType}`, provider: 'pollinations' };
      }

      // Guardar la imagen
      const fileName = `pollinations_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.png`;
      const filePath = join(this.outputDir, fileName);
      const arrayBuffer = await response.arrayBuffer();
      await writeFile(filePath, Buffer.from(arrayBuffer));

      console.log(`[Pollinations] Imagen guardada: ${filePath}`);

      return {
        success: true,
        filePath,
        url, // La URL se puede usar directamente en el navegador
        provider: 'pollinations',
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        provider: 'pollinations',
      };
    }
  }

  /**
   * Genera un ícono técnico
   */
  async generateIcon(
    description: string,
    style: 'flat' | 'outline' | 'filled' | '3d' = 'flat'
  ): Promise<ImageGenerationResult> {
    const prompt = `Professional ${style} style icon design: ${description}. Clean, modern, high quality, vector-like`;
    return this.generate(prompt, { width: 1024, height: 1024 });
  }

  /**
   * Genera un diagrama técnico
   */
  async generateDiagram(description: string): Promise<ImageGenerationResult> {
    const prompt = `Professional technical diagram: ${description}. Clean architecture style, clear lines, readable labels, corporate colors, white background`;
    return this.generate(prompt, { width: 1344, height: 768 });
  }

  /**
   * Genera un mockup de UI
   */
  async generateMockup(description: string): Promise<ImageGenerationResult> {
    const prompt = `Professional UI mockup: ${description}. Modern design, Material Design, high contrast, realistic`;
    return this.generate(prompt, { width: 1440, height: 720 });
  }

  /**
   * Genera arte conceptual
   */
  async generateArt(
    description: string,
    style: 'realistic' | 'anime' | 'digital-art' | 'pixel-art' | 'watercolor' = 'digital-art'
  ): Promise<ImageGenerationResult> {
    const prompt = `${description}, ${style} style, high quality, detailed, masterpiece`;
    return this.generate(prompt, { width: 1024, height: 1024 });
  }
}
