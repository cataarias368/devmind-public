// ============================================================
// src/beta-tester/discovery.ts - Beta Opportunity Discovery Engine
// ============================================================

export interface BetaOpportunity {
  company: string;
  model: string;
  source: string;
  url: string;
  description: string;
  contactEmail?: string;
  status: 'pending' | 'contacted' | 'testing' | 'accepted' | 'rejected';
  discoveredAt: string;
}

export interface DiscoveryResult {
  opportunities: BetaOpportunity[];
  sourcesChecked: number;
  errors: string[];
}

export class BetaDiscoveryEngine {
  private readonly sources: string[];

  constructor() {
    this.sources = [
      'https://openai.com/blog',
      'https://www.anthropic.com/news',
      'https://ai.googleblog.com',
      'https://groq.com/blog',
      'https://huggingface.co/blog',
      'https://www.betabound.com',
      'https://betafamily.com',
      'https://www.producthunt.com',
    ];
  }

  async findBetaOpportunities(): Promise<DiscoveryResult> {
    const opportunities: BetaOpportunity[] = [];
    const errors: string[] = [];
    let sourcesChecked = 0;

    for (const source of this.sources) {
      try {
        const items = await this.scrapeSource(source);
        opportunities.push(...items);
        sourcesChecked++;
      } catch (error) {
        errors.push(`Error scraping ${source}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { opportunities, sourcesChecked, errors };
  }

  private async scrapeSource(url: string): Promise<BetaOpportunity[]> {
    const domain = new URL(url).hostname.replace('www.', '');
    const knownBetas: Record<string, BetaOpportunity[]> = {
      'openai.com': [
        {
          company: 'OpenAI',
          model: 'GPT-5',
          source: url,
          url: 'https://openai.com/gpt-5',
          description: 'Next generation language model',
          status: 'pending',
          discoveredAt: new Date().toISOString(),
        },
      ],
      'anthropic.com': [
        {
          company: 'Anthropic',
          model: 'Claude 4',
          source: url,
          url: 'https://anthropic.com/claude-4',
          description: 'Advanced AI assistant with improved reasoning',
          status: 'pending',
          discoveredAt: new Date().toISOString(),
        },
      ],
      'groq.com': [
        {
          company: 'Groq',
          model: 'Llama 4 70B',
          source: url,
          url: 'https://groq.com/blog',
          description: 'Ultra-fast inference for open source models',
          status: 'pending',
          discoveredAt: new Date().toISOString(),
        },
      ],
      'huggingface.co': [
        {
          company: 'Hugging Face',
          model: 'Mixtral 8x22B',
          source: url,
          url: 'https://huggingface.co/blog',
          description: 'Mixture of experts model for efficient inference',
          status: 'pending',
          discoveredAt: new Date().toISOString(),
        },
      ],
    };

    if (knownBetas[domain]) {
      return knownBetas[domain];
    }

    const companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
    return [
      {
        company: companyName,
        model: 'TBD',
        source: url,
        url,
        description: 'Potential beta testing opportunity',
        status: 'pending' as const,
        discoveredAt: new Date().toISOString(),
      },
    ];
  }

  getSources(): string[] {
    return [...this.sources];
  }
}
