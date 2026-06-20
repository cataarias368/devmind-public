// ============================================================
// src/beta-tester/index.ts - Agente Beta Tester
// Orquesta descubrimiento, presentación, pruebas y reportes
// ============================================================

import { BetaDiscoveryEngine } from './discovery.js';
import { AutoPresentationEngine } from './presentation.js';
import { AutomatedTestingEngine } from './automated-testing.js';
import type { ModelAccess, TestReport } from './automated-testing.js';
import { ReportGenerationEngine, type Report } from './reporting.js';

export interface BetaTesterStatus {
  opportunities: number;
  contacted: number;
  testing: number;
  reports: number;
}

export class BetaTesterAgent {
  private discovery: BetaDiscoveryEngine;
  private presentation: AutoPresentationEngine;
  private testing: AutomatedTestingEngine;
  private reporting: ReportGenerationEngine;
  private reports: Report[] = [];

  constructor() {
    this.discovery = new BetaDiscoveryEngine();
    this.presentation = new AutoPresentationEngine();
    this.testing = new AutomatedTestingEngine();
    this.reporting = new ReportGenerationEngine();
  }

  async run(): Promise<void> {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  🧪 Beta Tester Agent - DevMind                        ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    // 1. Buscar oportunidades
    console.log('🔍 PASO 1: Buscando oportunidades de beta testing...\n');
    const result = await this.discovery.findBetaOpportunities();
    const opportunities = result.opportunities;

    console.log(`✅ Encontradas ${opportunities.length} oportunidades (${result.sourcesChecked} fuentes consultadas)`);
    if (result.errors.length > 0) {
      console.log(`⚠️ ${result.errors.length} fuentes con errores`);
    }

    for (const opp of opportunities) {
      console.log(`  📋 ${opp.company}: ${opp.model} — ${opp.description.slice(0, 60)}...`);
    }

    // 2. Presentarse a empresas
    console.log('\n📧 PASO 2: Presentándose a empresas...\n');
    for (const opportunity of opportunities) {
      console.log(`  📧 Contactando ${opportunity.company}...`);
      const presResult = await this.presentation.presentToCompany(opportunity);

      if (presResult.success) {
        console.log(`  ✅ ${presResult.message}`);
        opportunity.status = 'contacted';
      } else {
        console.log(`  ⚠️ ${presResult.message}`);
      }
    }

    // 3. Si hay modelos con acceso, correr pruebas
    console.log('\n🧪 PASO 3: Ejecutando pruebas automatizadas...\n');
    const acceptedModels = opportunities.filter(o => o.status === 'accepted' || o.status === 'testing');

    if (acceptedModels.length === 0) {
      console.log('ℹ️ No hay modelos aceptados para testing aún.');
      console.log('   Las propuestas fueron enviadas. Esperá respuesta de las empresas.');
    }

    for (const model of acceptedModels) {
      console.log(`\n🧪 Probando ${model.model} de ${model.company}...`);

      const access: ModelAccess = {
        model: model.model,
        endpoint: `https://api.${model.company.toLowerCase().replace(/[^a-z0-9]/g, '')}.com/v1/chat/completions`,
        apiKey: process.env[`${model.company.toUpperCase().replace(/[^A-Z0-9]/g, '')}_API_KEY`] || 'test_key',
      };

      try {
        const testResults = await this.testing.runBetaTests(access);
        const report = await this.reporting.generateReport(testResults);

        console.log(`\n📊 Reporte para ${model.model}:`);
        console.log(report.summary);

        this.reports.push(report);

        // Enviar reporte
        const contact = this.presentation.findContact(model);
        if (contact) {
          await this.reporting.sendReport(report, contact);
        }
      } catch (err) {
        console.error(`❌ Error probando ${model.model}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    console.log('\n🏁 Beta Tester Agent finalizado.');
  }

  async testModel(access: ModelAccess): Promise<{ report: Report; testResults: TestReport }> {
    const testResults = await this.testing.runBetaTests(access);
    const report = await this.reporting.generateReport(testResults);
    this.reports.push(report);
    return { report, testResults };
  }

  getStatus(): BetaTesterStatus {
    return {
      opportunities: 0,
      contacted: 0,
      testing: 0,
      reports: this.reports.length,
    };
  }

  getReports(): Report[] {
    return [...this.reports];
  }
}
