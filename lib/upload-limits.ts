export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024

const blockedExtensions = new Set([
  'app', 'bat', 'cmd', 'com', 'cpl', 'exe', 'html', 'htm', 'js', 'jse',
  'msi', 'msp', 'pif', 'ps1', 'scr', 'svg', 'vbs', 'vbe', 'wsf',
])

function extensionOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

export function validateAttachment(file: Pick<File, 'name' | 'size'>): string | null {
  if (file.size <= 0) return 'This file is empty.'
  if (file.size > MAX_ATTACHMENT_BYTES) return 'Files must be 25 MB or smaller.'
  if (blockedExtensions.has(extensionOf(file.name))) return 'This file type is not allowed.'
  return null
}

export function validateImage(file: Pick<File, 'name' | 'size' | 'type'>): string | null {
  if (file.size <= 0) return 'This image is empty.'
  if (file.size > MAX_IMAGE_BYTES) return 'Images must be 10 MB or smaller.'
  if (!file.type.startsWith('image/') || extensionOf(file.name) === 'svg') return 'Choose a supported raster image.'
  return null
}

export function validateMarkdown(file: Pick<File, 'name' | 'size'>): string | null {
  if (file.size <= 0) return 'This Markdown file is empty.'
  if (file.size > MAX_MARKDOWN_BYTES) return 'Markdown files must be 2 MB or smaller.'
  const extension = extensionOf(file.name)
  if (!['md', 'markdown', 'txt'].includes(extension)) return 'Choose a Markdown or plain-text file.'
  return null
}
