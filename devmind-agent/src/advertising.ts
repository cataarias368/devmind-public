// ============================================================
// src/advertising.ts - Sistema de Publicidad No Intrusiva
// ============================================================

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { AdBanner } from './tasks/types.js';
import { escapeHtml } from './types.js';

interface AdManagerConfig {
  showAds: boolean;
  maxAdsPerPage: number;
  workspaceRoot?: string;
}

interface AdStats {
  totalImpressions: number;
  totalClicks: number;
  overallCTR: number;
  ads: Array<AdBanner & { ctr: number }>;
  impressions: Record<string, number>;
  clicks: Record<string, number>;
}

/**
 * Gestiona anuncios no intrusivos para el Dashboard de DevMind.
 * Soporta planes Free/Pro/Enterprise con diferente cantidad de anuncios.
 */
export class AdvertisingManager {
  private config: AdManagerConfig;
  private ads: AdBanner[] = [];
  private dataDir: string;

  constructor(config: AdManagerConfig) {
    this.config = config;
    this.dataDir = join(config.workspaceRoot || process.cwd(), '.devmind');
  }

  /**
   * Inicializa el sistema de publicidad con anuncios por defecto.
   */
  async init(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });

    // Intentar cargar anuncios existentes
    try {
      const content = await readFile(join(this.dataDir, 'ads.json'), 'utf-8');
      this.ads = JSON.parse(content) as AdBanner[];
    } catch {
      // Cargar anuncios por defecto
      this.ads = this.getDefaultAds();
      await this.save();
    }
  }

  /**
   * Devuelve anuncios para un plan de usuario específico.
   * Free: banner + footer. Pro: sidebar + footer. Enterprise: sin anuncios.
   */
  getAdsForUser(userPlan: string): AdBanner[] {
    if (!this.config.showAds) return [];
    if (userPlan === 'enterprise') return [];

    const now = Date.now();
    const activeAds = this.ads.filter(ad => {
      if (!ad.isActive) return false;
      const start = new Date(ad.startDate).getTime();
      const end = new Date(ad.endDate).getTime();
      if (now < start || now > end) return false;

      // Filtrar por audiencia
      if (!ad.targetAudience.includes('all') && !ad.targetAudience.includes(userPlan)) {
        return false;
      }

      // Pro users no ven banners invasivos
      if (userPlan === 'pro' && ad.type === 'banner') return false;

      return true;
    });

    // Ordenar por prioridad y limitar
    const sorted = activeAds
      .sort((a, b) => b.priority - a.priority)
      .slice(0, this.config.maxAdsPerPage);

    // Registrar impresiones
    for (const ad of sorted) {
      ad.impressions++;
    }
    this.save().catch(() => {});

    return sorted;
  }

  /**
   * Registra un click en un anuncio y actualiza métricas.
   */
  async trackClick(adId: string): Promise<boolean> {
    const ad = this.ads.find(a => a.id === adId);
    if (!ad) return false;

    ad.clicks++;
    ad.conversionRate = ad.impressions > 0 ? ad.clicks / ad.impressions : 0;
    await this.save();
    return true;
  }

  /**
   * Agrega un nuevo anuncio al sistema.
   */
  async addAd(ad: AdBanner): Promise<void> {
    this.ads.push(ad);
    await this.save();
  }

  /**
   * Desactiva un anuncio existente.
   */
  async deactivateAd(adId: string): Promise<boolean> {
    const ad = this.ads.find(a => a.id === adId);
    if (!ad) return false;
    ad.isActive = false;
    await this.save();
    return true;
  }

  /**
   * Devuelve estadísticas completas de publicidad.
   */
  getStats(): AdStats {
    const totalImpressions = this.ads.reduce((sum, ad) => sum + ad.impressions, 0);
    const totalClicks = this.ads.reduce((sum, ad) => sum + ad.clicks, 0);
    const overallCTR = totalImpressions > 0 ? totalClicks / totalImpressions : 0;

    const impressions: Record<string, number> = {};
    const clicks: Record<string, number> = {};

    const adsStats = this.ads.map(ad => {
      impressions[ad.id] = ad.impressions;
      clicks[ad.id] = ad.clicks;
      return {
        ...ad,
        ctr: ad.impressions > 0 ? ad.clicks / ad.impressions : 0,
      };
    });

    return { totalImpressions, totalClicks, overallCTR, ads: adsStats, impressions, clicks };
  }

  /**
   * Genera el HTML para renderizar anuncios en el dashboard.
   */
  renderAdsHTML(ads: AdBanner[]): string {
    if (ads.length === 0) return '';

    return ads.map(ad => {
      const safeTitle = escapeHtml(ad.title);
      const safeDesc = escapeHtml(ad.description);
      const safeCta = escapeHtml(ad.ctaText);
      const safeUrl = escapeHtml(ad.linkUrl);

      switch (ad.type) {
        case 'banner':
          return `<div class="ad-banner" id="ad-${escapeHtml(ad.id)}">
            <div class="ad-content">
              <strong>${safeTitle}</strong>
              <p>${safeDesc}</p>
              <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="ad-cta" onclick="fetch('/api/ad/click',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({adId:'${escapeHtml(ad.id)}'})})">${safeCta}</a>
            </div>
            <button class="ad-close" onclick="this.parentElement.remove()">✕</button>
          </div>`;

        case 'sidebar':
          return `<div class="ad-sidebar" id="ad-${escapeHtml(ad.id)}">
            <strong>${safeTitle}</strong>
            <p>${safeDesc}</p>
            <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="ad-cta" onclick="fetch('/api/ad/click',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({adId:'${escapeHtml(ad.id)}'})})">${safeCta}</a>
          </div>`;

        case 'footer':
          return `<div class="ad-footer" id="ad-${escapeHtml(ad.id)}">
            <span class="ad-footer-desc">${safeDesc}</span>
            <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="ad-footer-link" onclick="fetch('/api/ad/click',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({adId:'${escapeHtml(ad.id)}'})})">${safeCta}</a>
          </div>`;

        default:
          return '';
      }
    }).join('\n');
  }

  /**
   * Genera los estilos CSS para los anuncios.
   */
  getAdStyles(): string {
    return `
      .ad-banner { background: var(--surface2, #334155); border: 1px solid var(--border, #475569); border-radius: 8px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
      .ad-content { flex: 1; }
      .ad-content p { margin: 4px 0; color: var(--text2, #94a3b8); font-size: 0.85em; }
      .ad-cta { display: inline-block; background: var(--accent, #818cf8); color: white; padding: 4px 12px; border-radius: 6px; text-decoration: none; font-size: 0.85em; margin-top: 4px; }
      .ad-close { background: none; border: none; color: var(--text2, #94a3b8); cursor: pointer; font-size: 1.2em; }
      .ad-sidebar { background: var(--surface2, #334155); border-radius: 8px; padding: 12px; margin-bottom: 8px; }
      .ad-sidebar p { color: var(--text2, #94a3b8); font-size: 0.85em; }
      .ad-footer { padding: 8px 16px; border-top: 1px solid var(--border, #475569); display: flex; justify-content: space-between; align-items: center; }
      .ad-footer-desc { color: var(--text2, #94a3b8); font-size: 0.8em; }
      .ad-footer-link { color: var(--accent, #818cf8); text-decoration: none; font-size: 0.85em; }
    `;
  }

  /**
   * Devuelve los anuncios por defecto del sistema.
   */
  private getDefaultAds(): AdBanner[] {
    return [
      {
        id: 'sponsor-railway',
        type: 'banner',
        title: 'Railway',
        description: 'Desplegá tu app en segundos. Sin configuración, sin dolor.',
        imageUrl: 'https://railway.app/brand/logo.png',
        linkUrl: 'https://railway.app?ref=devmind',
        ctaText: 'Desplegar',
        priority: 9,
        isActive: true,
        impressions: 0,
        clicks: 0,
        conversionRate: 0,
        startDate: '2024-01-01T00:00:00.000Z',
        endDate: '2027-01-01T00:00:00.000Z',
        targetAudience: ['all'],
        placement: 'top',
      },
      {
        id: 'sponsor-educational',
        type: 'sidebar',
        title: 'Cursos Online',
        description: 'Aprendé programación online. 20% OFF con código DEV20.',
        imageUrl: '',
        linkUrl: 'https://educational.io?ref=devmind',
        ctaText: 'Ver Cursos',
        priority: 7,
        isActive: true,
        impressions: 0,
        clicks: 0,
        conversionRate: 0,
        startDate: '2024-01-01T00:00:00.000Z',
        endDate: '2027-01-01T00:00:00.000Z',
        targetAudience: ['free', 'pro'],
        placement: 'sidebar',
      },
      {
        id: 'devmind-pro',
        type: 'footer',
        title: 'DevMind Pro',
        description: 'Desbloqueá modelos premium y funciones avanzadas.',
        imageUrl: '',
        linkUrl: 'https://devmind.ai/pricing',
        ctaText: 'Mejorar Plan',
        priority: 10,
        isActive: true,
        impressions: 0,
        clicks: 0,
        conversionRate: 0,
        startDate: '2024-01-01T00:00:00.000Z',
        endDate: '2027-01-01T00:00:00.000Z',
        targetAudience: ['free'],
        placement: 'bottom',
      },
    ];
  }

  /**
   * Persiste los anuncios en disco.
   */
  private async save(): Promise<void> {
    try {
      await mkdir(this.dataDir, { recursive: true });
      await writeFile(
        join(this.dataDir, 'ads.json'),
        JSON.stringify(this.ads, null, 2),
        'utf-8'
      );
    } catch {
      // No bloquear
    }
  }
}
