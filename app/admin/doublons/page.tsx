'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type FiscalYear = {
  id: string
  year: number
}

type Transaction = {
  id: string
  tx_date: string
  kind: 'income' | 'expense'
  description: string | null
  amount_cents: number
  receipt_status: string | null
  receipt_path: string | null
  fiscal_year_id: string | null
}

type Allocation = {
  transaction_id: string
  budget_id: string
  budget:
    | { name: string }
    | { name: string }[]
    | null
}

type DuplicateGroup = {
  key: string
  tx_date: string
  amount_cents: number
  items: Transaction[]
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

function formatFrDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

function firstObj<T>(value: T | T[] | null): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

export default function AdminDoublonsPage() {
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [years, setYears] = useState<FiscalYear[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [allocations, setAllocations] = useState<Allocation[]>([])

  const [selectedYearId, setSelectedYearId] = useState<string>('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

    const [
      { data: fyData, error: fyErr },
      { data: txData, error: txErr },
      { data: allocData, error: allocErr },
    ] = await Promise.all([
      supabase
        .from('fiscal_years')
        .select('id,year')
        .order('year', { ascending: false }),

      supabase
        .from('transactions')
        .select('id,tx_date,kind,description,amount_cents,receipt_status,receipt_path,fiscal_year_id')
        .order('tx_date', { ascending: false }),

      supabase
        .from('transaction_allocations')
        .select('transaction_id,budget_id,budget:budgets(name)'),
    ])

    if (fyErr || txErr || allocErr) {
      console.error(fyErr || txErr || allocErr)
      alert('Erreur chargement doublons')
      setLoading(false)
      return
    }

    const yearsData = (fyData ?? []) as FiscalYear[]
    setYears(yearsData)
    setTransactions((txData ?? []) as Transaction[])
    setAllocations((allocData ?? []) as Allocation[])

    if (!selectedYearId && yearsData.length > 0) {
      setSelectedYearId(yearsData[0].id)
    }

    setLoading(false)
  }

  async function deleteTransaction(txId: string) {
    const ok = confirm('Supprimer cette transaction ? Cette action est définitive.')
    if (!ok) return

    setDeletingId(txId)

    try {
      await supabase.from('receipt_requests').delete().eq('transaction_id', txId)
      await supabase.from('rescrit_requests').delete().eq('transaction_id', txId)

      const { error: allocErr } = await supabase
        .from('transaction_allocations')
        .delete()
        .eq('transaction_id', txId)

      if (allocErr) throw allocErr

      const { error: txErr } = await supabase
        .from('transactions')
        .delete()
        .eq('id', txId)

      if (txErr) throw txErr

      alert('✅ Transaction supprimée')
      await load()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur suppression : ${e?.message ?? 'inconnue'}`)
    } finally {
      setDeletingId(null)
    }
  }

  const txBudgetMap = useMemo(() => {
    const map: Record<string, string[]> = {}

    for (const a of allocations) {
      if (!map[a.transaction_id]) map[a.transaction_id] = []
      const budget = firstObj(a.budget)
      if (budget?.name && !map[a.transaction_id].includes(budget.name)) {
        map[a.transaction_id].push(budget.name)
      }
    }

    return map
  }, [allocations])

  const duplicateGroups = useMemo<DuplicateGroup[]>(() => {
    const filtered = transactions.filter((tx) => {
      if (!selectedYearId) return true
      return tx.fiscal_year_id === selectedYearId
    })

    const byKey = new Map<string, Transaction[]>()

    for (const tx of filtered) {
      const key = `${tx.tx_date}__${tx.amount_cents}`
      const current = byKey.get(key) ?? []
      current.push(tx)
      byKey.set(key, current)
    }

    const groups: DuplicateGroup[] = []

    for (const [key, items] of byKey.entries()) {
      if (items.length > 1) {
        groups.push({
          key,
          tx_date: items[0].tx_date,
          amount_cents: items[0].amount_cents,
          items: items.sort((a, b) => {
            const byDate = b.tx_date.localeCompare(a.tx_date)
            if (byDate !== 0) return byDate
            return (a.description ?? '').localeCompare(b.description ?? '')
          }),
        })
      }
    }

    groups.sort((a, b) => {
      const byDate = b.tx_date.localeCompare(a.tx_date)
      if (byDate !== 0) return byDate
      return b.amount_cents - a.amount_cents
    })

    return groups
  }, [transactions, selectedYearId])

  const totalPotentialDuplicates = duplicateGroups.reduce((sum, g) => sum + g.items.length, 0)

  if (loading) {
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Chargement…</main>
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1200 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900 }}>Admin — Doublons transactions</h1>

      <div style={{ marginTop: 8, opacity: 0.8 }}>
        Cette page affiche les transactions ayant exactement la même <b>date</b> et le même <b>montant</b>.
        Ce sont des doublons potentiels à vérifier.
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>Année :</label>
        <select
          value={selectedYearId}
          onChange={(e) => setSelectedYearId(e.target.value)}
          style={{ padding: 8, minWidth: 140 }}
        >
          <option value="">Toutes les années</option>
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.year}
            </option>
          ))}
        </select>

        <div style={{ opacity: 0.75 }}>
          {duplicateGroups.length} groupe(s) de doublons potentiels — {totalPotentialDuplicates} transaction(s)
        </div>
      </div>

      <div style={{ marginTop: 24, display: 'grid', gap: 16 }}>
        {duplicateGroups.map((group) => (
          <div
            key={group.key}
            style={{
              border: '1px solid #ddd',
              borderRadius: 12,
              padding: 16,
              background: '#fffaf5',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 18 }}>
              {formatFrDate(group.tx_date)} — {centsToEuros(group.amount_cents)} €
            </div>

            <div style={{ marginTop: 6, opacity: 0.75 }}>
              {group.items.length} transaction(s) avec la même date et le même montant
            </div>

            <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
              {group.items.map((tx) => {
                const linkedBudgets = txBudgetMap[tx.id] ?? []

                return (
                  <div
                    key={tx.id}
                    style={{
                      border: '1px solid #e8d9c7',
                      borderRadius: 10,
                      padding: 12,
                      background: 'white',
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto',
                        gap: 12,
                        alignItems: 'start',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>
                          {tx.description || 'Sans libellé'}
                        </div>

                        <div style={{ marginTop: 4, fontSize: 14, opacity: 0.75 }}>
                          ID : <code>{tx.id}</code>
                        </div>

                        <div style={{ marginTop: 4, fontSize: 14, opacity: 0.75 }}>
                          Type : {tx.kind === 'expense' ? 'Dépense' : 'Recette'}
                        </div>

                        {linkedBudgets.length > 0 && (
                          <div style={{ marginTop: 4, fontSize: 14, opacity: 0.75 }}>
                            Budget{linkedBudgets.length > 1 ? 's' : ''} : <b>{linkedBudgets.join(', ')}</b>
                          </div>
                        )}

                        <div style={{ marginTop: 4, fontSize: 14, opacity: 0.75 }}>
                          PJ : {tx.receipt_status ?? '—'}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gap: 8, minWidth: 180 }}>
                        <a
                          href={`/transactions/${tx.id}/edit`}
                          style={{
                            textDecoration: 'none',
                            border: '1px solid #ddd',
                            borderRadius: 8,
                            padding: '8px 10px',
                            color: 'inherit',
                            textAlign: 'center',
                          }}
                        >
                          Voir / modifier
                        </a>

                        <button
                          onClick={() => deleteTransaction(tx.id)}
                          disabled={deletingId === tx.id}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: '1px solid #d9b3b3',
                            background: deletingId === tx.id ? '#f3f3f3' : '#fff7f7',
                            cursor: deletingId === tx.id ? 'default' : 'pointer',
                          }}
                        >
                          {deletingId === tx.id ? 'Suppression…' : 'Supprimer'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {duplicateGroups.length === 0 && (
          <div style={{ opacity: 0.7 }}>
            Aucun doublon potentiel pour ce filtre 🎉
          </div>
        )}
      </div>
    </main>
  )
}
