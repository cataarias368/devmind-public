// ============================================================
// src/index.ts - Punto de Entrada Principal de DevMind Agent v3.0
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
import { scanAvailableModels } from './llm-scanner.js';
import { A2AProtocol } from './a2a-protocol.js';
import { VideoGenerator } from './video/index.js';
import { LLMRouter } from './llm-router.js';
import { ID, show, assert } from './core/identity.js';
import { getLicensingInfo } from './core/licensing.js';
import { claimRevenue, detectCommercialUse, getAds } from './core/monetization.js';
import type { AgentCore } from './types.js';

async function main(): Promise<void> {
  // --- Verificar identidad (GPS anti-clon) ---
  assert();

  // --- Cargar configuración validada ---
  const config = getConfig();
  const workspaceRoot = resolve(config.WORKSPACE_ROOT);

  console.log(`
╔══════════════════════════════════════════════════════════╗
║  🧠 DevMind Agent v3.0.0                               ║
║  🔒 Identidad verificada                                ║
║  📧 Contacto: ${ID.contact}                             ║
║  📜 Licencia: ${ID.license}                             ║
╚══════════════════════════════════════════════════════════╝
  `);
  console.log(`📂 Workspace: ${workspaceRoot}`);

  // --- Comandos de identidad ---

  // WHOAMI: Mostrar identidad completa
  if (process.argv.includes('--whoami')) {
    console.log(show());
    process.exit(0);
  }

  // LICENSE: Mostrar informacion de licencias
  if (process.argv.includes('--license-info')) {
    console.log(getLicensingInfo());
    process.exit(0);
  }

  // CLAIM: Reclamar ganancias
  if (process.argv.includes('--claim')) {
    const claimArgs = process.argv.slice(process.argv.indexOf('--claim') + 1);
    const amount = parseFloat(claimArgs[0] || '0');
    const source = claimArgs[1] || 'unknown';
    claimRevenue(amount, source);
    process.exit(0);
  }

  // --- Detectar uso comercial no autorizado ---
  detectCommercialUse();

  // --- Control de publicidad ---
  const ads = getAds('free');
  if (ads.length > 0) {
    console.log('📢 [DevMind] Publicidad activa (plan gratuito)');
  }

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

  // --- Inicializar LLM Router (múltiples proveedores API) ---
  const llmRouter = new LLMRouter(config.GLM_API_KEY);
  const routerStats = llmRouter.getStats();
  if (routerStats.active > 0) {
    console.log(`🔌 LLM Router: ${routerStats.active}/${routerStats.providers} proveedores activos`);
  }

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
      apiKey: config.API_AUTH_KEY || config.GLM_API_KEY,
      allowedOrigins: config.ALLOWED_ORIGINS.split(','),
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
      apiKey: config.API_AUTH_KEY || config.GLM_API_KEY,
      allowedOrigins: config.ALLOWED_ORIGINS.split(','),
      llmRouter,
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

  // ======== LLM ROUTER: PROVEEDORES API ========

  // API-CHECK: Verificar proveedores disponibles
  if (args.includes('--api-check')) {
    const stats = llmRouter.getStats();
    console.log('\n🔌 Proveedores API:\n');
    console.log(`  Total registrados: ${stats.providers}`);
    console.log(`  Activos: ${stats.active}\n`);

    if (stats.providerList.length === 0) {
      console.log('  ⚠️ No hay proveedores externos configurados.');
      console.log('  💡 Agregá API keys en .env (GOOGLE_API_KEY, MISTRAL_API_KEY, GROQ_API_KEY, etc.)');
    } else {
      for (const p of stats.providerList) {
        const icon = p.active ? '✅' : '❌';
        console.log(`  ${icon} ${p.name}`);
        console.log(`     Modelos: ${p.models.join(', ')}`);
        console.log(`     Velocidad: ${p.speed} | Calidad: ${p.quality} | Tipo: ${p.type}`);
        if (!p.active) {
          console.log(`     ⚠️ No configurado (falta API key)`);
        }
      }
    }

    console.log(`\n  🧠 ZhipuAI GLM-4: Siempre disponible (fallback principal)`);
    return;
  }

  // API-DEFAULT: Cambiar proveedor por defecto
  if (args.includes('--api-default')) {
    const providerId = args[args.indexOf('--api-default') + 1];
    if (!providerId || providerId.startsWith('--')) {
      console.log('❌ Especificá un proveedor: devmind --api-default <provider-id>');
      console.log('\nProveedores disponibles:');
      for (const p of llmRouter.getActiveProviders()) {
        console.log(`  • ${p.id} (${p.name})`);
      }
      return;
    }

    const success = llmRouter.setDefaultProvider(providerId);
    if (success) {
      console.log(`✅ Proveedor por defecto cambiado a: ${providerId}`);
    } else {
      console.log(`❌ Proveedor "${providerId}" no disponible o no configurado.`);
      console.log('💡 Usá --api-check para ver proveedores activos.');
    }
    return;
  }

  // ======== GENERADOR DE VIDEO ========

  if (args.includes('--video') || args.includes('--video-anime')) {
    const cmdIndex = args.indexOf('--video-anime') !== -1 ? args.indexOf('--video-anime') : args.indexOf('--video');
    const idea = args.slice(cmdIndex + 1).filter(a => !a.startsWith('--')).join(' ');

    if (!idea) {
      console.log('❌ Proporcioná una idea para el video.');
      console.log('📝 Uso: devmind --video "Un robot que aprende a programar"');
      console.log('📝 Uso: devmind --video-anime "Una historia de amor entre un programador y su computadora"');
      return;
    }

    console.log(`🎬 Generando video: "${idea}"\n`);

    const videoGen = new VideoGenerator(
      llmProvider,
      resolve(workspaceRoot, 'generated_videos')
    );

    try {
      const result = await videoGen.generate(idea);
      console.log(`\n✅ Video generado exitosamente:`);
      console.log(`   📁 Ruta: ${result.path}`);
      console.log(`   🎬 Escenas: ${result.scenes}`);
      console.log(`   ⏱️  Duración: ${result.duration.toFixed(1)}s`);
      console.log(`   📖 Título: ${result.title}`);
    } catch (err) {
      console.error(`❌ Error generando video: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  // ======== DEV MIND 3.0: AUTO-MUTATION ========

  // LISTAR MODELOS DISPONIBLES
  if (args.includes('--models')) {
    const models = scanAvailableModels();
    console.log('\n🧬 Modelos LLM Disponibles:\n');
    if (models.length === 0) {
      console.log('  ⚠️ No se encontraron modelos. Configurá al menos una API key en .env');
    } else {
      for (const model of models) {
        const cost = model.costPer1kInput > 0 ? `$${model.costPer1kInput.toFixed(4)}/1K` : 'Gratis';
        console.log(`  ${model.id.padEnd(20)} ${model.name.padEnd(25)} ${cost.padEnd(15)} ${model.popularity}/100 calidad`);
        console.log(`  ${''.padEnd(20)} Capacidades: ${model.capabilities.join(', ')}`);
      }
    }
    console.log(`\n  Total: ${models.length} modelos configurados`);
    return;
  }

  // AUTO-MUTATE: Ejecutar tarea con auto-mutación
  if (args.includes('--auto-mutate')) {
    const taskIndex = args.indexOf('--auto-mutate') + 1;
    const task = args[taskIndex] || 'Analizar la estructura del proyecto y sugerir mejoras';

    console.log(`🧬 Modo Auto-Mutation: "${task}"\n`);

    await taskManager.startAllTasks();

    const result = await agentLoop(task, {
      llmProvider,
      imageProvider,
      workspaceRoot,
      maxSteps: config.AGENT_MAX_STEPS,
      dryRun: config.AGENT_DRY_RUN,
      onStep: (step, msg) => console.log(`[Paso ${step}] ${msg}`),
      autoMutation: true,
      preferredModel: config.PREFERRED_MODEL,
    });

    monitor.recordTask(result.success);
    await taskManager.evaluator.record(task, { success: result.success, summary: result.summary, steps: result.stepsCompleted });

    console.log(`\n${result.success ? '✅' : '❌'} Resultado:`);
    console.log(result.summary);
    if (result.modelMutations && result.modelMutations > 0) {
      console.log(`\n🧬 Auto-Mutation: ${result.modelMutations} mutaciones realizadas`);
    }
    if (result.totalCost !== undefined && result.totalCost > 0) {
      console.log(`💰 Costo total: $${result.totalCost.toFixed(4)}`);
    }

    await taskManager.stopAllTasks();
    return;
  }

  // ======== DEV MIND 3.0: A2A PROTOCOL ========

  // A2A: Iniciar agente con protocolo A2A
  if (args.includes('--a2a')) {
    const nodeName = args[args.indexOf('--a2a') + 1]?.startsWith('--')
      ? config.A2A_NODE_NAME
      : (args[args.indexOf('--a2a') + 1] || config.A2A_NODE_NAME);

    console.log(`🤝 Modo A2A: "${nodeName}"\n`);

    await taskManager.startAllTasks();

    const { randomUUID } = await import('crypto');
    const a2a = new A2AProtocol({
      nodeId: randomUUID(),
      name: nodeName,
      workspace: workspaceRoot,
      capabilities: ['coding', 'refactoring', 'testing', 'documentation', 'image-generation'],
      port: config.A2A_PORT,
    });

    a2a.startDiscovery();

    a2a.on('incoming', (msg) => {
      console.log(`📩 [A2A] Mensaje de ${msg.from}: ${String(msg.content).slice(0, 100)}`);
    });

    console.log(`🟢 Agente A2A "${nodeName}" iniciado y anunciando presencia`);
    console.log('Presioná Ctrl+C para detener.');

    process.on('SIGINT', async () => {
      a2a.stop();
      await taskManager.stopAllTasks();
      process.exit(0);
    });
    return;
  }

  // A2A-LIST: Listar agentes disponibles
  if (args.includes('--a2a-list')) {
    const a2a = new A2AProtocol({
      nodeId: 'scanner',
      name: 'DevMind-Scanner',
      workspace: workspaceRoot,
      capabilities: ['discovery'],
      port: config.A2A_PORT,
    });

    const nodes = await a2a.discoverNodes();
    console.log('\n🤝 Agentes A2A Disponibles:\n');

    if (nodes.length === 0) {
      console.log('  ⚠️ No se encontraron agentes. Asegurate de que otros agentes estén corriendo con --a2a');
    } else {
      for (const node of nodes) {
        const status = node.status === 'active' ? '🟢' : '🔴';
        console.log(`  ${status} ${node.name} (ID: ${node.id.slice(0, 8)}...)`);
        console.log(`     Capacidades: ${node.capabilities.join(', ')}`);
        console.log(`     Último visto: ${new Date(node.lastSeen).toLocaleTimeString()}`);
      }
    }
    console.log(`\n  Total: ${nodes.length} agentes`);
    a2a.stop();
    return;
  }

  // A2A-TASK: Orquestar equipo para tarea compleja
  if (args.includes('--a2a-task')) {
    const taskIndex = args.indexOf('--a2a-task') + 1;
    const task = args[taskIndex] || 'Construir una API REST completa con tests y documentación';

    console.log(`🤝 Modo A2A Task: "${task}"\n`);

    const { randomUUID } = await import('crypto');
    const a2a = new A2AProtocol({
      nodeId: randomUUID(),
      name: 'DevMind-Orchestrator',
      workspace: workspaceRoot,
      capabilities: ['architecture', 'coding', 'orchestration'],
      port: config.A2A_PORT,
    });

    a2a.startDiscovery();

    // Esperar un momento para que se descubran agentes
    console.log('🔍 Buscando agentes disponibles...');
    await new Promise(r => setTimeout(r, 5000));

    const nodes = await a2a.discoverNodes();
    const otherNodes = nodes.filter(n => n.id !== a2a.getMyNode().id);

    if (otherNodes.length === 0) {
      console.log('⚠️ No hay otros agentes disponibles. Usando modo single-agent con auto-mutación.');

      await taskManager.startAllTasks();
      const result = await agentLoop(task, {
        llmProvider,
        imageProvider,
        workspaceRoot,
        maxSteps: config.AGENT_MAX_STEPS,
        onStep: (step, msg) => console.log(`[Paso ${step}] ${msg}`),
        autoMutation: true,
        a2aEnabled: false,
      });

      console.log(`\n${result.success ? '✅' : '❌'} Resultado:`);
      console.log(result.summary);
      await taskManager.stopAllTasks();
    } else {
      const team = await a2a.orchestrateTeam(task);
      console.log(`\n🤝 Equipo Orquestado:`);
      console.log(`  Líder: ${team.leader.name}`);
      console.log(`  Asignados: ${team.assigned.map(n => n.name).join(', ') || 'Ninguno'}`);

      // Ejecutar con multi-agente
      await taskManager.startAllTasks();
      const result = await agentLoop(task, {
        llmProvider,
        imageProvider,
        workspaceRoot,
        maxSteps: config.AGENT_MAX_STEPS,
        onStep: (step, msg) => console.log(`[Paso ${step}] ${msg}`),
        autoMutation: true,
        a2aEnabled: true,
        nodeName: 'DevMind-Orchestrator',
      });

      console.log(`\n${result.success ? '✅' : '❌'} Resultado:`);
      console.log(result.summary);
      if (result.a2aNodesUsed) {
        console.log(`🤝 Agentes A2A utilizados: ${result.a2aNodesUsed}`);
      }
      await taskManager.stopAllTasks();
    }

    a2a.stop();
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

  🎬 Generación de Video:
  devmind --video "idea"       Genera video estilo anime/procedural
  devmind --video-anime "idea" Alias para --video

  🔌 Proveedores API:
  devmind --api-check          Verificar proveedores API disponibles
  devmind --api-default <id>   Cambiar proveedor por defecto

  🧬 DevMind 3.0 - Auto-Mutation:
  devmind --models             Listar modelos LLM disponibles
  devmind --auto-mutate [tarea] Ejecutar con auto-mutación de modelo

  🤝 DevMind 3.0 - A2A Protocol:
  devmind --a2a [--node-name NAME]  Iniciar agente con A2A habilitado
  devmind --a2a-list                 Listar agentes A2A disponibles
  devmind --a2a-task [tarea]        Orquestar equipo para tarea compleja

  🔒 Identidad y Protección:
  devmind --whoami              Ver identidad del propietario
  devmind --license-info        Ver información de licencias
  devmind --claim <monto> <src> Reclamar ganancias

Ejemplos:
  devmind "Crear una API REST con Express"
  devmind --multi-agent "Construir un sistema de autenticación"
  devmind --auto-mutate "Refactoriza el módulo de autenticación"
  devmind --a2a --node-name "Backend-Dev"
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
