// ============================================================
// src/index.ts - Punto de Entrada Principal de DevMind Agent v2.0
// ============================================================

import { resolve } from 'path';
import { getConfig, hasGitHubConfig, hasBotConfig } from './config.js';
import { GLM47Provider } from './llm-provider.js';
import { CogViewProvider } from './image-provider.js';
import { CheckpointManager } from './checkpoint.js';
import { MemoryStore } from './memory.js';
import { agentLoop } from './agent.js';
import { DocumentationGenerator } from './doc-generator.js';
import { GitHubIntegration } from './github-integration.js';
import { DashboardServer } from './dashboard.js';
import { MultiPlatformBot } from './chat-bots.js';
import { MultiAgentOrchestrator } from './multi-agent.js';
import { TestGenerator } from './test-generator.js';
import { RestAPIServer } from './server.js';
import { TaskManager } from './tasks/index.js';
import { AdvertisingManager } from './advertising.js';
import { Monitor } from './monitor.js';
import type { AgentCore } from './types.js';

async function main(): Promise<void> {
  // --- Cargar configuración validada ---
  const config = getConfig();
  const workspaceRoot = resolve(config.WORKSPACE_ROOT);

  console.log('🧠 DevMind Agent v2.0.0');
  console.log(`📂 Workspace: ${workspaceRoot}`);

  // --- Inicializar proveedores globales ---
  const llmProvider = new GLM47Provider({ apiKey: config.GLM_API_KEY });
  const imageProvider = new CogViewProvider({
    apiKey: config.GLM_API_KEY,
    outputDir: resolve(workspaceRoot, 'generated_images'),
  });
  const checkpointManager = new CheckpointManager(workspaceRoot);
  const memoryStore = new MemoryStore(workspaceRoot);

  // Inicializar subsistemas de estado
  await checkpointManager.init();
  await memoryStore.init();

  // --- Inicializar TaskManager (15 módulos de rendimiento) ---
  const taskManager = new TaskManager(workspaceRoot);

  // --- Inicializar Advertising Manager ---
  const adManager = new AdvertisingManager({
    showAds: true,
    maxAdsPerPage: 3,
    workspaceRoot,
  });
  await adManager.init();

  // --- Inicializar Monitor del Sistema ---
  const monitor = new Monitor(workspaceRoot);
  await monitor.init();

  // Construir el núcleo del agente
  const agentCore: AgentCore = {
    llmProvider,
    imageProvider,
    checkpointManager,
    memoryStore,
    workspaceRoot,
  };

  // --- Módulos opcionales ---
  const docGen = new DocumentationGenerator(resolve(workspaceRoot, 'docs'));
  const gitHub = hasGitHubConfig(config)
    ? new GitHubIntegration({
        owner: config.GITHUB_OWNER!,
        repo: config.GITHUB_REPO!,
        token: config.GITHUB_TOKEN!,
      })
    : undefined;

  // --- PARSAR MODO DE OPERACIÓN ---

  const args = process.argv.slice(2);

  // ======== NUEVOS COMANDOS DE RENDIMIENTO ========

  // HEALTH CHECK
  if (args.includes('--health')) {
    await taskManager.startAllTasks();
    const health = await taskManager.healthCheck.check();
    console.log(`\n🏥 Health Check: ${health.status.toUpperCase()}`);
    console.log(`Timestamp: ${new Date(health.timestamp).toISOString()}`);
    console.log('\nChecks:');
    for (const [check, passed] of Object.entries(health.checks)) {
      console.log(`  ${passed ? '✅' : '❌'} ${check}`);
    }
    if (health.issues.length > 0) {
      console.log('\n⚠️ Issues:');
      for (const issue of health.issues) {
        console.log(`  → ${issue}`);
      }
    }
    await taskManager.stopAllTasks();
    return;
  }

  // MÉTRICAS DE RENDIMIENTO
  if (args.includes('--metrics')) {
    await taskManager.evaluator.load();
    const evaluation = await taskManager.evaluator.evaluate();
    const performance = await taskManager.evaluator.getPerformance();
    console.log(`\n📊 Métricas de Rendimiento: ${performance}`);
    console.log(`  Tasa de éxito: ${(evaluation.details.successRate * 100).toFixed(1)}%`);
    console.log(`  Pasos promedio: ${evaluation.details.avgSteps.toFixed(1)}`);
    console.log(`  Tokens promedio: ${evaluation.details.avgTokens.toFixed(0)}`);
    console.log(`  Tiempo promedio: ${(evaluation.details.avgTime / 1000).toFixed(1)}s`);
    return;
  }

  // SUGERENCIAS DE MEJORA
  if (args.includes('--suggest')) {
    await taskManager.evaluator.load();
    const suggestions = await taskManager.suggestions.suggest(taskManager.evaluator);
    console.log('\n💡 Sugerencias de Mejora:');
    if (suggestions.length === 0) {
      console.log('  No hay sugerencias. ¡Todo funciona bien!');
    } else {
      for (const s of suggestions) {
        console.log(`  → ${s}`);
      }
    }
    return;
  }

  // LIMPIAR CACHÉ SEMÁNTICO
  if (args.includes('--clear-cache')) {
    const removed = taskManager.cache.clearExpired();
    taskManager.cache.clear();
    console.log(`🗑️ Caché semántico limpiado (${removed} entradas expiradas eliminadas, caché reseteado)`);
    return;
  }

  // ESTADO COMPLETO DEL SISTEMA
  if (args.includes('--status')) {
    await taskManager.startAllTasks();
    const status = await taskManager.getStatus() as Record<string, unknown>;
    const episodes = status.episodes as { total: number; successful: number; failed: number };
    const alerts = status.alerts as { total: number; warning: number; critical: number };
    console.log('\n📊 Estado Completo del Sistema:');
    console.log(`  Salud: ${status.health}`);
    console.log(`  Rendimiento: ${status.performance}`);
    console.log(`  Caché: ${String(status.cacheSize)} entradas`);
    console.log(`  Lotes pendientes: ${String(status.pendingBatches)}`);
    console.log(`  Episodios: ${String(episodes.total)} (${String(episodes.successful)} exitosos, ${String(episodes.failed)} fallidos)`);
    console.log(`  Memoria corto plazo: ${String(status.shortTermMemories)} entradas recientes`);
    console.log(`  Alertas: ${String(alerts.total)} (⚠️ ${String(alerts.warning)} 🚨 ${String(alerts.critical)})`);
    console.log(`  TaskManager: ${status.isRunning ? '🟢 Activo' : '🔴 Detenido'}`);

    // Monitor stats
    console.log('\n📈 Monitor del Sistema:');
    console.log(monitor.getSummary());

    await taskManager.stopAllTasks();
    return;
  }

  // ESTADÍSTICAS DE PUBLICIDAD
  if (args.includes('--ad-stats')) {
    const stats = adManager.getStats();
    console.log('\n📊 Estadísticas de Publicidad:\n');
    console.log(`  Total Impresiones: ${stats.totalImpressions}`);
    console.log(`  Total Clicks: ${stats.totalClicks}`);
    console.log(`  CTR Global: ${(stats.overallCTR * 100).toFixed(2)}%\n`);
    console.log('--- Anuncios Activos ---');
    for (const ad of stats.ads) {
      if (ad.isActive) {
        const imp = stats.impressions[ad.id] || 0;
        const clicks = stats.clicks[ad.id] || 0;
        console.log(`  ✅ ${ad.title} (${ad.placement}): ${imp} impresiones, ${clicks} clicks (${(ad.ctr * 100).toFixed(2)}% CTR)`);
      }
    }
    return;
  }

  // ======== MODOS ORIGINALES ========

  // 1. MODO DASHBOARD WEB
  if (args.includes('--dashboard')) {
    await taskManager.startAllTasks();
    const dashboard = new DashboardServer({
      port: config.DASHBOARD_PORT,
      agentCore,
      apiKey: config.GLM_API_KEY,
    });
    await dashboard.start();
    console.log(`🖥️ Dashboard corriendo en http://localhost:${config.DASHBOARD_PORT}`);
    console.log('Presioná Ctrl+C para detener.');

    process.on('SIGINT', async () => {
      await taskManager.stopAllTasks();
      process.exit(0);
    });
    return;
  }

  // 2. MODO API REST
  if (args.includes('--server')) {
    await taskManager.startAllTasks();
    const server = new RestAPIServer({
      port: config.API_PORT,
      agentCore,
      apiKey: config.GLM_API_KEY,
    });
    await server.start();
    console.log('Presioná Ctrl+C para detener.');

    process.on('SIGINT', async () => {
      await taskManager.stopAllTasks();
      process.exit(0);
    });
    return;
  }

  // 3. MODO BOTS (Slack/Discord/Telegram)
  if (args.includes('--bots')) {
    if (!hasBotConfig(config)) {
      console.error('❌ No hay bots configurados. Configurá al menos uno: SLACK_TOKEN, DISCORD_TOKEN o TELEGRAM_TOKEN en .env');
      process.exit(1);
    }

    await taskManager.startAllTasks();

    const bot = new MultiPlatformBot({
      slack: config.SLACK_TOKEN ? {
        token: config.SLACK_TOKEN,
        signingSecret: config.SLACK_SIGNING_SECRET || '',
      } : undefined,
      discord: config.DISCORD_TOKEN ? {
        token: config.DISCORD_TOKEN,
        clientId: config.DISCORD_CLIENT_ID || '',
      } : undefined,
      telegram: config.TELEGRAM_TOKEN ? {
        token: config.TELEGRAM_TOKEN,
      } : undefined,
      agentInstance: { llmProvider, imageProvider },
    });
    await bot.start();
    console.log('🤖 Bots iniciados. Presioná Ctrl+C para detener.');

    process.on('SIGINT', async () => {
      console.log('\n🛑 Deteniendo bots...');
      await bot.stop();
      await taskManager.stopAllTasks();
      process.exit(0);
    });
    return;
  }

  // 4. MODO MULTI-AGENTE (Paralelo)
  if (args.includes('--multi-agent')) {
    const taskIndex = args.indexOf('--multi-agent') + 1;
    const task = args[taskIndex] || 'Construir una API REST simple con Node.js y TypeScript';

    console.log(`🤖 Modo Multi-Agente: "${task}"\n`);

    await taskManager.startAllTasks();

    const orchestrator = new MultiAgentOrchestrator({
      llmProvider,
      imageProvider,
      workspaceRoot,
      maxParallel: 3,
      agents: MultiAgentOrchestrator.defaultAgents(),
    });

    orchestrator.on('task-start', (data) => console.log(`🏃 [${data.agent}] ${data.description}`));
    orchestrator.on('task-done', (data) => console.log(`✅ ${data.taskId}: ${String(data.result).slice(0, 60)}...`));
    orchestrator.on('task-failed', (data) => console.log(`❌ ${data.taskId}: ${data.error}`));

    const result = await orchestrator.execute(task);
    console.log('\n🏁 RESUMEN MULTI-AGENTE:');
    console.log(result.summary);

    await taskManager.stopAllTasks();
    return;
  }

  // 5. MODO TESTING AUTOMÁTICO
  if (args.includes('--test')) {
    const testDirIndex = args.indexOf('--test') + 1;
    const targetDir = args[testDirIndex] || resolve(workspaceRoot, 'src');
    const testType = args.includes('--integration') ? 'integration' : 'unit';

    console.log(`🧪 Modo Testing: escaneando ${targetDir}...`);

    const testGen = new TestGenerator(
      {
        framework: 'vitest',
        language: 'typescript',
        outputDir: resolve(workspaceRoot, 'tests'),
        coverage: true,
        workspaceRoot,
      },
      llmProvider
    );
    await testGen.init();

    const suites = await testGen.generateForDirectory(targetDir, testType);
    console.log(`\n📊 ${suites.length} suites de tests generadas`);

    if (suites.length > 0 && args.includes('--run')) {
      console.log('\n🚀 Ejecutando tests...');
      for (const suite of suites) {
        const res = await testGen.runTestFile(suite.fileName);
        console.log(res.success ? `✅ ${suite.fileName}` : `❌ ${suite.fileName}`);
        if (!res.success) {
          console.log(res.output.slice(0, 300));
        }
      }
    }
    return;
  }

  // 6. MODO DOCUMENTACIÓN
  if (args.includes('--docs')) {
    const docsDirIndex = args.indexOf('--docs') + 1;
    const targetDir = args[docsDirIndex] || resolve(workspaceRoot, 'src');
    const format = args.includes('--html') ? 'html' as const : args.includes('--pdf') ? 'pdf' as const : 'markdown' as const;

    console.log(`📚 Modo Documentación: ${targetDir} → ${format}`);

    const generated = await docGen.generateForDirectory(targetDir, llmProvider, { format });
    console.log(`\n📝 ${generated.length} archivos de documentación generados`);
    return;
  }

  // 7. MODO GITHUB
  if (args.includes('--github') && gitHub) {
    const githubAction = args[args.indexOf('--github') + 1] || 'summary';

    switch (githubAction) {
      case 'issues':
        const issues = await gitHub.listIssues();
        console.log(`📋 Issues abiertas: ${issues.length}`);
        for (const issue of issues.slice(0, 10)) {
          console.log(`  #${issue.number} ${issue.title}`);
        }
        break;
      case 'prs':
        const prs = await gitHub.listPRs();
        console.log(`🔀 Pull Requests: ${prs.length}`);
        for (const pr of prs.slice(0, 10)) {
          console.log(`  #${pr.number} ${pr.title} (${pr.head.ref} → ${pr.base.ref})`);
        }
        break;
      case 'summary':
      default:
        const summary = await gitHub.getRepoSummary();
        console.log(summary);
        break;
    }
    return;
  }

  // 8. MODO AGENTE CLI (Fallback - tarea directa)
  const userTask = args.find(a => !a.startsWith('--'));
  if (!userTask) {
    console.log(`
📝 Modos disponibles:

  devmind <tarea>              Ejecuta una tarea con el agente autónomo
  devmind --dashboard          Inicia el panel web en puerto ${config.DASHBOARD_PORT}
  devmind --server             Inicia la API REST en puerto ${config.API_PORT}
  devmind --bots               Conecta bots de Slack/Discord/Telegram
  devmind --multi-agent [tarea] Ejecuta tarea con agentes paralelos
  devmind --test [directorio]  Genera tests automáticos
  devmind --docs [directorio]  Genera documentación automática
  devmind --github [acción]    Interactúa con GitHub (issues, prs, summary)

  🔧 Rendimiento:
  devmind --health             Ejecutar Health Check
  devmind --metrics            Mostrar métricas de rendimiento
  devmind --suggest            Obtener sugerencias de mejora
  devmind --clear-cache        Limpiar caché semántico
  devmind --status             Estado completo del sistema

  📢 Publicidad:
  devmind --ad-stats           Estadísticas de publicidad

Ejemplos:
  devmind "Crear una API REST con Express"
  devmind --multi-agent "Construir un sistema de autenticación"
  devmind --test ./src --run
  devmind --health
  devmind --status
`);
    return;
  }

  // Ejecutar tarea con el agente (con TaskManager activo)
  await taskManager.startAllTasks();

  console.log(`🤖 Ejecutando tarea: ${userTask}\n`);

  const result = await agentLoop(userTask, {
    llmProvider,
    imageProvider,
    workspaceRoot,
    maxSteps: config.AGENT_MAX_STEPS,
    dryRun: config.AGENT_DRY_RUN,
    onStep: (step, msg) => console.log(`[Paso ${step}] ${msg}`),
  });

  // Registrar métricas
  monitor.recordTask(result.success);
  await taskManager.evaluator.record(userTask, { success: result.success, summary: result.summary, steps: result.stepsCompleted });

  console.log(`\n${result.success ? '✅' : '❌'} Resultado:`);
  console.log(result.summary);

  if (result.filesCreated.length > 0) {
    console.log('\n📄 Archivos creados:');
    for (const file of result.filesCreated) {
      console.log(`  → ${file}`);
    }
  }

  await taskManager.stopAllTasks();
}

// --- Manejo de señales ---
process.on('SIGINT', () => {
  console.log('\n🛑 DevMind detenido por el usuario');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('💥 Error no capturado:', err);
  process.exit(1);
});

// --- Ejecutar ---
main().catch((err) => {
  console.error('💥 Error fatal:', err);
  process.exit(1);
});
