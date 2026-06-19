// ============================================================
// src/core/licensing.ts — Licencias y Contacto Comercial
// ============================================================
//
// Define los planes de licencia de DevMind y proporciona
// informacion de contacto para uso comercial.
// Todo el control de licencias reside en el repositorio Master.
// ============================================================

import { ID } from './identity.js';

export interface LicensePlan {
  name: string;
  license: string;
  price: string;
  description: string;
  features: string[];
}

export const LICENSING = {
  contact: ID.contact,
  owner: ID.owner.n,
  plans: {
    community: {
      name: 'Community Edition',
      license: 'AGPLv3',
      price: '$0',
      description: 'Uso personal, educativo y open source',
      features: [
        'Agente autonomo con GLM-4',
        '15 modulos de rendimiento',
        'Dashboard web',
        'Generacion de imagenes (CogView)',
        'Multi-agente (5 roles)',
        'Generacion de video basico',
        'Plugins comunitarios',
        'Soporte via GitHub Issues',
        'Anuncios incluidos'
      ]
    },
    pro: {
      name: 'Pro Edition',
      license: 'Commercial',
      price: '$19/mes',
      description: 'Sin anuncios, modelos premium, generacion ilimitada',
      features: [
        'Todo de Community',
        'Multi-provider LLM (Google, Mistral, Groq, OpenRouter)',
        'Generacion de video ilimitada',
        'Auto-mutation avanzada',
        'Protocolo A2A completo',
        'Sin anuncios',
        'Soporte prioritario por email',
        'Actualizaciones anticipadas'
      ]
    },
    enterprise: {
      name: 'Enterprise Edition',
      license: 'Commercial',
      price: '$99/mes',
      description: 'Para empresas que requieren privacidad total',
      features: [
        'Todo de Pro',
        'Modelos privados (on-premise)',
        'SLA garantizado 99.9%',
        'Soporte dedicado 24/7',
        'Personalizacion de marca',
        'Auditoria de seguridad',
        'Integracion con SSO/SAML',
        'Facturacion corporativa'
      ]
    }
  }
};

/**
 * Retorna la informacion completa de licencias.
 */
export function getLicensingInfo(): string {
  return `
╔══════════════════════════════════════════════════════════╗
║  📜 DevMind — Licencias                                 ║
║  ═════════════════════════════════════════════════════  ║
║  Community Edition:   AGPLv3 (Gratis)                  ║
║  Pro Edition:         $19/mes                          ║
║  Enterprise Edition:  $99/mes                          ║
║  ═════════════════════════════════════════════════════  ║
║  📧 Contacto comercial: ${LICENSING.contact}           ║
║  ═════════════════════════════════════════════════════  ║
║  Para usar DevMind sin abrir tu codigo:                ║
║  Contactanos para una licencia comercial.              ║
╚══════════════════════════════════════════════════════════╝
  `;
}

/**
 * Retorna los detalles de un plan especifico.
 */
export function getPlanDetails(planId: keyof typeof LICENSING.plans): LicensePlan {
  return LICENSING.plans[planId];
}
