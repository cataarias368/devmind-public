// ============================================================
// src/github-integration.ts - Cliente GitHub para Issues, PRs y Búsqueda
// ============================================================

import type { GitHubConfig } from './types.js';

interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: Array<{ name: string }>;
  assignee: { login: string } | null;
  created_at: string;
  html_url: string;
}

interface GitHubPR {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  head: { ref: string };
  base: { ref: string };
  html_url: string;
}

interface SearchResult {
  path: string;
  textMatches: string[];
}

export class GitHubIntegration {
  private readonly owner: string;
  private readonly repo: string;
  private readonly token: string;
  private readonly baseUrl = 'https://api.github.com';

  constructor(config: GitHubConfig) {
    this.owner = config.owner;
    this.repo = config.repo;
    this.token = config.token;
  }

  private get headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  private get repoUrl(): string {
    return `${this.baseUrl}/repos/${this.owner}/${this.repo}`;
  }

  // --- Issues ---

  /**
   * Lista issues abiertas del repositorio.
   */
  async listIssues(state: 'open' | 'closed' | 'all' = 'open'): Promise<GitHubIssue[]> {
    const response = await fetch(
      `${this.repoUrl}/issues?state=${state}&per_page=30`,
      { headers: this.headers }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${await response.text()}`);
    }

    const issues = (await response.json()) as GitHubIssue[];
    // Filtrar PRs (GitHub los incluye en /issues)
    return issues.filter(i => !('pull_request' in (i as unknown as Record<string, unknown>)));
  }

  /**
   * Crea una nueva issue.
   */
  async createIssue(title: string, body: string, labels?: string[]): Promise<GitHubIssue> {
    const payload: Record<string, unknown> = { title, body };
    if (labels) payload.labels = labels;

    const response = await fetch(`${this.repoUrl}/issues`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Error creando issue: ${response.status} ${await response.text()}`);
    }

    return (await response.json()) as GitHubIssue;
  }

  /**
   * Comenta en una issue existente.
   */
  async commentIssue(issueNumber: number, body: string): Promise<void> {
    const response = await fetch(`${this.repoUrl}/issues/${issueNumber}/comments`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ body }),
    });

    if (!response.ok) {
      throw new Error(`Error comentando issue #${issueNumber}: ${response.status}`);
    }
  }

  // --- Pull Requests ---

  /**
   * Lista PRs del repositorio.
   */
  async listPRs(state: 'open' | 'closed' | 'all' = 'open'): Promise<GitHubPR[]> {
    const response = await fetch(
      `${this.repoUrl}/pulls?state=${state}&per_page=30`,
      { headers: this.headers }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${await response.text()}`);
    }

    return (await response.json()) as GitHubPR[];
  }

  /**
   * Crea un Pull Request.
   */
  async createPR(title: string, body: string, head: string, base = 'main'): Promise<GitHubPR> {
    const response = await fetch(`${this.repoUrl}/pulls`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ title, body, head, base }),
    });

    if (!response.ok) {
      throw new Error(`Error creando PR: ${response.status} ${await response.text()}`);
    }

    return (await response.json()) as GitHubPR;
  }

  // --- Búsqueda de Código ---

  /**
   * Busca código en el repositorio usando GitHub Code Search API.
   */
  async searchCode(query: string): Promise<SearchResult[]> {
    const encoded = encodeURIComponent(`${query} repo:${this.owner}/${this.repo}`);
    const response = await fetch(
      `${this.baseUrl}/search/code?q=${encoded}&per_page=20`,
      { headers: this.headers }
    );

    if (!response.ok) {
      throw new Error(`Error en búsqueda: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as {
      items: Array<{
        path: string;
        text_matches?: Array<{ fragment: string }>;
      }>;
    };

    return data.items.map(item => ({
      path: item.path,
      textMatches: item.text_matches?.map(m => m.fragment) || [],
    }));
  }

  // --- Utilidades ---

  /**
   * Obtiene el contenido de un archivo del repositorio.
   */
  async getFileContent(path: string, branch = 'main'): Promise<string> {
    const response = await fetch(
      `${this.repoUrl}/contents/${path}?ref=${branch}`,
      { headers: this.headers }
    );

    if (!response.ok) {
      throw new Error(`Error obteniendo archivo ${path}: ${response.status}`);
    }

    const data = (await response.json()) as { content: string; encoding: string };

    if (data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }

    return data.content;
  }

  /**
   * Genera un resumen del estado del repositorio.
   */
  async getRepoSummary(): Promise<string> {
    const [issues, prs] = await Promise.all([
      this.listIssues('open').catch(() => []),
      this.listPRs('open').catch(() => []),
    ]);

    const lines: string[] = [
      `Repositorio: ${this.owner}/${this.repo}`,
      `Issues abiertas: ${issues.length}`,
      `Pull Requests abiertos: ${prs.length}`,
      '',
    ];

    if (issues.length > 0) {
      lines.push('Issues recientes:');
      for (const issue of issues.slice(0, 5)) {
        lines.push(`  #${issue.number} ${issue.title} [${issue.state}]`);
      }
    }

    if (prs.length > 0) {
      lines.push('');
      lines.push('PRs recientes:');
      for (const pr of prs.slice(0, 5)) {
        lines.push(`  #${pr.number} ${pr.title} (${pr.head.ref} -> ${pr.base.ref})`);
      }
    }

    return lines.join('\n');
  }
}
