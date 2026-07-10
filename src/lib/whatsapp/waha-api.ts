/**
 * WAHA (WhatsApp HTTP API — github.com/devlikeapro/waha) helpers.
 *
 * Mirrors the conventions of meta-api.ts: every function takes a single
 * options object (named parameters), throws on non-2xx with the server's
 * error message, and returns the provider message id so the caller can
 * persist it to `messages.message_id` exactly like a Meta send.
 *
 * Unlike Meta, WAHA is self-hosted: `baseUrl` points at the instance
 * (e.g. https://waha.example.com) and `apiKey` is its X-Api-Key. A
 * "session" is one connected WhatsApp number.
 */

export interface WahaSendResult {
  messageId: string
}

interface WahaErrorResponse {
  message?: string | string[]
  error?: string
}

async function throwWahaError(response: Response, fallback: string): Promise<never> {
  let message = fallback
  try {
    const data = (await response.json()) as WahaErrorResponse
    if (Array.isArray(data.message)) message = data.message.join('; ')
    else if (data.message) message = data.message
    else if (data.error) message = data.error
  } catch {
    // response body wasn't JSON — keep the fallback
  }
  throw new Error(message)
}

/**
 * WAHA addresses 1:1 chats as `<digits>@c.us`. Accepts a phone in any
 * of the formats the CRM stores (E.164 with or without `+`) and returns
 * the chatId WAHA expects.
 */
export function chatIdFromPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return `${digits}@c.us`
}

/**
 * WAHA returns the sent message in the engine's native shape, so the id
 * lives in a different place per engine (WEBJS: id._serialized, NOWEB:
 * key.id, others: plain id). Try each known location; an empty string
 * means "sent but id unknown" and is safe to persist — status webhooks
 * for it just won't match a row, same as a Meta send that lost its id.
 */
function extractMessageId(data: unknown): string {
  if (!data || typeof data !== 'object') return ''
  const d = data as {
    id?: string | { _serialized?: string }
    key?: { id?: string }
  }
  if (typeof d.id === 'string') return d.id
  if (d.id && typeof d.id === 'object' && typeof d.id._serialized === 'string') {
    return d.id._serialized
  }
  if (d.key && typeof d.key.id === 'string') return d.key.id
  return ''
}

interface WahaRequestArgs {
  baseUrl: string
  apiKey: string
  path: string
  body: Record<string, unknown>
  method?: 'POST' | 'PUT'
}

async function wahaRequest(args: WahaRequestArgs): Promise<unknown> {
  const { baseUrl, apiKey, path, body, method = 'POST' } = args
  const url = `${baseUrl.replace(/\/+$/, '')}${path}`
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    await throwWahaError(response, `WAHA API error: ${response.status}`)
  }
  // 200/201 with JSON body; some endpoints return an empty body.
  try {
    return await response.json()
  } catch {
    return null
  }
}

export interface WahaSendTextArgs {
  baseUrl: string
  apiKey: string
  session: string
  to: string
  text: string
  /** Provider message id of the message being replied to. WAHA renders
   *  the new message as a quote-reply, same as Meta's `context`. */
  contextMessageId?: string
}

/**
 * Send a free-form WhatsApp text message via WAHA. No 24-hour window
 * applies — WAHA speaks the consumer protocol, not the Cloud API.
 */
export async function sendTextMessage(
  args: WahaSendTextArgs
): Promise<WahaSendResult> {
  const { baseUrl, apiKey, session, to, text, contextMessageId } = args
  if (!text) throw new Error('sendTextMessage requires text.')
  const body: Record<string, unknown> = {
    session,
    chatId: chatIdFromPhone(to),
    text,
  }
  if (contextMessageId) body.reply_to = contextMessageId
  const data = await wahaRequest({ baseUrl, apiKey, path: '/api/sendText', body })
  return { messageId: extractMessageId(data) }
}

export type WahaMediaKind = 'image' | 'video' | 'document'

export interface WahaSendMediaArgs {
  baseUrl: string
  apiKey: string
  session: string
  to: string
  kind: WahaMediaKind
  /** Public URL WAHA fetches at send time — same contract as Meta's `link`. */
  link: string
  caption?: string
  /** Document-only. Shown in the recipient's chat as the file name. */
  filename?: string
  contextMessageId?: string
}

/**
 * Send an image, video, or document via a URL the WAHA server can reach.
 * Endpoint differs per kind (sendImage / sendVideo / sendFile); the
 * payload shape is shared.
 */
export async function sendMediaMessage(
  args: WahaSendMediaArgs
): Promise<WahaSendResult> {
  const { baseUrl, apiKey, session, to, kind, link, caption, filename, contextMessageId } = args
  if (!link) throw new Error('sendMediaMessage requires a link.')

  const path =
    kind === 'image' ? '/api/sendImage'
    : kind === 'video' ? '/api/sendVideo'
    : '/api/sendFile'

  const file: Record<string, unknown> = { url: link }
  if (kind === 'document' && filename) file.filename = filename

  const body: Record<string, unknown> = {
    session,
    chatId: chatIdFromPhone(to),
    file,
  }
  if (caption) body.caption = caption
  if (contextMessageId) body.reply_to = contextMessageId

  const data = await wahaRequest({ baseUrl, apiKey, path, body })
  return { messageId: extractMessageId(data) }
}

export interface WahaSetReactionArgs {
  baseUrl: string
  apiKey: string
  session: string
  /** Provider message id of the message being reacted to. */
  messageId: string
  /** Emoji to set; empty string removes the reaction (same as Meta). */
  emoji: string
}

/** Set or remove a reaction on a message. */
export async function setReaction(args: WahaSetReactionArgs): Promise<void> {
  const { baseUrl, apiKey, session, messageId, emoji } = args
  if (!messageId) throw new Error('setReaction requires messageId.')
  await wahaRequest({
    baseUrl,
    apiKey,
    path: '/api/reaction',
    method: 'PUT',
    body: { session, messageId, reaction: emoji },
  })
}
