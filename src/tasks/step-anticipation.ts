// ============================================================
// src/tasks/step-anticipation.ts - Anticipación de Pasos
// ============================================================

import type { LLMProvider } from './types.js';

interface Prediction {
  step: string;
  confidence: number;
}

/**
 * Predice los próximos pasos basándose en el estado actual y la tarea.
 * Usa LLM cuando está disponible, o heurísticas por palabras clave como fallback.
 */
export class StepAnticipator {
  /** Historial de predicciones para análisis posterior */
  private predictionLog: Array<{ predicted: string; actual: string; correct: boolean }> = [];

  /**
   * Devuelve el historial de predicciones.
   */
  getPredictionHistory(): Array<{ predicted: string; actual: string; correct: boolean }> {
    return this.predictionLog;
  }

  /**
   * Predice los próximos 3 pasos basándose en el estado actual.
   */
  async anticipateNextStep(
    currentState: string,
    task: string,
    llmProvider?: LLMProvider
  ): Promise<Prediction[]> {
    try {
      if (llmProvider) {
        const response = await llmProvider.call([
          {
            role: 'system',
            content: 'Sos un planificador de tareas de software. Predecí los próximos 3 pasos. Respondé en JSON: [{"step":"...","confidence":0.8}]',
          },
          {
            role: 'user',
            content: `Estado actual: ${currentState}\nTarea: ${task}\nPredecí los próximos 3 pasos.`,
          },
        ]);

        const respObj = response as { choices: Array<{ message: { content: string } }> };
        const content = respObj.choices?.[0]?.message?.content || '';
        const cleaned = content.replace(/```json\n?|```/g, '').trim();

        try {
          return JSON.parse(cleaned) as Prediction[];
        } catch {
          // Fall through to heuristic
        }
      }

      // Fallback: predicción por palabras clave
      return this.heuristicPrediction(task);
    } catch {
      return [{ step: 'Continuar ejecución', confidence: 0.5 }];
    }
  }

  /**
   * Valida si una predicción coincide con lo que realmente pasó.
   */
  validatePrediction(prediction: string, actual: string): boolean {
    const predWords = prediction.toLowerCase().split(/\s+/);
    const actWords = actual.toLowerCase().split(/\s+/);
    const intersection = predWords.filter(w => actWords.includes(w)).length;
    const union = new Set([...predWords, ...actWords]).size;
    return union > 0 ? intersection / union > 0.5 : false;
  }

  /**
   * Predicción heurística basada en palabras clave.
   */
  private heuristicPrediction(task: string): Prediction[] {
    const lower = task.toLowerCase();
    const predictions: Prediction[] = [];

    if (lower.includes('error') || lower.includes('fix') || lower.includes('bug')) {
      predictions.push({ step: 'Analizar logs de error', confidence: 0.8 });
      predictions.push({ step: 'Revisar trazas de pila', confidence: 0.7 });
      predictions.push({ step: 'Aplicar corrección', confidence: 0.6 });
    } else if (lower.includes('implementar') || lower.includes('crear') || lower.includes('codificar')) {
      predictions.push({ step: 'Revisar archivos existentes', confidence: 0.8 });
      predictions.push({ step: 'Crear nuevos archivos', confidence: 0.7 });
      predictions.push({ step: 'Verificar implementación', confidence: 0.6 });
    } else if (lower.includes('test') || lower.includes('prueba')) {
      predictions.push({ step: 'Ejecutar tests existentes', confidence: 0.8 });
      predictions.push({ step: 'Analizar resultados', confidence: 0.7 });
      predictions.push({ step: 'Corregir fallos si los hay', confidence: 0.6 });
    } else {
      predictions.push({ step: 'Analizar requerimientos', confidence: 0.7 });
      predictions.push({ step: 'Planificar ejecución', confidence: 0.6 });
      predictions.push({ step: 'Ejecutar plan', confidence: 0.5 });
    }

    return predictions;
  }
}
