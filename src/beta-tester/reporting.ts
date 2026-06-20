// ============================================================
// src/beta-tester/reporting.ts - Motor de Generación de Reportes
// Genera reportes detallados de las pruebas beta
// ============================================================

import type { TestReport } from './automated-testing.js';

export interface Report {
  title: string;
  generatedAt: Date;
  summary: string;
  details: {
    model: string;
    timestamp: Date;
    performance: TestReport['performance'];
    tests: Array<{
      name: string;
      passed: number;
      total: number;
      rate: number;
    }>;
  };
  issues: string[];
  recommendations: string[];
  score: number;
}

export class ReportGenerationEngine {

  async generateReport(testResults: TestReport): Promise<Report> {
    const totalTests = testResults.tests.reduce((acc, t) => acc + t.total, 0);
    const passedTests = testResults.tests.reduce((acc, t) => acc + t.passed, 0);
    const passRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;

    return {
      title: `Beta Test Report - ${testResults.model}`,
      generatedAt: new Date(),
      summary: this.generateSummary(testResults, passRate),
      details: {
        model: testResults.model,
        timestamp: testResults.timestamp,
        performance: testResults.performance,
        tests: testResults.tests.map(t => ({
          name: t.name,
          passed: t.passed,
          total: t.total,
          rate: t.total > 0 ? (t.passed / t.total) * 100 : 0,
        })),
      },
      issues: testResults.issues,
      recommendations: this.generateRecommendations(testResults, passRate),
      score: passRate,
    };
  }

  private generateSummary(testResults: TestReport, passRate: number): string {
    const edgeTests = testResults.tests.find(t => t.name === 'Edge Cases');
    const funcTests = testResults.tests.find(t => t.name === 'Functionality Tests');

    let summary = `
╔══════════════════════════════════════════════════════════╗
║  Beta Test Report - ${testResults.model.padEnd(36)}║
╚══════════════════════════════════════════════════════════╝

📊 OVERVIEW
-----------
  Pass Rate:       ${passRate.toFixed(1)}%
  Total Tests:     ${testResults.tests.reduce((a, t) => a + t.total, 0)}
  Passed:          ${testResults.tests.reduce((a, t) => a + t.passed, 0)}
  Issues Found:    ${testResults.issues.length}

⚡ PERFORMANCE
--------------
  Avg Latency:     ${testResults.performance.avgLatency.toFixed(1)}ms
  P95 Latency:     ${testResults.performance.p95Latency.toFixed(1)}ms
  P99 Latency:     ${testResults.performance.p99Latency.toFixed(1)}ms
  Failed Requests: ${testResults.performance.failedRequests}/${testResults.performance.totalRequests}

🧪 TEST BREAKDOWN
------------------`;

    if (funcTests) {
      summary += `\n  Functionality:   ${funcTests.passed}/${funcTests.total} (${(funcTests.passed / funcTests.total * 100).toFixed(0)}%)`;
    }
    if (edgeTests) {
      summary += `\n  Edge Cases:      ${edgeTests.passed}/${edgeTests.total} (${(edgeTests.passed / edgeTests.total * 100).toFixed(0)}%)`;
    }

    const consTests = testResults.tests.find(t => t.name === 'Consistency Tests');
    if (consTests) {
      summary += `\n  Consistency:     ${consTests.passed}/${consTests.total} (${(consTests.passed / consTests.total * 100).toFixed(0)}%)`;
    }

    summary += `\n\n🎯 VERDICT: ${passRate > 80 ? '✅ Ready for production' : passRate > 50 ? '⚠️ Needs improvement' : '❌ Not recommended'}`;

    if (testResults.issues.length > 0) {
      summary += '\n\n🚨 ISSUES:\n';
      for (const issue of testResults.issues) {
        summary += `  • ${issue}\n`;
      }
    }

    return summary;
  }

  private generateRecommendations(testResults: TestReport, passRate: number): string[] {
    const recommendations: string[] = [];

    if (passRate < 80) {
      recommendations.push('Improve basic functionality pass rate (currently below 80%)');
    }

    if (testResults.performance.avgLatency > 5000) {
      recommendations.push(`Optimize latency (current avg: ${testResults.performance.avgLatency.toFixed(0)}ms, target: <5000ms)`);
    }

    if (testResults.performance.p95Latency > 10000) {
      recommendations.push(`Reduce tail latency (p95: ${testResults.performance.p95Latency.toFixed(0)}ms)`);
    }

    const edgeTests = testResults.tests.find(t => t.name === 'Edge Cases');
    if (edgeTests && edgeTests.passed < edgeTests.total * 0.7) {
      recommendations.push(`Improve edge case handling (only ${edgeTests.passed}/${edgeTests.total} passed)`);
    }

    const consTests = testResults.tests.find(t => t.name === 'Consistency Tests');
    if (consTests && consTests.passed < consTests.total) {
      recommendations.push('Improve response consistency across identical prompts');
    }

    if (testResults.performance.failedRequests > 0) {
      recommendations.push(`Investigate ${testResults.performance.failedRequests} failed requests (potential stability issue)`);
    }

    // Security recommendations
    const securityIssues = testResults.issues.filter(i => i.includes('SECURITY'));
    if (securityIssues.length > 0) {
      recommendations.push('CRITICAL: Address security vulnerabilities before production release');
    }

    if (recommendations.length === 0) {
      recommendations.push('No critical improvements needed — model performs well across all dimensions');
    }

    return recommendations;
  }

  async sendReport(report: Report, contactEmail: string): Promise<void> {
    console.log(`\n📧 Enviando reporte a ${contactEmail}`);
    console.log('='.repeat(60));
    console.log(report.summary);
    console.log('='.repeat(60));

    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      for (const rec of report.recommendations) {
        console.log(`  • ${rec}`);
      }
    }

    // En producción: enviar email real via SMTP o API
  }

  formatReportAsJSON(report: Report): string {
    return JSON.stringify(report, null, 2);
  }

  formatReportAsMarkdown(report: Report): string {
    let md = `# ${report.title}\n\n`;
    md += `**Generated:** ${report.generatedAt.toISOString()}\n`;
    md += `**Score:** ${report.score.toFixed(1)}%\n\n`;

    md += `## Test Results\n\n`;
    md += `| Test | Passed | Total | Rate |\n`;
    md += `|------|--------|-------|------|\n`;
    for (const test of report.details.tests) {
      md += `| ${test.name} | ${test.passed} | ${test.total} | ${test.rate.toFixed(1)}% |\n`;
    }

    md += `\n## Performance\n\n`;
    md += `- Avg Latency: ${report.details.performance.avgLatency.toFixed(1)}ms\n`;
    md += `- P95 Latency: ${report.details.performance.p95Latency.toFixed(1)}ms\n`;
    md += `- P99 Latency: ${report.details.performance.p99Latency.toFixed(1)}ms\n`;

    if (report.issues.length > 0) {
      md += `\n## Issues\n\n`;
      for (const issue of report.issues) {
        md += `- ${issue}\n`;
      }
    }

    if (report.recommendations.length > 0) {
      md += `\n## Recommendations\n\n`;
      for (const rec of report.recommendations) {
        md += `- ${rec}\n`;
      }
    }

    return md;
  }
}
