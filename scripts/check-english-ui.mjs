import { readFile, readdir } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

const roots = ['app', 'components', 'hooks', 'lib', 'public']
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.webmanifest'])
const allowedFiles = new Set([
  'hooks/useNumberFormatPrefs.ts',
])

// Keep this intentionally focused on UI copy. User content, locale names and
// test fixtures may legitimately contain any language.
const forbiddenUiPhrases = [
  'Annuler',
  'Bienvenue',
  'Chargement',
  'Corbeille',
  'Créer',
  'Déplacer',
  'Dupliquer',
  'Enregistrer',
  'Erreur',
  'Exporter',
  'Fermer',
  'Importer',
  'Inviter',
  'Nouvelle page',
  'Paramètres',
  'Rechercher',
  'Restaurer',
  'Sauvegarde',
  'Supprimer',
]

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesIn(path) : [path]
  }))
  return files.flat()
}

const files = (await Promise.all(roots.map(filesIn))).flat()
  .filter(file => sourceExtensions.has(extname(file)))
const findings = []

for (const file of files) {
  const displayPath = relative(process.cwd(), file)
  if (allowedFiles.has(displayPath)) continue
  const lines = (await readFile(file, 'utf8')).split('\n')
  lines.forEach((line, index) => {
    for (const phrase of forbiddenUiPhrases) {
      if (line.includes(phrase)) findings.push(`${displayPath}:${index + 1}: ${phrase}`)
    }
  })
}

if (findings.length) {
  console.error('Non-English application copy found:')
  findings.forEach(finding => console.error(`- ${finding}`))
  process.exitCode = 1
} else {
  console.log(`English UI check passed (${files.length} source files scanned).`)
}
