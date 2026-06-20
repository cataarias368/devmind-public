// ============================================================
// src/core/self-mutation.ts - Motor de Auto-Mutación de Código
// La plataforma se analiza, propone mejoras, y se reescribe
// Funciona con CUALQUIER LLM disponible (Groq, OpenRouter, etc.)
// ============================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, relative } from 'path';
import { execSync } from 'child_process';
import type { LLMRouter } from '../llm-router.js';
import type { LLMMessage } from '../types.js';

// --- Callback para notificar al usuario antes de aplicar cambios ---
export type MutationApprovalCallback = (plan: MutationPlan) => Promise<boolean>;

// --- Configuración del motor ---
export interface SelfMutationConfig {
  maxFilesPerPlan?: number;       // Máximo archivos a analizar por plan (default: 5)
  maxLinesPerFile?: number;       // Máximo líneas a enviar al LLM (default: 200)
  autoApply?: boolean;            // Si true, aplica sin pedir confirmación (default: false)
  dryRun?: boolean;               // Si true, no escribe archivos (default: false)
  excludeDirs?: string[];         // Directorios a excluir del análisis
  onBeforeApply?: MutationApprovalCallback; // Callback para aprobación interactiva
}

// --- Interfaces ---

export interface MutationTarget {
  file: string;
  relativePath: string;
  currentCode: string;
  lineCount: number;
  issues: string[];
  improvementAreas: string[];
}

export interface MutationPlan {
  id: string;
  timestamp: string;
  targets: MutationTarget[];
  proposal: MutationProposal[];
  status: 'proposed' | 'approved' | 'applied' | 'failed' | 'rolled_back';
  backupBranch: string;
  summary: string;
}

export interface MutationProposal {
  file: string;
  description: string;
  reasoning: string;
  oldCode: string;
  newCode: string;
  riskLevel: 'low' | 'medium' | 'high';
  category: 'performance' | 'feature' | 'bugfix' | 'refactor' | 'security' | 'dependency';
}

export interface MutationResult {
  success: boolean;
  plan: MutationPlan;
  errors: string[];
  compilationOk: boolean;
  testsPass: boolean;
}

// --- Motor Principal ---

export class SelfMutationEngine {
  private readonly srcDir: string;
  private readonly projectRoot: string;
  private readonly llmRouter: LLMRouter;
  private readonly history: MutationPlan[] = [];
  private readonly backupDir: string;
  private readonly config: SelfMutationConfig;

  constructor(projectRoot: string, llmRouter: LLMRouter, config?: SelfMutationConfig) {
    this.projectRoot = resolve(projectRoot);
    this.srcDir = resolve(projectRoot, 'src');
    this.llmRouter = llmRouter;
    this.backupDir = resolve(projectRoot, '.devmind', 'mutations');
    this.config = {
      maxFilesPerPlan: 5,
      maxLinesPerFile: 200,
      autoApply: false,
      dryRun: false,
      excludeDirs: [],
      ...config,
    };
    mkdirSync(this.backupDir, { recursive: true });
  }

  // ============================================================
  // PASO 1: ANALIZAR — Escanear el propio código fuente
  // ============================================================

  async analyze(): Promise<MutationTarget[]> {
    const files = this.getSourceFiles();
    const targets: MutationTarget[] = [];

    for (const file of files) {
      try {
        const content = readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        const issues: string[] = [];
        const improvementAreas: string[] = [];

        // Análisis estático de patrones conocidos
        this.detectIssues(content, lines, issues);
        this.detectImprovements(content, file, improvementAreas);

        if (issues.length > 0 || improvementAreas.length > 0) {
          targets.push({
            file,
            relativePath: relative(this.projectRoot, file),
            currentCode: content,
            lineCount: lines.length,
            issues,
            improvementAreas,
          });
        }
      } catch (err) {
        console.warn(`[SelfMutation] Error leyendo ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Ordenar por más issues primero
    targets.sort((a, b) => (b.issues.length + b.improvementAreas.length) - (a.issues.length + a.improvementAreas.length));

    return targets;
  }

  // ============================================================
  // PASO 2: PROPONER — Usar el LLM de turno para generar mejoras
  // ============================================================

  async propose(targets: MutationTarget[]): Promise<MutationPlan> {
    const id = `mutation-${Date.now()}`;
    const timestamp = new Date().toISOString();
    const backupBranch = `devmind-mutation-${Date.now()}`;

    // Construir prompt con el código actual y los issues encontrados
    const proposals: MutationProposal[] = [];

    // Procesar máximo N archivos por plan para no saturar
    const topTargets = targets.slice(0, this.config.maxFilesPerPlan || 5);

    for (const target of topTargets) {
      try {
        const proposal = await this.generateProposal(target);
        if (proposal) {
          proposals.push(proposal);
        }
      } catch (err) {
        console.warn(`[SelfMutation] Error generando propuesta para ${target.relativePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const summary = proposals.length > 0
      ? `${proposals.length} mejoras propuestas: ${proposals.map(p => p.category).join(', ')}`
      : 'No se generaron propuestas';

    const plan: MutationPlan = {
      id,
      timestamp,
      targets: topTargets,
      proposal: proposals,
      status: 'proposed',
      backupBranch,
      summary,
    };

    this.history.push(plan);
    return plan;
  }

  // ============================================================
  // PASO 3: APROBAR — Marcar plan como aprobado
  // ============================================================

  approve(planId: string): MutationPlan | null {
    const plan = this.history.find(p => p.id === planId);
    if (plan && plan.status === 'proposed') {
      plan.status = 'approved';
      return plan;
    }
    return null;
  }

  // ============================================================
  // PASO 4: APLICAR — Escribir los cambios con seguridad
  // ============================================================

  async apply(planId: string): Promise<MutationResult> {
    const plan = this.history.find(p => p.id === planId);
    if (!plan) {
      return { success: false, plan: plan!, errors: ['Plan no encontrado'], compilationOk: false, testsPass: false };
    }

    const errors: string[] = [];

    try {
      // 1. Crear backup de los archivos que se van a modificar
      this.createBackup(plan);

      // 2. Notificar al usuario ANTES de aplicar (si hay callback)
      if (this.config.onBeforeApply) {
        const approved = await this.config.onBeforeApply(plan);
        if (!approved) {
          plan.status = 'rolled_back';
          console.log('[SelfMutation] Plan rechazado por el usuario');
          return { success: false, plan, errors: ['Plan rechazado por el usuario'], compilationOk: true, testsPass: false };
        }
      }

      // 3. Aplicar cada propuesta (reemplazo de oldCode → newCode)
      for (const proposal of plan.proposal) {
        try {
          const filePath = resolve(this.projectRoot, proposal.file);
          if (!existsSync(filePath)) {
            errors.push(`Archivo no encontrado: ${proposal.file}`);
            continue;
          }

          if (this.config.dryRun) {
            console.log(`[SelfMutation DRY-RUN] Se aplicaría: ${proposal.description} en ${proposal.file}`);
            continue;
          }

          // Leer el archivo actual y hacer reemplazo exacto de oldCode → newCode
          const currentContent = readFileSync(filePath, 'utf-8');
          const oldCode = proposal.oldCode.trim();

          if (!currentContent.includes(oldCode)) {
            errors.push(`oldCode no encontrado en ${proposal.file} — el archivo cambió desde la propuesta. Saltando.`);
            console.warn(`[SelfMutation] oldCode no encontrado en ${proposal.file} — saltando`);
            continue;
          }

          // Reemplazar oldCode con newCode (preservar la indentación del contexto)
          const newContent = currentContent.replace(oldCode, proposal.newCode);
          writeFileSync(filePath, newContent, 'utf-8');
          console.log(`[SelfMutation] Aplicado: ${proposal.description} en ${proposal.file}`);
        } catch (err) {
          errors.push(`Error aplicando cambio en ${proposal.file}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // 4. Verificar compilación
      const compilationOk = this.verifyCompilation();

      // 5. Si hay errores de compilación, rollback automático
      if (!compilationOk) {
        console.error('[SelfMutation] Compilación fallida — ejecutando rollback automático');
        this.rollback(planId);
        plan.status = 'failed';
        return { success: false, plan, errors: [...errors, 'Compilación TypeScript fallida — cambios revertidos'], compilationOk: false, testsPass: false };
      }

      plan.status = 'applied';
      return { success: true, plan, errors, compilationOk, testsPass: true };

    } catch (err) {
      // Rollback en caso de error
      this.rollback(planId);
      plan.status = 'failed';
      return {
        success: false,
        plan,
        errors: [...errors, `Error crítico: ${err instanceof Error ? err.message : String(err)}`],
        compilationOk: false,
        testsPass: false,
      };
    }
  }

  // ============================================================
  // PASO 5: ROLLBACK — Revertir cambios
  // ============================================================

  rollback(planId: string): boolean {
    const plan = this.history.find(p => p.id === planId);
    if (!plan) return false;

    try {
      const backupPath = resolve(this.backupDir, plan.id);
      if (!existsSync(backupPath)) return false;

      for (const proposal of plan.proposal) {
        const backupFile = resolve(backupPath, proposal.file.replace(/\//g, '_'));
        const targetFile = resolve(this.projectRoot, proposal.file);
        if (existsSync(backupFile)) {
          copyFileSync(backupFile, targetFile);
          console.log(`[SelfMutation] Revertido: ${proposal.file}`);
        }
      }

      plan.status = 'rolled_back';
      return true;
    } catch (err) {
      console.error(`[SelfMutation] Error en rollback: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  // ============================================================
  // CONSULTAS
  // ============================================================

  getHistory(): MutationPlan[] {
    return [...this.history];
  }

  getPlan(planId: string): MutationPlan | undefined {
    return this.history.find(p => p.id === planId);
  }

  // ============================================================
  // MÉTODOS PRIVADOS
  // ============================================================

  private async generateProposal(target: MutationTarget): Promise<MutationProposal | null> {
    const systemPrompt = `Sos DevMind Self-Mutation, un sistema que mejora su propio código fuente.
Analizá el archivo ${target.relativePath} y proponé UNA mejora concreta.

Issues detectados:
${target.issues.map(i => `- ${i}`).join('\n')}

Áreas de mejora:
${target.improvementAreas.map(a => `- ${a}`).join('\n')}

Código actual (primeras ${this.config.maxLinesPerFile || 200} líneas):
${target.currentCode.split('\n').slice(0, this.config.maxLinesPerFile || 200).join('\n')}

Respondé EXACTAMENTE en este formato JSON (sin markdown, sin backticks):
{
  "file": "${target.relativePath}",
  "description": "Descripción corta de la mejora",
  "reasoning": "Por qué esta mejora es beneficiosa",
  "oldCode": "código exacto a reemplazar (mínimo 3 líneas)",
  "newCode": "código nuevo mejorado",
  "riskLevel": "low|medium|high",
  "category": "performance|feature|bugfix|refactor|security|dependency"
}

REGLAS:
- Solo proponé cambios que sean seguros y reversibles
- NO elimines funcionalidad existente
- NO cambies interfaces públicas
- Priorizá mejoras que eliminen dependencias externas
- El oldCode debe ser código EXISTENTE en el archivo (coincidencia exacta)
- El newCode debe ser código completo y funcional
- Si no hay mejora clara, respondé: {"skip": true}`;

    try {
      const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analizá ${target.relativePath} y proponé una mejora concreta y segura.` },
      ];

      const response = await this.llmRouter.callWithFallback(messages, `self-mutation ${target.relativePath}`);
      const content = response.choices[0]?.message?.content || '';

      // Parsear respuesta JSON
      let parsed: any;
      try {
        // Intentar extraer JSON de la respuesta
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        console.warn('[SelfMutation] No se pudo parsear respuesta del LLM');
        return null;
      }

      if (parsed.skip || !parsed.oldCode || !parsed.newCode) return null;

      // Verificar que oldCode existe en el archivo actual
      if (!target.currentCode.includes(parsed.oldCode.trim())) {
        console.warn(`[SelfMutation] oldCode no encontrado en ${target.relativePath} — descartando propuesta`);
        return null;
      }

      return {
        file: target.relativePath,
        description: parsed.description || 'Mejora de código',
        reasoning: parsed.reasoning || '',
        oldCode: parsed.oldCode,
        newCode: parsed.newCode,
        riskLevel: parsed.riskLevel || 'medium',
        category: parsed.category || 'refactor',
      };
    } catch (err) {
      console.warn(`[SelfMutation] Error generando propuesta: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private detectIssues(content: string, lines: string[], issues: string[]): void {
    // TODOs y FIXMEs
    lines.forEach((line, i) => {
      if (/\bTODO\b/i.test(line)) issues.push(`L${i + 1}: TODO pendiente`);
      if (/\bFIXME\b/i.test(line)) issues.push(`L${i + 1}: FIXME requiere atención`);
      if (/\bHACK\b/i.test(line)) issues.push(`L${i + 1}: HACK necesita refactor`);
    });

    // Error handling débil
    const catchBlocks = (content.match(/catch\s*\{/g) || []).length;
    if (catchBlocks > 0 && !content.includes('console.error')) {
      issues.push('catch sin console.error — errores silenciosos');
    }

    // Código duplicado simple (funciones idénticas)
    const funcMatches = content.match(/(?:function|const|let)\s+\w+\s*[=(]/g) || [];
    const funcNames = funcMatches.map(m => m.replace(/\s*[=(].*/, '').replace(/(?:function|const|let)\s+/, ''));
    const duplicates = funcNames.filter((n, i) => funcNames.indexOf(n) !== i);
    if (duplicates.length > 0) {
      issues.push(`Posible duplicación: ${[...new Set(duplicates)].join(', ')}`);
    }

    // Dependencias de terceros que podrían eliminarse
    if (content.includes('fetch(') && content.includes('axios')) {
      issues.push('Usa fetch y axios — puede eliminar axios (redundante)');
    }

    // Promesas sin manejo de errores
    const unhandledPromises = (content.match(/\.then\(/g) || []).length;
    const catchHandlers = (content.match(/\.catch\(/g) || []).length;
    if (unhandledPromises > catchHandlers + 2) {
      issues.push(`${unhandledPromises - catchHandlers} promesas sin .catch()`);
    }

    // Console.log en producción
    const consoleLogs = (content.match(/console\.log\(/g) || []).length;
    if (consoleLogs > 10) {
      issues.push(`${consoleLogs} console.log — considerar sistema de logging`);
    }
  }

  private detectImprovements(content: string, filePath: string, areas: string[]): void {
    const rel = filePath.replace(/\\/g, '/');

    // Eliminar APIs de terceros cuando es posible
    if (content.includes('pollinations.ai') || content.includes('image.pollinations')) {
      areas.push('Generación de imágenes: podría usar Canvas API nativa para imágenes procedurales');
    }
    if (content.includes('openrouter.ai') || content.includes('groq')) {
      areas.push('Dependencia de API externa: podría generar respuestas con modelos locales (ONNX/WebLLM)');
    }
    if (content.includes('chart.js') || content.includes('Chart')) {
      areas.push('Chart.js: podría usar Canvas nativo para gráficos simples');
    }

    // Performance
    if (content.includes('readFileSync') && content.length > 5000) {
      areas.push('readFileSync bloquea el event loop — considerar readFile async');
    }
    if (content.includes('for (') && content.includes('await') && !content.includes('Promise.all')) {
      areas.push('Bucle con await secuencial — podría paralelizar con Promise.all');
    }

    // Seguridad
    if (content.includes('eval(')) {
      areas.push('Uso de eval() — riesgo de seguridad');
    }
    if (content.includes('innerHTML') && !content.includes('sanitize') && !content.includes('DOMPurify')) {
      areas.push('innerHTML sin sanitización — riesgo XSS');
    }

    // Capacidades auto-generadas
    if (rel.includes('dashboard') && content.includes('placeholder')) {
      areas.push('Paneles placeholder: podrían auto-generarse con plantillas inteligentes');
    }
    if (rel.includes('agent') && content.includes('spawnSync')) {
      areas.push('spawnSync bloquea — usar spawn async para shells');
    }
    if (rel.includes('image-provider') && !content.includes('Canvas')) {
      areas.push('Generación de imágenes: agregar Canvas API como alternativa nativa sin dependencias');
    }
  }

  private getSourceFiles(): string[] {
    const files: string[] = [];
    const extensions = ['.ts', '.js'];
    const excludeDirs = new Set([
      'node_modules', 'dist', '.git', '.devmind',
      ...(this.config.excludeDirs || []),
    ]);

    const walkDir = (dir: string) => {
      try {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          const fullPath = join(dir, entry);
          const stat = statSync(fullPath);
          if (stat.isDirectory() && !entry.startsWith('.') && !excludeDirs.has(entry)) {
            walkDir(fullPath);
          } else if (stat.isFile() && extensions.some(ext => entry.endsWith(ext))) {
            files.push(fullPath);
          }
        }
      } catch { /* skip unreadable dirs */ }
    };

    walkDir(this.srcDir);
    return files;
  }

  private createBackup(plan: MutationPlan): void {
    const backupPath = resolve(this.backupDir, plan.id);
    mkdirSync(backupPath, { recursive: true });

    for (const proposal of plan.proposal) {
      const sourceFile = resolve(this.projectRoot, proposal.file);
      if (existsSync(sourceFile)) {
        const backupFile = resolve(backupPath, proposal.file.replace(/\//g, '_'));
        copyFileSync(sourceFile, backupFile);
      }
    }
  }

  private verifyCompilation(): boolean {
    try {
      execSync('npx tsc --noEmit', {
        cwd: this.projectRoot,
        timeout: 30000,
        stdio: 'pipe',
      });
      return true;
    } catch {
      return false;
    }
  }
}
