// ============================================================
// src/core/monetization.ts — Control de Publicidad y Ganancias
// ============================================================
//
// Sistema de control de publicidad y reclamacion de ganancias.
// Si alguien clona DevMind y modifica los anuncios, este
// sistema detecta la modificacion y redirige las ganancias
// al propietario original.
//
// Todo el control de monetizacion reside en el repositorio Master.
// ============================================================

import { ID, verify } from './identity.js';

// ============================================================
// INTERFACES
// ============================================================

export interface AdItem {
  id: string;
  title: string;
  description: string;
  link: string;
  cta: string;
  priority: number;
}

export interface RevenueClaim {
  amount: number;
  source: string;
  timestamp: string;
  owner: string;
  contact: string;
}

// ============================================================
// CONTROL DE PUBLICIDAD
// ============================================================

/**
 * Retorna los anuncios segun el plan del usuario.
 * Si la identidad esta comprometida (clon), muestra
 * anuncios de DevMind original en vez de los del clon.
 * Esto garantiza que la monetizacion siempre va al propietario.
 */
export function getAds(userPlan: string = 'free'): AdItem[] {
  // Si la identidad esta comprometida, mostrar anuncios de DevMind
  if (!verify()) {
    return [{
      id: 'devmind-original',
      title: '🧠 DevMind Original',
      description: 'Estas usando una version modificada. Descarga la original.',
      link: 'https://github.com/cataarias368/devmind-agent',
      cta: 'Descargar original',
      priority: 100
    }];
  }

  // Anuncios normales segun el plan
  if (userPlan === 'free') {
    return [
      {
        id: 'devmind-pro',
        title: '🚀 DevMind Pro',
        description: 'Sin anuncios, modelos premium, generacion ilimitada.',
        link: 'mailto:cataarias368@gmail.com',
        cta: 'Contactar',
        priority: 10
      },
      {
        id: 'sponsor-railway',
        title: '🚀 Despliega con Railway',
        description: 'El hosting mas facil. $5 de credito con DEVMIND.',
        link: 'https://railway.app?ref=devmind',
        cta: 'Probar',
        priority: 8
      },
      {
        id: 'sponsor-educative',
        title: '📚 Aprende con Educative',
        description: 'Cursos interactivos. 20% off con DEVMIND20.',
        link: 'https://educative.io?ref=devmind',
        cta: 'Ver cursos',
        priority: 7
      }
    ];
  }

  // Planes de pago: sin anuncios
  return [];
}

// ============================================================
// SISTEMA DE RECLAMACION DE GANANCIAS
// ============================================================

/**
 * Genera un reclamo de ganancias con los datos del propietario.
 * Se usa para documentar y reclamar ingresos generados por
 * el uso de DevMind. Todas las ganancias pertenecen al
 * propietario registrado en el sistema de identidad.
 */
export function claimRevenue(amount: number, source: string): RevenueClaim {
  const claim: RevenueClaim = {
    amount,
    source,
    timestamp: new Date().toISOString(),
    owner: ID.owner.n,
    contact: ID.contact
  };

  console.log(`
╔══════════════════════════════════════════════════════════╗
║  💰 DevMind — Reclamacion de Ganancias                  ║
║  ═════════════════════════════════════════════════════  ║
║  Propietario: ${ID.owner.n}                             ║
║  Correo:      ${ID.contact}                            ║
║  Cedula:      ${ID.owner.i}                            ║
║  ═════════════════════════════════════════════════════  ║
║  Cantidad:    $${amount.toFixed(2)}                     ║
║  Fuente:      ${source}                                 ║
║  Fecha:       ${claim.timestamp}                        ║
║  ═════════════════════════════════════════════════════  ║
║  📧 Enviar factura a: ${ID.contact}                    ║
║  💳 IBAN: (contactar para detalles)                    ║
╚══════════════════════════════════════════════════════════╝
  `);

  return claim;
}

// ============================================================
// VERIFICACION DE USO COMERCIAL
// ============================================================

/**
 * Ejecuta una verificacion periodica de uso comercial
 * no autorizado. Registra en consola los datos del
 * propietario para fines de auditoria.
 */
export function detectCommercialUse(): void {
  console.log(`
🔍 [DevMind] Verificando uso comercial no autorizado...
   Propietario: ${ID.owner.n}
   Contacto: ${ID.contact}
   Si detectas uso comercial sin licencia, contacta a:
   ${ID.contact}
  `);
}
