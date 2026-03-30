import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { configureAmplify } from '@/lib/amplify'
import { AuthProvider } from '@/contexts/AuthContext'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Stewardly — HOA Management',
    template: '%s | Stewardly',
  },
  description: 'Modern HOA management software. Streamline dues, meetings, and communications for your community.',
  icons: {
    icon: '/favicon.ico',
  },
}

// Configure Amplify at module load (runs on client via 'use client' in children)
configureAmplify()

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
