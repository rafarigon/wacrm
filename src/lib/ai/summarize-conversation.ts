/**
 * Conversation summarizer + contact classifier (RR customization).
 *
 * Isolates the LLM call behind one function so the API route stays
 * provider-agnostic. Uses Google Gemini Flash — the API's free tier costs
 * nothing and needs no credit card, which fits an on-demand summary
 * button. Called via plain fetch (same idiom as waha-api.ts); reads
 * GEMINI_API_KEY from the environment (the route checks it's present
 * before calling).
 *
 * Returns a structured result (responseSchema-enforced JSON) so the route
 * gets both a human-readable summary AND a machine-usable contact
 * category to drive auto-tagging, in a single model call.
 */

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

// gemini-2.5-flash is closed to new API accounts ("no longer available
// to new users") — the account's key was created after the cutoff, so we
// use the current stable flash instead.
const MODEL = 'gemini-3.5-flash'
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

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

// responseSchema (OpenAPI subset, Gemini generationConfig): guarantees
// the response parses into { tipo, resumo } instead of relying on the
// model to format free text.
const OUTPUT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    tipo: { type: 'STRING', enum: CONTACT_CATEGORIES },
    resumo: { type: 'STRING' },
  },
  required: ['tipo', 'resumo'],
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    finishReason?: string
  }>
  error?: { message?: string }
}

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

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY || '',
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: transcript }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: OUTPUT_SCHEMA,
        // Flash 3.x reasons internally before answering and that spends
        // from the SAME output budget — too low a cap returns an empty
        // body with finishReason MAX_TOKENS. 8192 leaves ample headroom;
        // the schema keeps the actual JSON small regardless.
        maxOutputTokens: 8192,
        temperature: 0.2,
      },
    }),
  })

  const data = (await response.json().catch(() => ({}))) as GeminiResponse
  if (!response.ok) {
    throw new Error(data.error?.message || `Gemini API error: ${response.status}`)
  }

  const candidate = data.candidates?.[0]
  const text = (candidate?.content?.parts ?? [])
    .map((p) => p.text ?? '')
    .join('')
    .trim()
  if (!text) {
    throw new Error(
      `Gemini returned an empty response (finishReason: ${candidate?.finishReason ?? 'unknown'}).`,
    )
  }

  const parsed = JSON.parse(text) as ConversationSummary
  const tipo: ContactCategory = CONTACT_CATEGORIES.includes(parsed.tipo)
    ? parsed.tipo
    : 'outros'
  return { tipo, resumo: (parsed.resumo || '').trim() }
}
