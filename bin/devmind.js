#!/usr/bin/env node
// ============================================================
// bin/devmind.js — CLI entry point for DevMind Public
// ============================================================

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load dotenv
try {
  const { config } = await import('dotenv');
  config({ path: resolve(__dirname, '..', '.env') });
} catch {
  // dotenv not available, skip
}

// Run main
await import(resolve(__dirname, '..', 'src', 'index.ts'));
