// ============================================================
// src/image-provider.ts - Generación de Imágenes con CogView
// ============================================================

import crypto from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';

interface CogViewConfig {
  apiKey: string;
  outputDir: string;
  model?: string;
  baseUrl?: string;
}

interface ImageGenerationResult {
  success: boolean;
  filePath?: string;
  url?: string;
  error?: string;
}

interface CogViewResponse {
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
  }>;
}

export class CogViewProvider {
  private readonly apiKeyId: string;
  private readonly apiKeySecret: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly outputDir: string;

  constructor(config: CogViewConfig) {
    const parts = config.apiKey.split('.');
    if (parts.length !== 2) {
      throw new Error('GLM_API_KEY debe tener formato "id.secret" para CogView');
    }
    this.apiKeyId = parts[0];
    this.apiKeySecret = parts[1];
    this.model = config.model || 'cogview-3-plus';
    this.baseUrl = config.baseUrl || 'https://open.bigmodel.cn/api/paas/v4';
    this.outputDir = resolve(config.outputDir);
  }

  /**
   * Genera un JWT para autenticación (compartido con LLM Provider).
   */
  private generateToken(): string {
    const now = Date.now();
    const header = { alg: 'HS256', sign_type: 'SIGN' };
    const payload = {
      api_key: this.apiKeyId,
      exp: now + 3600 * 1000,
      timestamp: now,
    };

    const encode = (obj: object) =>
      Buffer.from(JSON.stringify(obj)).toString('base64url');

    const content = `${encode(header)}.${encode(payload)}`;
    const signature = crypto
      .createHmac('sha256', this.apiKeySecret)
      .update(content)
      .digest('base64url');

    return `${content}.${signature}`;
  }

  /**
   * Genera una imagen a partir de un prompt de texto.
   */
  async generate(
    prompt: string,
    options?: {
      size?: '1024x1024' | '768x1344' | '864x1152' | '1344x768' | '1152x864' | '1440x720' | '720x1440';
      style?: string;
    }
  ): Promise<ImageGenerationResult> {
    try {
      await mkdir(this.outputDir, { recursive: true });

      const token = this.generateToken();
      const url = `${this.baseUrl}/images/generations`;

      const body: Record<string, unknown> = {
        model: this.model,
        prompt,
        size: options?.size || '1024x1024',
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `CogView API error ${response.status}: ${errorText}` };
      }

      const data = (await response.json()) as CogViewResponse;

      if (!data.data || data.data.length === 0) {
        return { success: false, error: 'No se generó ninguna imagen' };
      }

      const imageData = data.data[0];
      const fileName = `cogview_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.png`;
      const filePath = join(this.outputDir, fileName);

      if (imageData.b64_json) {
        const buffer = Buffer.from(imageData.b64_json, 'base64');
        await writeFile(filePath, buffer);
        return { success: true, filePath, url: undefined };
      }

      if (imageData.url) {
        // Descargar la imagen desde la URL temporal
        const imgResponse = await fetch(imageData.url);
        if (!imgResponse.ok) {
          return { success: false, error: `Error descargando imagen: ${imgResponse.status}` };
        }
        const arrayBuffer = await imgResponse.arrayBuffer();
        await writeFile(filePath, Buffer.from(arrayBuffer));
        return { success: true, filePath, url: imageData.url };
      }

      return { success: false, error: 'Respuesta sin imagen utilizable' };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Genera un ícono técnico (wrapper con prompt estructurado).
   */
  async generateIcon(
    description: string,
    style: 'flat' | 'outline' | 'filled' | '3d' = 'flat'
  ): Promise<ImageGenerationResult> {
    const prompt = `Diseño de ícono profesional estilo ${style}: ${description}. Fondo transparente, limpio, moderno, alta calidad, vector-like`;
    return this.generate(prompt, { size: '1024x1024' });
  }

  /**
   * Genera un diagrama técnico a partir de una descripción.
   */
  async generateDiagram(description: string): Promise<ImageGenerationResult> {
    const prompt = `Diagrama técnico profesional: ${description}. Estilo clean architecture, líneas claras, etiquetas legibles, colores corporativos, fondo blanco`;
    return this.generate(prompt, { size: '1344x768' });
  }

  /**
   * Genera un mockup de UI a partir de una descripción.
   */
  async generateMockup(description: string): Promise<ImageGenerationResult> {
    const prompt = `Mockup de interfaz de usuario profesional: ${description}. Diseño moderno, Material Design, alto contraste, realista`;
    return this.generate(prompt, { size: '1440x720' });
  }

  /**
   * Genera variaciones de una imagen existente.
   */
  async generateVariation(
    originalPrompt: string,
    variation: string
  ): Promise<ImageGenerationResult> {
    const prompt = `${originalPrompt}. Variación: ${variation}. Mismo estilo, con los cambios indicados`;
    return this.generate(prompt);
  }
}
