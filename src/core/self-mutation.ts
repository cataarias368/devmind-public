// ============================================================
// src/core/self-mutation.ts - Motor de Auto-Mutación de Código
// v3: Enfoque híbrido — envía código real al LLM para generar
// propuestas precisas con oldCode verificable
// ============================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, relative } from 'path';
import { execSync } from 'child_process';
import type { LLMRouter } from '../llm-router.js';
import type { LLMMessage } from '../types.js';

export type MutationApprovalCallback = (plan: MutationPlan) => Promise<boolean>;

export interface SelfMutationConfig {
  maxFilesPerPlan?: number;
  maxLinesPerFile?: number;
  autoApply?: boolean;
  dryRun?: boolean;
  excludeDirs?: string[];
  onBeforeApply?: MutationApprovalCallback;
}

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

export class SelfMutationEngine {
  private readonly srcDir: string;
  private readonly projectRoot: string;
  private readonly llmRouter: LLMRouter;
  private readonly history: MutationPlan[] = [];
  private readonly backupDir: string;
  private readonly config: Required<Pick<SelfMutationConfig, 'maxFilesPerPlan' | 'maxLinesPerFile' | 'autoApply' | 'dryRun'>> & SelfMutationConfig;

  constructor(projectRoot: string, llmRouter: LLMRouter, config?: SelfMutationConfig) {
    this.projectRoot = resolve(projectRoot);
    this.srcDir = resolve(projectRoot, 'src');
    this.llmRouter = llmRouter;
    this.backupDir = resolve(projectRoot, '.devmind', 'mutations');
    this.config = {
      maxFilesPerPlan: 10,
      maxLinesPerFile: 60,
      autoApply: false,
      dryRun: false,
      excludeDirs: [],
      ...config,
    };
    mkdirSync(this.backupDir, { recursive: true });
  }

  // ============================================================
  // PASO 1: ANALIZAR
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

        this.detectIssues(content, lines, issues);
        this.detectImprovements(content, file, improvementAreas);

        if (issues.length > 0 || improvementAreas.length > 0) {
          targets.push({
            file,
            relativePath: relative(this.projectRoot, file).replace(/\\/g, '/'),
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

    targets.sort((a, b) => (b.issues.length + b.improvementAreas.length) - (a.issues.length + a.improvementAreas.length));
    console.log(`[SelfMutation] Analisis: ${targets.length} archivos con mejoras posibles`);
    return targets;
  }

  // ============================================================
  // PASO 2: PROPONER — Generar propuestas con código real
  // ============================================================

  async propose(targets: MutationTarget[]): Promise<MutationPlan> {
    const id = `mutation-${Date.now()}`;
    const timestamp = new Date().toISOString();
    const maxFiles = this.config.maxFilesPerPlan;
    const topTargets = targets.slice(0, maxFiles);
    const proposals: MutationProposal[] = [];

    console.log(`[SelfMutation] Generando propuestas para ${topTargets.length} archivos (con código real)...`);

    // Generar propuestas de a 2-3 archivos por llamada LLM
    // para que el prompt no sea demasiado largo
    const batchSize = 3;
    
    for (let i = 0; i < topTargets.length; i += batchSize) {
      const batch = topTargets.slice(i, i + batchSize);
      console.log(`[SelfMutation] Batch ${Math.floor(i / batchSize) + 1}: ${batch.map(t => t.relativePath).join(', ')}`);
      
      try {
        const batchProposals = await this.generateBatchProposals(batch);
        proposals.push(...batchProposals);
        console.log(`[SelfMutation] → ${batchProposals.length} propuestas de este batch`);
      } catch (err) {
        console.warn(`[SelfMutation] Batch falló: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const summary = proposals.length > 0
      ? `${proposals.length} mejoras propuestas: ${proposals.map(p => p.category).join(', ')}`
      : 'No se generaron propuestas';

    console.log(`[SelfMutation] Resultado final: ${summary}`);

    const plan: MutationPlan = {
      id, timestamp,
      targets: topTargets,
      proposal: proposals,
      status: 'proposed',
      backupBranch: `devmind-mutation-${Date.now()}`,
      summary,
    };

    this.history.push(plan);
    return plan;
  }

  // ============================================================
  // APROBAR / APLICAR / ROLLBACK
  // ============================================================

  approve(planId: string): MutationPlan | null {
    const plan = this.history.find(p => p.id === planId);
    if (plan && plan.status === 'proposed') {
      plan.status = 'approved';
      return plan;
    }
    return null;
  }

  async apply(planId: string): Promise<MutationResult> {
    const plan = this.history.find(p => p.id === planId);
    if (!plan) {
      return { success: false, plan: plan!, errors: ['Plan no encontrado'], compilationOk: false, testsPass: false };
    }

    const errors: string[] = [];

    try {
      this.createBackup(plan);

      if (this.config.onBeforeApply) {
        const approved = await this.config.onBeforeApply(plan);
        if (!approved) {
          plan.status = 'rolled_back';
          return { success: false, plan, errors: ['Rechazado por el usuario'], compilationOk: true, testsPass: false };
        }
      }

      for (const proposal of plan.proposal) {
        try {
          const filePath = resolve(this.projectRoot, proposal.file.replace(/\\/g, '/'));
          if (!existsSync(filePath)) {
            errors.push(`Archivo no encontrado: ${proposal.file}`);
            continue;
          }

          if (this.config.dryRun) {
            console.log(`[SelfMutation DRY-RUN] ${proposal.description} en ${proposal.file}`);
            continue;
          }

          const currentContent = readFileSync(filePath, 'utf-8');
          const oldCode = proposal.oldCode.trim();

          // Intento 1: match exacto
          let newContent = currentContent.replace(oldCode, proposal.newCode);

          // Intento 2: match flexible
          if (newContent === currentContent) {
            const oldLines = oldCode.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            const flexiblePattern = oldLines.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*\\n\\s*');
            try {
              const regex = new RegExp(flexiblePattern, 'm');
              newContent = currentContent.replace(regex, proposal.newCode);
            } catch { /* regex failed */ }
          }

          if (newContent === currentContent) {
            errors.push(`oldCode no encontrado en ${proposal.file}`);
            continue;
          }

          writeFileSync(filePath, newContent, 'utf-8');
          console.log(`[SelfMutation] ✅ Aplicado: ${proposal.description} en ${proposal.file}`);
        } catch (err) {
          errors.push(`Error en ${proposal.file}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      const compilationOk = this.verifyCompilation();

      if (!compilationOk) {
        console.error('[SelfMutation] ❌ Compilación fallida — rollback automático');
        this.rollback(planId);
        plan.status = 'failed';
        return { success: false, plan, errors: [...errors, 'Compilación fallida — revertido'], compilationOk: false, testsPass: false };
      }

      plan.status = 'applied';
      console.log(`[SelfMutation] ✅ Plan aplicado (${errors.length} errores menores)`);
      return { success: true, plan, errors, compilationOk, testsPass: true };

    } catch (err) {
      this.rollback(planId);
      plan.status = 'failed';
      return {
        success: false, plan,
        errors: [...errors, `Error crítico: ${err instanceof Error ? err.message : String(err)}`],
        compilationOk: false, testsPass: false,
      };
    }
  }

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

  getHistory(): MutationPlan[] { return [...this.history]; }
  getPlan(planId: string): MutationPlan | undefined { return this.history.find(p => p.id === planId); }

  // ============================================================
  // PRIVADOS — Generación de propuestas
  // ============================================================

  /**
   * Genera propuestas para un batch pequeño de archivos (2-3).
   * Envía el CÓDIGO REAL al LLM para que oldCode sea exacto.
   */
  private async generateBatchProposals(targets: MutationTarget[]): Promise<MutationProposal[]> {
    const maxLines = this.config.maxLinesPerFile;

    // Construir sección de cada archivo con su código real
    const fileSections = targets.map((t, i) => {
      const path = t.relativePath.replace(/\\/g, '/');
      const codeLines = t.currentCode.split('\n').slice(0, maxLines).join('\n');
      const issuesStr = t.issues.slice(0, 3).map(s => `- ${s}`).join('\n');
      const improvementsStr = t.improvementAreas.slice(0, 3).map(s => `- ${s}`).join('\n');

      return `--- FILE ${i + 1}: ${path} ---
Issues:
${issuesStr || '(none)'}
Improvements:
${improvementsStr || '(none)'}
Code:
\`\`\`typescript
${codeLines}
\`\`\``;
    }).join('\n\n');

    const systemPrompt = `You are DevMind Self-Mutation. Propose SAFE improvements for these TypeScript files.

${fileSections}

For EACH file where you can find a safe improvement, output a JSON object:
{"file":"src/path.ts","description":"Short description","reasoning":"Why","oldCode":"exact code from the file (3-10 lines)","newCode":"improved code","riskLevel":"low","category":"bugfix"}

RULES:
- oldCode MUST be copied EXACTLY from the code shown above (character-perfect, 3-10 lines)
- Do NOT change sync to async, readFileSync to readFile, or add new imports
- PREFER: adding console.error to empty catches, adding missing error handling, fixing typos
- Keep changes SMALL (3-10 lines max)
- If no safe improvement for a file, skip it
- Output a JSON array: [proposal1, proposal2, ...]
- Output ONLY the JSON array, no other text`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Propose safe improvements. Output only a JSON array.' },
    ];

    const response = await this.llmRouter.callWithFallback(messages, 'self-mutation');
    const content = response.choices[0]?.message?.content || '';

    if (!content || content.length < 20) {
      console.warn('[SelfMutation] Respuesta vacía del LLM');
      return [];
    }

    return this.parseProposals(content, targets);
  }

  /**
   * Parsea la respuesta del LLM buscando propuestas JSON.
   * Soporta: array JSON, objetos JSON individuales, code fences, regex fallback.
   */
  private parseProposals(content: string, targets: MutationTarget[]): MutationProposal[] {
    const proposals: MutationProposal[] = [];

    try {
      // Limpiar code fences
      let jsonStr = content;
      const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

      // Intentar parsear como array
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          const items = JSON.parse(arrayMatch[0]) as any[];
          for (const item of items) {
            const p = this.validateProposal(item, targets);
            if (p) proposals.push(p);
          }
          if (proposals.length > 0) return proposals;
        } catch { /* array parse failed, try individual */ }
      }

      // Intentar parsear objetos individuales
      const objectRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
      let match;
      while ((match = objectRegex.exec(jsonStr)) !== null) {
        try {
          const item = JSON.parse(match[0]);
          const p = this.validateProposal(item, targets);
          if (p) proposals.push(p);
        } catch { /* skip invalid */ }
      }

      // Último intento: extraer con regex
      if (proposals.length === 0) {
        const oldMatches = [...content.matchAll(/"oldCode"\s*:\s*"((?:[^"\\]|\\.)*)"/gs)];
        const newMatches = [...content.matchAll(/"newCode"\s*:\s*"((?:[^"\\]|\\.)*)"/gs)];
        const descMatches = [...content.matchAll(/"description"\s*:\s*"([^"]+)"/g)];
        const fileMatches = [...content.matchAll(/"file"\s*:\s*"([^"]+)"/g)];

        const count = Math.min(oldMatches.length, newMatches.length);
        for (let i = 0; i < count; i++) {
          try {
            const oldCode = JSON.parse(`"${oldMatches[i][1]}"`);
            const newCode = JSON.parse(`"${newMatches[i][1]}"`);
            const desc = descMatches[i]?.[1] || 'Mejora';
            const file = fileMatches[i]?.[1]?.replace(/\\/g, '/') || '';

            if (oldCode.trim().length > 0 && newCode.trim().length > 0) {
              const target = targets.find(t => t.relativePath.replace(/\\/g, '/') === file);
              if (target) {
                proposals.push({
                  file,
                  description: desc,
                  reasoning: '',
                  oldCode,
                  newCode,
                  riskLevel: 'low',
                  category: 'bugfix',
                });
              }
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      console.warn(`[SelfMutation] Parse error: ${err instanceof Error ? err.message : String(err)}`);
    }

    return proposals;
  }

  /**
   * Valida que una propuesta tenga oldCode que exista en el archivo.
   */
  private validateProposal(item: any, targets: MutationTarget[]): MutationProposal | null {
    if (!item || item.skip || !item.oldCode || !item.newCode) return null;

    const filePath = (item.file || '').replace(/\\/g, '/');
    const target = targets.find(t => t.relativePath.replace(/\\/g, '/') === filePath);
    if (!target) return null;

    const trimmedOld = item.oldCode.trim();
    if (trimmedOld.length < 10) return null; // muy corto para ser confiable

    // Verificar que oldCode existe en el archivo
    if (!target.currentCode.includes(trimmedOld)) {
      // Intento flexible: comparar líneas sin whitespace
      const oldLines = trimmedOld.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
      const coreOld = oldLines.join('\n');
      const coreCurrent = target.currentCode.split('\n').map(l => l.trim()).join('\n');

      if (!coreCurrent.includes(coreOld)) {
        console.warn(`[SelfMutation] oldCode no encontrado en ${filePath} — descartando propuesta`);
        return null;
      }
    }

    return {
      file: filePath,
      description: item.description || 'Mejora de código',
      reasoning: item.reasoning || '',
      oldCode: item.oldCode,
      newCode: item.newCode,
      riskLevel: item.riskLevel === 'low' || item.riskLevel === 'medium' || item.riskLevel === 'high' ? item.riskLevel : 'medium',
      category: item.category || 'refactor',
    };
  }

  // ============================================================
  // Análisis estático
  // ============================================================

  private detectIssues(content: string, lines: string[], issues: string[]): void {
    lines.forEach((line, i) => {
      if (/\bTODO\b/i.test(line)) issues.push(`L${i + 1}: TODO pendiente`);
      if (/\bFIXME\b/i.test(line)) issues.push(`L${i + 1}: FIXME requiere atención`);
      if (/\bHACK\b/i.test(line)) issues.push(`L${i + 1}: HACK necesita refactor`);
    });

    const catchBlocks = (content.match(/catch\s*\{/g) || []).length;
    if (catchBlocks > 0 && !content.includes('console.error')) {
      issues.push('catch sin console.error — errores silenciosos');
    }

    const consoleLogs = (content.match(/console\.log\(/g) || []).length;
    if (consoleLogs > 10) {
      issues.push(`${consoleLogs} console.log — considerar logging`);
    }

    const unhandledPromises = (content.match(/\.then\(/g) || []).length;
    const catchHandlers = (content.match(/\.catch\(/g) || []).length;
    if (unhandledPromises > catchHandlers + 2) {
      issues.push(`${unhandledPromises - catchHandlers} promesas sin .catch()`);
    }
  }

  private detectImprovements(content: string, filePath: string, areas: string[]): void {
    if (content.includes('pollinations.ai') || content.includes('image.pollinations')) {
      areas.push('Podría usar Canvas API nativa para imágenes procedurales');
    }
    if (content.includes('readFileSync') && content.length > 5000) {
      areas.push('readFileSync bloquea el event loop');
    }
    if (content.includes('for (') && content.includes('await') && !content.includes('Promise.all')) {
      areas.push('Bucle con await secuencial — Promise.all');
    }
    if (content.includes('eval(')) {
      areas.push('Uso de eval() — riesgo de seguridad');
    }
    if (content.includes('innerHTML') && !content.includes('sanitize') && !content.includes('DOMPurify')) {
      areas.push('innerHTML sin sanitización — riesgo XSS');
    }
    if (filePath.includes('dashboard') && content.includes('placeholder')) {
      areas.push('Paneles placeholder podrían auto-generarse');
    }
    if (filePath.includes('agent') && content.includes('spawnSync')) {
      areas.push('spawnSync bloquea — usar spawn async');
    }
  }

  private getSourceFiles(): string[] {
    const files: string[] = [];
    const extensions = ['.ts', '.js'];
    const excludeDirs = new Set(['node_modules', 'dist', '.git', '.devmind', ...(this.config.excludeDirs || [])]);

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
      } catch { /* skip */ }
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
        copyFileSync(sourceFile, resolve(backupPath, normalizedFile));
        console.log(`[SelfMutation] 📦 Backup: ${proposal.file}`);
      }
    }
  }

  private verifyCompilation(): boolean {
    try {
      execSync('npx tsc --noEmit', { cwd: this.projectRoot, timeout: 30000, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }
}
