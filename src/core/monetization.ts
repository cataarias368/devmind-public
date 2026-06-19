// src/core/monetization.ts
import { ID, verify } from './identity.js';

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

export function getAds(userPlan: string = 'free'): AdItem[] {
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

  if (userPlan === 'free') {
    return [
      { id: 'devmind-pro', title: '🚀 DevMind Pro', description: 'Sin anuncios, modelos premium, generacion ilimitada.', link: 'mailto:cataarias368@gmail.com', cta: 'Contactar', priority: 10 },
      { id: 'sponsor-railway', title: '🚀 Despliega con Railway', description: 'El hosting mas facil. $5 de credito con DEVMIND.', link: 'https://railway.app?ref=devmind', cta: 'Probar', priority: 8 },
      { id: 'sponsor-educative', title: '📚 Aprende con Educative', description: 'Cursos interactivos. 20% off con DEVMIND20.', link: 'https://educative.io?ref=devmind', cta: 'Ver cursos', priority: 7 }
    ];
  }

  return [];
}

export function claimRevenue(amount: number, source: string): RevenueClaim {
  const claim: RevenueClaim = { amount, source, timestamp: new Date().toISOString(), owner: ID.owner.n, contact: ID.contact };
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
╚══════════════════════════════════════════════════════════╝
  `);
  return claim;
}

export function detectCommercialUse(): void {
  console.log(`🔍 [DevMind] Verificando uso comercial no autorizado... Propietario: ${ID.owner.n} Contacto: ${ID.contact}`);
}
