// ============================================================
// src/core/identity.ts - SHA-256 Hash Identity System
// ============================================================

import crypto from 'crypto';

// --- Identity Data ---

interface IdentityData {
  name: string;
  email: string;
  contact: string;
  license: string;
}

const IDENTITY: IdentityData = {
  name: 'Jose Luis Arias Casco',
  email: 'cataarias368@gmail.com',
  contact: 'cataarias368@gmail.com',
  license: 'AGPLv3',
};

// --- SHA-256 Hash Generation ---

function hashIdentity(data: IdentityData): string {
  const payload = JSON.stringify(data);
  return crypto.createHash('sha256').update(payload).digest('hex');
}

// --- Exported ID Object ---

export const ID = {
  name: IDENTITY.name,
  email: IDENTITY.email,
  contact: IDENTITY.contact,
  license: IDENTITY.license,
};

// --- Show Function ---

export function show(): string {
  const hash = hashIdentity(IDENTITY);
  return [
    `DevMind Agent Identity`,
    `  Name:    ${IDENTITY.name}`,
    `  Email:   ${IDENTITY.email}`,
    `  Contact: ${IDENTITY.contact}`,
    `  License: ${IDENTITY.license}`,
    `  SHA-256: ${hash}`,
  ].join('\n');
}

// --- Assert Function ---

export function assert(): void {
  const hash = hashIdentity(IDENTITY);
  const expectedLength = 64; // SHA-256 hex digest is always 64 characters

  if (hash.length !== expectedLength) {
    throw new Error('Identity verification failed: invalid hash');
  }

  if (!IDENTITY.name || !IDENTITY.email || !IDENTITY.license) {
    throw new Error('Identity verification failed: missing required fields');
  }

  console.log(`✅ Identity verified: ${IDENTITY.name} (${hash.substring(0, 12)}...)`);
}
