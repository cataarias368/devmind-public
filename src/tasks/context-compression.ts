// ============================================================
// src/tasks/context-compression.ts - Compresión de Contexto
// ============================================================

import type { AgentMessage, LLMProvider } from './types.js';

/**
 * Comprime el contexto de mensajes manteniendo los más recientes
 * y resumiendo los antiguos para reducir uso de tokens.
 */
export async function compressContext(
  messages: AgentMessage[],
  llmProvider?: LLMProvider
): Promise<AgentMessage[]> {
  if (messages.length <= 10) return messages;

  // Mantener siempre los últimos 10 mensajes sin comprimir
  const recentMessages = messages.slice(-10);

  // Identificar mensajes antiguos
  const oldMessages = messages.slice(0, messages.length - 10);

  // Filtrar mensajes importantes que no se deben perder
  const importantMessages = oldMessages.filter(msg => {
    const content = msg.content.toLowerCase();
    return (
      msg.role === 'system' ||
      content.includes('error') ||
      content.includes('fail') ||
      content.includes('✅') ||
      content.includes('🔒') ||
      content.includes('critique') ||
      content.includes('objetivo') ||
      content.includes('decisión')
    );
  });

  if (importantMessages.length === 0) return [...recentMessages];

  try {
    // Intentar usar LLM para generar resumen
    if (llmProvider) {
      const summaryPrompt = `Resumí estos mensajes brevemente manteniendo objetivos, decisiones y errores clave:\n${
        importantMessages.map(m => `${m.role}: ${m.content.slice(0, 200)}`).join('\n')
      }`;

      const response = await llmProvider.call([
        { role: 'user', content: summaryPrompt }
      ]);
      const respObj = response as { choices: Array<{ message: { content: string } }> };
      const summary = respObj.choices?.[0]?.message?.content || '';

      if (summary) {
        return [
          { role: 'system', content: `[RESUMEN DE CONTEXTO] ${summary}`, timestamp: Date.now() },
          ...recentMessages,
        ];
      }
    }

    // Fallback: resumen manual sin LLM
    const manualSummary = importantMessages
      .slice(-5)
      .map(m => `${m.role}: ${m.content.slice(0, 100)}...`)
      .join(' | ');

    return [
      { role: 'system', content: `[RESUMEN] ${manualSummary}`, timestamp: Date.now() },
      ...recentMessages,
    ];
  } catch (error) {
    console.error('Error comprimiendo contexto:', error);
    return [...recentMessages];
  }
}
