'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { useUserPermissions } from '@/lib/useUserPermissions'

type NavLink = {
  href: string
  label: string
  permission: string
}

const principalLinks: NavLink[] = [
  { href: '/', label: 'Accueil', permission: 'home' },
  { href: '/members', label: 'Membres', permission: 'members' },
  { href: '/transactions/new', label: 'Nouvelle transaction', permission: 'new_transaction' },
  { href: '/transactions', label: 'Transactions', permission: 'transactions' },
  { href: '/budgets/archived', label: 'Projets archivés', permission: 'archived_projects' },
]

const followupLinks: NavLink[] = [
  { href: '/receipts/requests', label: 'Demandes PJ', permission: 'receipt_requests' },
  { href: '/reimbursement-request', label: 'Demande de remboursement', permission: 'reimbursement_requests' },
  { href: '/evolutions', label: 'Propositions d’évolutions', permission: 'evolutions' },
]

const reportLinks: NavLink[] = [
  { href: '/reports/previsionnel', label: 'Prévisionnel vs réalisé', permission: 'forecast_vs_actual' },
  { href: '/reports/cr', label: 'Compte de résultat', permission: 'income_statement' },
  { href: '/reports/bilan', label: 'Bilan annuel', permission: 'annual_balance_sheet' },
]

const billingLinks: NavLink[] = [
  { href: '/admin/facturation/settings', label: 'Paramétrage', permission: 'billing_settings' },
  { href: '/admin/facturation/devis', label: 'Devis', permission: 'quotes' },
  { href: '/admin/facturation/factures', label: 'Factures', permission: 'invoices' },
  { href: '/admin/facturation/rescrits', label: 'Rescrits', permission: 'tax_rulings' },
]

const adminLinks: NavLink[] = [
  { href: '/admin/reimbursements', label: 'Gestion remboursements', permission: 'admin_reimbursements' },
  { href: '/receipts/missing', label: 'PJ manquantes', permission: 'missing_receipts' },
  { href: '/admin/rescrits', label: 'Rescrits à fournir', permission: 'admin_tax_rulings' },
  { href: '/admin/exports', label: 'Exports', permission: 'exports' },
  { href: '/admin/membres', label: 'Membres', permission: 'admin_members' },
  { href: '/settings/mapping', label: 'Mapping', permission: 'mapping' },
  { href: '/admin/referentiel', label: 'Admin référentiel', permission: 'admin_referentiel' },
  { href: '/admin/previsionnel', label: 'Admin prévisionnel', permission: 'admin_forecast' },
  { href: '/admin/evolutions', label: 'Admin évolutions', permission: 'admin_evolutions' },
  { href: '/admin/import', label: 'Import de masse', permission: 'mass_import' },
  { href: '/admin/doublons', label: 'Doublons transactions', permission: 'transaction_duplicates' },
  { href: '/admin/repartition-communication', label: 'Répartition communication', permission: 'communication_split' },
]

function Section({
  title,
  links,
  pathname,
  onNavigate,
}: {
  title: string
  links: NavLink[]
  pathname: string
  onNavigate: () => void
}) {
  if (links.length === 0) return null

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
  const { permissions, loading } = useUserPermissions()

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

  const filteredPrincipalLinks = useMemo(
    () => principalLinks.filter((link) => permissions.includes(link.permission)),
    [permissions]
  )

  const filteredFollowupLinks = useMemo(
    () => followupLinks.filter((link) => permissions.includes(link.permission)),
    [permissions]
  )

  const filteredReportLinks = useMemo(
    () => reportLinks.filter((link) => permissions.includes(link.permission)),
    [permissions]
  )

  const filteredBillingLinks = useMemo(
    () => billingLinks.filter((link) => permissions.includes(link.permission)),
    [permissions]
  )

  const filteredAdminLinks = useMemo(
    () => adminLinks.filter((link) => permissions.includes(link.permission)),
    [permissions]
  )

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

        {loading ? (
          <div style={{ opacity: 0.7 }}>Chargement des accès…</div>
        ) : (
          <>
            <Section
              title="Principal"
              links={filteredPrincipalLinks}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />

            <Section
              title="Suivi"
              links={filteredFollowupLinks}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />

            <Section
              title="Rapports"
              links={filteredReportLinks}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />

            <Section
              title="Facturation"
              links={filteredBillingLinks}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />

            <Section
              title="Admin"
              links={filteredAdminLinks}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
          </>
        )}

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