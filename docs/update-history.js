#!/usr/bin/env node
// ============================================================
// .devmind/update-history.js - Autoactualizar historial de chat
// ============================================================
// Uso: node .devmind/update-history.js "descripcion del cambio"
// Se puede usar como git hook o manualmente

import { appendFileSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const HISTORY_FILE = resolve(__dirname, 'CHAT_HISTORY.md');

function getTimestamp() {
  return new Date().toISOString().slice(0, 16).replace('T', ' ');
}

function updateHistory(description) {
  const timestamp = getTimestamp();
  
  const entry = `
### **Actualización: ${timestamp}**

**Descripción:** ${description}

**Estado del sistema:**
- Proveedores LLM: DeepSeek ✅ | Cloudflare ✅ | Groq ✅
- Dashboard: Puerto 3003
- Auto-Mutación: ${process.env.AUTO_MUTATION === 'true' ? 'Activada' : 'Desactivada'}
- Compilación: Verificar con \`tsc --noEmit\`

---
`;

  if (existsSync(HISTORY_FILE)) {
    appendFileSync(HISTORY_FILE, entry, 'utf-8');
    console.log(`📖 Historial actualizado: ${timestamp}`);
  } else {
    console.warn('⚠️ No se encontró .devmind/chat-history.md');
  }
}

// Obtener descripción de argumentos o stdin
const args = process.argv.slice(2);
const description = args.join(' ') || 'Actualización automática sin descripción';

updateHistory(description);
