import { NextResponse, after } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { decrypt } from '@/lib/whatsapp/encryption'
import { getLidPhoneNumber } from '@/lib/whatsapp/waha-api'
import { processMessage, handleStatusUpdate } from '@/lib/whatsapp/inbound'
import {
  translateWahaEvent,
  verifyWahaWebhookSignature,
  type WahaWebhookEvent,
} from '@/lib/whatsapp/waha-events'

// POST - Receive WAHA events (message, message.reaction, message.ack).
//
// Mirrors the Meta webhook route: verify the signature on the raw
// bytes, ack fast, process asynchronously. Tenancy is resolved by the
// WAHA session name — each connected number is one session, and the
// whatsapp_config row that owns it stores the name in `waha_session`
// (unique index in migration 025).
export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-webhook-hmac')

  if (!verifyWahaWebhookSignature(rawBody, signature)) {
    console.warn('[waha-webhook] rejected request with invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: WahaWebhookEvent
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // after() (not fire-and-forget) — on Vercel the serverless instance
  // freezes as soon as the response is sent, killing detached promises.
  // after() keeps the function alive until processing completes.
  after(() =>
    processEvent(event).catch((error) => {
      console.error('[waha-webhook] error processing event:', error)
    }),
  )

  return NextResponse.json({ status: 'received' }, { status: 200 })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WhatsAppConfigRow = any

/**
 * Resolve the whatsapp_config row that owns a WAHA session. Exactly one
 * row per session name — the unique index from migration 025 makes >1 a
 * data corruption worth logging loudly.
 */
async function findConfigBySession(
  session: string,
): Promise<WhatsAppConfigRow | null> {
  const { data: configRows, error: configError } = await supabaseAdmin()
    .from('whatsapp_config')
    .select('*')
    .eq('provider', 'waha')
    .eq('waha_session', session)

  if (configError) {
    console.error(
      '[waha-webhook] error fetching whatsapp_config for session:',
      session,
      configError,
    )
    return null
  }
  if (!configRows || configRows.length === 0) {
    console.error('[waha-webhook] no config found for session:', session)
    return null
  }
  if (configRows.length > 1) {
    console.error(
      `[waha-webhook] multiple configs (${configRows.length}) for session:`,
      session,
      '— inbound message dropped. The unique index on waha_session should prevent this.',
    )
    return null
  }
  return configRows[0]
}

async function processEvent(event: WahaWebhookEvent) {
  let config: WhatsAppConfigRow | null = null

  // WhatsApp hides some senders behind anonymous LID addresses
  // (`NNN@lid`). The shared pipeline keys contacts by phone number, so
  // resolve the real chat id via WAHA's lid mapping BEFORE translation
  // (which would otherwise reject the event as "not a 1:1 chat").
  // Ack events never read the sender number — skip the lookup there.
  const payloadFrom = (event.payload as { from?: unknown } | undefined)?.from
  if (
    event.event !== 'message.ack' &&
    typeof payloadFrom === 'string' &&
    payloadFrom.endsWith('@lid')
  ) {
    config = await findConfigBySession(event.session)
    if (!config) return
    if (!config.waha_url) {
      console.error('[waha-webhook] waha_url missing on config — cannot resolve LID')
      return
    }
    const pn = await getLidPhoneNumber({
      baseUrl: config.waha_url,
      apiKey: decrypt(config.access_token),
      session: event.session,
      lid: payloadFrom,
    }).catch(() => null)
    if (!pn) {
      console.warn('[waha-webhook] LID without known mapping, event dropped:', payloadFrom)
      return
    }
    ;(event.payload as { from?: unknown }).from = pn
  }

  const translation = translateWahaEvent(event)

  if (translation.kind === 'ignored') {
    // Routine — fromMe echoes and group chatter land here. Log at debug
    // volume only for genuinely unhandled events.
    if (translation.reason.startsWith('unhandled event')) {
      console.warn('[waha-webhook]', translation.reason)
    }
    return
  }

  if (translation.kind === 'status') {
    await handleStatusUpdate(translation.status)
    return
  }

  // Inbound message — resolve the owning account by session name
  // (reuses the row already fetched for LID resolution when present).
  if (!config) config = await findConfigBySession(event.session)
  if (!config) return

  // accessToken is only used by the Meta media-verification path, which
  // direct_media bypasses — pass an empty string.
  await processMessage(
    translation.message,
    translation.contact,
    config.account_id,
    config.user_id,
    '',
  )
}
