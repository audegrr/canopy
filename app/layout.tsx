import type { Metadata, Viewport } from 'next'
import { Newsreader, Hanken_Grotesk, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import RegisterSW from '@/components/RegisterSW'

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--newsreader',
  display: 'swap',
})

const hankenGrotesk = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--hanken',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: 'Canopy', template: '%s — Canopy' },
  description: 'Beautiful documents, shared effortlessly.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Canopy',
  },
  icons: {
    icon: '/canopy_favicon_no_bg.ico',
    apple: '/favicon.ico',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2f6b4f',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${hankenGrotesk.variable} ${jetbrainsMono.variable}`}>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  )
}
