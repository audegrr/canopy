'use client'
import { useState, useEffect } from 'react'

export type NumberLocale = 'auto' | 'en-US' | 'en-GB' | 'fr-FR' | 'de-DE' | 'es-ES'

export const NUMBER_LOCALES: { id: NumberLocale; label: string; sample: string }[] = [
  { id: 'auto', label: 'Automatic (browser)', sample: '' },
  { id: 'en-US', label: 'English (US)', sample: '1,234.56' },
  { id: 'en-GB', label: 'English (UK)', sample: '1,234.56' },
  { id: 'fr-FR', label: 'Français', sample: '1 234,56' },
  { id: 'de-DE', label: 'Deutsch', sample: '1.234,56' },
  { id: 'es-ES', label: 'Español', sample: '1.234,56' },
]

const STORAGE_KEY = 'canopy-number-locale'
const CHANGE_EVENT = 'canopy:numberLocaleChange'

// Controls how numbers and currency amounts are formatted across database
// views — thousands/decimal separators, grouping. Persisted per-browser
// (like the font prefs), not per-workspace, since it's a personal reading
// preference rather than shared document content.
export function useNumberFormatPrefs() {
  const [numberLocale, setNumberLocaleState] = useState<NumberLocale>('auto')

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as NumberLocale | null
    if (saved && NUMBER_LOCALES.some(l => l.id === saved)) setNumberLocaleState(saved)
    const onChange = (e: Event) => setNumberLocaleState((e as CustomEvent<NumberLocale>).detail)
    window.addEventListener(CHANGE_EVENT, onChange)
    return () => window.removeEventListener(CHANGE_EVENT, onChange)
  }, [])

  function setNumberLocale(loc: NumberLocale) {
    localStorage.setItem(STORAGE_KEY, loc)
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: loc }))
  }

  // undefined tells Intl.NumberFormat to use the browser's own locale.
  const resolvedLocale = numberLocale === 'auto' ? undefined : numberLocale
  return { numberLocale, setNumberLocale, resolvedLocale }
}
