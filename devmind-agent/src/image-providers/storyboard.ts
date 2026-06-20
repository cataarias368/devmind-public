// ============================================================
// src/image-providers/storyboard.ts - Video Storyboard Generation
// ============================================================

import type { PollinationsStyle } from './pollinations.js';

// --- Storyboard Types ---

export type CameraPhase = 'establishing' | 'approaching' | 'close-up' | 'panning' | 'revealing' | 'pulling-back' | 'tracking' | 'static';
export type TransitionType = 'cut' | 'dissolve' | 'fade' | 'wipe' | 'zoom' | 'slide';

export interface KenBurnsEffect {
  startScale: number;
  endScale: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface StoryboardScene {
  prompt: string;
  seed: number;
  duration: number;
  cameraPhase: CameraPhase;
  kenBurns: KenBurnsEffect;
  transition: TransitionType;
  fps: number;
  narration: string;
}

export interface StoryboardResult {
  scenes: StoryboardScene[];
  totalDuration: number;
  style: PollinationsStyle;
  baseSeed: number;
  title: string;
  description: string;
}

// --- Camera Phase Configs ---

const CAMERA_PHASE_KEN_BURNS: Record<CameraPhase, KenBurnsEffect> = {
  establishing: { startScale: 1.0, endScale: 1.15, startX: 0.5, startY: 0.5, endX: 0.5, endY: 0.5 },
  approaching: { startScale: 1.0, endScale: 1.5, startX: 0.5, startY: 0.5, endX: 0.5, endY: 0.5 },
  'close-up': { startScale: 1.4, endScale: 1.6, startX: 0.5, startY: 0.4, endX: 0.5, endY: 0.45 },
  panning: { startScale: 1.1, endScale: 1.1, startX: 0.3, startY: 0.5, endX: 0.7, endY: 0.5 },
  revealing: { startScale: 1.3, endScale: 1.0, startX: 0.5, startY: 0.5, endX: 0.5, endY: 0.5 },
  'pulling-back': { startScale: 1.5, endScale: 1.0, startX: 0.5, startY: 0.5, endX: 0.5, endY: 0.5 },
  tracking: { startScale: 1.15, endScale: 1.15, startX: 0.3, startY: 0.5, endX: 0.7, endY: 0.5 },
  static: { startScale: 1.0, endScale: 1.0, startX: 0.5, startY: 0.5, endX: 0.5, endY: 0.5 },
};

const CAMERA_PHASES: CameraPhase[] = [
  'establishing',
  'approaching',
  'close-up',
  'panning',
  'revealing',
  'pulling-back',
  'tracking',
  'static',
];

const TRANSITION_TYPES: TransitionType[] = ['cut', 'dissolve', 'fade', 'wipe', 'zoom', 'slide'];

// --- Storyboard Provider ---

export class StoryboardProvider {
  constructor() {
    // PollinationsProvider used via getSceneImageUrl for URL generation
  }

  /**
   * Generate a video storyboard from an idea.
   * Uses correlated seeds for visual consistency between scenes.
   * Produces Ken Burns effect data for each scene.
   */
  async generate(
    idea: string,
    style: PollinationsStyle = 'realistic',
    sceneCount: number = 5
  ): Promise<StoryboardResult> {
    const baseSeed = this.generateBaseSeed();
    const scenes: StoryboardScene[] = [];
    const fps = 24;

    // Generate scenes with narrative camera phases
    for (let i = 0; i < sceneCount; i++) {
      const cameraPhase = this.selectCameraPhase(i, sceneCount);
      const transition = this.selectTransition(i, sceneCount);
      const seed = this.generateCorrelatedSeed(baseSeed, i);
      const duration = this.computeSceneDuration(i, sceneCount);

      const scenePrompt = this.buildScenePrompt(idea, i, sceneCount, cameraPhase);
      const narration = this.buildNarration(idea, i, sceneCount);

      const kenBurns = { ...CAMERA_PHASE_KEN_BURNS[cameraPhase] };

      scenes.push({
        prompt: scenePrompt,
        seed,
        duration,
        cameraPhase,
        kenBurns,
        transition,
        fps,
        narration,
      });
    }

    const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);

    return {
      scenes,
      totalDuration,
      style,
      baseSeed,
      title: this.generateTitle(idea),
      description: `Storyboard for: ${idea} — ${sceneCount} scenes, ${totalDuration}s total`,
    };
  }

  /**
   * Generate the image URL for a scene using Pollinations.
   */
  getSceneImageUrl(scene: StoryboardScene, style: PollinationsStyle): string {
    const styleModifier = style ? `, ${style} style` : '';
    const url = new URL(`https://image.pollinations.ai/prompt/${encodeURIComponent(scene.prompt + styleModifier)}`);
    url.searchParams.set('width', '1024');
    url.searchParams.set('height', '576');
    url.searchParams.set('seed', String(scene.seed));
    url.searchParams.set('nologo', 'true');
    return url.toString();
  }

  // --- Private Helpers ---

  private generateBaseSeed(): number {
    return Math.floor(Math.random() * 100000) + 1000;
  }

  /**
   * Correlated seeds: each scene's seed is derived from the base
   * so consecutive scenes share visual traits.
   */
  private generateCorrelatedSeed(baseSeed: number, index: number): number {
    return baseSeed + index * 7;
  }

  private selectCameraPhase(index: number, total: number): CameraPhase {
    // Narrative arc: establish → approach → detail → transition → reveal
    if (total <= 1) return 'establishing';

    const ratio = index / (total - 1);

    if (ratio === 0) return 'establishing';
    if (ratio < 0.25) return 'approaching';
    if (ratio < 0.5) return CAMERA_PHASES[index % CAMERA_PHASES.length];
    if (ratio < 0.75) return 'close-up';
    if (ratio === 1) return 'revealing';
    return CAMERA_PHASES[(index + 2) % CAMERA_PHASES.length];
  }

  private selectTransition(index: number, total: number): TransitionType {
    if (index === 0) return 'fade';
    if (index === total - 1) return 'fade';
    // Vary transitions for visual interest
    return TRANSITION_TYPES[index % TRANSITION_TYPES.length];
  }

  private computeSceneDuration(index: number, total: number): number {
    // Opening and closing scenes are longer; middle scenes are shorter
    if (index === 0 || index === total - 1) return 5;
    return 3;
  }

  private buildScenePrompt(idea: string, index: number, total: number, phase: CameraPhase): string {
    const sceneNumber = index + 1;
    const phaseDescriptions: Record<CameraPhase, string> = {
      establishing: 'wide establishing shot showing the full scene',
      approaching: 'medium shot moving closer to the subject',
      'close-up': 'close-up shot showing fine details',
      panning: 'panoramic shot sweeping across the scene',
      revealing: 'dramatic reveal shot uncovering the scene',
      'pulling-back': 'pulling back to show the full context',
      tracking: 'tracking shot following the action',
      static: 'composed static shot',
    };

    return `${idea}, scene ${sceneNumber} of ${total}, ${phaseDescriptions[phase]}, cinematic lighting, high quality`;
  }

  private buildNarration(idea: string, index: number, total: number): string {
    const sceneNumber = index + 1;

    if (index === 0) {
      return `Scene ${sceneNumber}: We begin our story about ${idea}.`;
    }

    if (index === total - 1) {
      return `Scene ${sceneNumber}: Thus concludes our journey through ${idea}.`;
    }

    const midDescriptions = [
      'As the scene unfolds',
      'Moving forward',
      'The narrative deepens',
      'We see the next chapter',
      'The story continues',
    ];

    return `Scene ${sceneNumber}: ${midDescriptions[index % midDescriptions.length]} — ${idea}.`;
  }

  private generateTitle(idea: string): string {
    const words = idea.split(' ').slice(0, 5);
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
}
