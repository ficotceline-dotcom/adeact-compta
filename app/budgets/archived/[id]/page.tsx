'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type Budget = {
  id: string
  name: string
  closed_at: string | null
}

type AllocRow = {
  id: string
  budget_id: string
  amount_cents: number
  poste_cr: string | null
  category: { id: string; name: string; kind: string } | { id: string; name: string; kind: string }[] | null
  subcategory: { id: string; name: string } | { id: string; name: string }[] | null
  transaction: {
    id: string
    kind: string
    tx_date: string
    description: string | null
    receipt_status: string | null
  } | {
    id: string
    kind: string
    tx_date: string
    description: string | null
    receipt_status: string | null
  }[] | null
}

type Forecast = {
  category_id: string
  subcategory_id: string | null
  amount_cents: number
  kind: string
}

function firstObj<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null
  if (Array.isArray(val)) return val[0] ?? null
  return val
}

function euros(cents: number) {
  return (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default function ClosedBudgetDetailPage() {
  const params = useParams()
  const budgetId = params.id as string

  const [loading, setLoading] = useState(true)
  const [budget, setBudget] = useState<Budget | null>(null)
  const [allocs, setAllocs] = useState<AllocRow[]>([])
  const [forecasts, setForecasts] = useState<Forecast[]>([])

  useEffect(() => {
    if (budgetId) load()
  }, [budgetId])

  async function load() {
    setLoading(true)

    const [{ data: bData }, { data: aData }, { data: fData }] = await Promise.all([
      supabase
        .from('budgets')
        .select('id,name,closed_at')
        .eq('id', budgetId)
        .single(),

      supabase
        .from('transaction_allocations')
        .select(`
          id,
          budget_id,
          amount_cents,
          poste_cr,
          category:categories(id,name,kind),
          subcategory:subcategories(id,name),
          transaction:transactions(id,kind,tx_date,description,receipt_status)
        `)
        .eq('budget_id', budgetId),

      supabase
        .from('budget_forecasts')
        .select('category_id,subcategory_id,amount_cents,kind')
        .eq('budget_id', budgetId),
    ])

    setBudget(bData as Budget ?? null)
    setAllocs((aData ?? []) as AllocRow[])
    setForecasts((fData ?? []) as Forecast[])
    setLoading(false)
  }

  const stats = useMemo(() => {
    let totalIncome = 0
    let totalExpense = 0
    let missingReceipts = 0

    for (const row of allocs) {
      const tx = firstObj(row.transaction)
      if (!tx) continue
      if (tx.kind === 'income') {
        totalIncome += row.amount_cents
      } else {
        totalExpense += row.amount_cents
        if (tx.receipt_status === 'PJ manquante') missingReceipts++
      }
    }

    const forecastIncome = forecasts.filter(f => f.kind === 'income').reduce((s, f) => s + f.amount_cents, 0)
    const forecastExpense = forecasts.filter(f => f.kind === 'expense').reduce((s, f) => s + f.amount_cents, 0)

    return { totalIncome, totalExpense, missingReceipts, forecastIncome, forecastExpense }
  }, [allocs, forecasts])

  // Group expenses by category
  const expensesByCategory = useMemo(() => {
    const map = new Map<string, { name: string; realise: number; previsionnel: number; pjMissing: number }>()

    for (const row of allocs) {
      const tx = firstObj(row.transaction)
      if (!tx || tx.kind !== 'expense') continue
      const cat = firstObj(row.category)
      if (!cat) continue

      if (!map.has(cat.id)) {
        map.set(cat.id, { name: cat.name, realise: 0, previsionnel: 0, pjMissing: 0 })
      }
      const entry = map.get(cat.id)!
      entry.realise += row.amount_cents
      if (tx.receipt_status === 'PJ manquante') entry.pjMissing++
    }

    // Add prévisionnel
    for (const f of forecasts) {
      if (f.kind !== 'expense' || !f.category_id) continue
      if (!map.has(f.category_id)) {
        map.set(f.category_id, { name: f.category_id, realise: 0, previsionnel: 0, pjMissing: 0 })
      }
      map.get(f.category_id)!.previsionnel += f.amount_cents
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [allocs, forecasts])

  if (loading) {
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Chargement…</main>
  }

  if (!budget) {
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Budget introuvable.</main>
  }

  const soldeExpense = stats.forecastExpense - stats.totalExpense

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1100 }}>

      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>{budget.name}</h1>
            <span style={{
              padding: '4px 10px',
              borderRadius: 8,
              background: '#fee2e2',
              color: '#c8202e',
              fontWeight: 700,
              fontSize: 13,
            }}>
              🔒 Clôturé
            </span>
          </div>
          <div style={{ marginTop: 6, color: '#64748b', fontSize: 14 }}>
            Clôturé le {formatDate(budget.closed_at)} · Lecture seule
          </div>
        </div>
        <Link
          href="/budgets/archived"
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            background: 'white',
            color: '#374151',
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          ← Budgets clôturés
        </Link>
      </div>

      {/* Chiffres clés */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 24 }}>
        {[
          { label: 'Recettes réalisées', value: euros(stats.totalIncome), color: '#15803d' },
          { label: 'Dépenses réalisées', value: euros(stats.totalExpense), color: '#c8202e' },
          { label: 'Prévisionnel dépenses', value: euros(stats.forecastExpense), color: '#374151' },
          {
            label: 'Solde dépenses',
            value: euros(Math.abs(soldeExpense)) + (soldeExpense >= 0 ? ' restant' : ' dépassé'),
            color: soldeExpense >= 0 ? '#15803d' : '#c8202e',
          },
          ...(stats.missingReceipts > 0 ? [{
            label: 'PJ manquantes',
            value: `${stats.missingReceipts} transaction(s)`,
            color: '#b45309',
          }] : []),
        ].map((card) => (
          <div key={card.label} style={{
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: 16,
            background: 'white',
          }}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {card.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: card.color, marginTop: 6 }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Détail dépenses par catégorie */}
      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>Dépenses par catégorie</h2>

        {expensesByCategory.length === 0 ? (
          <div style={{ opacity: 0.6 }}>Aucune dépense enregistrée.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                {['Catégorie', 'Prévisionnel', 'Réalisé', 'Solde', 'PJ manquantes'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 13, color: '#374151' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {expensesByCategory.map((cat) => {
                const solde = cat.previsionnel - cat.realise
                return (
                  <tr key={cat.name} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700 }}>{cat.name}</td>
                    <td style={{ padding: '10px 12px', color: '#374151' }}>
                      {cat.previsionnel > 0 ? euros(cat.previsionnel) : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#c8202e', fontWeight: 600 }}>
                      {euros(cat.realise)}
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: solde >= 0 ? '#15803d' : '#c8202e' }}>
                      {cat.previsionnel > 0 ? euros(solde) : '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {cat.pjMissing > 0 ? (
                        <span style={{ color: '#b45309', fontWeight: 600 }}>⚠️ {cat.pjMissing}</span>
                      ) : (
                        <span style={{ color: '#15803d' }}>✓</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Lien vers PJ manquantes si besoin */}
      {stats.missingReceipts > 0 && (
        <div style={{ marginTop: 20, padding: 16, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10 }}>
          <span style={{ fontWeight: 700, color: '#92400e' }}>
            ⚠️ {stats.missingReceipts} transaction(s) ont des pièces justificatives manquantes sur ce budget clôturé.
          </span>
          <Link
            href="/receipts/missing"
            style={{ marginLeft: 12, color: '#c8202e', fontWeight: 700, fontSize: 13 }}
          >
            Voir les PJ manquantes →
          </Link>
        </div>
      )}

    </main>
  )
}
