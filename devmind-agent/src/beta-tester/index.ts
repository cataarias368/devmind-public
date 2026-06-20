// ============================================================
// src/beta-tester/index.ts - Beta Tester Agent Orchestrator
// ============================================================

import { BetaDiscoveryEngine, type BetaOpportunity, type DiscoveryResult } from './discovery.js';
import { AutoPresentationEngine, type PresentationResult } from './presentation.js';
import { AutomatedTestingEngine, type ModelAccess, type TestReport } from './automated-testing.js';
import { ReportGenerationEngine, type Report } from './reporting.js';

export type { BetaOpportunity, DiscoveryResult } from './discovery.js';
export type { PresentationResult, DevMindProfile } from './presentation.js';
export type { ModelAccess, TestReport, TestResult, PerformanceMetrics } from './automated-testing.js';
export type { Report } from './reporting.js';

export interface BetaTesterStatus {
  phase: 'idle' | 'discovering' | 'presenting' | 'testing' | 'reporting' | 'complete' | 'error';
  opportunitiesFound: number;
  presentationsSent: number;
  modelsTested: number;
  reportsGenerated: number;
  lastRun: string | null;
  error: string | null;
}

export class BetaTesterAgent {
  private readonly discovery: BetaDiscoveryEngine;
  private readonly presentation: AutoPresentationEngine;
  private readonly testing: AutomatedTestingEngine;
  private readonly reporting: ReportGenerationEngine;

  private readonly reports: Report[] = [];
  private status: BetaTesterStatus;

  constructor() {
    this.discovery = new BetaDiscoveryEngine();
    this.presentation = new AutoPresentationEngine();
    this.testing = new AutomatedTestingEngine();
    this.reporting = new ReportGenerationEngine();

    this.status = {
      phase: 'idle',
      opportunitiesFound: 0,
      presentationsSent: 0,
      modelsTested: 0,
      reportsGenerated: 0,
      lastRun: null,
      error: null,
    };
  }

  async run(): Promise<{
    discovery: DiscoveryResult;
    presentations: PresentationResult[];
    testReports: TestReport[];
    reports: Report[];
  }> {
    this.updateStatus('discovering');
    console.log('[BetaTester] Starting beta testing pipeline...');

    let discoveryResult: DiscoveryResult;
    try {
      discoveryResult = await this.discovery.findBetaOpportunities();
      this.status.opportunitiesFound = discoveryResult.opportunities.length;
      console.log(`[BetaTester] Found ${discoveryResult.opportunities.length} opportunities from ${discoveryResult.sourcesChecked} sources`);
    } catch (error) {
      this.status.error = error instanceof Error ? error.message : String(error);
      this.updateStatus('error');
      throw error;
    }

    this.updateStatus('presenting');
    const presentations: PresentationResult[] = [];
    for (const opportunity of discoveryResult.opportunities) {
      try {
        const result = await this.presentation.presentToCompany(opportunity);
        presentations.push(result);
        if (result.success) {
          this.status.presentationsSent++;
        }
      } catch (error) {
        console.error(`[BetaTester] Failed to present to ${opportunity.company}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    this.updateStatus('testing');
    const testReports: TestReport[] = [];
    const acceptedOpportunities = discoveryResult.opportunities.filter(
      (opp) => opp.status === 'accepted' || opp.status === 'testing',
    );

    for (const opportunity of acceptedOpportunities) {
      try {
        const access = this.createModelAccess(opportunity);
        const report = await this.testModel(access);
        testReports.push(report);
        this.status.modelsTested++;
      } catch (error) {
        console.error(`[BetaTester] Failed to test ${opportunity.model}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    this.updateStatus('reporting');
    for (const testReport of testReports) {
      const report = this.reporting.generateReport(testReport);
      this.reports.push(report);
      this.status.reportsGenerated++;

      const contactEmail = await this.presentation.findContact(
        discoveryResult.opportunities.find((o) => o.model === testReport.model) ??
        discoveryResult.opportunities[0],
      );
      if (contactEmail) {
        this.reporting.sendReport(report, contactEmail);
      }
    }

    this.status.lastRun = new Date().toISOString();
    this.updateStatus('complete');
    console.log(`[BetaTester] Pipeline complete. ${this.status.reportsGenerated} reports generated.`);

    return { discovery: discoveryResult, presentations, testReports, reports: [...this.reports] };
  }

  async testModel(access: ModelAccess): Promise<TestReport> {
    console.log(`[BetaTester] Testing model: ${access.model}`);

    const tests = [];
    const issues: string[] = [];

    const functionality = await this.testing.testFunctionality(access);
    tests.push(functionality);

    const { result: performanceResult, metrics } = await this.testing.testPerformance(access);
    tests.push(performanceResult);

    const edgeCases = await this.testing.testEdgeCases(access);
    tests.push(edgeCases);

    const consistency = await this.testing.testConsistency(access);
    tests.push(consistency);

    const report: TestReport = {
      model: access.model,
      timestamp: new Date().toISOString(),
      tests,
      performance: metrics,
      issues,
    };

    const detectedIssues = this.testing.detectIssues(report);
    report.issues = detectedIssues;

    console.log(`[BetaTester] Testing complete for ${access.model}: ${detectedIssues.length} issues found`);
    return report;
  }

  getStatus(): BetaTesterStatus {
    return { ...this.status };
  }

  getReports(): Report[] {
    return [...this.reports];
  }

  private createModelAccess(opportunity: BetaOpportunity): ModelAccess {
    return {
      model: opportunity.model,
      endpoint: `https://api.${opportunity.company.toLowerCase().replace(/\s+/g, '')}.com/v1/chat/completions`,
      apiKey: process.env[`${opportunity.company.toUpperCase().replace(/\s+/g, '_')}_API_KEY`] ?? 'demo-key',
      rateLimit: 10,
    };
  }

  private updateStatus(phase: BetaTesterStatus['phase']): void {
    this.status.phase = phase;
  }
}
