// ============================================================
// src/test-generator.ts - Generador Automático de Tests (Seguro)
// ============================================================

import { spawnSync } from 'child_process';
import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { join, basename } from 'path';
import type { GLM47Provider } from './llm-provider.js';
import type { TestSuite, TestConfig } from './types.js';
import { isSafePath, serializeError } from './types.js';

export class TestGenerator {
  private readonly config: TestConfig;
  private readonly llm: GLM47Provider;

  constructor(config: TestConfig, llm: GLM47Provider) {
    this.config = config;
    this.llm = llm;
  }

  /**
   * Inicializa el directorio de salida de tests.
   */
  async init(): Promise<void> {
    await mkdir(this.config.outputDir, { recursive: true });
  }

  /**
   * Genera tests unitarios para un archivo fuente.
   */
  async generateUnitTests(filePath: string): Promise<TestSuite> {
    if (!isSafePath(filePath)) {
      throw new Error(`Ruta no segura: ${filePath}`);
    }

    const sourceCode = await readFile(filePath, 'utf-8');
    const fileName = basename(filePath);

    const prompt = `Analizá este archivo y generá tests unitarios completos.

Archivo: ${fileName}
Framework: ${this.config.framework}
Lenguaje: ${this.config.language}

Código fuente:
\`\`\`${this.config.language}
${sourceCode.slice(0, 4000)}
\`\`\`

Reglas:
- Cubrí todas las funciones y métodos exportados
- Incluí tests para casos felices y edge cases
- Usá mocks/stubs para dependencias externas
- Incluí tests de error handling
- Nombres de test descriptivos en español o inglés

Respondé SOLO con el código del archivo de test completo.`;

    const response = await this.llm.call([{ role: 'user', content: prompt }]);
    let testCode = response.choices[0]?.message?.content || '';
    testCode = this.cleanCodeBlock(testCode);

    const testFileName = fileName.replace(/\.(ts|js)$/, '.test.$1');
    return { fileName: testFileName, content: testCode, type: 'unit' };
  }

  /**
   * Genera tests de integración para un archivo fuente.
   */
  async generateAPITests(filePath: string): Promise<TestSuite> {
    if (!isSafePath(filePath)) {
      throw new Error(`Ruta no segura: ${filePath}`);
    }

    const sourceCode = await readFile(filePath, 'utf-8');
    const fileName = basename(filePath);

    const prompt = `Generá tests de integración para este módulo.

Archivo: ${fileName}
Framework: ${this.config.framework}

Código fuente:
\`\`\`${this.config.language}
${sourceCode.slice(0, 4000)}
\`\`\`

Reglas:
- Testeá las interacciones entre componentes
- Usá setup/teardown para estado compartido
- Verificá contratos de API
- Incluí tests de flujos completos end-to-end internos
- Manejá limpieza de recursos

Respondé SOLO con el código del archivo de test completo.`;

    const response = await this.llm.call([{ role: 'user', content: prompt }]);
    let testCode = response.choices[0]?.message?.content || '';
    testCode = this.cleanCodeBlock(testCode);

    const testFileName = fileName.replace(/\.(ts|js)$/, '.integration.test.$1');
    return { fileName: testFileName, content: testCode, type: 'integration' };
  }

  /**
   * Genera tests E2E con Playwright para un flujo de usuario.
   */
  async generateE2ETests(pageDescription: string): Promise<TestSuite> {
    const prompt = `Generá tests E2E con Playwright para este flujo de usuario.

Descripción del flujo: "${pageDescription}"

Reglas:
- Usá page.goto, page.click, page.fill, page.expect
- Usá selectores estables (data-testid, role)
- Manejá waits y asserts explícitos
- Estructuralo con test.describe y test

Respondé SOLO con el código del archivo de test completo.`;

    const response = await this.llm.call([{ role: 'user', content: prompt }]);
    let testCode = response.choices[0]?.message?.content || '';
    testCode = this.cleanCodeBlock(testCode);

    return { fileName: 'e2e.spec.ts', content: testCode, type: 'e2e' };
  }

  /**
   * Ejecuta un archivo de tests específico de forma SEGURA.
   * Usa spawnSync con shell=false y valida la ruta.
   */
  async runTestFile(filePath: string): Promise<{ success: boolean; output: string }> {
    // SEGURIDAD: Validar ruta antes de ejecutar
    if (!isSafePath(filePath)) {
      return {
        success: false,
        output: `Ruta no segura rechazada: ${filePath}`,
      };
    }

    const testPath = join(this.config.outputDir, filePath);

    try {
      let command: string;
      let args: string[];

      // Detectar comando según framework (sin shell)
      if (this.config.framework === 'playwright') {
        command = 'npx';
        args = ['playwright', 'test', testPath];
      } else if (this.config.framework === 'vitest') {
        command = 'npx';
        args = ['vitest', 'run', testPath];
      } else {
        command = 'npx';
        args = ['jest', testPath];
      }

      if (this.config.coverage) {
        args.push('--coverage');
      }

      // ✅ SEGURO: spawnSync con shell=false
      const result = spawnSync(command, args, {
        cwd: this.config.workspaceRoot,
        encoding: 'utf-8',
        timeout: 120000,
        shell: false,
      });

      const output = (result.stdout || '') + (result.stderr || '');

      if (result.status === 0) {
        return { success: true, output };
      }

      return {
        success: false,
        output: output || `Exit code: ${result.status}`,
      };
    } catch (err) {
      return {
        success: false,
        output: serializeError(err),
      };
    }
  }

  /**
   * Escanea un directorio y genera tests para todos los archivos fuente.
   * Usa procesamiento PARALELO con límite de concurrencia.
   */
  async generateForDirectory(
    sourceDir: string,
    type: 'unit' | 'integration'
  ): Promise<TestSuite[]> {
    await this.init();

    const files = await this.scanSourceFiles(sourceDir);
    const testSuites: TestSuite[] = [];

    // Procesamiento en paralelo con límite de concurrencia
    const LIMIT = 5;

    for (let i = 0; i < files.length; i += LIMIT) {
      const batch = files.slice(i, i + LIMIT);

      const results = await Promise.allSettled(
        batch.map(async (file) => {
          const fullPath = join(sourceDir, file);
          const suite = type === 'unit'
            ? await this.generateUnitTests(fullPath)
            : await this.generateAPITests(fullPath);

          await writeFile(
            join(this.config.outputDir, suite.fileName),
            suite.content,
            'utf-8'
          );

          console.log(`✅ Test generado para: ${file}`);
          return suite;
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          testSuites.push(result.value);
        } else {
          console.error(`❌ Error generando test:`, result.reason);
        }
      }
    }

    return testSuites;
  }

  /**
   * Escanea archivos fuente en un directorio.
   */
  private async scanSourceFiles(dir: string): Promise<string[]> {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return entries
        .filter(e => e.isFile() && /\.(ts|js)$/.test(e.name) && !e.name.includes('.test.') && !e.name.includes('.spec.'))
        .map(e => e.name);
    } catch {
      return [];
    }
  }

  /**
   * Limpia marcadores de code block de la respuesta del LLM.
   */
  private cleanCodeBlock(code: string): string {
    return code.replace(/```[\w]*\n?|```/g, '').trim();
  }
}
