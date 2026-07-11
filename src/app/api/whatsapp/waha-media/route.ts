import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/whatsapp/encryption'

// Proxy for WAHA media files.
//
// WAHA serves downloaded media at `${waha_url}/api/files/<session>/<file>`
// behind its X-Api-Key, and the URL it puts on messages points at its
// own internal host (localhost). The browser can neither reach that host
// nor attach the API key — so inbound photos/audio/docs would render as
// broken links. This route takes the `<session>/<file>` path, fetches it
// from WAHA with the key server-side (using the logged-in user's account
// config), and streams the bytes back. Mirrors the Meta media proxy.
//
// `f` is validated to `<segment>/<segment>` of safe chars so it can only
// ever address WAHA's files endpoint — no path traversal, no SSRF.
const SAFE_PATH = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

export async function GET(request: Request) {
  try {
    const f = new URL(request.url).searchParams.get('f')
    if (!f || !SAFE_PATH.test(f)) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('provider, waha_url, access_token')
      .eq('account_id', accountId)
      .single()
    if (configError || !config || config.provider !== 'waha' || !config.waha_url) {
      return NextResponse.json(
        { error: 'WAHA not configured for this account' },
        { status: 400 },
      )
    }

    const apiKey = decrypt(config.access_token)
    const url = `${config.waha_url.replace(/\/+$/, '')}/api/files/${f}`
    const upstream = await fetch(url, { headers: { 'X-Api-Key': apiKey } })
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: `WAHA media fetch failed: ${upstream.status}` },
        { status: 502 },
      )
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type':
          upstream.headers.get('content-type') || 'application/octet-stream',
        'Cache-Control': 'private, max-age=86400',
      },
    })
  } catch (error) {
    console.error('Error in WAHA media GET:', error)
    return NextResponse.json({ error: 'Failed to fetch media' }, { status: 500 })
  }
}
