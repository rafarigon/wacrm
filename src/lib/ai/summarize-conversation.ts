/**
 * Conversation summarizer + contact classifier (RR customization).
 *
 * Isolates the Anthropic SDK behind one function so the API route stays
 * provider-agnostic. Uses Claude Haiku 4.5 — a WhatsApp conversation
 * summary is a short, high-volume task, so the cheapest capable model is
 * the right default. Reads ANTHROPIC_API_KEY from the environment (the
 * route checks it's present before calling).
 *
 * Returns a structured result (JSON schema output) so the route gets both
 * a human-readable summary AND a machine-usable contact category to drive
 * auto-tagging, in a single model call.
 */

import Anthropic from '@anthropic-ai/sdk'

export interface TranscriptLine {
  sender: 'customer' | 'agent'
  text: string
}

/** Contact classification, used to apply the matching CRM tag. */
export type ContactCategory = 'cliente' | 'corretor' | 'fornecedor' | 'outros'

export const CONTACT_CATEGORIES: ContactCategory[] = [
  'cliente',
  'corretor',
  'fornecedor',
  'outros',
]

export interface ConversationSummary {
  tipo: ContactCategory
  resumo: string
}

const MODEL = 'claude-haiku-4-5'

const SYSTEM_PROMPT = `Você é um assistente de CRM da RR Incorporações, uma incorporadora imobiliária de Curitiba. Recebe a transcrição de uma conversa de WhatsApp entre um corretor/atendente e um contato.

Faça duas coisas:

1) Classifique o contato em UMA categoria (campo "tipo"):
- "cliente": pessoa interessada em comprar/alugar um imóvel — tira dúvidas sobre empreendimentos, valores, financiamento, visita, disponibilidade.
- "corretor": corretor de imóveis ou parceiro imobiliário — fala de parceria, comissão, permuta, indicação/repasse de clientes entre profissionais.
- "fornecedor": prestador de serviço ou fornecedor — obra, materiais, marketing, jurídico, cobrança de pagamento a receber, propostas comerciais para a RR.
- "outros": qualquer outro caso (pessoal, spam, indefinido ou sem sinais suficientes).
Escolha pelo conteúdo da conversa; na dúvida entre cliente e outros, prefira "outros".

2) Escreva o resumo (campo "resumo") em português do Brasil, no máximo ~120 palavras, para o corretor consultar depois. Estruture assim:
Resumo: uma ou duas frases sobre o que o contato quer.
Pontos-chave:
- (empreendimento/imóvel de interesse, faixa de preço, forma de pagamento, prazo, região — apenas o que aparecer na conversa)
Próximo passo: o que ficou combinado ou o que o corretor deve fazer, se houver.

Não invente informações que não estão na conversa; se algo não foi mencionado, omita a linha.`

// JSON-schema structured output: guarantees the response parses into
// { tipo, resumo } instead of relying on the model to format free text.
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    tipo: {
      type: 'string',
      enum: CONTACT_CATEGORIES,
    },
    resumo: { type: 'string' },
  },
  required: ['tipo', 'resumo'],
  additionalProperties: false,
} as const

/**
 * Summarize + classify a WhatsApp conversation. Throws on API failure
 * (no key, network, rate limit) — the caller maps that to a 502 so the UI
 * can show a retry-able error.
 */
export async function summarizeConversation(
  lines: TranscriptLine[],
): Promise<ConversationSummary> {
  const transcript = lines
    .map((l) => `${l.sender === 'customer' ? 'Cliente' : 'Atendente'}: ${l.text}`)
    .join('\n')

  const client = new Anthropic()
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    output_config: {
      format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
    },
    messages: [{ role: 'user', content: transcript }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  const parsed = JSON.parse(text) as ConversationSummary
  const tipo: ContactCategory = CONTACT_CATEGORIES.includes(parsed.tipo)
    ? parsed.tipo
    : 'outros'
  return { tipo, resumo: (parsed.resumo || '').trim() }
}
