import type { Metadata, Viewport } from 'next'
import './globals.css'
import RegisterSW from '@/components/RegisterSW'

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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700&family=Hanken+Grotesk:ital,wght@0,400..700;1,400..700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  )
}
