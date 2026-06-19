// ============================================================
// src/tasks/parallel-pipeline.ts - Pipeline Paralelo
// ============================================================

/**
 * Ejecuta etapas de un pipeline secuencialmente, donde cada etapa
 * puede procesar datos en paralelo si son iterables.
 */
export class ParallelPipeline {
  /**
   * Ejecuta un pipeline de etapas sobre los datos de entrada.
   * Cada etapa recibe el output de la anterior.
   * Si los datos son un array, cada item se procesa en paralelo.
   */
  async executePipeline(
    stages: Array<(data: unknown) => Promise<unknown>>,
    input: unknown
  ): Promise<unknown[]> {
    let currentData = input;
    const results: unknown[] = [];

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      try {
        if (Array.isArray(currentData)) {
          // Procesar cada item en paralelo
          currentData = await Promise.all(
            currentData.map(item => stage(item).catch(err => ({
              error: err instanceof Error ? err.message : String(err),
              item,
            })))
          );
        } else {
          currentData = await stage(currentData);
        }
        results.push(currentData);
      } catch (err) {
        // Si una etapa falla, capturar error sin detener todo
        results.push({
          error: err instanceof Error ? err.message : String(err),
          stage: i,
        });
        // Continuar con datos parciales
        currentData = currentData;
      }
    }

    return results;
  }
}
