import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getPageAccess } from '@/lib/server/access'
import { isUuid, normalizeEmail, rateLimit, readJson, safePublicOrigin } from '@/lib/server/security'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const serverClient = await createClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req, 32_000)
  const email = normalizeEmail(body?.email)
  const page_id = body?.page_id
  const page_title = typeof body?.page_title === 'string' ? body.page_title.slice(0, 300) : ''
  const role = body?.role === 'edit' ? 'edit' : body?.role === 'view' ? 'view' : null
  if (!email || !isUuid(page_id) || !role) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const limited = rateLimit(`share:${user.id}`, 20, 60 * 60 * 1000)
  if (limited) return limited

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Look up the inviter's display name
  const { data: inviterProfile } = await admin
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single()
  const inviterName = inviterProfile?.full_name || inviterProfile?.email?.split('@')[0] || 'Someone'

  // Ensure the page is accessible via link (set to 'view' at minimum if currently locked)
  const { data: page } = await admin
    .from('pages')
    .select('id, owner_id, workspace_id, link_permission, title')
    .eq('id', page_id)
    .single()

  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })
  const access = await getPageAccess(admin, user.id, page)
  if (!access.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const currentPerm = page.link_permission ?? 'none'
  const title = page_title || page?.title || 'Untitled'

  // Determine the link permission to apply for this share
  const linkPerm = role

  // Only upgrade link_permission, never downgrade
  const permOrder: Record<string, number> = { none: 0, view: 1, edit: 2 }
  if ((permOrder[currentPerm] ?? 0) < (permOrder[linkPerm] ?? 0)) {
    await admin.from('pages').update({ link_permission: linkPerm }).eq('id', page_id)
    // Propagate to sub-pages
    const { data: subIds } = await admin.rpc('get_all_subpage_ids', { page_id })
    if (subIds?.length) {
      for (const row of subIds) {
        const { data: sub } = await admin.from('pages').select('link_permission').eq('id', row.id).single()
        if (sub && (permOrder[sub.link_permission] ?? 0) < (permOrder[linkPerm] ?? 0)) {
          await admin.from('pages').update({ link_permission: linkPerm }).eq('id', row.id)
        }
      }
    }
  }

  const origin = safePublicOrigin(req)
  if (!origin) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  const shareUrl = `${origin}/share/${page_id}`

  // ── Send via Resend if configured ─────────────────────────────────────────
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'Canopy <onboarding@resend.dev>',
        to: [email],
        subject: `${inviterName} shared "${title}" with you`,
        html: buildEmailHtml({ inviterName, title, shareUrl, role }),
        text: `${inviterName} shared "${title}" with you.\n\nView it here: ${shareUrl}`,
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error('[share-page] Resend error:', res.status, err)
      // Resend sandbox restriction: onboarding@resend.dev can only send to the
      // Resend account owner's email. Fall back to clipboard link in that case.
      if (res.status === 403 || err.includes('testing') || err.includes('verified')) {
        return NextResponse.json({ ok: true, emailSent: false, shareUrl, resendError: err })
      }
      return NextResponse.json({ error: err }, { status: 500 })
    }
    return NextResponse.json({ ok: true, emailSent: true })
  }

  // ── No email service configured — return the link for clipboard fallback ──
  return NextResponse.json({ ok: true, emailSent: false, shareUrl })
}

function buildEmailHtml({ inviterName, title, shareUrl, role }: {
  inviterName: string
  title: string
  shareUrl: string
  role: string
}) {
  const accessLabel = role === 'edit' ? 'edit' : 'view'
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f7f7f5;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:10px;border:1px solid #e9e9e7;overflow:hidden;">
    <div style="padding:28px 32px 0;">
      <img src="https://canopy-bay-eight.vercel.app/canopy_favicon_no_bg.ico" width="36" height="36" alt="Canopy" style="display:block;margin-bottom:16px;object-fit:contain;" />
    </div>
    <div style="padding:0 32px 32px;">
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#37352f;">${escHtml(inviterName)} shared a page with you</h2>
      <p style="margin:0 0 24px;font-size:14px;color:#787774;">You have been given <strong>${accessLabel}</strong> access to:</p>
      <div style="background:#f7f7f5;border:1px solid #e9e9e7;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0;font-size:15px;font-weight:600;color:#37352f;">${escHtml(title)}</p>
      </div>
      <a href="${shareUrl}" style="display:inline-block;background:#2383e2;color:#fff;text-decoration:none;padding:10px 24px;border-radius:7px;font-size:14px;font-weight:500;">Open page</a>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #f0f0ef;">
      <p style="margin:0;font-size:12px;color:#acaba8;">You received this because ${escHtml(inviterName)} shared a Canopy page with you.</p>
    </div>
  </div>
</body>
</html>`
}

function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
