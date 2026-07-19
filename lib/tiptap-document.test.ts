import { describe, expect, it } from 'vitest'
import { findFirstDifferingBlock, formatRelativeTime, nodesToMarkdown, tryMergeDocuments } from './tiptap-document'

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const document = (...content: ReturnType<typeof paragraph>[]) => ({ type: 'doc', content })

describe('Tiptap document helpers', () => {
  it('merges changes made to distinct blocks', () => {
    const result = tryMergeDocuments(
      document(paragraph('A'), paragraph('B')),
      document(paragraph('Remote'), paragraph('B')),
      document(paragraph('A'), paragraph('Local')),
    )

    expect(result.hasConflict).toBe(false)
    expect(result.merged).toEqual(document(paragraph('Remote'), paragraph('Local')))
  })

  it('reports concurrent changes to the same block', () => {
    const result = tryMergeDocuments(document(paragraph('A')), document(paragraph('Remote')), document(paragraph('Local')))
    expect(result).toEqual({ merged: null, hasConflict: true })
  })

  it('describes the first differing block', () => {
    expect(findFirstDifferingBlock(document(paragraph('Mine')), document(paragraph('Theirs')))).toEqual({
      mine: 'Mine',
      theirs: 'Theirs',
    })
  })

  it('exports rich text and tables to Markdown', () => {
    expect(nodesToMarkdown([
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title', marks: [{ type: 'bold' }] }] },
      { type: 'table', content: [
        { type: 'tableRow', content: [{ type: 'tableHeader', content: [paragraph('Name')] }] },
        { type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph('Canopy')] }] },
      ] },
    ])).toContain('## **Title**\n\n| Name |\n| --- |\n| Canopy |')
  })

  it('formats relative time deterministically', () => {
    const now = Date.parse('2026-07-18T12:00:00Z')
    expect(formatRelativeTime('2026-07-18T11:15:00Z', now)).toBe('45m ago')
    expect(formatRelativeTime('2026-07-16T12:00:00Z', now)).toBe('2d ago')
  })
})
