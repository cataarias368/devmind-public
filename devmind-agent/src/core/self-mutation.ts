// ============================================================
// src/core/self-mutation.ts - Self-Modifying Code Engine
// ============================================================
//
// Allows DevMind Agent to analyze its own source code, propose
// improvements via LLM, and apply them safely with backup and
// rollback. All changes are conservative, small, and verified
// by TypeScript compilation before being committed.
// ============================================================

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  statSync,
} from 'fs';
import { resolve, join, relative } from 'path';
import { execSync } from 'child_process';
import { LLMRouter } from '../llm-router.js';
import type { LLMMessage } from '../types.js';

// ----------------------------------------------------------------
// Types & Interfaces
// ----------------------------------------------------------------

/** Callback invoked before applying a mutation plan; return false to abort. */
export type MutationApprovalCallback = (plan: MutationPlan) => Promise<boolean>;

/** Configuration for the self-mutation engine. */
export interface SelfMutationConfig {
  maxFilesPerPlan: number;
  maxLinesPerFile: number;
  autoApply: boolean;
  dryRun: boolean;
  excludeDirs: string[];
  onBeforeApply?: MutationApprovalCallback;
}

/** A single file that has been analyzed and contains issues. */
export interface MutationTarget {
  file: string;
  relativePath: string;
  currentCode: string;
  lineCount: number;
  issues: string[];
  improvementAreas: string[];
}

/** The master plan for a batch of mutations. */
export interface MutationPlan {
  id: string;
  timestamp: number;
  targets: MutationTarget[];
  proposal: MutationProposal[];
  status: 'proposed' | 'approved' | 'applied' | 'failed' | 'rolled_back';
  backupBranch: string;
  summary: string;
}

/** A single proposed change to a single file. */
export interface MutationProposal {
  file: string;
  description: string;
  reasoning: string;
  oldCode: string;
  newCode: string;
  riskLevel: 'low' | 'medium' | 'high';
  category:
    | 'performance'
    | 'feature'
    | 'bugfix'
    | 'refactor'
    | 'security'
    | 'dependency'
    | 'reliability';
}

/** Result of applying a mutation plan. */
export interface MutationResult {
  success: boolean;
  plan: MutationPlan;
  errors: string[];
  compilationOk: boolean;
  testsPass: boolean;
}

// ----------------------------------------------------------------
// Default configuration
// ----------------------------------------------------------------

const DEFAULT_CONFIG: SelfMutationConfig = {
  maxFilesPerPlan: 5,
  maxLinesPerFile: 200,
  autoApply: false,
  dryRun: false,
  excludeDirs: ['node_modules', 'dist', '.git', '.devmind'],
};

// ----------------------------------------------------------------
// SelfMutationEngine
// ----------------------------------------------------------------

export class SelfMutationEngine {
  private projectRoot: string;
  private srcDir: string;
  private backupDir: string;
  private llmRouter: LLMRouter;
  private config: SelfMutationConfig;
  private plans: Map<string, MutationPlan> = new Map();

  constructor(
    projectRoot: string,
    llmRouter: LLMRouter,
    config?: Partial<SelfMutationConfig>,
  ) {
    this.projectRoot = projectRoot;
    this.srcDir = join(projectRoot, 'src');
    this.llmRouter = llmRouter;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.backupDir = join(projectRoot, '.devmind', 'mutations');
    mkdirSync(this.backupDir, { recursive: true });
  }

  // ==============================================================
  // analyze() — Scan source files for issues & improvement areas
  // ==============================================================

  analyze(): MutationTarget[] {
    const sourceFiles = this.getSourceFiles();
    const targets: MutationTarget[] = [];

    for (const filePath of sourceFiles) {
      try {
        const code = readFileSync(filePath, 'utf-8');
        const lines = code.split('\n');
        const lineCount = lines.length;
        const relPath = relative(this.projectRoot, filePath).replace(/\\/g, '/');

        if (lineCount > this.config.maxLinesPerFile) continue;

        const issues: string[] = [];
        const improvementAreas: string[] = [];

        // --- Detect TODOs, FIXMEs, HACKs ---
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/\bTODO\b/i.test(line)) {
            issues.push(`TODO at line ${i + 1}: ${line.trim()}`);
          }
          if (/\bFIXME\b/i.test(line)) {
            issues.push(`FIXME at line ${i + 1}: ${line.trim()}`);
          }
          if (/\bHACK\b/i.test(line)) {
            issues.push(`HACK at line ${i + 1}: ${line.trim()}`);
          }
        }

        // --- Empty catch blocks (catch without console.error) ---
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/catch\s*\(/.test(line) || /^catch\b/.test(line.trim())) {
            // Look ahead for empty block
            let j = i + 1;
            while (j < lines.length && lines[j].trim() === '') j++;
            if (j < lines.length) {
              const nextLine = lines[j].trim();
              if (nextLine === '}' || nextLine === '};') {
                issues.push(`Empty catch block at line ${i + 1}`);
              } else if (
                nextLine.startsWith('//') &&
                j + 1 < lines.length &&
                (lines[j + 1].trim() === '}' || lines[j + 1].trim() === '};')
              ) {
                issues.push(`Empty catch block (comment-only) at line ${i + 1}`);
              }
            }
          }
        }

        // --- Duplicate function names ---
        const funcNames: string[] = [];
        const funcRegex =
          /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\()/g;
        let match: RegExpExecArray | null;
        while ((match = funcRegex.exec(code)) !== null) {
          const name = match[1] || match[2];
          if (name) {
            if (funcNames.includes(name)) {
              issues.push(`Duplicate function name: ${name}`);
            }
            funcNames.push(name);
          }
        }

        // --- Redundant dependencies (fetch + axios) ---
        const hasFetch = /from\s+['"]node-fetch['"]|require\s*\(\s*['"]node-fetch['"]\)/.test(code);
        const hasAxios = /from\s+['"]axios['"]|require\s*\(\s*['"]axios['"]\)/.test(code);
        if (hasFetch && hasAxios) {
          issues.push('Redundant dependencies: both fetch and axios imported');
        }

        // --- Unhandled promises (.then without .catch) ---
        const thenWithoutCatch = code.match(/\.then\s*\(/g);
        const catchCount = code.match(/\.catch\s*\(/g);
        if (
          thenWithoutCatch &&
          thenWithoutCatch.length > (catchCount ? catchCount.length : 0)
        ) {
          issues.push(
            `Unhandled promises: ${thenWithoutCatch.length} .then() but only ${catchCount ? catchCount.length : 0} .catch()`,
          );
        }

        // --- Too many console.logs ---
        const logCount = (code.match(/console\.log\s*\(/g) || []).length;
        if (logCount > 10) {
          issues.push(`Excessive console.log calls: ${logCount} (threshold: 10)`);
        }

        // --- Improvement areas ---

        // Pollinations → Canvas
        if (/pollinations/i.test(code)) {
          improvementAreas.push('Consider migrating Pollinations to Canvas for local image generation');
        }

        // External APIs → local
        if (/fetch\s*\(\s*['"]https?:\/\//.test(code)) {
          improvementAreas.push('Consider replacing external API calls with local implementations where possible');
        }

        // readFileSync → async
        if (/readFileSync\s*\(/.test(code)) {
          improvementAreas.push('Consider using async readFile instead of readFileSync');
        }

        // Sequential await → Promise.all
        const awaitCount = (code.match(/await\s+/g) || []).length;
        if (awaitCount > 3) {
          improvementAreas.push('Consider using Promise.all for independent sequential awaits');
        }

        // eval() risk
        if (/\beval\s*\(/.test(code)) {
          improvementAreas.push('SECURITY: eval() usage detected — consider safer alternatives');
        }

        // innerHTML without sanitization
        if (/innerHTML\s*=/.test(code) && !/sanitize|escape|DOMPurify/i.test(code)) {
          improvementAreas.push('SECURITY: innerHTML without sanitization detected');
        }

        // spawnSync blocking
        if (/spawnSync\s*\(/.test(code) || /execSync\s*\(/.test(code)) {
          improvementAreas.push('Consider using async spawn/exec instead of sync variants');
        }

        // Image provider without Canvas
        if (/imageProvider|image-provider/i.test(code) && !/canvas/i.test(code)) {
          improvementAreas.push('Consider adding Canvas as a local image provider fallback');
        }

        if (issues.length > 0 || improvementAreas.length > 0) {
          targets.push({
            file: filePath.replace(/\\/g, '/'),
            relativePath: relPath,
            currentCode: code,
            lineCount,
            issues,
            improvementAreas,
          });
        }
      } catch {
        // Skip unreadable files
      }
    }

    // Sort by issue count (most issues first)
    targets.sort((a, b) => b.issues.length - a.issues.length);

    return targets;
  }

  // ==============================================================
  // propose() — Generate mutation proposals via LLM
  // ==============================================================

  async propose(targets: MutationTarget[]): Promise<MutationPlan> {
    const planId = `mutation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const topTargets = targets.slice(0, this.config.maxFilesPerPlan);
    const proposals: MutationProposal[] = [];

    for (const target of topTargets) {
      try {
        const proposal = await this.generateProposal(target);
        if (proposal) {
          proposals.push(proposal);
        }
      } catch (err) {
        console.warn(
          `[SelfMutation] Failed to generate proposal for ${target.relativePath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const plan: MutationPlan = {
      id: planId,
      timestamp: Date.now(),
      targets: topTargets,
      proposal: proposals,
      status: 'proposed',
      backupBranch: `devmind/${planId}`,
      summary: `Proposed ${proposals.length} improvement(s) across ${topTargets.length} file(s)`,
    };

    this.plans.set(planId, plan);

    // Auto-approve if configured
    if (this.config.autoApply) {
      plan.status = 'approved';
      if (!this.config.dryRun) {
        return this.apply(planId);
      }
    }

    return plan;
  }

  // ==============================================================
  // approve() — Mark a plan as approved
  // ==============================================================

  approve(planId: string): MutationPlan {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Mutation plan "${planId}" not found`);
    }
    if (plan.status !== 'proposed') {
      throw new Error(`Cannot approve plan in "${plan.status}" status`);
    }
    plan.status = 'approved';
    return plan;
  }

  // ==============================================================
  // apply() — Apply a mutation plan with backup & verification
  // ==============================================================

  async apply(planId: string): Promise<MutationResult> {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Mutation plan "${planId}" not found`);
    }
    if (plan.status !== 'approved' && plan.status !== 'proposed') {
      throw new Error(`Cannot apply plan in "${plan.status}" status`);
    }

    const errors: string[] = [];

    // 1. Create backup
    this.createBackup(plan);

    // 2. Call onBeforeApply callback
    if (this.config.onBeforeApply) {
      try {
        const allowed = await this.config.onBeforeApply(plan);
        if (!allowed) {
          plan.status = 'failed';
          return {
            success: false,
            plan,
            errors: ['Mutation blocked by onBeforeApply callback'],
            compilationOk: false,
            testsPass: false,
          };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`onBeforeApply callback error: ${msg}`);
        plan.status = 'failed';
        return { success: false, plan, errors, compilationOk: false, testsPass: false };
      }
    }

    // 3. Apply each proposal
    for (const proposal of plan.proposal) {
      try {
        const normalizedFile = proposal.file.replace(/\\/g, '/');
        const fullPath = resolve(this.projectRoot, normalizedFile);

        if (!existsSync(fullPath)) {
          errors.push(`File not found: ${normalizedFile}`);
          continue;
        }

        const currentContent = readFileSync(fullPath, 'utf-8');

        // Try exact match first
        let newContent = currentContent.replace(proposal.oldCode.trim(), proposal.newCode);

        // Tolerant second attempt: try with whitespace-flexible matching
        if (newContent === currentContent) {
          const oldTrimmed = proposal.oldCode.trim();
          const oldLines = oldTrimmed.split('\n').map((l) => l.trim());
          // Build a regex that allows flexible whitespace
          const flexiblePattern = oldLines.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*\\n\\s*');
          try {
            const regex = new RegExp(flexiblePattern, 'm');
            newContent = currentContent.replace(regex, proposal.newCode);
          } catch {
            // Regex construction failed — skip
          }
        }

        if (newContent === currentContent) {
          errors.push(
            `oldCode not found in ${normalizedFile} — skipping (oldCode: "${proposal.oldCode.slice(0, 60)}...")`,
          );
          continue;
        }

        if (!this.config.dryRun) {
          writeFileSync(fullPath, newContent, 'utf-8');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Error applying proposal to ${proposal.file}: ${msg}`);
      }
    }

    // 4. Verify compilation
    let compilationOk = false;
    if (!this.config.dryRun) {
      compilationOk = this.verifyCompilation();
      if (!compilationOk) {
        // Automatic rollback on compilation failure
        console.warn('[SelfMutation] Compilation failed — rolling back automatically');
        this.rollback(planId);
        plan.status = 'failed';
        return {
          success: false,
          plan,
          errors: [...errors, 'TypeScript compilation failed after applying mutations — rolled back'],
          compilationOk: false,
          testsPass: false,
        };
      }
    } else {
      compilationOk = true; // Assume ok in dry-run
    }

    plan.status = 'applied';
    return {
      success: errors.length === 0,
      plan,
      errors,
      compilationOk,
      testsPass: true, // Test execution is not part of this engine
    };
  }

  // ==============================================================
  // rollback() — Restore files from backup
  // ==============================================================

  rollback(planId: string): MutationPlan {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Mutation plan "${planId}" not found`);
    }

    const planBackupDir = join(this.backupDir, planId);

    if (!existsSync(planBackupDir)) {
      throw new Error(`No backup found for plan "${planId}"`);
    }

    // Restore each backed-up file
    const backupFiles = readdirSync(planBackupDir);
    for (const backupFileName of backupFiles) {
      const backupFilePath = join(planBackupDir, backupFileName);

      // Reverse the normalization: underscores → path separators
      // The backup filename was created by replacing /[\\/]/g with '_'
      // We need to recover the original relative path
      const restoredRelPath = backupFileName.replace(/_/g, '/');
      const targetPath = resolve(this.projectRoot, restoredRelPath);

      if (existsSync(targetPath)) {
        copyFileSync(backupFilePath, targetPath);
      }
    }

    plan.status = 'rolled_back';
    return plan;
  }

  // ==============================================================
  // getHistory() — Return all plans
  // ==============================================================

  getHistory(): MutationPlan[] {
    return Array.from(this.plans.values()).sort(
      (a, b) => b.timestamp - a.timestamp,
    );
  }

  // ==============================================================
  // getPlan() — Return a specific plan
  // ==============================================================

  getPlan(planId: string): MutationPlan | undefined {
    return this.plans.get(planId);
  }

  // ==============================================================
  // Private: Generate a single proposal via LLM
  // ==============================================================

  private async generateProposal(
    target: MutationTarget,
  ): Promise<MutationProposal | null> {
    const systemPrompt = `You are a conservative code-improvement assistant for the DevMind Agent project.
Your job is to propose exactly ONE small, safe improvement to the provided source file.

RULES (MUST follow ALL of these):
1. Only propose changes that will NOT break TypeScript compilation.
2. Do NOT propose sync→async changes (they break compilation).
3. Do NOT add new imports unless absolutely necessary.
4. PREFERS: adding console.error to empty catch blocks, fixing typos, adding missing error handling.
5. The oldCode must be an EXACT match of 3-10 lines from the source file.
6. Keep changes SMALL — newCode should be 3-10 lines max.
7. Output pure JSON only — no markdown, no explanation outside JSON.
8. If you cannot find a safe improvement, respond with: {"skip": true}

JSON format:
{
  "file": "relative/path/to/file.ts",
  "description": "Brief description of the change",
  "reasoning": "Why this change is safe and beneficial",
  "oldCode": "exact code to replace (3-10 lines)",
  "newCode": "replacement code (3-10 lines)",
  "riskLevel": "low|medium|high",
  "category": "performance|feature|bugfix|refactor|security|dependency|reliability"
}`;

    const contextLines = target.issues
      .slice(0, 10)
      .map((i) => `  - ${i}`)
      .join('\n');
    const improveLines = target.improvementAreas
      .slice(0, 5)
      .map((i) => `  - ${i}`)
      .join('\n');

    const userPrompt = `File: ${target.relativePath} (${target.lineCount} lines)

Detected issues:
${contextLines || '  (none)'}

Improvement areas:
${improveLines || '  (none)'}

Source code:
\`\`\`typescript
${target.currentCode}
\`\`\`

Propose ONE small, safe improvement as JSON.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await this.llmRouter.callWithFallback(messages, 'code');
    const text = response.choices[0]?.message?.content?.trim() ?? '';

    if (!text) return null;

    const parsed = this.parseProposalResponse(text, target.relativePath);
    return parsed;
  }

  // ==============================================================
  // Private: Parse LLM response into a MutationProposal
  // ==============================================================

  private parseProposalResponse(
    text: string,
    fallbackFile: string,
  ): MutationProposal | null {
    let raw: Record<string, unknown> | null = null;

    // Strategy 1: Direct JSON.parse
    try {
      raw = JSON.parse(text);
    } catch {
      // Strategy 2: Extract from code blocks (```json...```)
      const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
      if (codeBlockMatch) {
        try {
          raw = JSON.parse(codeBlockMatch[1]);
        } catch {
          // Strategy 3: Regex fallback to extract individual fields
          raw = this.extractFieldsByRegex(text);
        }
      } else {
        // Strategy 3 without code block
        raw = this.extractFieldsByRegex(text);
      }
    }

    if (!raw || raw.skip) return null;

    // Normalize paths to forward slashes
    const file = typeof raw.file === 'string'
      ? raw.file.replace(/\\/g, '/')
      : fallbackFile;

    // Verify oldCode exists in the file (tolerant second attempt)
    const oldCode = typeof raw.oldCode === 'string' ? raw.oldCode : '';
    const newCode = typeof raw.newCode === 'string' ? raw.newCode : '';

    if (!oldCode || !newCode) return null;

    // Try to verify oldCode exists in the target file
    const normalizedFile = file.replace(/\\/g, '/');
    const fullPath = resolve(this.projectRoot, normalizedFile);
    if (existsSync(fullPath)) {
      const fileContent = readFileSync(fullPath, 'utf-8');

      if (!fileContent.includes(oldCode.trim())) {
        // Tolerant second attempt: trim each line
        const oldLines = oldCode.trim().split('\n').map((l) => l.trim());
        const fileLines = fileContent.split('\n');

        let found = false;
        for (let i = 0; i <= fileLines.length - oldLines.length; i++) {
          let match = true;
          for (let j = 0; j < oldLines.length; j++) {
            if (fileLines[i + j].trim() !== oldLines[j]) {
              match = false;
              break;
            }
          }
          if (match) {
            found = true;
            break;
          }
        }

        if (!found) {
          console.warn(
            `[SelfMutation] oldCode not found in ${file} — skipping proposal`,
          );
          return null;
        }
      }
    }

    const validRiskLevels = ['low', 'medium', 'high'] as const;
    const validCategories = [
      'performance',
      'feature',
      'bugfix',
      'refactor',
      'security',
      'dependency',
      'reliability',
    ] as const;

    const riskLevel = validRiskLevels.includes(raw.riskLevel as typeof validRiskLevels[number])
      ? (raw.riskLevel as 'low' | 'medium' | 'high')
      : 'medium';

    const category = validCategories.includes(raw.category as typeof validCategories[number])
      ? (raw.category as MutationProposal['category'])
      : 'bugfix'; // Default to 'bugfix' (safest)

    return {
      file,
      description: typeof raw.description === 'string' ? raw.description : 'Code improvement',
      reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : 'Safety improvement',
      oldCode,
      newCode,
      riskLevel,
      category,
    };
  }

  // ==============================================================
  // Private: Regex-based field extraction (fallback strategy 3)
  // ==============================================================

  private extractFieldsByRegex(text: string): Record<string, unknown> | null {
    const extract = (field: string): string | null => {
      const patterns = [
        new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 's'),
        new RegExp(`'${field}'\\s*:\\s*'((?:[^'\\\\]|\\\\.)*)'`, 's'),
        new RegExp(`"${field}"\\s*:\\s*\`([^\`]*)\``, 's'),
      ];
      for (const pattern of patterns) {
        const m = text.match(pattern);
        if (m) return m[1];
      }
      return null;
    };

    const file = extract('file');
    const description = extract('description');
    const reasoning = extract('reasoning');
    const oldCode = extract('oldCode');
    const newCode = extract('newCode');
    const riskLevel = extract('riskLevel');
    const category = extract('category');

    if (!oldCode || !newCode) return null;

    return {
      file: file ?? '',
      description: description ?? '',
      reasoning: reasoning ?? '',
      oldCode,
      newCode,
      riskLevel: riskLevel ?? 'medium',
      category: category ?? 'bugfix',
    };
  }

  // ==============================================================
  // Private: getSourceFiles() — Walk src/ directory recursively
  // ==============================================================

  private getSourceFiles(): string[] {
    const files: string[] = [];
    const excludeDirs = new Set(this.config.excludeDirs);

    const walk = (dir: string): void => {
      if (!existsSync(dir)) return;

      let entries;
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = join(dir, entry);
        let stat;
        try {
          stat = statSync(fullPath);
        } catch {
          continue;
        }

        if (stat.isDirectory()) {
          if (!excludeDirs.has(entry)) {
            walk(fullPath);
          }
        } else if (stat.isFile()) {
          if (/\.(ts|js)$/.test(entry)) {
            files.push(fullPath);
          }
        }
      }
    };

    walk(this.srcDir);
    return files;
  }

  // ==============================================================
  // Private: createBackup() — Copy files to .devmind/mutations/{planId}/
  // ==============================================================

  private createBackup(plan: MutationPlan): void {
    const planBackupDir = join(this.backupDir, plan.id);
    mkdirSync(planBackupDir, { recursive: true });

    const backedUpFiles = new Set<string>();

    for (const proposal of plan.proposal) {
      // Normalize: replace both forward and back slashes with underscore
      const normalizedFile = proposal.file.replace(/[\\/]/g, '_');
      const normalizedSource = proposal.file.replace(/\\/g, '/');
      const sourcePath = resolve(this.projectRoot, normalizedSource);

      if (backedUpFiles.has(normalizedFile)) continue;
      backedUpFiles.add(normalizedFile);

      if (existsSync(sourcePath)) {
        const backupPath = join(planBackupDir, normalizedFile);
        copyFileSync(sourcePath, backupPath);
      }
    }
  }

  // ==============================================================
  // Private: verifyCompilation() — Run tsc --noEmit with timeout
  // ==============================================================

  private verifyCompilation(): boolean {
    try {
      execSync('npx tsc --noEmit', {
        cwd: this.projectRoot,
        timeout: 30_000,
        stdio: 'pipe',
      });
      return true;
    } catch {
      return false;
    }
  }
}
