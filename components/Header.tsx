'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const principalLinks = [
  { href: '/', label: 'Accueil' },
  { href: '/members', label: 'Membres' },
  { href: '/transactions/new', label: 'Nouvelle transaction' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/budgets/archived', label: 'Projets archivés' },
]

const followupLinks = [
  { href: '/receipts/requests', label: 'Demandes PJ' },
  { href: '/reimbursement-request', label: 'Demande de remboursement' },
  { href: '/evolutions', label: 'Propositions d’évolutions' },
]

const reportLinks = [
  { href: '/reports/previsionnel', label: 'Prévisionnel vs réalisé' },
  { href: '/reports/cr', label: 'Compte de résultat' },
  { href: '/reports/bilan', label: 'Bilan annuel' },
]

const billingLinks = [
  { href: '/admin/facturation/settings', label: 'Paramétrage' },
  { href: '/admin/facturation/devis', label: 'Devis' },
  { href: '/admin/facturation/factures', label: 'Factures' },
  { href: '/admin/facturation/rescrits', label: 'Rescrits' },
]

const adminLinks = [
  { href: '/admin/reimbursements', label: 'Gestion remboursements' },
  { href: '/receipts/missing', label: 'PJ manquantes' },
  { href: '/admin/rescrits', label: 'Rescrits à fournir' },
  { href: '/admin/exports', label: 'Exports' },
  { href: '/admin/membres', label: 'Membres' },
  { href: '/settings/mapping', label: 'Mapping' },
  { href: '/admin/referentiel', label: 'Admin référentiel' },
  { href: '/admin/previsionnel', label: 'Admin prévisionnel' },
  { href: '/admin/evolutions', label: 'Admin évolutions' },
  { href: '/admin/import', label: 'Import de masse' },
  { href: '/admin/doublons', label: 'Doublons transactions' },
  { href: '/admin/repartition-communication', label: 'Répartition communication' },
]

function Section({
  title,
  links,
  pathname,
  onNavigate,
}: {
  title: string
  links: { href: string; label: string }[]
  pathname: string
  onNavigate: () => void
}) {
  return (
    <div style={{ marginTop: 18 }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 800,
          opacity: 0.6,
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        {title}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {links.map((l) => {
          const active = pathname === l.href

          return (
            <Link
              key={l.href}
              href={l.href}
              onClick={onNavigate}
              style={{
                textDecoration: 'none',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #ddd',
                background: active ? '#f3f3f3' : 'white',
                color: 'inherit',
                fontWeight: active ? 700 : 500,
              }}
            >
              {l.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export function Header() {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  if (pathname === '/login') return null

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  async function handleLogout() {
    await supabase.auth.signOut()
    setOpen(false)
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      <header
        style={{
          borderBottom: '1px solid #eee',
          padding: '14px 20px',
          fontFamily: 'system-ui',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          background: 'white',
          zIndex: 40,
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => router.back()}
            aria-label="Retour"
            style={{
              border: '1px solid #ddd',
              borderRadius: 10,
              background: 'white',
              padding: '8px 10px',
              cursor: 'pointer',
            }}
          >
            ←
          </button>

          <button
            onClick={() => setOpen(true)}
            aria-label="Ouvrir le menu"
            style={{
              border: '1px solid #ddd',
              borderRadius: 10,
              background: 'white',
              padding: '8px 10px',
              cursor: 'pointer',
              fontSize: 20,
              lineHeight: 1,
            }}
          >
            ☰
          </button>

          <span style={{ fontWeight: 800 }}>ADEACT • Trésorerie</span>
        </div>

        <button
          onClick={handleLogout}
          style={{
            padding: '8px 10px',
            borderRadius: 999,
            border: '1px solid #ddd',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          Se déconnecter
        </button>
      </header>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            zIndex: 49,
          }}
        />
      )}

      <aside
        style={{
          position: 'fixed',
          top: 0,
          left: open ? 0 : -340,
          width: 320,
          maxWidth: '85vw',
          height: '100vh',
          background: 'white',
          borderRight: '1px solid #eee',
          zIndex: 50,
          transition: 'left 0.2s ease',
          fontFamily: 'system-ui',
          padding: 18,
          overflowY: 'auto',
          boxShadow: open ? '0 8px 30px rgba(0,0,0,0.12)' : 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 18,
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 18 }}>Menu</div>

          <button
            onClick={() => setOpen(false)}
            style={{
              border: '1px solid #ddd',
              borderRadius: 10,
              background: 'white',
              padding: '8px 10px',
              cursor: 'pointer',
            }}
          >
            Fermer
          </button>
        </div>

        <Section title="Principal" links={principalLinks} pathname={pathname} onNavigate={() => setOpen(false)} />
        <Section title="Suivi" links={followupLinks} pathname={pathname} onNavigate={() => setOpen(false)} />
        <Section title="Rapports" links={reportLinks} pathname={pathname} onNavigate={() => setOpen(false)} />
        <Section title="Facturation" links={billingLinks} pathname={pathname} onNavigate={() => setOpen(false)} />
        <Section title="Admin" links={adminLinks} pathname={pathname} onNavigate={() => setOpen(false)} />

        <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid #eee' }}>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #ddd',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            Se déconnecter
          </button>
        </div>
      </aside>
    </>
  )
}
