// ============================================================
// src/tasks/improvement-suggestions.ts - Sugerencias de Mejora
// ============================================================

import type { SelfEvaluator } from './self-evaluation.js';

/**
 * Analiza los resultados del agente y genera sugerencias
 * concretas para mejorar el rendimiento.
 */
export class ImprovementSuggestions {
  /**
   * Genera sugerencias basadas en las métricas de evaluación.
   */
  async suggest(evaluator: SelfEvaluator): Promise<string[]> {
    const { score, details } = await evaluator.evaluate();
    const suggestions: string[] = [];

    if (score === 'no-data') {
      suggestions.push('Ejecutá algunas tareas para generar datos de rendimiento.');
      return suggestions;
    }

    // Verificar tasa de éxito
    if (details.successRate < 0.8) {
      suggestions.push('La tasa de éxito es baja (<80%). Usá Chain of Verification para validar resultados antes de continuar.');
    }

    if (details.successRate < 0.5) {
      suggestions.push('Tasa de éxito crítica (<50%). Considerá usar un modelo más potente o simplificar la tarea.');
    }

    // Verificar pasos excesivos
    if (details.avgSteps > 20) {
      suggestions.push('Promedio de pasos alto (>20). Considerá usar Tree of Thoughts para explorar múltiples caminos.');
    }

    if (details.avgSteps > 30) {
      suggestions.push('Ejecución muy larga (>30 pasos). Usá batch processing para operaciones similares.');
    }

    // Verificar tiempo
    if (details.avgTime > 30000) {
      suggestions.push('Tiempo de ejecución alto (>30s). Considerá procesar operaciones en paralelo.');
    }

    // Verificar tokens
    if (details.avgTokens > 8000) {
      suggestions.push('Uso de tokens alto. Activá compresión de contexto y caché semántico para reducir costos.');
    }

    // Sugerencias generales según score
    if (score === 'needs-improvement') {
      suggestions.push('Revisá los errores más frecuentes y agregá herramientas específicas para esos casos.');
    }

    if (suggestions.length === 0) {
      suggestions.push('El rendimiento es bueno. Considerá registrar aprendizajes en la memoria episódica.');
    }

    return suggestions;
  }
}
