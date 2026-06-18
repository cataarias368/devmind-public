// ============================================================
// src/tasks/dynamic-planning.ts - Planificación Dinámica
// ============================================================

import type { TaskResult } from './types.js';

interface PlanStep {
  description: string;
  status: 'pending' | 'completed' | 'failed' | 'skipped';
}

/**
 * Crea planes dinámicos que se adaptan cuando un paso falla.
 * Mantiene historial de planes y permite replanificar automáticamente.
 */
export class DynamicPlanning {
  private plan: PlanStep[] = [];
  private history: Array<{ step: string; result: TaskResult }> = [];

  /**
   * Crea un plan inicial para la tarea dada.
   */
  createPlan(task: string): string[] {
    const lower = task.toLowerCase();

    if (lower.includes('api') || lower.includes('rest') || lower.includes('backend')) {
      this.plan = [
        { description: 'Analizar requerimientos de la API', status: 'pending' },
        { description: 'Diseñar estructura de endpoints', status: 'pending' },
        { description: 'Implementar rutas y controladores', status: 'pending' },
        { description: 'Agregar validación y manejo de errores', status: 'pending' },
        { description: 'Escribir tests', status: 'pending' },
        { description: 'Verificar funcionamiento', status: 'pending' },
      ];
    } else if (lower.includes('ui') || lower.includes('frontend') || lower.includes('componente')) {
      this.plan = [
        { description: 'Analizar diseño requerido', status: 'pending' },
        { description: 'Crear estructura de componentes', status: 'pending' },
        { description: 'Implementar lógica y estado', status: 'pending' },
        { description: 'Agregar estilos', status: 'pending' },
        { description: 'Verificar responsividad', status: 'pending' },
      ];
    } else {
      this.plan = [
        { description: 'Analizar requerimientos', status: 'pending' },
        { description: 'Explorar archivos existentes', status: 'pending' },
        { description: 'Implementar cambios', status: 'pending' },
        { description: 'Verificar resultado', status: 'pending' },
      ];
    }

    return this.plan.map(s => s.description);
  }

  /**
   * Adapta el plan según el resultado de un paso.
   * Si falla, inserta pasos de diagnóstico antes de continuar.
   */
  adapt(step: string, result: TaskResult): string[] {
    this.history.push({ step, result });

    const currentStep = this.plan.find(s => s.description === step);
    if (currentStep) {
      currentStep.status = result.success ? 'completed' : 'failed';
    }

    if (!result.success) {
      const insertIdx = this.plan.findIndex(s => s.description === step);
      if (insertIdx >= 0) {
        const recoverySteps: PlanStep[] = [
          { description: `Diagnosticar error en: ${step}`, status: 'pending' },
          { description: `Intentar enfoque alternativo para: ${step}`, status: 'pending' },
        ];
        this.plan.splice(insertIdx + 1, 0, ...recoverySteps);
      }
    }

    return this.plan.filter(s => s.status === 'pending').map(s => s.description);
  }

  /**
   * Replanifica completamente basándose en el historial de errores.
   */
  replan(): string[] {
    const lastFailed = this.history.filter(h => !h.result.success).pop();
    this.plan = [
      { description: 'Analizar error crítico', status: 'pending' },
      { description: `Corregir fallo en: ${lastFailed?.step || 'paso desconocido'}`, status: 'pending' },
      { description: 'Continuar con el resto del plan', status: 'pending' },
    ];
    return this.plan.map(s => s.description);
  }

  /**
   * Devuelve el plan actual.
   */
  getCurrentPlan(): string[] {
    return this.plan.map(s => `${s.status === 'completed' ? '✅' : s.status === 'failed' ? '❌' : '⏳'} ${s.description}`);
  }
}
