// ============================================================
// src/beta-tester/reporting.ts - Report Generation Engine
// ============================================================

import type { TestReport } from './automated-testing.js';

export interface Report {
  title: string;
  generatedAt: string;
  summary: string;
  details: string[];
  issues: string[];
  recommendations: string[];
  score: number;
}

export class ReportGenerationEngine {
  generateReport(testResults: TestReport): Report {
    const totalPassed = testResults.tests.reduce((sum, t) => sum + t.passed, 0);
    const totalTests = testResults.tests.reduce((sum, t) => sum + t.total, 0);
    const passRate = totalTests > 0 ? totalPassed / totalTests : 0;

    const details: string[] = [];
    for (const test of testResults.tests) {
      details.push(`**${test.name}**: ${test.passed}/${test.total} passed`);
      for (const result of test.results) {
        const status = result.passed ? '✅' : '❌';
        details.push(`  ${status} ${result.name} (${result.latencyMs.toFixed(0)}ms)`);
        if (result.error) {
          details.push(`     Error: ${result.error}`);
        }
      }
    }

    details.push('');
    details.push('**Performance Metrics**:');
    details.push(`  Average Latency: ${testResults.performance.avgLatency.toFixed(0)}ms`);
    details.push(`  P95 Latency: ${testResults.performance.p95Latency.toFixed(0)}ms`);
    details.push(`  P99 Latency: ${testResults.performance.p99Latency.toFixed(0)}ms`);
    details.push(`  Avg Tokens/Second: ${testResults.performance.avgTokensPerSecond.toFixed(1)}`);
    details.push(`  Avg Memory Usage: ${testResults.performance.avgMemoryUsage.toFixed(0)}KB`);
    details.push(`  Max Memory Usage: ${testResults.performance.maxMemoryUsage.toFixed(0)}KB`);
    details.push(`  Failed Requests: ${testResults.performance.failedRequests}/${testResults.performance.totalRequests}`);

    const recommendations = this.generateRecommendations(testResults);
    const score = this.calculateScore(testResults, passRate);
    const summary = this.generateSummary(testResults.model, passRate, totalPassed, totalTests, score);

    return {
      title: `Beta Test Report — ${testResults.model}`,
      generatedAt: new Date().toISOString(),
      summary,
      details,
      issues: testResults.issues,
      recommendations,
      score,
    };
  }

  formatReportAsMarkdown(report: Report): string {
    const lines: string[] = [
      `# ${report.title}`,
      '',
      `**Generated**: ${report.generatedAt}`,
      `**Overall Score**: ${report.score}/100`,
      '',
      `## Summary`,
      '',
      report.summary,
      '',
      `## Details`,
      '',
      ...report.details,
      '',
    ];

    if (report.issues.length > 0) {
      lines.push('## Issues', '');
      for (const issue of report.issues) {
        lines.push(`- ${issue}`);
      }
      lines.push('');
    } else {
      lines.push('## Issues', '', 'No issues detected.', '');
    }

    if (report.recommendations.length > 0) {
      lines.push('## Recommendations', '');
      for (const rec of report.recommendations) {
        lines.push(`- ${rec}`);
      }
      lines.push('');
    } else {
      lines.push('## Recommendations', '', 'No specific recommendations at this time.', '');
    }

    return lines.join('\n');
  }

  formatReportAsJSON(report: Report): string {
    return JSON.stringify(report, null, 2);
  }

  sendReport(report: Report, email: string): void {
    console.log(`[Report] Sending report "${report.title}" to ${email}`);
    console.log(`[Report] Score: ${report.score}/100, Issues: ${report.issues.length}`);
  }

  private generateSummary(model: string, passRate: number, passed: number, total: number, score: number): string {
    const percentage = (passRate * 100).toFixed(1);
    let verdict: string;

    if (score >= 90) {
      verdict = 'Excellent';
    } else if (score >= 75) {
      verdict = 'Good';
    } else if (score >= 50) {
      verdict = 'Fair';
    } else {
      verdict = 'Needs Improvement';
    }

    return `Beta testing of ${model} completed with ${passed}/${total} tests passing (${percentage}%). Overall assessment: ${verdict} (${score}/100).`;
  }

  private generateRecommendations(testResults: TestReport): string[] {
    const recommendations: string[] = [];

    if (testResults.performance.avgLatency > 3000) {
      recommendations.push('Consider optimizing model response time — average latency exceeds 3 seconds');
    }

    if (testResults.performance.failedRequests > 0) {
      recommendations.push(`Investigate ${testResults.performance.failedRequests} failed requests to improve reliability`);
    }

    if (testResults.performance.avgTokensPerSecond < 20) {
      recommendations.push('Token throughput is below optimal — consider infrastructure scaling');
    }

    const edgeCaseTest = testResults.tests.find((t) => t.name === 'Edge Cases');
    if (edgeCaseTest && edgeCaseTest.passed < edgeCaseTest.total) {
      recommendations.push('Improve handling of edge cases — some inputs caused unexpected behavior');
    }

    const consistencyTest = testResults.tests.find((t) => t.name === 'Consistency');
    if (consistencyTest && consistencyTest.passed < consistencyTest.total) {
      recommendations.push('Investigate response consistency — identical prompts produced varying results');
    }

    const functionalityTest = testResults.tests.find((t) => t.name === 'Functionality');
    if (functionalityTest && functionalityTest.passed < functionalityTest.total) {
      recommendations.push('Review core functionality failures — some basic tasks were not completed correctly');
    }

    if (recommendations.length === 0) {
      recommendations.push('Model performs well across all test categories — continue monitoring in production');
    }

    return recommendations;
  }

  private calculateScore(testResults: TestReport, passRate: number): number {
    let score = passRate * 60;

    if (testResults.performance.avgLatency < 1000) {
      score += 15;
    } else if (testResults.performance.avgLatency < 3000) {
      score += 10;
    } else if (testResults.performance.avgLatency < 5000) {
      score += 5;
    }

    if (testResults.performance.failedRequests === 0) {
      score += 10;
    } else if (testResults.performance.failedRequests <= 2) {
      score += 5;
    }

    score -= Math.min(testResults.issues.length * 3, 15);

    return Math.round(Math.max(0, Math.min(100, score)));
  }
}
