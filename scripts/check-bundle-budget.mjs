import { createGzip } from 'node:zlib'
import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

const root = join(process.cwd(), '.next', 'static', 'chunks')
const maxChunkBytes = 380 * 1024
const maxTotalBytes = 1_150 * 1024

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? filesIn(join(directory, entry.name)) : [join(directory, entry.name)]))
  return nested.flat()
}

async function gzipSize(file) {
  return new Promise((resolve, reject) => {
    let bytes = 0
    createReadStream(file).pipe(createGzip()).on('data', chunk => { bytes += chunk.length }).on('end', () => resolve(bytes)).on('error', reject)
  })
}

await stat(root)
const chunks = (await filesIn(root)).filter(file => file.endsWith('.js'))
const sizes = await Promise.all(chunks.map(async file => ({ file, bytes: await gzipSize(file) })))
const total = sizes.reduce((sum, item) => sum + item.bytes, 0)
const oversized = sizes.filter(item => item.bytes > maxChunkBytes)
console.log(`Client JavaScript: ${(total / 1024).toFixed(1)} KiB gzip across ${sizes.length} chunks (budget ${(maxTotalBytes / 1024).toFixed(0)} KiB)`)
if (oversized.length || total > maxTotalBytes) {
  oversized.forEach(item => console.error(`Chunk ${relative(root, item.file)} is ${(item.bytes / 1024).toFixed(1)} KiB gzip (budget ${(maxChunkBytes / 1024).toFixed(0)} KiB)`))
  process.exitCode = 1
}
