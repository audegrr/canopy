import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, readJson, requireUser } from '@/lib/server/security'

const SYSTEM_PROMPTS: Record<string, string> = {
  improve:   'Rewrite the following text to improve clarity, flow, and grammar. Keep the same language, tone, and meaning. Return only the rewritten text, no explanation.',
  shorten:   'Shorten the following text to roughly half its length while keeping the key information. Keep the same language. Return only the shortened text, no explanation.',
  lengthen:  'Expand the following text with more detail, examples, and depth. Keep the same language and tone. Return only the expanded text, no explanation.',
  formal:    'Rewrite the following text in a formal, professional tone. Keep the same language and meaning. Return only the rewritten text, no explanation.',
  casual:    'Rewrite the following text in a friendly, casual conversational tone. Keep the same language and meaning. Return only the rewritten text, no explanation.',
  translate: 'Translate the following text into English (or, if it is already in English, translate it into French). Return only the translated text, no explanation.',
  write:     'You are a writing assistant. Write content based on the following prompt. Be clear, well-structured, and use markdown formatting (headings, lists, bold) where appropriate. Return only the written content, no preamble or explanation.',
}

export async function POST(req: NextRequest) {
  const { user } = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limited = rateLimit(`ai:${user.id}`, 30, 60 * 60 * 1000)
  if (limited) return limited
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 })

  const body = await readJson(req, 64_000)
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  const action = typeof body?.action === 'string' ? body.action : ''
  if (!text || text.length > 40_000 || !action || action.length > 80) return NextResponse.json({ error: 'Invalid text or action' }, { status: 400 })

  let systemPrompt = SYSTEM_PROMPTS[action]
  if (!systemPrompt && /^translate:[\p{L} -]{2,40}$/u.test(action)) {
    const lang = action.slice('translate:'.length)
    if (lang) systemPrompt = `Translate the following text into ${lang}. If the text is already in ${lang}, return it unchanged. Do not translate into any other language. Return only the translated text, no explanation.`
  }
  if (!systemPrompt) return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: err }, { status: res.status })
  }

  const data = await res.json()
  const result = data.choices?.[0]?.message?.content ?? ''
  return NextResponse.json({ result })
}
