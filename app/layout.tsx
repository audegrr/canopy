import type { Metadata, Viewport } from 'next'
import {
  Newsreader, Hanken_Grotesk, JetBrains_Mono,
  Lora, Playfair_Display, Merriweather, Source_Serif_4,
  Fraunces, Libre_Baskerville, DM_Serif_Display, IBM_Plex_Serif,
  Inter, Work_Sans, Nunito_Sans, Manrope,
  Geist, Plus_Jakarta_Sans, DM_Sans, Space_Grotesk,
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

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--fraunces',
  display: 'swap',
})

const libreBaskerville = Libre_Baskerville({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--libre-baskerville',
  display: 'swap',
})

const dmSerifDisplay = DM_Serif_Display({
  subsets: ['latin'],
  weight: '400',
  variable: '--dm-serif-display',
  display: 'swap',
})

const ibmPlexSerif = IBM_Plex_Serif({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--ibm-plex-serif',
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

const geist = Geist({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--geist',
  display: 'swap',
})

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--plus-jakarta-sans',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--dm-sans',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--space-grotesk',
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
  fraunces, libreBaskerville, dmSerifDisplay, ibmPlexSerif,
  hankenGrotesk, inter, workSans, nunitoSans, manrope,
  geist, plusJakartaSans, dmSans, spaceGrotesk,
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
