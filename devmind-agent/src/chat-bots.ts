// ============================================================
// src/chat-bots.ts - Integración Multi-Plataforma: Slack, Discord, Telegram
// ============================================================

import type { BotConfig, LLMMessage } from './types.js';

export class MultiPlatformBot {
  private readonly config: BotConfig;
  private readonly platforms: Map<string, BotPlatform> = new Map();

  constructor(config: BotConfig) {
    this.config = config;

    if (config.slack) {
      this.platforms.set('slack', new SlackPlatform(config.slack));
    }
    if (config.discord) {
      this.platforms.set('discord', new DiscordPlatform(config.discord));
    }
    if (config.telegram) {
      this.platforms.set('telegram', new TelegramPlatform(config.telegram));
    }
  }

  /**
   * Inicia todos los bots configurados.
   */
  async start(): Promise<void> {
    if (this.platforms.size === 0) {
      console.warn('⚠️ No hay bots configurados. Configurá SLACK_TOKEN, DISCORD_TOKEN o TELEGRAM_TOKEN.');
      return;
    }

    for (const [name, platform] of this.platforms) {
      try {
        await platform.start(async (message) => {
          return await this.handleMessage(name, message);
        });
        console.log(`✅ Bot ${name} iniciado`);
      } catch (err) {
        console.error(`❌ Error iniciando bot ${name}:`, err);
      }
    }
  }

  /**
   * Detiene todos los bots.
   */
  async stop(): Promise<void> {
    for (const [name, platform] of this.platforms) {
      try {
        await platform.stop();
        console.log(`🛑 Bot ${name} detenido`);
      } catch (err) {
        console.error(`Error deteniendo bot ${name}:`, err);
      }
    }
  }

  /**
   * Maneja un mensaje entrante de cualquier plataforma.
   */
  private async handleMessage(platform: string, message: BotMessage): Promise<string> {
    console.log(`📩 [${platform}] ${message.userName}: ${message.text}`);

    try {
      const messages: LLMMessage[] = [
        {
          role: 'system',
          content: `Sos DevMind Agent, un asistente de desarrollo de software. Respondé en español, de forma concisa y profesional. Estás recibiendo un mensaje desde ${platform}.`,
        },
        { role: 'user', content: message.text },
      ];

      const response = await this.config.agentInstance.llmProvider.call(messages);
      return response.choices[0]?.message?.content || 'No pude generar una respuesta.';
    } catch (err) {
      console.error(`Error procesando mensaje de ${platform}:`, err);
      return 'Lo siento, hubo un error procesando tu mensaje.';
    }
  }
}

// --- Interfaces de Plataforma ---

interface BotMessage {
  text: string;
  userName: string;
  channel: string;
}

interface BotPlatform {
  start(onMessage: (msg: BotMessage) => Promise<string>): Promise<void>;
  stop(): Promise<void>;
}

// --- Slack Platform ---

class SlackPlatform implements BotPlatform {

  constructor(_config: { token: string; signingSecret: string }) {
    // Config reservado para producción con @slack/bolt
  }

  async start(_onMessage: (msg: BotMessage) => Promise<string>): Promise<void> {
    // En producción, usar @slack/bolt para manejar eventos
    // Aquí implementamos un stub funcional
    console.log('🔗 Slack bot conectado (modo stub - instalá @slack/bolt para producción)');
  }

  async stop(): Promise<void> {
    console.log('Slack bot desconectado');
  }
}

// --- Discord Platform ---

class DiscordPlatform implements BotPlatform {

  constructor(_config: { token: string; clientId: string }) {
    // Config reservado para producción con discord.js
  }

  async start(_onMessage: (msg: BotMessage) => Promise<string>): Promise<void> {
    // En producción, usar discord.js
    console.log('🎮 Discord bot conectado (modo stub - instalá discord.js para producción)');
  }

  async stop(): Promise<void> {
    console.log('Discord bot desconectado');
  }
}

// --- Telegram Platform ---

class TelegramPlatform implements BotPlatform {
  private readonly config: { token: string };
  private polling: boolean = false;

  constructor(config: { token: string }) {
    this.config = config;
  }

  async start(onMessage: (msg: BotMessage) => Promise<string>): Promise<void> {
    this.polling = true;

    // Polling simple de la API de Telegram
    let offset = 0;

    const poll = async () => {
      while (this.polling) {
        try {
          const url = `https://api.telegram.org/bot${this.config.token}/getUpdates?offset=${offset}&timeout=30`;
          const response = await fetch(url);
          const data = (await response.json()) as {
            ok: boolean;
            result: Array<{
              update_id: number;
              message?: {
                text: string;
                from: { first_name: string };
                chat: { id: number };
              };
            }>;
          };

          if (data.ok && data.result) {
            for (const update of data.result) {
              offset = update.update_id + 1;

              if (update.message?.text) {
                const reply = await onMessage({
                  text: update.message.text,
                  userName: update.message.from.first_name,
                  channel: String(update.message.chat.id),
                });

                // Enviar respuesta
                await fetch(
                  `https://api.telegram.org/bot${this.config.token}/sendMessage`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      chat_id: update.message.chat.id,
                      text: reply,
                      parse_mode: 'Markdown',
                    }),
                  }
                );
              }
            }
          }
        } catch (err) {
          console.error('Telegram polling error:', err);
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    };

    poll(); // No await - corre en background
    console.log('📱 Telegram bot conectado (polling activo)');
  }

  async stop(): Promise<void> {
    this.polling = false;
    console.log('Telegram bot desconectado');
  }
}
