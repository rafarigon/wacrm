import {
  sendTextMessage as metaSendText,
  sendMediaMessage as metaSendMedia,
  type MediaKind,
} from '@/lib/whatsapp/meta-api'
import {
  sendTextMessage as wahaSendText,
  sendMediaMessage as wahaSendMedia,
  sendVoiceMessage as wahaSendVoice,
} from '@/lib/whatsapp/waha-api'

/**
 * Provider dispatch for outbound text + media.
 *
 * Every sender in the app (agent inbox, Flows engine, Automations
 * engine) loads the account's whatsapp_config row, decrypts
 * `access_token`, and calls Meta. With WAHA as a second provider
 * (migration 025 adds `provider`, `waha_url`, `waha_session`), the
 * same decrypted `access_token` column carries the WAHA API key, and
 * these helpers route the send to the right backend.
 *
 * Deliberately NOT covered: templates and interactive buttons/lists.
 * Both are Cloud API concepts — WAHA speaks the consumer protocol,
 * where templates don't exist and buttons no longer render on modern
 * WhatsApp clients. Callers must reject those sends for WAHA configs
 * with a clear message instead of silently degrading.
 */

export interface ProviderConfigRow {
  provider?: string | null
  phone_number_id: string
  waha_url?: string | null
  waha_session?: string | null
}

export function isWahaConfig(config: ProviderConfigRow): boolean {
  return config.provider === 'waha'
}

function wahaConnection(config: ProviderConfigRow, accessToken: string) {
  if (!config.waha_url) {
    throw new Error(
      'WAHA provider selected but waha_url is not set on whatsapp_config.',
    )
  }
  return {
    baseUrl: config.waha_url,
    apiKey: accessToken,
    session: config.waha_session || 'default',
  }
}

export interface ProviderSendTextArgs {
  config: ProviderConfigRow
  /** Decrypted whatsapp_config.access_token — Meta Bearer token or WAHA API key. */
  accessToken: string
  to: string
  text: string
  contextMessageId?: string
}

export async function sendProviderText(
  args: ProviderSendTextArgs,
): Promise<{ messageId: string }> {
  const { config, accessToken, to, text, contextMessageId } = args
  if (isWahaConfig(config)) {
    return wahaSendText({
      ...wahaConnection(config, accessToken),
      to,
      text,
      contextMessageId,
    })
  }
  return metaSendText({
    phoneNumberId: config.phone_number_id,
    accessToken,
    to,
    text,
    contextMessageId,
  })
}

export interface ProviderSendMediaArgs {
  config: ProviderConfigRow
  accessToken: string
  to: string
  kind: MediaKind
  /** Public URL the provider fetches at send time. */
  link: string
  caption?: string
  filename?: string
  contextMessageId?: string
}

export async function sendProviderMedia(
  args: ProviderSendMediaArgs,
): Promise<{ messageId: string }> {
  const { config, accessToken, to, kind, link, caption, filename, contextMessageId } = args
  if (isWahaConfig(config)) {
    return wahaSendMedia({
      ...wahaConnection(config, accessToken),
      to,
      kind,
      link,
      caption,
      filename,
      contextMessageId,
    })
  }
  return metaSendMedia({
    phoneNumberId: config.phone_number_id,
    accessToken,
    to,
    kind,
    link,
    caption,
    filename,
    contextMessageId,
  })
}

export interface ProviderSendVoiceArgs {
  config: ProviderConfigRow
  accessToken: string
  to: string
  /** Public URL the provider fetches at send time. */
  link: string
  contextMessageId?: string
}

/**
 * Send a voice note (PTT). WAHA-only for now — the Meta Cloud API can
 * send audio too, but the inbox voice-note feature ships against WAHA;
 * a Meta config falls back to a plain audio document send.
 */
export async function sendProviderVoice(
  args: ProviderSendVoiceArgs,
): Promise<{ messageId: string }> {
  const { config, accessToken, to, link, contextMessageId } = args
  if (isWahaConfig(config)) {
    return wahaSendVoice({
      ...wahaConnection(config, accessToken),
      to,
      link,
      contextMessageId,
    })
  }
  // Meta: no PTT helper — send as an audio file via the media path.
  return metaSendMedia({
    phoneNumberId: config.phone_number_id,
    accessToken,
    to,
    kind: 'document',
    link,
    filename: 'audio.ogg',
    contextMessageId,
  })
}
