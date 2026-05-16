'use client'
import { useState, useEffect } from 'react'

type Theme = 'light' | 'dark' | 'system'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('canopy-theme') as Theme) || 'light'
    return 'light'
  })

  useEffect(() => {
    const root = document.documentElement
    const applyTheme = (t: string) => {
      const isDark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      root.style.transition = 'background 0.4s ease, color 0.4s ease'
      root.setAttribute('data-theme', isDark ? 'dark' : 'light')
    }
    applyTheme(theme)
    localStorage.setItem('canopy-theme', theme)
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => applyTheme('system')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])

  return { theme, setTheme }
}
