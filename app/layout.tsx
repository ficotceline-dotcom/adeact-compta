import type { Metadata } from 'next'
import './globals.css'
import { AuthGate } from '@/components/AuthGate'
import { Header } from '@/components/Header'

export const metadata: Metadata = {
  title: 'ADEACT',
  description: 'Gestion budgets & trésorerie ADEACT',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <AuthGate>
          {/* Le Header est affiché partout sauf sur /login (géré dans AuthGate) */}
          <Header />
          {children}
        </AuthGate>
      </body>
    </html>
  )
}
