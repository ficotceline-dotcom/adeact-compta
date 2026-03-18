'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

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

type TxDateRow = {
  tx_date: string | null
}

type AllocationRow = {
  id: string
  budget_id: string
  amount_cents: number
  budget:
    | { id: string; name: string; ordre: number }
    | { id: string; name: string; ordre: number }[]
    | null
  category:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null
  subcategory:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null
  transaction:
    | {
        id: string
        kind: 'income' | 'expense'
        receipt_status: string
        tx_date: string
        fiscal_year_id: string | null
        description: string | null
      }
    | {
        id: string
        kind: 'income' | 'expense'
        receipt_status: string
        tx_date: string
        fiscal_year_id: string | null
        description: string | null
      }[]
    | null
}

type GroupedSubcategory = {
  name: string
  amount_cents: number
}

type GroupedCategory = {
  name: string
  amount_cents: number
  subcategories: GroupedSubcategory[]
}

function firstObj<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

function formatFrDate(dateStr: string | null) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

function getMaxTxDate(rows: TxDateRow[]): string | null {
  const dates = rows.map((r) => r.tx_date).filter((d): d is string => Boolean(d))
  if (dates.length === 0) return null
  return dates.reduce((max, current) => (current > max ? current : max))
}

function groupBudgetSide(
  rows: AllocationRow[],
  kind: 'income' | 'expense'
): GroupedCategory[] {
  const categoryMap = new Map<string, { amount_cents: number; subMap: Map<string, number> }>()

  for (const row of rows) {
    const tx = firstObj(row.transaction)
    if (!tx || tx.kind !== kind) continue

    const categoryName = firstObj(row.category)?.name ?? 'Sans catégorie'
    const subcategoryName = firstObj(row.subcategory)?.name ?? 'Sans sous-catégorie'

    if (!categoryMap.has(categoryName)) {
      categoryMap.set(categoryName, {
        amount_cents: 0,
        subMap: new Map<string, number>(),
      })
    }

    const categoryEntry = categoryMap.get(categoryName)!
    categoryEntry.amount_cents += row.amount_cents
    categoryEntry.subMap.set(
      subcategoryName,
      (categoryEntry.subMap.get(subcategoryName) ?? 0) + row.amount_cents
    )
  }

  return Array.from(categoryMap.entries())
    .map(([name, value]) => ({
      name,
      amount_cents: value.amount_cents,
      subcategories: Array.from(value.subMap.entries())
        .map(([subName, amount]) => ({
          name: subName,
          amount_cents: amount,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export default function HomePage() {
  const [loading, setLoading] = useState(true)

  const [budgets, setBudgets] = useState<Budget[]>([])
  const [allocations, setAllocations] = useState<AllocationRow[]>([])
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([])

  const [selectedYear, setSelectedYear] = useState<string>('')
  const [lastTxDate, setLastTxDate] = useState<string | null>(null)
  const [openBudgetId, setOpenBudgetId] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

    const [
      { data: budgetsData, error: e1 },
      { data: allocData, error: e2 },
      { data: fyData, error: e3 },
      { data: txDates, error: e4 },
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
          budget:budgets(id,name,ordre),
          category:categories(id,name),
          subcategory:subcategories(id,name),
          transaction:transactions(id,kind,receipt_status,tx_date,fiscal_year_id,description)
        `),

      supabase
        .from('fiscal_years')
        .select('id,year')
        .order('year', { ascending: false }),

      supabase
        .from('transactions')
        .select('tx_date'),
    ])

    if (e1 || e2 || e3 || e4) {
      console.error(e1 || e2 || e3 || e4)
      alert('Erreur chargement accueil')
      setLoading(false)
      return
    }

    const years = (fyData ?? []) as FiscalYear[]
    const allocs = (allocData ?? []) as AllocationRow[]
    const txDateRows = (txDates ?? []) as TxDateRow[]

    setBudgets((budgetsData ?? []) as Budget[])
    setAllocations(allocs)
    setFiscalYears(years)

    if (years.length > 0) {
      setSelectedYear(years[0].id)
    }

    setLastTxDate(getMaxTxDate(txDateRows))
    setLoading(false)
  }

  const globalStats = useMemo(() => {
    let totalIncome = 0
    let totalExpense = 0
    let missingReceipts = 0

    for (const row of allocations) {
      const tx = firstObj(row.transaction)
      if (!tx) continue

      if (selectedYear && tx.fiscal_year_id !== selectedYear) continue

      if (tx.kind === 'income') {
        totalIncome += row.amount_cents
      } else {
        totalExpense += row.amount_cents
        if (tx.receipt_status === 'PJ manquante') {
          missingReceipts++
        }
      }
    }

    return {
      totalIncome,
      totalExpense,
      missingReceipts,
      result: totalIncome - totalExpense,
    }
  }, [allocations, selectedYear])

  function getBudgetRows(budgetId: string) {
    return allocations.filter((a) => a.budget_id === budgetId)
  }

  function getBudgetSummary(budgetId: string) {
    const rows = getBudgetRows(budgetId)

    let income = 0
    let expense = 0
    let budgetMissingReceipts = 0

    for (const row of rows) {
      const tx = firstObj(row.transaction)
      if (!tx) continue

      if (tx.kind === 'income') {
        income += row.amount_cents
      } else {
        expense += row.amount_cents
        if (tx.receipt_status === 'PJ manquante') {
          budgetMissingReceipts++
        }
      }
    }

    return {
      income,
      expense,
      budgetMissingReceipts,
      result: income - expense,
    }
  }

  if (loading) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui' }}>
        Chargement…
      </main>
    )
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1250 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900 }}>
        ADEACT — Tableau de bord
      </h1>

      <div
        style={{
          marginTop: 6,
          padding: '8px 12px',
          borderRadius: 8,
          background: '#f5f5f5',
          display: 'inline-block',
          fontSize: 14,
        }}
      >
        Dernière date de transaction : <b>{formatFrDate(lastTxDate)}</b>
      </div>

      <div style={{ marginTop: 25 }}>
        <label>Année civile :</label>{' '}
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          style={{ padding: 6 }}
        >
          {fiscalYears.map((fy) => (
            <option key={fy.id} value={fy.id}>
              {fy.year}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          marginTop: 20,
          display: 'flex',
          gap: 30,
          flexWrap: 'wrap',
          padding: 16,
          border: '1px solid #e6e6e6',
          borderRadius: 12,
          background: 'white',
        }}
      >
        <div>
          Recettes : <b>{centsToEuros(globalStats.totalIncome)} €</b>
        </div>

        <div>
          Dépenses : <b>{centsToEuros(globalStats.totalExpense)} €</b>
        </div>

        <div>
          Résultat :{' '}
          <b style={{ color: globalStats.result >= 0 ? 'green' : 'red' }}>
            {centsToEuros(globalStats.result)} €
          </b>
        </div>

        <div>
          PJ manquantes : <b>{globalStats.missingReceipts}</b>
        </div>
      </div>

      <div
        style={{
          marginTop: 30,
          display: 'grid',
          gap: 16,
        }}
      >
        {budgets.map((budget) => {
          const rows = getBudgetRows(budget.id)
          const summary = getBudgetSummary(budget.id)
          const isOpen = openBudgetId === budget.id

          const incomeGroups = groupBudgetSide(rows, 'income')
          const expenseGroups = groupBudgetSide(rows, 'expense')

          return (
            <div
              key={budget.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: 14,
                padding: 18,
                background: 'white',
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 800 }}>
                {budget.name}
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: 'flex',
                  gap: 24,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  Recettes : <b>{centsToEuros(summary.income)} €</b>
                </div>

                <div>
                  Dépenses : <b>{centsToEuros(summary.expense)} €</b>
                </div>

                <div>
                  Résultat :{' '}
                  <b style={{ color: summary.result >= 0 ? 'green' : 'red' }}>
                    {centsToEuros(summary.result)} €
                  </b>
                </div>

                <div>
                  PJ manquantes : <b>{summary.budgetMissingReceipts}</b>
                </div>
              </div>

              <button
                onClick={() =>
                  setOpenBudgetId((prev) => (prev === budget.id ? null : budget.id))
                }
                style={{
                  marginTop: 14,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #ddd',
                  background: isOpen ? '#f3f3f3' : 'white',
                  cursor: 'pointer',
                }}
              >
                {isOpen ? 'Masquer le détail' : 'Voir le détail'}
              </button>

              {isOpen && (
                <div
                  style={{
                    marginTop: 18,
                    borderTop: '1px solid #eee',
                    paddingTop: 18,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 24,
                  }}
                >
                  <div
                    style={{
                      border: '1px solid #eef3ee',
                      background: '#fafdf9',
                      borderRadius: 12,
                      padding: 16,
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 14 }}>
                      Recettes
                    </div>

                    {incomeGroups.length > 0 ? (
                      <div style={{ display: 'grid', gap: 14 }}>
                        {incomeGroups.map((cat) => (
                          <div key={`income-${cat.name}`}>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 12,
                                fontWeight: 800,
                              }}
                            >
                              <div>{cat.name}</div>
                              <div>{centsToEuros(cat.amount_cents)} €</div>
                            </div>

                            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                              {cat.subcategories.map((sub) => (
                                <div
                                  key={`income-${cat.name}-${sub.name}`}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    paddingLeft: 14,
                                    opacity: 0.9,
                                  }}
                                >
                                  <div>{sub.name}</div>
                                  <div>{centsToEuros(sub.amount_cents)} €</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ opacity: 0.7 }}>Aucune recette.</div>
                    )}
                  </div>

                  <div
                    style={{
                      border: '1px solid #f3eeee',
                      background: '#fdfafa',
                      borderRadius: 12,
                      padding: 16,
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 14 }}>
                      Dépenses
                    </div>

                    {expenseGroups.length > 0 ? (
                      <div style={{ display: 'grid', gap: 14 }}>
                        {expenseGroups.map((cat) => (
                          <div key={`expense-${cat.name}`}>
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 12,
                                fontWeight: 800,
                              }}
                            >
                              <div>{cat.name}</div>
                              <div>{centsToEuros(cat.amount_cents)} €</div>
                            </div>

                            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                              {cat.subcategories.map((sub) => (
                                <div
                                  key={`expense-${cat.name}-${sub.name}`}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    paddingLeft: 14,
                                    opacity: 0.9,
                                  }}
                                >
                                  <div>{sub.name}</div>
                                  <div>{centsToEuros(sub.amount_cents)} €</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ opacity: 0.7 }}>Aucune dépense.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}
