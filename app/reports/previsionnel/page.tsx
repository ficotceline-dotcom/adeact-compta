'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Budget = {
  id: string
  name: string
  ordre: number
}

type ForecastRow = {
  budget_id: string | null
  kind: 'income' | 'expense' | string | null
  category_id: string | null
  subcategory_id: string | null
  amount_cents: number | null
}

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
  budget_id: string | null
}

type SubcategoryRow = {
  id: string
  name: string
  category_id: string | null
}

type DetailSubcategory = {
  id: string
  name: string
  forecast_cents: number
  actual_cents: number
  diff_cents: number
}

type DetailCategory = {
  id: string
  name: string
  forecast_cents: number
  actual_cents: number
  diff_cents: number
  subcategories: DetailSubcategory[]
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

function signedEuros(cents: number) {
  return `${cents > 0 ? '+' : ''}${centsToEuros(cents)} €`
}

function diffColor(kind: 'income' | 'expense', diff: number) {
  if (kind === 'expense') {
    return diff > 0 ? 'red' : 'green'
  }
  return diff < 0 ? 'red' : 'green'
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

    const [
      budgetsRes,
      forecastsRes,
      allocationsRes,
      transactionsRes,
      categoriesRes,
      subcategoriesRes,
    ] = await Promise.all([
      supabase
        .from('budgets')
        .select('id,name,ordre')
        .eq('is_archived', false)
        .order('ordre'),

      supabase
        .from('budget_forecasts')
        .select('budget_id,kind,category_id,subcategory_id,amount_cents'),

      supabase
        .from('transaction_allocations')
        .select('budget_id,transaction_id,category_id,subcategory_id,amount_cents'),

      supabase
        .from('transactions')
        .select('id,kind'),

      supabase
        .from('categories')
        .select('id,name,budget_id')
        .order('name'),

      supabase
        .from('subcategories')
        .select('id,name,category_id')
        .order('name'),
    ])

    const firstError =
      budgetsRes.error ||
      forecastsRes.error ||
      allocationsRes.error ||
      transactionsRes.error ||
      categoriesRes.error ||
      subcategoriesRes.error

    if (firstError) {
      console.error({
        budgets: budgetsRes.error,
        forecasts: forecastsRes.error,
        allocations: allocationsRes.error,
        transactions: transactionsRes.error,
        categories: categoriesRes.error,
        subcategories: subcategoriesRes.error,
      })
      setErrorDetails(firstError.message)
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
    const map = new Map<string, CategoryRow>()
    for (const c of categories) map.set(c.id, c)
    return map
  }, [categories])

  const subcategoryMap = useMemo(() => {
    const map = new Map<string, SubcategoryRow>()
    for (const s of subcategories) map.set(s.id, s)
    return map
  }, [subcategories])

  function buildDetails(budgetId: string, kind: 'income' | 'expense'): DetailCategory[] {
    const grouped = new Map<
      string,
      {
        id: string
        name: string
        forecast_cents: number
        actual_cents: number
        subcategories: Map<
          string,
          {
            id: string
            name: string
            forecast_cents: number
            actual_cents: number
          }
        >
      }
    >()

    const budgetCategories = categories.filter((c) => c.budget_id === budgetId)
    const budgetCategoryIds = new Set(budgetCategories.map((c) => c.id))
    const budgetSubcategories = subcategories.filter(
      (s) => s.category_id && budgetCategoryIds.has(s.category_id)
    )

    for (const category of budgetCategories) {
      grouped.set(category.id, {
        id: category.id,
        name: category.name,
        forecast_cents: 0,
        actual_cents: 0,
        subcategories: new Map(),
      })
    }

    for (const sub of budgetSubcategories) {
      if (!sub.category_id) continue
      const category = grouped.get(sub.category_id)
      if (!category) continue

      category.subcategories.set(sub.id, {
        id: sub.id,
        name: sub.name,
        forecast_cents: 0,
        actual_cents: 0,
      })
    }

    for (const row of forecastRows) {
      if (row.budget_id !== budgetId) continue
      if (row.kind !== kind) continue
      if (!row.category_id) continue

      if (!grouped.has(row.category_id)) {
        const cat = categoryMap.get(row.category_id)
        grouped.set(row.category_id, {
          id: row.category_id,
          name: cat?.name ?? 'Sans catégorie',
          forecast_cents: 0,
          actual_cents: 0,
          subcategories: new Map(),
        })
      }

      const category = grouped.get(row.category_id)!
      const amount = row.amount_cents ?? 0
      category.forecast_cents += amount

      if (row.subcategory_id) {
        if (!category.subcategories.has(row.subcategory_id)) {
          const sub = subcategoryMap.get(row.subcategory_id)
          category.subcategories.set(row.subcategory_id, {
            id: row.subcategory_id,
            name: sub?.name ?? 'Sans sous-catégorie',
            forecast_cents: 0,
            actual_cents: 0,
          })
        }

        const sub = category.subcategories.get(row.subcategory_id)!
        sub.forecast_cents += amount
      }
    }

    for (const row of allocationRows) {
      if (row.budget_id !== budgetId) continue
      if (!row.transaction_id) continue
      if (transactionKindMap.get(row.transaction_id) !== kind) continue
      if (!row.category_id) continue

      if (!grouped.has(row.category_id)) {
        const cat = categoryMap.get(row.category_id)
        grouped.set(row.category_id, {
          id: row.category_id,
          name: cat?.name ?? 'Sans catégorie',
          forecast_cents: 0,
          actual_cents: 0,
          subcategories: new Map(),
        })
      }

      const category = grouped.get(row.category_id)!
      const amount = row.amount_cents ?? 0
      category.actual_cents += amount

      if (row.subcategory_id) {
        if (!category.subcategories.has(row.subcategory_id)) {
          const sub = subcategoryMap.get(row.subcategory_id)
          category.subcategories.set(row.subcategory_id, {
            id: row.subcategory_id,
            name: sub?.name ?? 'Sans sous-catégorie',
            forecast_cents: 0,
            actual_cents: 0,
          })
        }

        const sub = category.subcategories.get(row.subcategory_id)!
        sub.actual_cents += amount
      }
    }

    return Array.from(grouped.values())
      .map((category) => ({
        id: category.id,
        name: category.name,
        forecast_cents: category.forecast_cents,
        actual_cents: category.actual_cents,
        diff_cents: category.actual_cents - category.forecast_cents,
        subcategories: Array.from(category.subcategories.values())
          .map((sub) => ({
            id: sub.id,
            name: sub.name,
            forecast_cents: sub.forecast_cents,
            actual_cents: sub.actual_cents,
            diff_cents: sub.actual_cents - sub.forecast_cents,
          }))
          .filter(
            (sub) => sub.forecast_cents !== 0 || sub.actual_cents !== 0
          )
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter(
        (category) =>
          category.forecast_cents !== 0 ||
          category.actual_cents !== 0 ||
          category.subcategories.length > 0
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  const byBudget = useMemo(() => {
    return budgets.map((budget) => {
      const incomeForecast = forecastRows
        .filter((row) => row.budget_id === budget.id && row.kind === 'income')
        .reduce((sum, row) => sum + (row.amount_cents ?? 0), 0)

      const expenseForecast = forecastRows
        .filter((row) => row.budget_id === budget.id && row.kind === 'expense')
        .reduce((sum, row) => sum + (row.amount_cents ?? 0), 0)

      const incomeActual = allocationRows
        .filter(
          (row) =>
            row.budget_id === budget.id &&
            row.transaction_id &&
            transactionKindMap.get(row.transaction_id) === 'income'
        )
        .reduce((sum, row) => sum + (row.amount_cents ?? 0), 0)

      const expenseActual = allocationRows
        .filter(
          (row) =>
            row.budget_id === budget.id &&
            row.transaction_id &&
            transactionKindMap.get(row.transaction_id) === 'expense'
        )
        .reduce((sum, row) => sum + (row.amount_cents ?? 0), 0)

      return {
        budget,
        incomeForecast,
        incomeActual,
        incomeDiff: incomeActual - incomeForecast,
        expenseForecast,
        expenseActual,
        expenseDiff: expenseActual - expenseForecast,
        incomeDetails: buildDetails(budget.id, 'income'),
        expenseDetails: buildDetails(budget.id, 'expense'),
      }
    })
  }, [budgets, forecastRows, allocationRows, transactionKindMap, categories, subcategories])

  if (loading) {
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Chargement…</main>
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1400 }}>
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

      <div style={{ marginTop: 18, display: 'grid', gap: 18 }}>
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
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 14,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 800 }}>{row.budget.name}</div>

                <button
                  onClick={() =>
                    setOpenBudgetId((prev) => (prev === row.budget.id ? null : row.budget.id))
                  }
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #ccc',
                    cursor: 'pointer',
                    background: isOpen ? '#f3f3f3' : '#f7f7f7',
                  }}
                >
                  {isOpen ? 'Masquer le détail' : 'Voir le détail'}
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 20,
                }}
              >
                <section
                  style={{
                    background: '#f5fff5',
                    border: '1px solid #d7ead7',
                    borderRadius: 12,
                    padding: 14,
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 10 }}>
                    Recettes
                  </div>

                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thLeft}>Libellé</th>
                        <th style={thRight}>Prévisionnel</th>
                        <th style={thRight}>Réalisé</th>
                        <th style={thRight}>Écart</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={tdLabelStrong}>Total recettes</td>
                        <td style={tdRightStrong}>{centsToEuros(row.incomeForecast)} €</td>
                        <td style={tdRightStrong}>{centsToEuros(row.incomeActual)} €</td>
                        <td
                          style={{
                            ...tdRightStrong,
                            color: diffColor('income', row.incomeDiff),
                          }}
                        >
                          {signedEuros(row.incomeDiff)}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {isOpen && (
                    <div style={{ marginTop: 14 }}>
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={thLeft}>Libellé</th>
                            <th style={thRight}>Prévisionnel</th>
                            <th style={thRight}>Réalisé</th>
                            <th style={thRight}>Écart</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.incomeDetails.length === 0 ? (
                            <tr>
                              <td style={tdMuted} colSpan={4}>
                                Aucune recette.
                              </td>
                            </tr>
                          ) : (
                            row.incomeDetails.map((category) => (
                              <FragmentCategory
                                key={`income-${row.budget.id}-${category.id}`}
                                category={category}
                                kind="income"
                              />
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section
                  style={{
                    background: '#fff6f6',
                    border: '1px solid #ead7d7',
                    borderRadius: 12,
                    padding: 14,
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 10 }}>
                    Dépenses
                  </div>

                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thLeft}>Libellé</th>
                        <th style={thRight}>Prévisionnel</th>
                        <th style={thRight}>Réalisé</th>
                        <th style={thRight}>Écart</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={tdLabelStrong}>Total dépenses</td>
                        <td style={tdRightStrong}>{centsToEuros(row.expenseForecast)} €</td>
                        <td style={tdRightStrong}>{centsToEuros(row.expenseActual)} €</td>
                        <td
                          style={{
                            ...tdRightStrong,
                            color: diffColor('expense', row.expenseDiff),
                          }}
                        >
                          {signedEuros(row.expenseDiff)}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {isOpen && (
                    <div style={{ marginTop: 14 }}>
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={thLeft}>Libellé</th>
                            <th style={thRight}>Prévisionnel</th>
                            <th style={thRight}>Réalisé</th>
                            <th style={thRight}>Écart</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.expenseDetails.length === 0 ? (
                            <tr>
                              <td style={tdMuted} colSpan={4}>
                                Aucune dépense.
                              </td>
                            </tr>
                          ) : (
                            row.expenseDetails.map((category) => (
                              <FragmentCategory
                                key={`expense-${row.budget.id}-${category.id}`}
                                category={category}
                                kind="expense"
                              />
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
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

function FragmentCategory({
  category,
  kind,
}: {
  category: DetailCategory
  kind: 'income' | 'expense'
}) {
  return (
    <>
      <tr>
        <td style={tdLabelStrong}>{category.name}</td>
        <td style={tdRightStrong}>{centsToEuros(category.forecast_cents)} €</td>
        <td style={tdRightStrong}>{centsToEuros(category.actual_cents)} €</td>
        <td
          style={{
            ...tdRightStrong,
            color: diffColor(kind, category.diff_cents),
          }}
        >
          {signedEuros(category.diff_cents)}
        </td>
      </tr>

      {category.subcategories.map((sub) => (
        <tr key={sub.id}>
          <td style={tdLabelSub}>{sub.name}</td>
          <td style={tdRight}>{centsToEuros(sub.forecast_cents)} €</td>
          <td style={tdRight}>{centsToEuros(sub.actual_cents)} €</td>
          <td
            style={{
              ...tdRight,
              color: diffColor(kind, sub.diff_cents),
            }}
          >
            {signedEuros(sub.diff_cents)}
          </td>
        </tr>
      ))}
    </>
  )
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  tableLayout: 'fixed',
}

const thLeft: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 13,
  padding: '8px 10px',
  borderBottom: '1px solid #ddd',
}

const thRight: React.CSSProperties = {
  textAlign: 'right',
  fontSize: 13,
  padding: '8px 10px',
  borderBottom: '1px solid #ddd',
  width: '18%',
}

const tdLabelStrong: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid #eee',
  fontWeight: 800,
}

const tdLabelSub: React.CSSProperties = {
  padding: '8px 10px 8px 24px',
  borderBottom: '1px solid #f2f2f2',
}

const tdRightStrong: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid #eee',
  textAlign: 'right',
  fontWeight: 800,
  whiteSpace: 'nowrap',
}

const tdRight: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid #f2f2f2',
  textAlign: 'right',
  whiteSpace: 'nowrap',
}

const tdMuted: React.CSSProperties = {
  padding: '10px',
  opacity: 0.7,
}
