import type { TiptapNode } from './types'

function blocks(document: TiptapNode | TiptapNode[] | null | undefined): TiptapNode[] {
  if (Array.isArray(document)) return document
  return document?.type === 'doc' ? (document.content ?? []) : []
}

export function tryMergeDocuments(base: TiptapNode, remote: TiptapNode, local: TiptapNode) {
  const baseBlocks = blocks(base)
  const remoteBlocks = blocks(remote)
  const localBlocks = blocks(local)
  const maxLength = Math.max(baseBlocks.length, remoteBlocks.length, localBlocks.length)
  const remoteChanged = new Set<number>()
  const localChanged = new Set<number>()

  for (let index = 0; index < maxLength; index++) {
    if (JSON.stringify(baseBlocks[index]) !== JSON.stringify(remoteBlocks[index])) remoteChanged.add(index)
    if (JSON.stringify(baseBlocks[index]) !== JSON.stringify(localBlocks[index])) localChanged.add(index)
  }

  if ([...remoteChanged].some(index => localChanged.has(index))) {
    return { merged: null, hasConflict: true as const }
  }

  const mergedBlocks: Array<TiptapNode | undefined> = [...remoteBlocks]
  while (mergedBlocks.length < localBlocks.length) mergedBlocks.push(undefined)
  for (const index of localChanged) mergedBlocks[index] = localBlocks[index]

  return {
    merged: { type: 'doc' as const, content: mergedBlocks.filter((node): node is TiptapNode => Boolean(node)) },
    hasConflict: false as const,
  }
}

export function tiptapToPlainText(content: TiptapNode | TiptapNode[] | null | undefined): string {
  if (!content) return ''
  const nodes = Array.isArray(content) ? content : content.type === 'doc' ? (content.content ?? []) : [content]
  return nodes.map(node => {
    if (node.text) return node.text
    const children = tiptapToPlainText(node.content ?? [])
    return ['paragraph', 'heading', 'blockquote', 'codeBlock', 'listItem', 'taskItem'].includes(node.type ?? '')
      ? `${children}\n`
      : children
  }).join('')
}

export function findFirstDifferingBlock(mine: TiptapNode, theirs: TiptapNode) {
  const mineBlocks = blocks(mine)
  const theirBlocks = blocks(theirs)
  const maxLength = Math.max(mineBlocks.length, theirBlocks.length)

  for (let index = 0; index < maxLength; index++) {
    if (JSON.stringify(mineBlocks[index]) !== JSON.stringify(theirBlocks[index])) {
      return {
        mine: mineBlocks[index] ? tiptapToPlainText({ type: 'doc', content: [mineBlocks[index]] }).trim() : '(block deleted)',
        theirs: theirBlocks[index] ? tiptapToPlainText({ type: 'doc', content: [theirBlocks[index]] }).trim() : '(block deleted)',
      }
    }
  }
  return null
}

export function formatRelativeTime(iso: string, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function inlineToMarkdown(node: TiptapNode): string {
  if (node.type === 'pageMention') {
    return `[@${String(node.attrs?.label || 'Page')}](/app/page/${String(node.attrs?.pageId || '')})`
  }
  if (node.type === 'text') {
    let text = node.text ?? ''
    const marks = (node.marks ?? []).map(mark => mark.type)
    if (marks.includes('bold')) text = `**${text}**`
    if (marks.includes('italic')) text = `_${text}_`
    if (marks.includes('code')) text = `\`${text}\``
    if (marks.includes('strike')) text = `~~${text}~~`
    const link = (node.marks ?? []).find(mark => mark.type === 'link')
    if (link) text = `[${text}](${String(link.attrs?.href || '')})`
    return text
  }
  return (node.content ?? []).map(inlineToMarkdown).join('')
}

function nodeToMarkdown(node: TiptapNode, listDepth = 0): string {
  const indent = '  '.repeat(listDepth)
  switch (node.type) {
    case 'heading': return `${'#'.repeat(Number(node.attrs?.level) || 1)} ${(node.content ?? []).map(inlineToMarkdown).join('')}\n\n`
    case 'paragraph': {
      const text = (node.content ?? []).map(inlineToMarkdown).join('')
      return text ? `${text}\n\n` : '\n'
    }
    case 'bulletList':
      return (node.content ?? []).map(item => `${indent}- ${(item.content ?? []).map(child => nodeToMarkdown(child, listDepth + 1)).join('').trimEnd()}\n`).join('') + '\n'
    case 'orderedList':
      return (node.content ?? []).map((item, index) => `${indent}${index + 1}. ${(item.content ?? []).map(child => nodeToMarkdown(child, listDepth + 1)).join('').trimEnd()}\n`).join('') + '\n'
    case 'taskList':
      return (node.content ?? []).map(item => `${indent}- [${item.attrs?.checked ? 'x' : ' '}] ${(item.content ?? []).map(child => nodeToMarkdown(child, listDepth + 1)).join('').trimEnd()}\n`).join('') + '\n'
    case 'blockquote': return (node.content ?? []).map(child => `> ${nodeToMarkdown(child, listDepth).trimEnd()}`).join('\n') + '\n\n'
    case 'codeBlock': return `\`\`\`${String(node.attrs?.language || '')}\n${(node.content ?? []).map(child => child.text ?? '').join('')}\n\`\`\`\n\n`
    case 'columns': return (node.content ?? []).map(column => (column.content ?? []).map(child => nodeToMarkdown(child)).join('')).join('\n') + '\n'
    case 'horizontalRule': return '---\n\n'
    case 'image': return `![${String(node.attrs?.alt || '')}](${String(node.attrs?.src || '')})\n\n`
    case 'table': return `${tableToMarkdown(node)}\n`
    default: return (node.content ?? []).map(child => nodeToMarkdown(child, listDepth)).join('')
  }
}

function tableToMarkdown(table: TiptapNode): string {
  const rows = (table.content ?? []).map(row => (row.content ?? []).map(cell =>
    (cell.content ?? []).map(child => nodeToMarkdown(child)).join('').trim().replace(/\n+/g, ' ')
  ))
  if (rows.length === 0) return ''
  const columns = Math.max(...rows.map(row => row.length))
  return [
    `| ${rows[0].join(' | ')} |`,
    `| ${Array(columns).fill('---').join(' | ')} |`,
    ...rows.slice(1).map(row => `| ${row.join(' | ')} |`),
  ].join('\n')
}

export function nodesToMarkdown(nodes: TiptapNode[]): string {
  return nodes.map(node => nodeToMarkdown(node)).join('')
}
