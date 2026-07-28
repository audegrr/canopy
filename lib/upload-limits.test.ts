import { describe, expect, it } from 'vitest'
import { MAX_ATTACHMENT_BYTES, MAX_IMAGE_BYTES, MAX_MARKDOWN_BYTES, validateAttachment, validateImage, validateMarkdown } from './upload-limits'

describe('upload limits', () => {
  it('accepts ordinary attachments', () => {
    expect(validateAttachment({ name: 'brief.pdf', size: 1_024 })).toBeNull()
  })

  it('rejects oversized and executable attachments', () => {
    expect(validateAttachment({ name: 'archive.zip', size: MAX_ATTACHMENT_BYTES + 1 })).toMatch(/25 MB/)
    expect(validateAttachment({ name: 'invoice.html', size: 1_024 })).toMatch(/not allowed/)
  })

  it('accepts raster images and rejects SVG or oversized images', () => {
    expect(validateImage({ name: 'cover.png', size: 1_024, type: 'image/png' })).toBeNull()
    expect(validateImage({ name: 'cover.svg', size: 1_024, type: 'image/svg+xml' })).toMatch(/raster/)
    expect(validateImage({ name: 'cover.jpg', size: MAX_IMAGE_BYTES + 1, type: 'image/jpeg' })).toMatch(/10 MB/)
  })

  it('limits Markdown imports', () => {
    expect(validateMarkdown({ name: 'notes.md', size: 1_024 })).toBeNull()
    expect(validateMarkdown({ name: 'notes.md', size: MAX_MARKDOWN_BYTES + 1 })).toMatch(/2 MB/)
  })
})
