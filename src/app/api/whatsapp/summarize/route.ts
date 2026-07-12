import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { phonesMatch } from '@/lib/whatsapp/phone-utils'
import {
  summarizeConversation,
  CONTACT_CATEGORIES,
  type TranscriptLine,
  type ConversationSummary,
  type ContactCategory,
} from '@/lib/ai/summarize-conversation'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

type ServerClient = Awaited<ReturnType<typeof createClient>>

// Display name + color for each auto-applied category tag. Created on
// first use (find-or-create), scoped to the account.
const CATEGORY_TAG: Record<ContactCategory, { name: string; color: string }> = {
  cliente: { name: 'Cliente', color: '#22c55e' },
  corretor: { name: 'Corretor', color: '#3b82f6' },
  fornecedor: { name: 'Fornecedor', color: '#f59e0b' },
  outros: { name: 'Outros', color: '#6b7280' },
}

// A summary only needs recent context; capping bounds cost + latency.
const MAX_MESSAGES = 300
const MAX_CHARS_PER_MESSAGE = 500

// content_text is null for media-only messages — label them so the
// transcript reads sensibly instead of dropping blank lines.
const MEDIA_LABEL: Record<string, string> = {
  image: '[imagem]',
  video: '[vídeo]',
  audio: '[áudio]',
  document: '[documento]',
  location: '[localização]',
}

/**
 * Generate an AI summary of a contact's WhatsApp conversation and persist
 * it in two places (per the user's choice): as a contact note (visible in
 * the inbox sidebar) and appended to the matching lead's `notas`.
 *
 * Resolves the conversation from `contact_id` because conversations are
 * 1:1 per (account, contact) — the inbox sidebar only has the contact.
 */
export async function POST(request: Request) {
  try {
    // Fail fast with a clear message if the key isn't set in the
    // environment — otherwise the Gemini call would 400 opaquely.
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        {
          error:
            'Resumo por IA não configurado: falta GEMINI_API_KEY nas variáveis de ambiente do projeto.',
        },
        { status: 503 },
      )
    }

    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Reuse the send bucket — summarizing is a paid, rate-worthy action
    // on the same per-user budget.
    const limit = checkRateLimit(`summarize:${user.id}`, RATE_LIMITS.send)
    if (!limit.success) return rateLimitResponse(limit)

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const accountId = profile?.account_id as string | undefined
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      )
    }

    const body = await request.json()
    const contactId = body?.contact_id as string | undefined
    if (!contactId) {
      return NextResponse.json(
        { error: 'contact_id is required' },
        { status: 400 },
      )
    }

    // Contact is account-scoped; we need its phone to mirror onto the lead.
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('id, phone, name')
      .eq('id', contactId)
      .eq('account_id', accountId)
      .single()
    if (contactError || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .single()
    if (convError || !conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 },
      )
    }

    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('sender_type, content_type, content_text, created_at')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .limit(MAX_MESSAGES)
    if (msgError) {
      console.error('[summarize] message load failed:', msgError.message)
      return NextResponse.json(
        { error: 'Failed to load messages' },
        { status: 500 },
      )
    }

    const lines: TranscriptLine[] = (messages ?? [])
      .map((m) => {
        const text = (
          m.content_text?.trim() ||
          MEDIA_LABEL[m.content_type as string] ||
          ''
        ).slice(0, MAX_CHARS_PER_MESSAGE)
        return {
          sender: m.sender_type === 'customer' ? 'customer' : 'agent',
          text,
        } as TranscriptLine
      })
      .filter((l) => l.text)

    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'Conversa muito curta para resumir.' },
        { status: 400 },
      )
    }

    let result: ConversationSummary
    try {
      result = await summarizeConversation(lines)
    } catch (err) {
      console.error(
        '[summarize] model call failed:',
        err instanceof Error ? err.message : err,
      )
      return NextResponse.json(
        { error: 'Falha ao gerar o resumo. Tente novamente.' },
        { status: 502 },
      )
    }
    if (!result.resumo) {
      return NextResponse.json({ error: 'Resumo vazio.' }, { status: 502 })
    }

    const noteText = `🤖 Resumo da conversa (IA)\n\n${result.resumo}`

    // 1) Persist as a contact note — shows up in the inbox sidebar.
    const { data: note, error: noteError } = await supabase
      .from('contact_notes')
      .insert({
        contact_id: contactId,
        account_id: accountId,
        user_id: user.id,
        note_text: noteText,
      })
      .select()
      .single()
    if (noteError || !note) {
      console.error('[summarize] note insert failed:', noteError?.message)
      return NextResponse.json(
        { error: 'Resumo gerado mas falhou ao salvar a nota.' },
        { status: 500 },
      )
    }

    // 2) Mirror onto the matching lead's `notas` (best-effort — a miss
    //    here must not fail the request; the contact note already landed).
    await mirrorSummaryToLead(accountId, contact.phone, result.resumo)

    // 3) Classify → apply the matching category tag (Cliente / Corretor /
    //    Fornecedor / Outros). Mutually exclusive + best-effort.
    await applyCategoryTag(supabase, accountId, user.id, contactId, result.tipo)

    return NextResponse.json({ success: true, note, tipo: result.tipo })
  } catch (error) {
    console.error('Error in summarize POST:', error)
    return NextResponse.json(
      { error: 'Failed to summarize conversation' },
      { status: 500 },
    )
  }
}

/**
 * Append the summary to the matching lead's `notas`. Lead lookup mirrors
 * ensureLeadForContact in inbound.ts: SQL pre-filter by last-8-digit
 * suffix, then strict phonesMatch in JS (bridges national vs. +55 formats
 * between rows created here and rows mirrored from Twenty). Uses the admin
 * client because the leads funnel isn't exposed to the user's RLS scope in
 * the inbox context.
 */
async function mirrorSummaryToLead(
  accountId: string,
  phone: string | null,
  summary: string,
) {
  try {
    const digits = (phone || '').replace(/\D/g, '')
    if (!digits) return
    const suffix = digits.length >= 8 ? digits.slice(-8) : digits

    const { data: candidates, error: findError } = await supabaseAdmin()
      .from('leads')
      .select('id, telefone, notas')
      .eq('account_id', accountId)
      .ilike('telefone', `%${suffix}%`)
      .limit(10)
    if (findError) {
      console.error('[summarize] lead lookup failed:', findError.message)
      return
    }

    const lead = (candidates || []).find(
      (l: { telefone: string | null }) =>
        l.telefone && phonesMatch(l.telefone, phone as string),
    )
    if (!lead) return

    const stamp = new Date().toLocaleDateString('pt-BR')
    const block = `--- Resumo IA (${stamp}) ---\n${summary}`
    const notas = lead.notas ? `${lead.notas}\n\n${block}` : block

    const { error: updateError } = await supabaseAdmin()
      .from('leads')
      .update({ notas })
      .eq('id', lead.id)
    if (updateError) {
      console.error('[summarize] lead notas update failed:', updateError.message)
    }
  } catch (err) {
    console.error(
      '[summarize] mirrorSummaryToLead threw:',
      err instanceof Error ? err.message : err,
    )
  }
}

/**
 * Apply the category tag inferred by the model to the contact. The four
 * category tags are mutually exclusive — a contact is a Cliente OR a
 * Corretor, not both — so we clear any previously-applied category tag
 * before adding the new one. Category tags are created on first use
 * (find-or-create, account-scoped). Best-effort: a tag failure is logged
 * and swallowed so it never fails the summary that already saved.
 */
async function applyCategoryTag(
  supabase: ServerClient,
  accountId: string,
  userId: string,
  contactId: string,
  tipo: ContactCategory,
) {
  try {
    const target = CATEGORY_TAG[tipo]
    const categoryNames = CONTACT_CATEGORIES.map((c) => CATEGORY_TAG[c].name)

    // Existing category tags in this account (any of the four).
    const { data: existing, error: fetchError } = await supabase
      .from('tags')
      .select('id, name')
      .eq('account_id', accountId)
      .in('name', categoryNames)
    if (fetchError) {
      console.error('[summarize] tag lookup failed:', fetchError.message)
      return
    }

    const rows = (existing ?? []) as { id: string; name: string }[]
    let targetId = rows.find((t) => t.name === target.name)?.id

    // Create the target category tag if it doesn't exist yet.
    if (!targetId) {
      const { data: created, error: createError } = await supabase
        .from('tags')
        .insert({
          user_id: userId,
          account_id: accountId,
          name: target.name,
          color: target.color,
        })
        .select('id')
        .single()
      if (createError || !created) {
        console.error('[summarize] tag create failed:', createError?.message)
        return
      }
      targetId = created.id
    }

    // Clear the other category tags from this contact so the category is
    // single-valued, then attach the target.
    const otherIds = rows
      .filter((t) => t.id !== targetId)
      .map((t) => t.id)
    if (otherIds.length > 0) {
      const { error: delError } = await supabase
        .from('contact_tags')
        .delete()
        .eq('contact_id', contactId)
        .in('tag_id', otherIds)
      if (delError) {
        console.error('[summarize] category tag cleanup failed:', delError.message)
      }
    }

    const { error: upsertError } = await supabase
      .from('contact_tags')
      .upsert(
        { contact_id: contactId, tag_id: targetId },
        { onConflict: 'contact_id,tag_id' },
      )
    if (upsertError) {
      console.error('[summarize] tag apply failed:', upsertError.message)
    }
  } catch (err) {
    console.error(
      '[summarize] applyCategoryTag threw:',
      err instanceof Error ? err.message : err,
    )
  }
}
