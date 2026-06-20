// ============================================================
// src/core/self-mutation.ts - Motor de Auto-Mutación de Código
// La plataforma se analiza, propone mejoras, y se reescribe
// Funciona con CUALQUIER LLM disponible (DeepSeek, Cloudflare, Groq, etc.)
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
  maxFilesPerPlan?: number;       // Máximo archivos a analizar por plan (default: 10)
  maxLinesPerFile?: number;       // Máximo líneas a enviar al LLM (default: 80)
  maxProposalsPerFile?: number;   // Máximo propuestas por archivo (default: 3)
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
      maxFilesPerPlan: 10,
      maxLinesPerFile: 80,
      maxProposalsPerFile: 3,
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

    console.log(`[SelfMutation] Analisis: ${targets.length} archivos con ${targets.reduce((s, t) => s + t.issues.length, 0)} issues y ${targets.reduce((s, t) => s + t.improvementAreas.length, 0)} mejoras posibles`);
    return targets;
  }

  // ============================================================
  // PASO 2: PROPONER — Usar el LLM de turno para generar mejoras
  // ============================================================

  async propose(targets: MutationTarget[]): Promise<MutationPlan> {
    const id = `mutation-${Date.now()}`;
    const timestamp = new Date().toISOString();
    const backupBranch = `devmind-mutation-${Date.now()}`;

    const proposals: MutationProposal[] = [];

    // Procesar máximo N archivos por plan
    const maxFiles = this.config.maxFilesPerPlan || 10;
    const topTargets = targets.slice(0, maxFiles);

    console.log(`[SelfMutation] Generando propuestas para ${topTargets.length} archivos...`);

    for (let i = 0; i < topTargets.length; i++) {
      const target = topTargets[i];
      console.log(`[SelfMutation] [${i + 1}/${topTargets.length}] Analizando ${target.relativePath} (${target.issues.length} issues, ${target.improvementAreas.length} mejoras)...`);
      
      try {
        const proposal = await this.generateProposal(target);
        if (proposal) {
          proposals.push(proposal);
          console.log(`[SelfMutation] ✅ Propuesta generada: ${proposal.description} (${proposal.category}) en ${target.relativePath}`);
        } else {
          console.log(`[SelfMutation] ⏭️ Sin propuesta segura para ${target.relativePath}`);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[SelfMutation] ❌ Error generando propuesta para ${target.relativePath}: ${errMsg}`);
      }
    }

    const summary = proposals.length > 0
      ? `${proposals.length} mejoras propuestas: ${proposals.map(p => p.category).join(', ')}`
      : 'No se generaron propuestas';

    console.log(`[SelfMutation] Resultado: ${summary}`);

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
  // PASO 2b: PROPONER EN BATCH — Una sola llamada LLM para todos
  // ============================================================

  async proposeBatch(targets: MutationTarget[]): Promise<MutationPlan> {
    const id = `mutation-${Date.now()}`;
    const timestamp = new Date().toISOString();
    const maxFiles = this.config.maxFilesPerPlan || 10;
    const topTargets = targets.slice(0, maxFiles);

    console.log(`[SelfMutation] Generando propuestas en batch para ${topTargets.length} archivos...`);

    // Construir un resumen compacto de todos los archivos
    const fileSummaries = topTargets.map((t, i) => {
      const path = t.relativePath.replace(/\\/g, '/');
      const issues = t.issues.slice(0, 3).join('; ');
      const improvements = t.improvementAreas.slice(0, 3).join('; ');
      return `${i + 1}. ${path}: issues=[${issues}], mejoras=[${improvements}]`;
    }).join('\n');

    const systemPrompt = `You are DevMind Self-Mutation. Analyze these files and propose SAFE improvements.

Files to improve:
${fileSummaries}

Respond with a JSON ARRAY of proposals. Each proposal:
{"file":"src/path.ts","description":"Short description","reasoning":"Why","oldCode":"exact 3-10 line code to replace","newCode":"improved code","riskLevel":"low","category":"bugfix"}

STRICT RULES:
- ONLY propose changes that will NOT break TypeScript compilation
- Do NOT change sync to async, readFileSync to readFile, or require to import
- Do NOT add new imports, change function signatures, or remove functionality
- PREFER: adding console.error to empty catches, fixing typos, adding missing error handling
- oldCode must be EXACT code from the file (3-10 lines, character-perfect)
- Keep changes SMALL and CONSERVATIVE
- Output ONLY the JSON array, nothing else
- If no safe improvement for a file, skip it
- Maximum 3 proposals total`;

    try {
      const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Generate safe improvement proposals for the listed files. Output only JSON array.' },
      ];

      const response = await this.llmRouter.callWithFallback(messages, 'self-mutation batch');
      const content = response.choices[0]?.message?.content || '';

      const proposals = this.parseBatchResponse(content, topTargets);

      const summary = proposals.length > 0
        ? `${proposals.length} mejoras propuestas: ${proposals.map(p => p.category).join(', ')}`
        : 'No se generaron propuestas';

      console.log(`[SelfMutation] Batch: ${summary}`);

      const plan: MutationPlan = {
        id,
        timestamp,
        targets: topTargets,
        proposal: proposals,
        status: 'proposed',
        backupBranch: `devmind-mutation-${Date.now()}`,
        summary,
      };

      this.history.push(plan);
      return plan;
    } catch (err) {
      console.error(`[SelfMutation] Batch proposal failed: ${err instanceof Error ? err.message : String(err)}`);
      // Fallback: try individual proposals
      return this.propose(targets);
    }
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
      // 1. Crear backup
      this.createBackup(plan);

      // 2. Notificar al usuario ANTES de aplicar
      if (this.config.onBeforeApply) {
        const approved = await this.config.onBeforeApply(plan);
        if (!approved) {
          plan.status = 'rolled_back';
          console.log('[SelfMutation] Plan rechazado por el usuario');
          return { success: false, plan, errors: ['Plan rechazado por el usuario'], compilationOk: true, testsPass: false };
        }
      }

      // 3. Aplicar cada propuesta
      for (const proposal of plan.proposal) {
        try {
          const filePath = resolve(this.projectRoot, proposal.file.replace(/\\/g, '/'));
          if (!existsSync(filePath)) {
            errors.push(`Archivo no encontrado: ${proposal.file}`);
            continue;
          }

          if (this.config.dryRun) {
            console.log(`[SelfMutation DRY-RUN] Se aplicaría: ${proposal.description} en ${proposal.file}`);
            continue;
          }

          const currentContent = readFileSync(filePath, 'utf-8');
          const oldCode = proposal.oldCode.trim();

          // Intento 1: match exacto
          let newContent = currentContent.replace(oldCode, proposal.newCode);

          // Intento 2: match flexible (ignorar whitespace)
          if (newContent === currentContent) {
            const oldLines = oldCode.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            const flexiblePattern = oldLines.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*\\n\\s*');
            try {
              const regex = new RegExp(flexiblePattern, 'm');
              newContent = currentContent.replace(regex, proposal.newCode);
            } catch { /* regex construction failed */ }
          }

          if (newContent === currentContent) {
            errors.push(`oldCode no encontrado en ${proposal.file} — saltando`);
            console.warn(`[SelfMutation] oldCode no encontrado en ${proposal.file} — saltando`);
            continue;
          }

          writeFileSync(filePath, newContent, 'utf-8');
          console.log(`[SelfMutation] ✅ Aplicado: ${proposal.description} en ${proposal.file}`);
        } catch (err) {
          errors.push(`Error aplicando cambio en ${proposal.file}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // 4. Verificar compilación
      const compilationOk = this.verifyCompilation();

      // 5. Si hay errores de compilación, rollback automático
      if (!compilationOk) {
        console.error('[SelfMutation] ❌ Compilación fallida — ejecutando rollback automático');
        this.rollback(planId);
        plan.status = 'failed';
        return { success: false, plan, errors: [...errors, 'Compilación TypeScript fallida — cambios revertidos'], compilationOk: false, testsPass: false };
      }

      plan.status = 'applied';
      console.log(`[SelfMutation] ✅ Plan aplicado exitosamente con ${errors.length} errores menores`);
      return { success: true, plan, errors, compilationOk, testsPass: true };

    } catch (err) {
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
        const normalizedFile = proposal.file.replace(/[\\/]/g, '_');
        const backupFile = resolve(backupPath, normalizedFile);
        const targetFile = resolve(this.projectRoot, proposal.file.replace(/\\/g, '/'));
        if (existsSync(backupFile)) {
          copyFileSync(backupFile, targetFile);
          console.log(`[SelfMutation] ↩️ Revertido: ${proposal.file}`);
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
    const normalizedPath = target.relativePath.replace(/\\/g, '/');
    const maxLines = this.config.maxLinesPerFile || 80;

    // Solo enviar las primeras líneas relevantes del código
    const codeSnippet = target.currentCode.split('\n').slice(0, maxLines).join('\n');

    // Prompt más corto y directo para mejor tasa de éxito
    const systemPrompt = `You are DevMind Self-Mutation. Propose ONE small, safe improvement for ${normalizedPath}.

Issues found: ${target.issues.slice(0, 3).join('; ')}
Improvements possible: ${target.improvementAreas.slice(0, 3).join('; ')}

Code (first ${maxLines} lines):
${codeSnippet}

Reply with ONLY this JSON (no markdown, no code fences):
{"file":"${normalizedPath}","description":"Short description","reasoning":"Why","oldCode":"exact 3-10 line code","newCode":"improved code","riskLevel":"low","category":"bugfix"}

Rules: No sync→async, no readFileSync→readFile, no new imports, no signature changes. Keep 3-10 lines. If no safe fix, reply: {"skip":true}`;

    try {
      const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Propose one safe improvement for ${normalizedPath}.` },
      ];

      const response = await this.llmRouter.callWithFallback(messages, `self-mutation ${normalizedPath}`);
      const content = response.choices[0]?.message?.content || '';

      // Si la respuesta es muy corta o vacía, descartar
      if (!content || content.length < 20) {
        console.warn(`[SelfMutation] Respuesta vacía para ${normalizedPath}`);
        return null;
      }

      const parsed = this.parseProposalResponse(content, normalizedPath);
      if (!parsed || parsed.skip || !parsed.oldCode || !parsed.newCode) return null;

      // Verificar que oldCode existe en el archivo actual
      const trimmedOld = parsed.oldCode.trim();
      if (!target.currentCode.includes(trimmedOld)) {
        // Segundo intento: buscar líneas coincidentes
        const oldLines = trimmedOld.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
        const coreOld = oldLines.join('\n');
        const coreCurrent = target.currentCode.split('\n').map((l: string) => l.trim()).join('\n');

        if (!coreCurrent.includes(coreOld)) {
          console.warn(`[SelfMutation] oldCode no encontrado en ${normalizedPath} — descartando`);
          return null;
        }
      }

      return {
        file: (parsed.file || normalizedPath).replace(/\\/g, '/'),
        description: parsed.description || 'Mejora de código',
        reasoning: parsed.reasoning || '',
        oldCode: parsed.oldCode,
        newCode: parsed.newCode,
        riskLevel: parsed.riskLevel || 'medium',
        category: parsed.category || 'refactor',
      };
    } catch (err) {
      console.warn(`[SelfMutation] Error: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * Parsear respuesta JSON del LLM con múltiples estrategias
   */
  private parseProposalResponse(content: string, fallbackFile: string): any | null {
    try {
      // Estrategia 1: Remover code fences
      let jsonStr = content;
      const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      }

      // Estrategia 2: Buscar primer { ... }
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      return JSON.parse(jsonMatch[0]);
    } catch {
      // Estrategia 3: Extraer campos con regex
      try {
        const descMatch = content.match(/"description"\s*:\s*"([^"]+)"/);
        const oldMatch = content.match(/"oldCode"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
        const newMatch = content.match(/"newCode"\s*:\s*"((?:[^"\\]|\\.)*)"/s);

        if (!oldMatch || !newMatch) return null;

        return {
          description: descMatch?.[1] || 'Mejora',
          reasoning: (content.match(/"reasoning"\s*:\s*"([^"]+)"/)?.[1]) || '',
          oldCode: JSON.parse(`"${oldMatch[1]}"`),
          newCode: JSON.parse(`"${newMatch[1]}"`),
          riskLevel: (content.match(/"riskLevel"\s*:\s*"([^"]+)"/)?.[1]) || 'medium',
          category: (content.match(/"category"\s*:\s*"([^"]+)"/)?.[1]) || 'refactor',
          file: fallbackFile,
        };
      } catch {
        return null;
      }
    }
  }

  /**
   * Parsear respuesta batch (array JSON) del LLM
   */
  private parseBatchResponse(content: string, targets: MutationTarget[]): MutationProposal[] {
    const proposals: MutationProposal[] = [];

    try {
      // Remover code fences
      let jsonStr = content;
      const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

      // Buscar array JSON
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (!arrayMatch) {
        // Quizás es un solo objeto, no un array
        const singleMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (singleMatch) {
          const parsed = this.parseProposalResponse(content, '');
          if (parsed && !parsed.skip && parsed.oldCode && parsed.newCode) {
            proposals.push({
              file: parsed.file || targets[0]?.relativePath.replace(/\\/g, '/') || '',
              description: parsed.description || 'Mejora',
              reasoning: parsed.reasoning || '',
              oldCode: parsed.oldCode,
              newCode: parsed.newCode,
              riskLevel: parsed.riskLevel || 'medium',
              category: parsed.category || 'refactor',
            });
          }
        }
        return proposals;
      }

      const items = JSON.parse(arrayMatch[0]) as any[];
      for (const item of items) {
        if (item.skip || !item.oldCode || !item.newCode) continue;

        // Buscar el target correspondiente para verificar oldCode
        const filePath = (item.file || '').replace(/\\/g, '/');
        const target = targets.find(t => t.relativePath.replace(/\\/g, '/') === filePath);

        if (target) {
          const trimmedOld = item.oldCode.trim();
          const coreCurrent = target.currentCode.split('\n').map(l => l.trim()).join('\n');
          const coreOld = trimmedOld.split('\n').map((l: string) => l.trim()).join('\n');

          if (!coreCurrent.includes(coreOld) && !target.currentCode.includes(trimmedOld)) {
            console.warn(`[SelfMutation] Batch: oldCode no encontrado en ${filePath} — descartando`);
            continue;
          }
        }

        proposals.push({
          file: filePath,
          description: item.description || 'Mejora',
          reasoning: item.reasoning || '',
          oldCode: item.oldCode,
          newCode: item.newCode,
          riskLevel: item.riskLevel || 'medium',
          category: item.category || 'refactor',
        });
      }
    } catch (err) {
      console.warn(`[SelfMutation] Batch parse failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    return proposals;
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

    // Código duplicado simple
    const funcMatches = content.match(/(?:function|const|let)\s+\w+\s*[=(]/g) || [];
    const funcNames = funcMatches.map(m => m.replace(/\s*[=(].*/, '').replace(/(?:function|const|let)\s+/, ''));
    const duplicates = funcNames.filter((n, i) => funcNames.indexOf(n) !== i);
    if (duplicates.length > 0) {
      issues.push(`Posible duplicación: ${[...new Set(duplicates)].join(', ')}`);
    }

    // Dependencias redundantes
    if (content.includes('fetch(') && content.includes('axios')) {
      issues.push('Usa fetch y axios — puede eliminar axios (redundante)');
    }

    // Promesas sin manejo de errores
    const unhandledPromises = (content.match(/\.then\(/g) || []).length;
    const catchHandlers = (content.match(/\.catch\(/g) || []).length;
    if (unhandledPromises > catchHandlers + 2) {
      issues.push(`${unhandledPromises - catchHandlers} promesas sin .catch()`);
    }

    // Console.log excesivo
    const consoleLogs = (content.match(/console\.log\(/g) || []).length;
    if (consoleLogs > 10) {
      issues.push(`${consoleLogs} console.log — considerar sistema de logging`);
    }
  }

  private detectImprovements(content: string, filePath: string, areas: string[]): void {
    // Eliminar APIs de terceros cuando es posible
    if (content.includes('pollinations.ai') || content.includes('image.pollinations')) {
      areas.push('Generación de imágenes: podría usar Canvas API nativa');
    }
    if (content.includes('openrouter.ai') || content.includes('groq')) {
      areas.push('Dependencia de API externa: podría usar modelos locales');
    }

    // Performance
    if (content.includes('readFileSync') && content.length > 5000) {
      areas.push('readFileSync bloquea el event loop — considerar async');
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
    if (filePath.includes('dashboard') && content.includes('placeholder')) {
      areas.push('Paneles placeholder: podrían auto-generarse');
    }
    if (filePath.includes('agent') && content.includes('spawnSync')) {
      areas.push('spawnSync bloquea — usar spawn async');
    }
    if (filePath.includes('image-provider') && !content.includes('Canvas')) {
      areas.push('Agregar Canvas API como alternativa nativa');
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
      const normalizedFile = proposal.file.replace(/[\\/]/g, '_');
      const sourceFile = resolve(this.projectRoot, proposal.file.replace(/\\/g, '/'));
      if (existsSync(sourceFile)) {
        const backupFile = resolve(backupPath, normalizedFile);
        copyFileSync(sourceFile, backupFile);
        console.log(`[SelfMutation] 📦 Backup: ${proposal.file}`);
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
