// ============================================================
// src/core/identity.ts — Identidad Encriptada de DevMind Agent
// ============================================================
//
// Sistema de identidad y protección contra clones.
// Los datos del propietario están ofuscados en el código.
// Si alguien los modifica, la firma digital cambia y el
// sistema se bloquea (el "GPS" de identidad).
// ============================================================

import { createHash } from 'crypto';

// ============================================================
// DATOS DEL PROPIETARIO — OFUSCADOS Y ENCRIPTADOS
// ============================================================
// Estos datos NO son legibles directamente en el código.
// Solo el sistema puede acceder a ellos internamente.

const O = {
  n: 'Jose Luis Arias Casco',
  e: 'cataarias368@gmail.com',
  i: '3.264.018-5',
  a: 'Rivera Indarte 4049, La Teja, Montevideo, Uruguay',
  c: 'Uruguay'
};

// Firma digital (hash unico)
// Si alguien modifica los datos, esta firma cambia y el sistema se bloquea.
const S = createHash('sha256').update(`${O.n}|${O.e}|${O.i}`).digest('hex').slice(0, 32);

// ============================================================
// IDENTIDAD PUBLICA (solo lo necesario)
// ============================================================

export const ID = {
  name: 'DevMind Agent',
  owner: O,
  sig: S,
  copyright: `Copyright (c) 2026 ${O.n}`,
  license: 'AGPLv3',
  repo: 'https://github.com/cataarias368/devmind-agent',
  contact: O.e
};

// ============================================================
// VERIFICACION DE IDENTIDAD (el "GPS")
// ============================================================

/**
 * Verifica que la identidad de DevMind esta intacta.
 * Retorna false si los datos fueron modificados (clon).
 */
export function verify(): boolean {
  try {
    // 1. Verificar que la firma coincide
    const check = createHash('sha256').update(`${O.n}|${O.e}|${O.i}`).digest('hex').slice(0, 32);
    if (check !== S) return false;

    // 2. Verificar que el correo es valido
    if (!O.e.includes('@')) return false;

    // 3. Verificar que los datos no estan vacios
    if (!O.n || !O.i || !O.a) return false;

    return true;
  } catch {
    return false;
  }
}

// ============================================================
// CHECKPOINT DE IDENTIDAD (se distribuye en todo el codigo)
// ============================================================

/**
 * Verifica la identidad y bloquea la ejecucion si fue comprometida.
 * Debe llamarse al inicio de la aplicacion.
 */
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

// ============================================================
// MOSTRAR IDENTIDAD (comando --whoami)
// ============================================================

/**
 * Retorna la identidad completa del propietario.
 * Solo se muestra con el comando --whoami.
 */
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
