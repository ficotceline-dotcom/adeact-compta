'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Budget = {
  id: string
  name: string
  ordre: number
  is_archived: boolean | null
}

type AllocationCountRow = {
  budget_id: string
}

export default function ArchivedBudgetsPage() {
  const [loading, setLoading] = useState(true)
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [usedBudgetIds, setUsedBudgetIds] = useState<string[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)

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
        .select('id,name,ordre,is_archived')
        .eq('is_archived', true)
        .order('ordre'),
      supabase
        .from('transaction_allocations')
        .select('budget_id'),
    ])

    if (e1 || e2) {
      console.error(e1 || e2)
      alert('Erreur chargement projets archivés')
      setLoading(false)
      return
    }

    setBudgets((budgetsData ?? []) as Budget[])
    setUsedBudgetIds(
      Array.from(new Set(((allocsData ?? []) as AllocationCountRow[]).map((r) => r.budget_id)))
    )
    setLoading(false)
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

      alert('✅ Budget supprimé')
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
      <h1 style={{ fontSize: 26, fontWeight: 900 }}>Projets archivés</h1>

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        {budgets.map((budget) => {
          const hasTransactions = usedBudgetIds.includes(budget.id)

          return (
            <div
              key={budget.id}
              style={{
                border: '1px solid #ddd',
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
                <div style={{ marginTop: 6, opacity: 0.75 }}>
                  {hasTransactions
                    ? 'Des transactions sont liées à ce budget : suppression impossible.'
                    : 'Aucune transaction liée : suppression possible.'}
                </div>
              </div>

              <button
                onClick={() => deleteBudget(budget.id)}
                disabled={hasTransactions || deletingId === budget.id}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #ddd',
                  background: hasTransactions ? '#f5f5f5' : '#fff7f7',
                  cursor: hasTransactions ? 'not-allowed' : 'pointer',
                }}
              >
                {deletingId === budget.id ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          )
        })}

        {budgets.length === 0 && (
          <div style={{ opacity: 0.7 }}>Aucun projet archivé.</div>
        )}
      </div>
    </main>
  )
}
