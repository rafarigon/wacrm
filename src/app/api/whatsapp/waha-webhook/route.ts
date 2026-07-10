import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
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

  processEvent(event).catch((error) => {
    console.error('[waha-webhook] error processing event:', error)
  })

  return NextResponse.json({ status: 'received' }, { status: 200 })
}

async function processEvent(event: WahaWebhookEvent) {
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

  // Inbound message — resolve the owning account by session name.
  const { data: configRows, error: configError } = await supabaseAdmin()
    .from('whatsapp_config')
    .select('*')
    .eq('provider', 'waha')
    .eq('waha_session', event.session)

  if (configError) {
    console.error(
      '[waha-webhook] error fetching whatsapp_config for session:',
      event.session,
      configError,
    )
    return
  }
  if (!configRows || configRows.length === 0) {
    console.error('[waha-webhook] no config found for session:', event.session)
    return
  }
  if (configRows.length > 1) {
    console.error(
      `[waha-webhook] multiple configs (${configRows.length}) for session:`,
      event.session,
      '— inbound message dropped. The unique index on waha_session should prevent this.',
    )
    return
  }

  const config = configRows[0]

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
