'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Budget = {
  id: string
  name: string
  ordre: number
  is_archived: boolean | null
  closed_at: string | null
}

type AllocationCountRow = {
  budget_id: string
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default function ArchivedBudgetsPage() {
  const [loading, setLoading] = useState(true)
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [usedBudgetIds, setUsedBudgetIds] = useState<string[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [reopeningId, setReopeningId] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

    const [
      { data: budgetsData, error: e1 },
      { data: allocsData, error: e2 },
    ] = await Promise.all([
      supabase
        .from('budgets')
        .select('id,name,ordre,is_archived,closed_at')
        .eq('is_archived', true)
        .order('closed_at', { ascending: false }),
      supabase
        .from('transaction_allocations')
        .select('budget_id'),
    ])

    if (e1 || e2) {
      console.error(e1 || e2)
      alert('Erreur chargement budgets clôturés')
      setLoading(false)
      return
    }

    setBudgets((budgetsData ?? []) as Budget[])
    setUsedBudgetIds(
      Array.from(new Set(((allocsData ?? []) as AllocationCountRow[]).map((r) => r.budget_id)))
    )
    setLoading(false)
  }

  async function reopenBudget(budgetId: string, name: string) {
    const ok = confirm(`Réouvrir le budget "${name}" ?\n\nIl redeviendra actif et visible dans les vues principales.`)
    if (!ok) return

    setReopeningId(budgetId)
    try {
      const { error } = await supabase
        .from('budgets')
        .update({ is_archived: false, closed_at: null })
        .eq('id', budgetId)
      if (error) throw error
      await load()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur réouverture : ${e?.message ?? 'inconnue'}`)
    } finally {
      setReopeningId(null)
    }
  }

  async function deleteBudget(budgetId: string) {
    const hasTransactions = usedBudgetIds.includes(budgetId)
    if (hasTransactions) {
      alert('Impossible de supprimer ce budget : des transactions lui sont liées.')
      return
    }

    const ok = confirm('Supprimer définitivement ce budget ?')
    if (!ok) return

    setDeletingId(budgetId)
    try {
      const { error } = await supabase
        .from('budgets')
        .delete()
        .eq('id', budgetId)
      if (error) throw error
      await load()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur suppression budget : ${e?.message ?? 'inconnue'}`)
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Chargement…</main>
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1000 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900 }}>Budgets clôturés</h1>
      <p style={{ marginTop: 6, color: '#64748b', fontSize: 14 }}>
        Ces budgets sont clôturés mais restent accessibles pour les justificatifs manquants, les remboursements et les rapports.
      </p>

      <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
        {budgets.map((budget) => {
          const hasTransactions = usedBudgetIds.includes(budget.id)

          return (
            <div
              key={budget.id}
              style={{
                border: '1px solid #e5e7eb',
                borderLeft: '4px solid #c8202e',
                borderRadius: 12,
                padding: 16,
                background: 'white',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 16,
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{budget.name}</div>
                <div style={{ marginTop: 4, fontSize: 13, color: '#64748b' }}>
                  {budget.closed_at
                    ? `🔒 Clôturé le ${formatDate(budget.closed_at)}`
                    : '🔒 Clôturé (date inconnue)'}
                </div>
                {hasTransactions && (
                  <div style={{ marginTop: 4, fontSize: 12, color: '#92400e' }}>
                    ⚠️ Des transactions sont liées — suppression impossible
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => reopenBudget(budget.id, budget.name)}
                  disabled={reopeningId === budget.id}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid #16a34a',
                    background: 'white',
                    color: '#16a34a',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  {reopeningId === budget.id ? 'Réouverture…' : '🔓 Réouvrir'}
                </button>

                <button
                  onClick={() => deleteBudget(budget.id)}
                  disabled={hasTransactions || deletingId === budget.id}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #ddd',
                    background: hasTransactions ? '#f5f5f5' : '#fff7f7',
                    color: hasTransactions ? '#aaa' : '#c8202e',
                    cursor: hasTransactions ? 'not-allowed' : 'pointer',
                    fontSize: 13,
                  }}
                >
                  {deletingId === budget.id ? 'Suppression…' : 'Supprimer'}
                </button>
              </div>
            </div>
          )
        })}

        {budgets.length === 0 && (
          <div style={{ opacity: 0.7 }}>Aucun budget clôturé.</div>
        )}
      </div>
    </main>
  )
}
