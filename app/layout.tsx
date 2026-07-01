import type { Metadata, Viewport } from 'next'
import {
  Newsreader, Hanken_Grotesk, JetBrains_Mono,
  Lora, Playfair_Display, Merriweather, Source_Serif_4,
  Inter, Work_Sans, Nunito_Sans, Manrope,
} from 'next/font/google'
import './globals.css'
import RegisterSW from '@/components/RegisterSW'

// ── Heading (serif) font choices ──
const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--newsreader',
  display: 'swap',
})

const lora = Lora({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--lora',
  display: 'swap',
})

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--playfair',
  display: 'swap',
})

const merriweather = Merriweather({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--merriweather',
  display: 'swap',
})

const sourceSerif4 = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--source-serif',
  display: 'swap',
})

// ── Body/UI (sans-serif) font choices ──
const hankenGrotesk = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--hanken',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--inter',
  display: 'swap',
})

const workSans = Work_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--work-sans',
  display: 'swap',
})

const nunitoSans = Nunito_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--nunito-sans',
  display: 'swap',
})

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--manrope',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--jetbrains',
  display: 'swap',
})

const fontVariables = [
  newsreader, lora, playfairDisplay, merriweather, sourceSerif4,
  hankenGrotesk, inter, workSans, nunitoSans, manrope,
  jetbrainsMono,
].map(f => f.variable).join(' ')

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
    <html lang="en" className={fontVariables}>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  )
}
