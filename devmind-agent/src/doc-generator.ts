// ============================================================
// src/doc-generator.ts - Generador de Documentación Automática
// ============================================================

import { mkdir, writeFile, readFile, readdir, stat } from 'fs/promises';
import { join, resolve, extname, basename } from 'path';
import type { GLM47Provider } from './llm-provider.js';
import type { DocFormat, DocOptions } from './types.js';

interface DocEntry {
  filePath: string;
  content: string;
  summary: string;
}

export class DocumentationGenerator {
  private readonly outputDir: string;

  constructor(outputDir: string) {
    this.outputDir = resolve(outputDir);
  }

  /**
   * Genera documentación para un directorio de código fuente.
   */
  async generateForDirectory(
    sourceDir: string,
    llmProvider: GLM47Provider,
    options: DocOptions = { format: 'markdown' }
  ): Promise<string[]> {
    await mkdir(this.outputDir, { recursive: true });

    const entries = await this.scanSourceFiles(sourceDir);
    const generatedFiles: string[] = [];

    for (const entry of entries) {
      try {
        // Generar resumen con LLM
        const summary = await this.generateSummary(entry, llmProvider);
        entry.summary = summary;

        // Generar documentación en el formato solicitado
        const docContent = this.formatDoc(entry, options);
        const fileName = this.getOutputFileName(entry.filePath, options.format);
        const outputPath = join(this.outputDir, fileName);

        await writeFile(outputPath, docContent, 'utf-8');
        generatedFiles.push(outputPath);

        console.log(`📝 Documentación generada: ${fileName}`);
      } catch (err) {
        console.error(`Error generando doc para ${entry.filePath}:`, err);
      }
    }

    // Generar índice si hay múltiples archivos
    if (entries.length > 1) {
      const indexContent = this.generateIndex(entries, options);
      const indexPath = join(this.outputDir, `INDEX.${options.format === 'markdown' ? 'md' : options.format === 'html' ? 'html' : 'md'}`);
      await writeFile(indexPath, indexContent, 'utf-8');
      generatedFiles.push(indexPath);
    }

    return generatedFiles;
  }

  /**
   * Escanea archivos de código fuente en un directorio.
   */
  private async scanSourceFiles(dir: string): Promise<DocEntry[]> {
    const entries: DocEntry[] = [];
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs'];

    async function walk(currentDir: string): Promise<void> {
      const files = await readdir(currentDir);
      for (const file of files) {
        const fullPath = join(currentDir, file);
        const fileStat = await stat(fullPath);

        if (fileStat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
          await walk(fullPath);
        } else if (fileStat.isFile() && extensions.includes(extname(file))) {
          try {
            const content = await readFile(fullPath, 'utf-8');
            entries.push({ filePath: fullPath, content, summary: '' });
          } catch {
            // Ignorar archivos que no se pueden leer
          }
        }
      }
    }

    await walk(dir);
    return entries;
  }

  /**
   * Genera un resumen de un archivo usando el LLM.
   */
  private async generateSummary(entry: DocEntry, llm: GLM47Provider): Promise<string> {
    const prompt = `Analizá este archivo de código y generá documentación técnica clara y concisa.

Archivo: ${basename(entry.filePath)}

Código:
\`\`\`
${entry.content.slice(0, 3000)}
\`\`\`

Generá:
1. Descripción general del archivo
2. Funciones/métodos principales con sus firmas
3. Tipos/interfaces exportados
4. Dependencias principales
5. Notas de uso

Respondé en español, de forma profesional y directa.`;

    const response = await llm.call([{ role: 'user', content: prompt }]);
    return response.choices[0]?.message?.content || 'Sin resumen disponible';
  }

  /**
   * Formatea la documentación según el formato solicitado.
   */
  private formatDoc(entry: DocEntry, options: DocOptions): string {
    const fileName = basename(entry.filePath);

    switch (options.format) {
      case 'html':
        return this.formatAsHTML(entry, fileName);
      case 'pdf':
        // Para PDF generamos HTML que luego se convierte
        return this.formatAsHTML(entry, fileName);
      case 'markdown':
      default:
        return this.formatAsMarkdown(entry, fileName);
    }
  }

  private formatAsMarkdown(entry: DocEntry, fileName: string): string {
    return `# Documentación: ${fileName}

> Generado automáticamente por DevMind Agent

---

${entry.summary}

---

## Código Fuente Referenciado

\`\`\`typescript
${entry.content.slice(0, 2000)}${entry.content.length > 2000 ? '\n// ... (truncado)' : ''}
\`\`\`
`;
  }

  private formatAsHTML(entry: DocEntry, fileName: string): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Documentación: ${fileName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; line-height: 1.6; color: #333; }
    h1 { border-bottom: 2px solid #4f46e5; padding-bottom: 0.5rem; }
    h2 { color: #4f46e5; }
    code { background: #f3f4f6; padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.9em; }
    pre { background: #1e1e2e; color: #cdd6f4; padding: 1.5rem; border-radius: 8px; overflow-x: auto; }
    blockquote { border-left: 4px solid #4f46e5; margin: 1rem 0; padding: 0.5rem 1rem; background: #f9fafb; }
  </style>
</head>
<body>
  <h1>${fileName}</h1>
  <blockquote>Generado automáticamente por DevMind Agent</blockquote>
  <div>${this.markdownToHTML(entry.summary)}</div>
</body>
</html>`;
  }

  private markdownToHTML(md: string): string {
    return md
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(?!<)/, '<p>')
      .replace(/(?!>)$/, '</p>');
  }

  private generateIndex(entries: DocEntry[], options: DocOptions): string {
    const lines = entries.map(e => {
      const name = basename(e.filePath);
      const firstLine = e.summary.split('\n')[0] || '';
      return `- [${name}](${this.getOutputFileName(e.filePath, options.format)}): ${firstLine}`;
    });

    return `# Índice de Documentación\n\nGenerado por DevMind Agent\n\n${lines.join('\n')}`;
  }

  private getOutputFileName(sourcePath: string, format: DocFormat): string {
    const base = basename(sourcePath, extname(sourcePath));
    const ext = format === 'markdown' ? 'md' : format === 'html' ? 'html' : 'md';
    return `${base}.doc.${ext}`;
  }
}
