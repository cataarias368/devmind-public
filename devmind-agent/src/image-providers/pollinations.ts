// ============================================================
// src/image-providers/pollinations.ts - Free Image Generation via Pollinations
// ============================================================

export type PollinationsStyle =
  | 'realistic'
  | 'anime'
  | '3d'
  | 'digital-art'
  | 'pixel-art'
  | 'watercolor'
  | 'oil-painting'
  | 'sketch';

export interface PollinationsResult {
  url: string;
  prompt: string;
  style: PollinationsStyle | undefined;
}

const POLLINATIONS_BASE_URL = 'https://image.pollinations.ai/prompt/';

const STYLE_MODIFIERS: Record<PollinationsStyle, string> = {
  realistic: 'photorealistic, high detail, 8k',
  anime: 'anime style, vibrant colors, detailed illustration',
  '3d': '3D render, octane render, volumetric lighting',
  'digital-art': 'digital art, concept art, artstation',
  'pixel-art': 'pixel art style, retro, 16-bit',
  watercolor: 'watercolor painting, soft colors, flowing',
  'oil-painting': 'oil painting, classical, rich textures',
  sketch: 'pencil sketch, hand-drawn, detailed lines',
};

function buildUrl(prompt: string, width: number, height: number, style?: PollinationsStyle, seed?: number): string {
  let fullPrompt = prompt;

  if (style && STYLE_MODIFIERS[style]) {
    fullPrompt = `${prompt}, ${STYLE_MODIFIERS[style]}`;
  }

  const encoded = encodeURIComponent(fullPrompt);
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    nologo: 'true',
  });

  if (seed !== undefined) {
    params.set('seed', String(seed));
  }

  return `${POLLINATIONS_BASE_URL}${encoded}?${params.toString()}`;
}

export class PollinationsProvider {
  /**
   * Generate an image from a text prompt.
   * No API key required — uses the free Pollinations service.
   */
  async generate(prompt: string, style?: PollinationsStyle): Promise<PollinationsResult> {
    const url = buildUrl(prompt, 1024, 1024, style);
    return {
      url,
      prompt,
      style,
    };
  }

  /**
   * Generate a square icon (512x512).
   */
  async generateIcon(prompt: string): Promise<PollinationsResult> {
    const url = buildUrl(prompt, 512, 512, 'digital-art');
    return {
      url,
      prompt,
      style: 'digital-art',
    };
  }

  /**
   * Generate a landscape diagram (1024x512).
   */
  async generateDiagram(prompt: string): Promise<PollinationsResult> {
    const url = buildUrl(prompt, 1024, 512, 'digital-art');
    return {
      url,
      prompt,
      style: 'digital-art',
    };
  }

  /**
   * Generate a UI mockup (800x600).
   */
  async generateMockup(prompt: string): Promise<PollinationsResult> {
    const url = buildUrl(prompt, 800, 600, 'realistic');
    return {
      url,
      prompt,
      style: 'realistic',
    };
  }

  /**
   * Generate art (1024x1024).
   */
  async generateArt(prompt: string): Promise<PollinationsResult> {
    const url = buildUrl(prompt, 1024, 1024, 'digital-art');
    return {
      url,
      prompt,
      style: 'digital-art',
    };
  }
}
