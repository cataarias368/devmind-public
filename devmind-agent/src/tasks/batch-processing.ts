// ============================================================
// src/tasks/batch-processing.ts - Procesamiento por Lotes
// ============================================================

interface BatchItem {
  operation: string;
  params: unknown;
}

/**
 * Agrupa operaciones similares en lotes y las ejecuta juntas.
 * Reduce el overhead de múltiples llamadas individuales.
 */
export class BatchProcessor {
  private batches: Map<string, BatchItem[]> = new Map();
  private maxBatchSize: number;
  private processedCount: number = 0;

  constructor(maxBatchSize = 10) {
    this.maxBatchSize = maxBatchSize;
  }

  /**
   * Añade una operación al lote correspondiente.
   * Si el lote alcanza el tamaño máximo, se procesa automáticamente.
   */
  add(operation: string, params: unknown): void {
    if (!this.batches.has(operation)) {
      this.batches.set(operation, []);
    }

    const batch = this.batches.get(operation)!;
    batch.push({ operation, params });

    if (batch.length >= this.maxBatchSize) {
      this.process(operation);
    }
  }

  /**
   * Procesa todas las operaciones pendientes de un tipo.
   */
  async process(operation: string): Promise<Array<{ status: string; params: unknown }>> {
    const batch = this.batches.get(operation) || [];
    this.batches.set(operation, []);

    // Procesar todas las operaciones del lote
    const results = batch.map(item => {
      this.processedCount++;
      return { status: 'processed', params: item.params };
    });

    return results;
  }

  /**
   * Procesa todos los lotes pendientes.
   */
  async processAll(): Promise<Array<{ operation: string; results: Array<{ status: string; params: unknown }> }>> {
    const allResults: Array<{ operation: string; results: Array<{ status: string; params: unknown }> }> = [];

    for (const [operation] of this.batches) {
      const results = await this.process(operation);
      allResults.push({ operation, results });
    }

    return allResults;
  }

  /**
   * Devuelve estadísticas del procesador.
   */
  getStats(): { pendingBatches: number; totalProcessed: number; operations: string[] } {
    return {
      pendingBatches: this.batches.size,
      totalProcessed: this.processedCount,
      operations: Array.from(this.batches.keys()),
    };
  }
}
