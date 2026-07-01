'use client'
import { useState, useEffect } from 'react'

export type HeadingFont = 'newsreader' | 'lora' | 'playfair' | 'merriweather' | 'source-serif'
export type BodyFont = 'hanken' | 'inter' | 'work-sans' | 'nunito-sans' | 'manrope'

export const HEADING_FONTS: { id: HeadingFont; label: string; stack: string }[] = [
  { id: 'newsreader', label: 'Newsreader', stack: 'var(--newsreader), Georgia, serif' },
  { id: 'lora', label: 'Lora', stack: 'var(--lora), Georgia, serif' },
  { id: 'playfair', label: 'Playfair Display', stack: 'var(--playfair), Georgia, serif' },
  { id: 'merriweather', label: 'Merriweather', stack: 'var(--merriweather), Georgia, serif' },
  { id: 'source-serif', label: 'Source Serif 4', stack: 'var(--source-serif), Georgia, serif' },
]

export const BODY_FONTS: { id: BodyFont; label: string; stack: string }[] = [
  { id: 'hanken', label: 'Hanken Grotesk', stack: 'var(--hanken), -apple-system, BlinkMacSystemFont, sans-serif' },
  { id: 'inter', label: 'Inter', stack: 'var(--inter), -apple-system, BlinkMacSystemFont, sans-serif' },
  { id: 'work-sans', label: 'Work Sans', stack: 'var(--work-sans), -apple-system, BlinkMacSystemFont, sans-serif' },
  { id: 'nunito-sans', label: 'Nunito Sans', stack: 'var(--nunito-sans), -apple-system, BlinkMacSystemFont, sans-serif' },
  { id: 'manrope', label: 'Manrope', stack: 'var(--manrope), -apple-system, BlinkMacSystemFont, sans-serif' },
]

export function useFontPrefs() {
  const [headingFont, setHeadingFont] = useState<HeadingFont>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('canopy-heading-font') as HeadingFont) || 'newsreader'
    return 'newsreader'
  })
  const [bodyFont, setBodyFont] = useState<BodyFont>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('canopy-body-font') as BodyFont) || 'hanken'
    return 'hanken'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-heading-font', headingFont)
    localStorage.setItem('canopy-heading-font', headingFont)
  }, [headingFont])

  useEffect(() => {
    document.documentElement.setAttribute('data-body-font', bodyFont)
    localStorage.setItem('canopy-body-font', bodyFont)
  }, [bodyFont])

  return { headingFont, setHeadingFont, bodyFont, setBodyFont }
}
