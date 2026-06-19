// ============================================================
// src/core/identity.ts — Identidad Encriptada de DevMind Agent
// ============================================================

import { createHash } from 'crypto';

const O = {
  n: 'Jose Luis Arias Casco',
  e: 'cataarias368@gmail.com',
  i: '3.264.018-5',
  a: 'Rivera Indarte 4049, La Teja, Montevideo, Uruguay',
  c: 'Uruguay'
};

const S = createHash('sha256').update(`${O.n}|${O.e}|${O.i}`).digest('hex').slice(0, 32);

export const ID = {
  name: 'DevMind Agent',
  owner: O,
  sig: S,
  copyright: `Copyright (c) 2026 ${O.n}`,
  license: 'AGPLv3',
  repo: 'https://github.com/cataarias368/devmind-agent',
  contact: O.e
};

export function verify(): boolean {
  try {
    const check = createHash('sha256').update(`${O.n}|${O.e}|${O.i}`).digest('hex').slice(0, 32);
    if (check !== S) return false;
    if (!O.e.includes('@')) return false;
    if (!O.n || !O.i || !O.a) return false;
    return true;
  } catch {
    return false;
  }
}

export function assert(): void {
  if (!verify()) {
    console.error(`
╔══════════════════════════════════════════════════════════╗
║  ❌ DEVMIND: IDENTIDAD COMPROMETIDA                     ║
║  ═════════════════════════════════════════════════════  ║
║  Este software ha sido modificado o clonado.           ║
║  La identidad original de DevMind no esta intacta.     ║
║  ═════════════════════════════════════════════════════  ║
║  Si eres el propietario legitimo, contacta:            ║
║  📧 ${O.e}                                            ║
║  ═════════════════════════════════════════════════════  ║
║  Descarga la version oficial:                          ║
║  🔗 https://github.com/cataarias368/devmind-agent     ║
╚══════════════════════════════════════════════════════════╝
    `);
    throw new Error('DevMind: Identidad comprometida');
  }
}

export function show(): string {
  return `
╔══════════════════════════════════════════════════════════╗
║  🧠 DevMind Agent                                       ║
║  ═════════════════════════════════════════════════════  ║
║  Propietario: ${O.n}                                    ║
║  Correo:      ${O.e}                                   ║
║  Cedula:      ${O.i}                                   ║
║  Domicilio:   ${O.a}                                   ║
║  Jurisdiccion: ${O.c}                                  ║
║  ═════════════════════════════════════════════════════  ║
║  Licencia:    ${ID.license}                             ║
║  Copyright:   ${ID.copyright}                           ║
║  ═════════════════════════════════════════════════════  ║
║  📧 Contacto: ${O.e}                                   ║
║  🔗 Repo:     ${ID.repo}                                ║
╚══════════════════════════════════════════════════════════╝
  `;
}
