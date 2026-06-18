// ============================================================
// src/tasks/semantic-cache.ts - Caché Semántico con Embeddings
// ============================================================

/**
 * Genera un embedding simple basado en hash del texto.
 * No requiere API externa - usa hashing determinista.
 */
function getEmbedding(text: string): number[] {
  const vector = new Array(100).fill(0);
  const cleanText = text.toLowerCase().replace(/[^a-záéíóúñ0-9\s]/g, '');
  for (let i = 0; i < cleanText.length; i++) {
    vector[i % 100] += cleanText.charCodeAt(i) % 10;
  }
  return vector;
}

/**
 * Calcula la similitud del coseno entre dos vectores.
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }
  return magA && magB ? dotProduct / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
}

interface CacheEntry {
  content: string;
  timestamp: number;
  vector: number[];
}

/**
 * Caché semántico que almacena resultados del LLM
 * y los recupera por similitud semántica.
 */
export class SemanticCache {
  private cache: Map<string, CacheEntry> = new Map();
  private threshold: number;
  private expiryMs: number;

  constructor(threshold = 0.85, expiryMs = 60 * 60 * 1000) {
    this.threshold = threshold;
    this.expiryMs = expiryMs;
  }

  /**
   * Busca un resultado cacheado similar a la query.
   * Si encuentra uno con similitud > threshold y no expirado, lo devuelve.
   */
  async get(query: string): Promise<string | null> {
    const vector = getEmbedding(query);
    const now = Date.now();

    for (const [key, data] of this.cache) {
      if (now - data.timestamp > this.expiryMs) {
        this.cache.delete(key);
        continue;
      }
      if (cosineSimilarity(vector, data.vector) > this.threshold) {
        return data.content;
      }
    }
    return null;
  }

  /**
   * Almacena un resultado en el caché.
   */
  async set(query: string, result: string): Promise<void> {
    this.cache.set(query, {
      content: result,
      timestamp: Date.now(),
      vector: getEmbedding(query),
    });
  }

  /**
   * Limpia entradas expiradas del caché.
   */
  clearExpired(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, data] of this.cache) {
      if (now - data.timestamp > this.expiryMs) {
        this.cache.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Limpia todo el caché.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Devuelve estadísticas del caché.
   */
  getStats(): { size: number; oldestEntry: number | null } {
    let oldest: number | null = null;
    for (const [, data] of this.cache) {
      if (oldest === null || data.timestamp < oldest) {
        oldest = data.timestamp;
      }
    }
    return { size: this.cache.size, oldestEntry: oldest };
  }
}
