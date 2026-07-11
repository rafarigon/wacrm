import crypto from 'node:crypto'
import type { WhatsAppMessage } from '@/lib/whatsapp/inbound'

/**
 * WAHA webhook event translation.
 *
 * WAHA (github.com/devlikeapro/waha) POSTs events like:
 *
 *   { "event": "message", "session": "default", "payload": { ... } }
 *
 * The payload is the engine's message shape, which differs from Meta's
 * Cloud API webhook. Everything here is pure translation: WAHA event in,
 * Meta-shaped `WhatsAppMessage` (or a status update) out, so the shared
 * pipeline in src/lib/whatsapp/inbound.ts runs unchanged for both
 * providers.
 */

export interface WahaWebhookEvent {
  event: string
  session: string
  payload: Record<string, unknown>
}

/**
 * Verify the HMAC-SHA512 signature WAHA attaches to webhook POSTs
 * (`X-Webhook-Hmac: <hex>`, enabled by setting `hmac.key` on the
 * webhook config).
 *
 * Contract mirrors verifyMetaWebhookSignature: `WAHA_WEBHOOK_HMAC_KEY`
 * is **required** and we fail closed without it — an unauthenticated
 * webhook would let anyone inject fabricated messages into the inbox.
 */
export function verifyWahaWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const key = process.env.WAHA_WEBHOOK_HMAC_KEY
  if (!key) {
    console.error(
      '[waha-webhook] WAHA_WEBHOOK_HMAC_KEY is not set — rejecting request. ' +
        'Set the same key on the WAHA webhook config (hmac.key) and in this env var.',
    )
    return false
  }

  if (!signatureHeader) return false

  const expected = crypto
    .createHmac('sha512', key)
    .update(rawBody)
    .digest('hex')

  const a = Buffer.from(signatureHeader)
  const b = Buffer.from(expected)
  // Bail if lengths differ — timingSafeEqual throws otherwise.
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/** `5541992884412@c.us` → `5541992884412`. Returns null for non-1:1
 *  chat ids (groups `@g.us`, `status@broadcast`, lids). */
function digitsFromChatId(chatId: unknown): string | null {
  if (typeof chatId !== 'string') return null
  if (!chatId.endsWith('@c.us') && !chatId.endsWith('@s.whatsapp.net')) return null
  const digits = chatId.split('@')[0].replace(/\D/g, '')
  return digits.length > 0 ? digits : null
}

/** Best-effort display name across engines (NOWEB pushName, WEBJS
 *  notifyName). Falls back to the phone digits like the Meta path
 *  falls back in findOrCreateContact. */
function displayNameFromPayload(payload: Record<string, unknown>): string {
  const data = payload._data as Record<string, unknown> | undefined
  const candidates = [
    data?.pushName,
    data?.notifyName,
    (payload as { notifyName?: unknown }).notifyName,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return ''
}

/** WAHA ack levels → the messages.status CHECK-constraint values the
 *  Meta path already writes. PENDING maps to null (nothing to record —
 *  the row is already 'sent' from our own insert). */
export function mapAckToStatus(
  ack: unknown,
  ackName: unknown,
): 'failed' | 'sent' | 'delivered' | 'read' | null {
  const name = typeof ackName === 'string' ? ackName.toUpperCase() : ''
  switch (name) {
    case 'ERROR': return 'failed'
    case 'SERVER': return 'sent'
    case 'DEVICE': return 'delivered'
    case 'READ': return 'read'
    case 'PLAYED': return 'read'
  }
  switch (typeof ack === 'number' ? ack : NaN) {
    case -1: return 'failed'
    case 1: return 'sent'
    case 2: return 'delivered'
    case 3: return 'read'
    case 4: return 'read'
    default: return null
  }
}

export type WahaTranslation =
  | {
      kind: 'message'
      message: WhatsAppMessage
      contact: { profile: { name: string }; wa_id: string }
    }
  | {
      kind: 'status'
      status: { id: string; status: string; timestamp: string; recipient_id: string }
    }
  | { kind: 'ignored'; reason: string }

/**
 * Translate one WAHA webhook event into the Meta shapes the shared
 * inbound pipeline consumes. Returns `ignored` (with a log-friendly
 * reason) for everything the CRM deliberately doesn't process: our own
 * outbound echoes (fromMe), group chats, unknown event types.
 */
export function translateWahaEvent(event: WahaWebhookEvent): WahaTranslation {
  const payload = event.payload
  if (!payload || typeof payload !== 'object') {
    return { kind: 'ignored', reason: 'missing payload' }
  }

  if (event.event === 'message.ack') {
    if (payload.fromMe === false) {
      return { kind: 'ignored', reason: 'ack for inbound message' }
    }
    const status = mapAckToStatus(payload.ack, payload.ackName)
    if (!status) return { kind: 'ignored', reason: 'ack level not tracked' }
    const recipient =
      digitsFromChatId(payload.to) ?? digitsFromChatId(payload.from)
    const ts =
      typeof payload.timestamp === 'number'
        ? payload.timestamp
        : Math.floor(Date.now() / 1000)
    if (typeof payload.id !== 'string' || !payload.id) {
      return { kind: 'ignored', reason: 'ack without message id' }
    }
    return {
      kind: 'status',
      status: {
        id: payload.id,
        status,
        timestamp: String(ts),
        recipient_id: recipient ?? '',
      },
    }
  }

  if (event.event !== 'message' && event.event !== 'message.reaction') {
    return { kind: 'ignored', reason: `unhandled event: ${event.event}` }
  }

  if (payload.fromMe === true) {
    return { kind: 'ignored', reason: 'own outbound echo (fromMe)' }
  }

  const waId = digitsFromChatId(payload.from)
  if (!waId) {
    return { kind: 'ignored', reason: 'not a 1:1 chat (group/broadcast)' }
  }
  if (typeof payload.id !== 'string' || !payload.id) {
    return { kind: 'ignored', reason: 'message without id' }
  }

  const timestamp = String(
    typeof payload.timestamp === 'number'
      ? payload.timestamp
      : Math.floor(Date.now() / 1000),
  )

  const contact = {
    profile: { name: displayNameFromPayload(payload) },
    wa_id: waId,
  }

  // Reactions — WAHA delivers them as a dedicated event with the target
  // message id; Meta delivers type='reaction'. Same downstream handling.
  if (event.event === 'message.reaction') {
    const reaction = payload.reaction as
      | { text?: unknown; messageId?: unknown }
      | undefined
    if (!reaction || typeof reaction.messageId !== 'string') {
      return { kind: 'ignored', reason: 'reaction without target id' }
    }
    return {
      kind: 'message',
      contact,
      message: {
        id: payload.id,
        from: waId,
        timestamp,
        type: 'reaction',
        reaction: {
          message_id: reaction.messageId,
          emoji: typeof reaction.text === 'string' ? reaction.text : '',
        },
      },
    }
  }

  const base: WhatsAppMessage = {
    id: payload.id,
    from: waId,
    timestamp,
    type: 'text',
    text: { body: typeof payload.body === 'string' ? payload.body : '' },
  }

  // Swipe-reply context. Newer WAHA versions put the quoted message on
  // payload.replyTo ({ id, ... }); older ones used a plain id string.
  const replyTo = payload.replyTo as { id?: unknown } | string | undefined
  const replyToId =
    typeof replyTo === 'string'
      ? replyTo
      : replyTo && typeof replyTo === 'object' && typeof replyTo.id === 'string'
        ? replyTo.id
        : null
  if (replyToId) base.context = { id: replyToId }

  // Location (engines that surface it as a structured field).
  const location = payload.location as
    | { latitude?: unknown; longitude?: unknown; name?: unknown; address?: unknown }
    | undefined
  if (
    location &&
    typeof location.latitude === 'number' &&
    typeof location.longitude === 'number'
  ) {
    return {
      kind: 'message',
      contact,
      message: {
        ...base,
        type: 'location',
        text: undefined,
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          name: typeof location.name === 'string' ? location.name : undefined,
          address: typeof location.address === 'string' ? location.address : undefined,
        },
      },
    }
  }

  // Media — WAHA has already downloaded it and serves it from its own
  // /api/files/<session>/<file> URL (behind its API key, on its internal
  // host). Rewrite that to our same-origin proxy so the browser can load
  // it with the user's session. message.type still drives the
  // content_type mapping.
  const media = payload.media as
    | { url?: unknown; mimetype?: unknown; filename?: unknown }
    | undefined
  if (media && typeof media.url === 'string' && media.url) {
    const proxied = wahaMediaProxyUrl(media.url)
    if (proxied) {
      const mime = typeof media.mimetype === 'string' ? media.mimetype : ''
      const type =
        mime.startsWith('image/') ? 'image'
        : mime.startsWith('video/') ? 'video'
        : mime.startsWith('audio/') ? 'audio'
        : 'document'
      return {
        kind: 'message',
        contact,
        message: {
          ...base,
          type,
          text: undefined,
          direct_media: {
            url: proxied,
            mime_type: mime,
            caption: typeof payload.body === 'string' && payload.body ? payload.body : undefined,
            filename: typeof media.filename === 'string' ? media.filename : undefined,
          },
        },
      }
    }
  }

  return { kind: 'message', contact, message: base }
}

/**
 * Turn a WAHA media URL (`http://<host>/api/files/<session>/<file>`)
 * into our same-origin proxy path (`/api/whatsapp/waha-media?f=<session>/<file>`).
 * The proxy fetches the file from WAHA with the API key server-side.
 * Returns null when the URL isn't a recognizable WAHA files URL.
 */
export function wahaMediaProxyUrl(url: string): string | null {
  const marker = '/api/files/'
  const i = url.indexOf(marker)
  if (i === -1) return null
  const rel = url.slice(i + marker.length)
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(rel)) return null
  return `/api/whatsapp/waha-media?f=${rel}`
}
