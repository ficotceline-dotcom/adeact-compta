'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Budget = {
  id: string
  name: string
  ordre: number
}

type ForecastRow = Record<string, any>

type AllocationRow = {
  budget_id: string | null
  transaction_id: string | null
  category_id: string | null
  subcategory_id: string | null
  amount_cents: number | null
}

type TransactionRow = {
  id: string
  kind: 'income' | 'expense' | string
}

type CategoryRow = {
  id: string
  name: string
}

type SubcategoryRow = {
  id: string
  name: string
  category_id: string | null
}

type DetailSubcategory = {
  name: string
  forecast_cents: number
  actual_cents: number
  diff_cents: number
}

type DetailCategory = {
  name: string
  forecast_cents: number
  actual_cents: number
  diff_cents: number
  subcategories: DetailSubcategory[]
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

function diffColor(kind: 'income' | 'expense', diff: number) {
  if (kind === 'expense') {
    return diff > 0 ? 'red' : 'green'
  }
  return diff < 0 ? 'red' : 'green'
}

function readBudgetId(row: ForecastRow): string | null {
  return row?.budget_id ?? row?.budgetId ?? null
}

function readCategoryId(row: ForecastRow): string | null {
  return row?.category_id ?? row?.categoryId ?? null
}

function readSubcategoryId(row: ForecastRow): string | null {
  return row?.subcategory_id ?? row?.subcategoryId ?? null
}

function readKind(row: ForecastRow): 'income' | 'expense' | null {
  const raw = row?.kind ?? row?.type ?? row?.forecast_type ?? row?.nature ?? null
  if (raw === 'income' || raw === 'expense') return raw
  if (raw === 'recette') return 'income'
  if (raw === 'depense' || raw === 'dépense') return 'expense'
  return null
}

function readAmountCents(row: ForecastRow): number {
  const integerCandidates = [
    row?.amount_cents,
    row?.forecast_cents,
    row?.planned_amount_cents,
    row?.previsionnel_cents,
    row?.montant_cents,
  ]

  for (const value of integerCandidates) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }

  const decimalCandidates = [
    row?.amount,
    row?.forecast_amount,
    row?.planned_amount,
    row?.previsionnel,
    row?.montant,
  ]

  for (const value of decimalCandidates) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.round(value * 100)
    }
  }

  return 0
}

function buildDetailedComparison(
  budgetId: string,
  kind: 'income' | 'expense',
  forecastRows: ForecastRow[],
  allocationRows: AllocationRow[],
  transactionKindMap: Map<string, 'income' | 'expense'>,
  categoryMap: Map<string, string>,
  subcategoryMap: Map<string, { name: string; category_id: string | null }>
): DetailCategory[] {
  const grouped = new Map<
    string,
    {
      forecast_cents: number
      actual_cents: number
      subs: Map<
        string,
        {
          forecast_cents: number
          actual_cents: number
        }
      >
    }
  >()

  for (const row of forecastRows) {
    if (readBudgetId(row) !== budgetId) continue
    if (readKind(row) !== kind) continue

    const categoryName =
      (readCategoryId(row) && categoryMap.get(readCategoryId(row)!)) || 'Sans catégorie'

    const subcategoryName =
      (readSubcategoryId(row) && subcategoryMap.get(readSubcategoryId(row)!)?.name) ||
      'Sans sous-catégorie'

    if (!grouped.has(categoryName)) {
      grouped.set(categoryName, {
        forecast_cents: 0,
        actual_cents: 0,
        subs: new Map(),
      })
    }

    const cat = grouped.get(categoryName)!
    const amount = readAmountCents(row)

    cat.forecast_cents += amount

    if (!cat.subs.has(subcategoryName)) {
      cat.subs.set(subcategoryName, {
        forecast_cents: 0,
        actual_cents: 0,
      })
    }

    cat.subs.get(subcategoryName)!.forecast_cents += amount
  }

  for (const row of allocationRows) {
    if (row.budget_id !== budgetId) continue
    if (!row.transaction_id) continue
    if (transactionKindMap.get(row.transaction_id) !== kind) continue

    const categoryName =
      (row.category_id && categoryMap.get(row.category_id)) || 'Sans catégorie'

    const subcategoryName =
      (row.subcategory_id && subcategoryMap.get(row.subcategory_id)?.name) ||
      'Sans sous-catégorie'

    if (!grouped.has(categoryName)) {
      grouped.set(categoryName, {
        forecast_cents: 0,
        actual_cents: 0,
        subs: new Map(),
      })
    }

    const cat = grouped.get(categoryName)!
    const amount = row.amount_cents ?? 0

    cat.actual_cents += amount

    if (!cat.subs.has(subcategoryName)) {
      cat.subs.set(subcategoryName, {
        forecast_cents: 0,
        actual_cents: 0,
      })
    }

    cat.subs.get(subcategoryName)!.actual_cents += amount
  }

  return Array.from(grouped.entries())
    .map(([name, value]) => ({
      name,
      forecast_cents: value.forecast_cents,
      actual_cents: value.actual_cents,
      diff_cents: value.actual_cents - value.forecast_cents,
      subcategories: Array.from(value.subs.entries())
        .map(([subName, subValue]) => ({
          name: subName,
          forecast_cents: subValue.forecast_cents,
          actual_cents: subValue.actual_cents,
          diff_cents: subValue.actual_cents - subValue.forecast_cents,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export default function PrevisionnelPage() {
  const [loading, setLoading] = useState(true)
  const [errorDetails, setErrorDetails] = useState('')
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [forecastRows, setForecastRows] = useState<ForecastRow[]>([])
  const [allocationRows, setAllocationRows] = useState<AllocationRow[]>([])
  const [transactionRows, setTransactionRows] = useState<TransactionRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [subcategories, setSubcategories] = useState<SubcategoryRow[]>([])
  const [openBudgetId, setOpenBudgetId] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setErrorDetails('')

    const budgetsRes = await supabase
      .from('budgets')
      .select('id,name,ordre')
      .eq('is_archived', false)
      .order('ordre')

    if (budgetsRes.error) {
      console.error('budgets error', budgetsRes.error)
      setErrorDetails(`budgets: ${budgetsRes.error.message}`)
      alert('Erreur chargement prévisionnel')
      setLoading(false)
      return
    }

    const forecastsRes = await supabase
      .from('budget_forecasts')
      .select('*')

    if (forecastsRes.error) {
      console.error('budget_forecasts error', forecastsRes.error)
      setErrorDetails(`budget_forecasts: ${forecastsRes.error.message}`)
      alert('Erreur chargement prévisionnel')
      setLoading(false)
      return
    }

    const allocationsRes = await supabase
      .from('transaction_allocations')
      .select('budget_id,transaction_id,category_id,subcategory_id,amount_cents')

    if (allocationsRes.error) {
      console.error('transaction_allocations error', allocationsRes.error)
      setErrorDetails(`transaction_allocations: ${allocationsRes.error.message}`)
      alert('Erreur chargement prévisionnel')
      setLoading(false)
      return
    }

    const transactionsRes = await supabase
      .from('transactions')
      .select('id,kind')

    if (transactionsRes.error) {
      console.error('transactions error', transactionsRes.error)
      setErrorDetails(`transactions: ${transactionsRes.error.message}`)
      alert('Erreur chargement prévisionnel')
      setLoading(false)
      return
    }

    const categoriesRes = await supabase
      .from('categories')
      .select('id,name')

    if (categoriesRes.error) {
      console.error('categories error', categoriesRes.error)
      setErrorDetails(`categories: ${categoriesRes.error.message}`)
      alert('Erreur chargement prévisionnel')
      setLoading(false)
      return
    }

    const subcategoriesRes = await supabase
      .from('subcategories')
      .select('id,name,category_id')

    if (subcategoriesRes.error) {
      console.error('subcategories error', subcategoriesRes.error)
      setErrorDetails(`subcategories: ${subcategoriesRes.error.message}`)
      alert('Erreur chargement prévisionnel')
      setLoading(false)
      return
    }

    setBudgets((budgetsRes.data ?? []) as Budget[])
    setForecastRows((forecastsRes.data ?? []) as ForecastRow[])
    setAllocationRows((allocationsRes.data ?? []) as AllocationRow[])
    setTransactionRows((transactionsRes.data ?? []) as TransactionRow[])
    setCategories((categoriesRes.data ?? []) as CategoryRow[])
    setSubcategories((subcategoriesRes.data ?? []) as SubcategoryRow[])
    setLoading(false)
  }

  const transactionKindMap = useMemo(() => {
    const map = new Map<string, 'income' | 'expense'>()

    for (const tx of transactionRows) {
      if (tx.kind === 'income' || tx.kind === 'expense') {
        map.set(tx.id, tx.kind)
      }
    }

    return map
  }, [transactionRows])

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories) {
      map.set(c.id, c.name)
    }
    return map
  }, [categories])

  const subcategoryMap = useMemo(() => {
    const map = new Map<string, { name: string; category_id: string | null }>()
    for (const s of subcategories) {
      map.set(s.id, { name: s.name, category_id: s.category_id })
    }
    return map
  }, [subcategories])

  const byBudget = useMemo(() => {
    return budgets.map((budget) => {
      const budgetForecasts = forecastRows.filter(
        (row) => readBudgetId(row) === budget.id
      )

      const budgetActuals = allocationRows.filter(
        (row) => row.budget_id === budget.id
      )

      const incomeForecast = budgetForecasts
        .filter((row) => readKind(row) === 'income')
        .reduce((sum, row) => sum + readAmountCents(row), 0)

      const expenseForecast = budgetForecasts
        .filter((row) => readKind(row) === 'expense')
        .reduce((sum, row) => sum + readAmountCents(row), 0)

      const incomeActual = budgetActuals
        .filter((row) => {
          if (!row.transaction_id) return false
          return transactionKindMap.get(row.transaction_id) === 'income'
        })
        .reduce((sum, row) => sum + (row.amount_cents ?? 0), 0)

      const expenseActual = budgetActuals
        .filter((row) => {
          if (!row.transaction_id) return false
          return transactionKindMap.get(row.transaction_id) === 'expense'
        })
        .reduce((sum, row) => sum + (row.amount_cents ?? 0), 0)

      const incomeDetails = buildDetailedComparison(
        budget.id,
        'income',
        forecastRows,
        allocationRows,
        transactionKindMap,
        categoryMap,
        subcategoryMap
      )

      const expenseDetails = buildDetailedComparison(
        budget.id,
        'expense',
        forecastRows,
        allocationRows,
        transactionKindMap,
        categoryMap,
        subcategoryMap
      )

      return {
        budget,
        incomeForecast,
        incomeActual,
        incomeDiff: incomeActual - incomeForecast,
        expenseForecast,
        expenseActual,
        expenseDiff: expenseActual - expenseForecast,
        incomeDetails,
        expenseDetails,
      }
    })
  }, [budgets, forecastRows, allocationRows, transactionKindMap, categoryMap, subcategoryMap])

  if (loading) {
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Chargement…</main>
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1250 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900 }}>Prévisionnel vs réalisé</h1>

      {errorDetails && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            border: '1px solid #e5bcbc',
            background: '#fff5f5',
            borderRadius: 10,
            color: '#8a1f1f',
            whiteSpace: 'pre-wrap',
          }}
        >
          {errorDetails}
        </div>
      )}

      <div style={{ marginTop: 10, opacity: 0.75 }}>
        Le comparatif est affiché par budget. Si aucun prévisionnel n’a encore été saisi, le prévisionnel reste à 0.
      </div>

      <div style={{ marginTop: 18, display: 'grid', gap: 16 }}>
        {byBudget.map((row) => {
          const isOpen = openBudgetId === row.budget.id

          return (
            <div
              key={row.budget.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: 14,
                padding: 18,
                background: 'white',
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 14 }}>
                {row.budget.name}
              </div>

              <button
                onClick={() =>
                  setOpenBudgetId((prev) => (prev === row.budget.id ? null : row.budget.id))
                }
                style={{
                  marginBottom: 14,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #ccc',
                  cursor: 'pointer',
                  background: isOpen ? '#f3f3f3' : '#f7f7f7',
                }}
              >
                {isOpen ? 'Masquer le détail' : 'Voir le détail'}
              </button>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 18,
                }}
              >
                <div
                  style={{
                    background: '#eef9ee',
                    border: '1px solid #d8ecd8',
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 12 }}>
                    Recettes
                  </div>

                  <div style={summaryLineStyle}>
                    <span>Prévisionnel</span>
                    <b>{centsToEuros(row.incomeForecast)} €</b>
                  </div>

                  <div style={summaryLineStyle}>
                    <span>Réalisé</span>
                    <b>{centsToEuros(row.incomeActual)} €</b>
                  </div>

                  <div style={summaryLineStyle}>
                    <span>Écart</span>
                    <b style={{ color: diffColor('income', row.incomeDiff) }}>
                      {row.incomeDiff >= 0 ? '+' : ''}
                      {centsToEuros(row.incomeDiff)} €
                    </b>
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: 18, display: 'grid', gap: 14 }}>
                      {row.incomeDetails.length > 0 ? (
                        row.incomeDetails.map((cat) => (
                          <div key={`income-${row.budget.id}-${cat.name}`}>
                            <div style={categoryHeaderStyle}>
                              <div>{cat.name}</div>
                              <div style={{ display: 'flex', gap: 18 }}>
                                <span>{centsToEuros(cat.forecast_cents)} €</span>
                                <span>{centsToEuros(cat.actual_cents)} €</span>
                                <span style={{ color: diffColor('income', cat.diff_cents) }}>
                                  {cat.diff_cents >= 0 ? '+' : ''}
                                  {centsToEuros(cat.diff_cents)} €
                                </span>
                              </div>
                            </div>

                            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                              {cat.subcategories.map((sub) => (
                                <div
                                  key={`income-${row.budget.id}-${cat.name}-${sub.name}`}
                                  style={subLineStyle}
                                >
                                  <div>{sub.name}</div>
                                  <div style={{ display: 'flex', gap: 18 }}>
                                    <span>{centsToEuros(sub.forecast_cents)} €</span>
                                    <span>{centsToEuros(sub.actual_cents)} €</span>
                                    <span style={{ color: diffColor('income', sub.diff_cents) }}>
                                      {sub.diff_cents >= 0 ? '+' : ''}
                                      {centsToEuros(sub.diff_cents)} €
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={{ opacity: 0.7 }}>Aucune recette.</div>
                      )}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    background: '#fdf0f0',
                    border: '1px solid #efdada',
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 12 }}>
                    Dépenses
                  </div>

                  <div style={summaryLineStyle}>
                    <span>Prévisionnel</span>
                    <b>{centsToEuros(row.expenseForecast)} €</b>
                  </div>

                  <div style={summaryLineStyle}>
                    <span>Réalisé</span>
                    <b>{centsToEuros(row.expenseActual)} €</b>
                  </div>

                  <div style={summaryLineStyle}>
                    <span>Écart</span>
                    <b style={{ color: diffColor('expense', row.expenseDiff) }}>
                      {row.expenseDiff >= 0 ? '+' : ''}
                      {centsToEuros(row.expenseDiff)} €
                    </b>
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: 18, display: 'grid', gap: 14 }}>
                      {row.expenseDetails.length > 0 ? (
                        row.expenseDetails.map((cat) => (
                          <div key={`expense-${row.budget.id}-${cat.name}`}>
                            <div style={categoryHeaderStyle}>
                              <div>{cat.name}</div>
                              <div style={{ display: 'flex', gap: 18 }}>
                                <span>{centsToEuros(cat.forecast_cents)} €</span>
                                <span>{centsToEuros(cat.actual_cents)} €</span>
                                <span style={{ color: diffColor('expense', cat.diff_cents) }}>
                                  {cat.diff_cents >= 0 ? '+' : ''}
                                  {centsToEuros(cat.diff_cents)} €
                                </span>
                              </div>
                            </div>

                            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                              {cat.subcategories.map((sub) => (
                                <div
                                  key={`expense-${row.budget.id}-${cat.name}-${sub.name}`}
                                  style={subLineStyle}
                                >
                                  <div>{sub.name}</div>
                                  <div style={{ display: 'flex', gap: 18 }}>
                                    <span>{centsToEuros(sub.forecast_cents)} €</span>
                                    <span>{centsToEuros(sub.actual_cents)} €</span>
                                    <span style={{ color: diffColor('expense', sub.diff_cents) }}>
                                      {sub.diff_cents >= 0 ? '+' : ''}
                                      {centsToEuros(sub.diff_cents)} €
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={{ opacity: 0.7 }}>Aucune dépense.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {isOpen && (
                <div
                  style={{
                    marginTop: 12,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 18,
                    fontSize: 13,
                    opacity: 0.7,
                  }}
                >
                  <div>
                    Colonnes détail : <b>Prévisionnel</b> / <b>Réalisé</b> / <b>Écart</b>
                  </div>
                  <div>
                    Colonnes détail : <b>Prévisionnel</b> / <b>Réalisé</b> / <b>Écart</b>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {byBudget.length === 0 && (
          <div style={{ opacity: 0.7 }}>Aucun budget trouvé.</div>
        )}
      </div>
    </main>
  )
}

const summaryLineStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  padding: '8px 0',
}

const categoryHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  fontWeight: 800,
  alignItems: 'center',
  flexWrap: 'wrap',
}

const subLineStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  paddingLeft: 14,
  opacity: 0.92,
  alignItems: 'center',
  flexWrap: 'wrap',
}
