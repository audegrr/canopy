import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPTS: Record<string, string> = {
  improve:   'Rewrite the following text to improve clarity, flow, and grammar. Keep the same language, tone, and meaning. Return only the rewritten text, no explanation.',
  shorten:   'Shorten the following text to roughly half its length while keeping the key information. Keep the same language. Return only the shortened text, no explanation.',
  lengthen:  'Expand the following text with more detail, examples, and depth. Keep the same language and tone. Return only the expanded text, no explanation.',
  formal:    'Rewrite the following text in a formal, professional tone. Keep the same language and meaning. Return only the rewritten text, no explanation.',
  casual:    'Rewrite the following text in a friendly, casual conversational tone. Keep the same language and meaning. Return only the rewritten text, no explanation.',
  translate: 'Translate the following text into English (or, if it is already in English, translate it into French). Return only the translated text, no explanation.',
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

  const { text, action } = await req.json()
  if (!text || !action) return NextResponse.json({ error: 'Missing text or action' }, { status: 400 })

  const systemPrompt = SYSTEM_PROMPTS[action]
  if (!systemPrompt) return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: `${systemPrompt}\n\n${text}` }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: err }, { status: res.status })
  }

  const data = await res.json()
  const result = data.content?.[0]?.text ?? ''
  return NextResponse.json({ result })
}
