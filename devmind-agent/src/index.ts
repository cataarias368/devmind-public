// ============================================================
// src/index.ts - Punto de Entrada Principal de DevMind Agent
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

  // 1. MODO DASHBOARD WEB
  if (args.includes('--dashboard')) {
    const dashboard = new DashboardServer({
      port: config.DASHBOARD_PORT,
      agentCore,
      apiKey: config.GLM_API_KEY,
    });
    await dashboard.start();
    console.log(`🖥️ Dashboard corriendo en http://localhost:${config.DASHBOARD_PORT}`);
    console.log('Presioná Ctrl+C para detener.');
    return;
  }

  // 2. MODO API REST
  if (args.includes('--server')) {
    const server = new RestAPIServer({
      port: config.API_PORT,
      agentCore,
      apiKey: config.GLM_API_KEY,
    });
    await server.start();
    console.log('Presioná Ctrl+C para detener.');
    return;
  }

  // 3. MODO BOTS (Slack/Discord/Telegram)
  if (args.includes('--bots')) {
    if (!hasBotConfig(config)) {
      console.error('❌ No hay bots configurados. Configurá al menos uno: SLACK_TOKEN, DISCORD_TOKEN o TELEGRAM_TOKEN en .env');
      process.exit(1);
    }

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

    // Mantener proceso vivo
    process.on('SIGINT', async () => {
      console.log('\n🛑 Deteniendo bots...');
      await bot.stop();
      process.exit(0);
    });
    return;
  }

  // 4. MODO MULTI-AGENTE (Paralelo)
  if (args.includes('--multi-agent')) {
    const taskIndex = args.indexOf('--multi-agent') + 1;
    const task = args[taskIndex] || 'Construir una API REST simple con Node.js y TypeScript';

    console.log(`🤖 Modo Multi-Agente: "${task}"\n`);

    const orchestrator = new MultiAgentOrchestrator({
      llmProvider,
      imageProvider,
      workspaceRoot,
      maxParallel: 3,
      agents: MultiAgentOrchestrator.defaultAgents(),
    });

    // Suscribir a eventos
    orchestrator.on('task-start', (data) => console.log(`🏃 [${data.agent}] ${data.description}`));
    orchestrator.on('task-done', (data) => console.log(`✅ ${data.taskId}: ${String(data.result).slice(0, 60)}...`));
    orchestrator.on('task-failed', (data) => console.log(`❌ ${data.taskId}: ${data.error}`));

    const result = await orchestrator.execute(task);
    console.log('\n🏁 RESUMEN MULTI-AGENTE:');
    console.log(result.summary);
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

    // Ejecutar tests si se generaron
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

Ejemplos:
  devmind "Crear una API REST con Express"
  devmind --multi-agent "Construir un sistema de autenticación"
  devmind --test ./src --run
  devmind --docs ./src --html
`);
    return;
  }

  // Ejecutar tarea con el agente
  console.log(`🤖 Ejecutando tarea: ${userTask}\n`);

  const result = await agentLoop(userTask, {
    llmProvider,
    imageProvider,
    workspaceRoot,
    maxSteps: config.AGENT_MAX_STEPS,
    dryRun: config.AGENT_DRY_RUN,
    onStep: (step, msg) => console.log(`[Paso ${step}] ${msg}`),
  });

  console.log(`\n${result.success ? '✅' : '❌'} Resultado:`);
  console.log(result.summary);

  if (result.filesCreated.length > 0) {
    console.log('\n📄 Archivos creados:');
    for (const file of result.filesCreated) {
      console.log(`  → ${file}`);
    }
  }
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
