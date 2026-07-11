/**
 * Conversation summarizer (RR customization).
 *
 * Isolates the Anthropic SDK behind one function so the API route stays
 * provider-agnostic. Uses Claude Haiku 4.5 — a WhatsApp conversation
 * summary is a short, high-volume task, so the cheapest capable model is
 * the right default. Reads ANTHROPIC_API_KEY from the environment (the
 * route checks it's present before calling).
 */

import Anthropic from '@anthropic-ai/sdk'

export interface TranscriptLine {
  sender: 'customer' | 'agent'
  text: string
}

const MODEL = 'claude-haiku-4-5'

const SYSTEM_PROMPT = `Você é um assistente de CRM da RR Incorporações, uma incorporadora imobiliária de Curitiba. Recebe a transcrição de uma conversa de WhatsApp entre um corretor/atendente e um cliente ou lead.

Extraia os pontos mais importantes e escreva um resumo curto e objetivo em português do Brasil, para o corretor consultar depois. Use no máximo ~120 palavras. Estruture assim:

Resumo: uma ou duas frases sobre o que o cliente quer.
Pontos-chave:
- (empreendimento/imóvel de interesse, faixa de preço, forma de pagamento, prazo, região — apenas o que aparecer na conversa)
Próximo passo: o que ficou combinado ou o que o corretor deve fazer, se houver.

Não invente informações que não estão na conversa; se algo não foi mencionado, omita a linha. Responda apenas com o resumo, sem preâmbulo.`

/**
 * Summarize a WhatsApp conversation into key points + next step.
 * Throws on API failure (no key, network, rate limit) — the caller maps
 * that to a 502 so the UI can show a retry-able error.
 */
export async function summarizeConversation(
  lines: TranscriptLine[],
): Promise<string> {
  const transcript = lines
    .map((l) => `${l.sender === 'customer' ? 'Cliente' : 'Atendente'}: ${l.text}`)
    .join('\n')

  const client = new Anthropic()
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: transcript }],
  })

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}
