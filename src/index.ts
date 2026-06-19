// ============================================================
// src/index.ts — DevMind Public (Repositorio Publico)
// ============================================================
//
// Este es el punto de entrada del repositorio publico.
// Depende del submodulo Master (src/core) para funcionar.
// Si el submodulo no existe, el sistema no arranca.
// ============================================================

import { existsSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');

// ============================================================
// VERIFICAR QUE EL SUBMODULO MASTER EXISTE
// ============================================================

function checkMasterExists(): boolean {
  const corePath = join(__dirname, 'core', 'identity.ts');
  const coreExists = existsSync(corePath);

  if (!coreExists) {
    console.error(`
╔══════════════════════════════════════════════════════════╗
║  ❌ DEVMIND: INSTALACION INCOMPLETA                     ║
║  ═════════════════════════════════════════════════════  ║
║  Este repositorio publico requiere el submodulo Master  ║
║  para funcionar completamente.                         ║
║  ═════════════════════════════════════════════════════  ║
║  Para instalar correctamente:                          ║
║  git submodule update --init --recursive               ║
║  ═════════════════════════════════════════════════════  ║
║  🔗 Repositorio Master:                                ║
║  https://github.com/cataarias368/devmind-agent         ║
║  ═════════════════════════════════════════════════════  ║
║  📧 Contacto: cataarias368@gmail.com                   ║
╚══════════════════════════════════════════════════════════╝
    `);
    process.exit(1);
  }

  return true;
}

// ============================================================
// VERIFICAR IDENTIDAD (usa el sistema del Master)
// ============================================================

async function verifyIdentity(): Promise<void> {
  try {
    const { assert } = await import('./core/identity.js');
    assert();
    console.log('✅ [DevMind] Identidad verificada (desde Master)');
  } catch (_err) {
    console.error(`
╔══════════════════════════════════════════════════════════╗
║  ❌ DEVMIND: IDENTIDAD COMPROMETIDA                     ║
║  ═════════════════════════════════════════════════════  ║
║  El submodulo Master ha sido modificado.               ║
║  La identidad de DevMind no esta intacta.              ║
║  ═════════════════════════════════════════════════════  ║
║  Para restaurar la identidad:                          ║
║  git submodule update --force --remote                 ║
║  ═════════════════════════════════════════════════════  ║
║  🔗 Repositorio Master:                                ║
║  https://github.com/cataarias368/devmind-agent         ║
║  ═════════════════════════════════════════════════════  ║
║  📧 Contacto: cataarias368@gmail.com                   ║
╚══════════════════════════════════════════════════════════╝
    `);
    process.exit(1);
  }
}

// ============================================================
// FUNCION PRINCIPAL
// ============================================================

async function main(): Promise<void> {
  // 1. Verificar submodulo
  checkMasterExists();

  // 2. Verificar identidad desde el Master
  await verifyIdentity();

  // 3. Cargar modulos del Master
  const { ID, show } = await import('./core/identity.js');
  const { getLicensingInfo } = await import('./core/licensing.js');
  const { getAds, detectCommercialUse, claimRevenue } = await import('./core/monetization.js');

  // 4. Banner
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  🧠 DevMind Agent v3.0.0 — Open Source Edition         ║
║  🔒 Identidad verificada (Master)                       ║
║  📧 Contacto: ${ID.contact}                             ║
║  📜 Licencia: ${ID.license}                             ║
╚══════════════════════════════════════════════════════════╝
  `);

  // 5. Comandos de identidad
  const args = process.argv.slice(2);

  // WHOAMI
  if (args.includes('--whoami')) {
    console.log(show());
    process.exit(0);
  }

  // LICENSE
  if (args.includes('--license') || args.includes('--license-info')) {
    console.log(getLicensingInfo());
    process.exit(0);
  }

  // CLAIM
  if (args.includes('--claim')) {
    const claimArgs = args.slice(args.indexOf('--claim') + 1);
    const amount = parseFloat(claimArgs[0] || '0');
    const source = claimArgs[1] || 'unknown';
    claimRevenue(amount, source);
    process.exit(0);
  }

  // 6. Detectar uso comercial
  detectCommercialUse();

  // 7. Control de publicidad
  const ads = getAds('free');
  if (ads.length > 0) {
    console.log('📢 [DevMind] Publicidad activa (plan gratuito)');
  }

  // 8. Cargar el agente desde el Master
  console.log('🧠 [DevMind] Cargando agente desde el Master...');

  try {
    const { agentLoop } = await import('./core/agent.js');
    const { GLM47Provider } = await import('./core/llm-provider.js');

    // Configurar API key
    const apiKey = process.env.GLM_API_KEY;
    if (!apiKey) {
      console.error('❌ GLM_API_KEY no configurada. Crear un archivo .env con tu clave.');
      console.error('   cp .env.example .env');
      process.exit(1);
    }

    const llmProvider = new GLM47Provider({ apiKey });
    const workspaceRoot = process.cwd();

    // Ejecutar tarea o mostrar ayuda
    const task = args.find(a => !a.startsWith('--'));
    if (!task) {
      console.log(`
📋 DevMind Agent — Open Source Edition

Uso:
  devmind "Tu tarea aqui"        Ejecutar tarea con el agente
  devmind --whoami               Ver identidad del propietario
  devmind --license              Informacion de licencias
  devmind --claim <monto> <src>  Reclamar ganancias

📦 Depende del repositorio Master para funcionalidad completa:
  https://github.com/cataarias368/devmind-agent

📧 Contacto: cataarias368@gmail.com
      `);
      process.exit(0);
    }

    const result = await agentLoop(task, {
      llmProvider,
      workspaceRoot,
      maxSteps: 25,
      onStep: (step: number, msg: string) => console.log(`[Paso ${step}] ${msg}`)
    });

    console.log(`\n${result.success ? '✅' : '⚠️'} Tarea completada en ${result.stepsCompleted} pasos`);
    console.log(result.summary);
  } catch (err) {
    console.error(`❌ Error cargando agente desde Master: ${err instanceof Error ? err.message : String(err)}`);
    console.error('💡 Asegurate de que el submodulo Master esta inicializado:');
    console.error('   git submodule update --init --recursive');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
