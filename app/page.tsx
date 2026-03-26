'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useUserPermissions } from '@/lib/useUserPermissions'

type Budget = {
  id: string
  name: string
  is_archived: boolean | null
  ordre: number
}

type FiscalYear = {
  id: string
  year: number
}

type AllocationRow = {
  id: string
  budget_id: string
  amount_cents: number
  transaction: {
    kind: 'income' | 'expense'
    fiscal_year_id: string | null
    receipt_status: string
  } | null
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

export default function HomePage() {
  const [loading, setLoading] = useState(true)
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [allocations, setAllocations] = useState<AllocationRow[]>([])
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([])
  const [selectedYear, setSelectedYear] = useState<string>('')

  const { permissions, loading: permissionsLoading } = useUserPermissions()

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

    const [
      { data: budgetsData },
      { data: allocData },
      { data: fyData },
    ] = await Promise.all([
      supabase
        .from('budgets')
        .select('id,name,is_archived,ordre')
        .eq('is_archived', false)
        .order('ordre'),

      supabase
        .from('transaction_allocations')
        .select(`
          id,
          budget_id,
          amount_cents,
          transaction:transactions(kind,fiscal_year_id,receipt_status)
        `),

      supabase
        .from('fiscal_years')
        .select('id,year')
        .order('year', { ascending: false }),
    ])

    setBudgets(budgetsData ?? [])
    setAllocations(allocData ?? [])
    setFiscalYears(fyData ?? [])

    if (fyData && fyData.length > 0) {
      setSelectedYear(fyData[0].id)
    }

    setLoading(false)
  }

  const globalStats = useMemo(() => {
    let income = 0
    let expense = 0

    for (const row of allocations) {
      const tx = row.transaction
      if (!tx) continue

      if (selectedYear && tx.fiscal_year_id !== selectedYear) continue

      if (tx.kind === 'income') {
        income += row.amount_cents
      } else {
        expense += row.amount_cents
      }
    }

    return { income, expense }
  }, [allocations, selectedYear])

  if (loading || permissionsLoading) {
    return <main style={{ padding: 24 }}>Chargement...</main>
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 900 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900 }}>
        Tableau de bord
      </h1>

      {/* 🔥 DEBUG TEMPORAIRE */}
      <div style={{ marginBottom: 20 }}>
        <b>Permissions utilisateur :</b>
        <pre>{JSON.stringify(permissions, null, 2)}</pre>
      </div>

      <div style={{ marginTop: 20 }}>
        <label>Année :</label>{' '}
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
        >
          {fiscalYears.map((fy) => (
            <option key={fy.id} value={fy.id}>
              {fy.year}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 20 }}>
        <div>
          Recettes : <b>{centsToEuros(globalStats.income)} €</b>
        </div>
        <div>
          Dépenses : <b>{centsToEuros(globalStats.expense)} €</b>
        </div>
      </div>
    </main>
  )
}