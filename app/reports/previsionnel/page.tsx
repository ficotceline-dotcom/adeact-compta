'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Budget = {
  id: string
  name: string
  ordre: number
  is_archived?: boolean
}

type Category = {
  id: string
  name: string
  budget_id: string
  kind: 'income' | 'expense' | null
}

type Subcategory = {
  id: string
  name: string
  category_id: string
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
  category_id: string | null
  subcategory_id: string | null
  amount_cents?: number | null
  transaction_id: string | null
}

type TransactionRow = {
  id: string
  kind: 'income' | 'expense' | string
  amount_cents: number | null
}

type Line = {
  categoryId: string
  categoryName: string
  categoryKind: 'income' | 'expense'
  subcategoryId: string | null
  label: string
  forecastCents: number
  actualCents: number
}

type CategoryBlock = {
  categoryId: string
  categoryName: string
  lines: Line[]
}

function euros(cents: number) {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

function diffColor(kind: 'income' | 'expense', diff: number) {
  if (kind === 'expense') {
    if (diff > 0) return '#b42318' // réalisé > prévisionnel => mauvais
    if (diff < 0) return '#027a48' // réalisé < prévisionnel => bon
    return '#667085'
  }

  if (diff > 0) return '#027a48' // recettes réalisées > prévisionnel => bon
  if (diff < 0) return '#b42318' // recettes réalisées < prévisionnel => mauvais
  return '#667085'
}

export default function PrevisionnelVsRealisePage() {
  const [loading, setLoading] = useState(true)
  const [errorDetails, setErrorDetails] = useState('')
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [forecasts, setForecasts] = useState<ForecastRow[]>([])
  const [allocations, setAllocations] = useState<AllocationRow[]>([])
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [selectedBudgetId, setSelectedBudgetId] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setErrorDetails('')

    const [
      budgetsRes,
      categoriesRes,
      subcategoriesRes,
      forecastsRes,
      allocationsRes,
      transactionsRes,
    ] = await Promise.all([
      supabase
        .from('budgets')
        .select('id,name,ordre,is_archived')
        .order('ordre'),

      supabase
        .from('categories')
        .select('id,name,budget_id,kind')
        .order('name'),

      supabase
        .from('subcategories')
        .select('id,name,category_id')
        .order('name'),

      supabase
        .from('budget_forecasts')
        .select('budget_id,kind,category_id,subcategory_id,amount_cents'),

      supabase
        .from('transaction_allocations')
        .select('budget_id,category_id,subcategory_id,transaction_id,amount_cents'),

      supabase
        .from('transactions')
        .select('id,kind,amount_cents'),
    ])

    const firstError =
      budgetsRes.error ||
      categoriesRes.error ||
      subcategoriesRes.error ||
      forecastsRes.error ||
      allocationsRes.error ||
      transactionsRes.error

    if (firstError) {
      console.error({
        budgets: budgetsRes.error,
        categories: categoriesRes.error,
        subcategories: subcategoriesRes.error,
        forecasts: forecastsRes.error,
        allocations: allocationsRes.error,
        transactions: transactionsRes.error,
      })
      setErrorDetails(firstError.message)
      setLoading(false)
      return
    }

    const loadedBudgets = ((budgetsRes.data ?? []) as Budget[]).filter((b) => !b.is_archived)

    setBudgets(loadedBudgets)
    setCategories((categoriesRes.data ?? []) as Category[])
    setSubcategories((subcategoriesRes.data ?? []) as Subcategory[])
    setForecasts((forecastsRes.data ?? []) as ForecastRow[])
    setAllocations((allocationsRes.data ?? []) as AllocationRow[])
    setTransactions((transactionsRes.data ?? []) as TransactionRow[])

    if (loadedBudgets.length > 0) {
      setSelectedBudgetId((prev) => prev || loadedBudgets[0].id)
    }

    setLoading(false)
  }

  const visibleCategories = useMemo(() => {
    return categories
      .filter(
        (c) =>
          c.budget_id === selectedBudgetId &&
          (c.kind === 'income' || c.kind === 'expense')
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [categories, selectedBudgetId])

  const visibleCategoryIds = useMemo(() => {
    return new Set(visibleCategories.map((c) => c.id))
  }, [visibleCategories])

  const visibleSubcategories = useMemo(() => {
    return subcategories
      .filter((s) => visibleCategoryIds.has(s.category_id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [subcategories, visibleCategoryIds])

  const txMap = useMemo(() => {
    const map = new Map<string, TransactionRow>()
    for (const tx of transactions) {
      map.set(tx.id, tx)
    }
    return map
  }, [transactions])

  const forecastMap = useMemo(() => {
    const map = new Map<string, number>()

    for (const row of forecasts) {
      if (row.budget_id !== selectedBudgetId) continue
      if (!row.category_id) continue
      if (row.kind !== 'income' && row.kind !== 'expense') continue

      const key = `${row.kind}__${row.category_id}__${row.subcategory_id ?? 'none'}`
      map.set(key, (map.get(key) ?? 0) + (row.amount_cents ?? 0))
    }

    return map
  }, [forecasts, selectedBudgetId])

  const actualMap = useMemo(() => {
    const map = new Map<string, number>()

    for (const row of allocations) {
      if (row.budget_id !== selectedBudgetId) continue
      if (!row.category_id) continue
      if (!visibleCategoryIds.has(row.category_id)) continue
      if (!row.transaction_id) continue

      const tx = txMap.get(row.transaction_id)
      if (!tx) continue
      if (tx.kind !== 'income' && tx.kind !== 'expense') continue

      const key = `${tx.kind}__${row.category_id}__${row.subcategory_id ?? 'none'}`

      const amount =
        row.amount_cents != null
          ? row.amount_cents
          : tx.amount_cents ?? 0

      map.set(key, (map.get(key) ?? 0) + amount)
    }

    return map
  }, [allocations, txMap, selectedBudgetId, visibleCategoryIds])

  const allLines = useMemo<Line[]>(() => {
    const lines: Line[] = []

    for (const category of visibleCategories) {
      const subs = visibleSubcategories.filter((s) => s.category_id === category.id)

      if (subs.length === 0) {
        const key = `${category.kind}__${category.id}__none`

        lines.push({
          categoryId: category.id,
          categoryName: category.name,
          categoryKind: category.kind as 'income' | 'expense',
          subcategoryId: null,
          label: category.name,
          forecastCents: forecastMap.get(key) ?? 0,
          actualCents: actualMap.get(key) ?? 0,
        })
      } else {
        for (const sub of subs) {
          const key = `${category.kind}__${category.id}__${sub.id}`

          lines.push({
            categoryId: category.id,
            categoryName: category.name,
            categoryKind: category.kind as 'income' | 'expense',
            subcategoryId: sub.id,
            label: sub.name,
            forecastCents: forecastMap.get(key) ?? 0,
            actualCents: actualMap.get(key) ?? 0,
          })
        }
      }
    }

    return lines
  }, [visibleCategories, visibleSubcategories, forecastMap, actualMap])

  const incomeBlocks = useMemo<CategoryBlock[]>(() => {
    return visibleCategories
      .filter((c) => c.kind === 'income')
      .map((category) => ({
        categoryId: category.id,
        categoryName: category.name,
        lines: allLines.filter(
          (line) => line.categoryId === category.id && line.categoryKind === 'income'
        ),
      }))
  }, [visibleCategories, allLines])

  const expenseBlocks = useMemo<CategoryBlock[]>(() => {
    return visibleCategories
      .filter((c) => c.kind === 'expense')
      .map((category) => ({
        categoryId: category.id,
        categoryName: category.name,
        lines: allLines.filter(
          (line) => line.categoryId === category.id && line.categoryKind === 'expense'
        ),
      }))
  }, [visibleCategories, allLines])

  const totalIncomeForecast = incomeBlocks
    .flatMap((b) => b.lines)
    .reduce((sum, line) => sum + line.forecastCents, 0)

  const totalIncomeActual = incomeBlocks
    .flatMap((b) => b.lines)
    .reduce((sum, line) => sum + line.actualCents, 0)

  const totalExpenseForecast = expenseBlocks
    .flatMap((b) => b.lines)
    .reduce((sum, line) => sum + line.forecastCents, 0)

  const totalExpenseActual = expenseBlocks
    .flatMap((b) => b.lines)
    .reduce((sum, line) => sum + line.actualCents, 0)

  if (loading) {
    return <main style={pageStyle}>Chargement…</main>
  }

  return (
    <main style={pageStyle}>
      <h1 style={titleStyle}>Prévisionnel vs réalisé</h1>

      {errorDetails && (
        <div style={errorBoxStyle}>
          <b>Détail erreur :</b> {errorDetails}
        </div>
      )}

      <section style={topCardStyle}>
        <div style={topRowStyle}>
          <div style={{ minWidth: 280 }}>
            <div style={labelStyle}>Budget</div>
            <select
              value={selectedBudgetId}
              onChange={(e) => setSelectedBudgetId(e.target.value)}
              style={selectStyle}
            >
              {budgets.map((budget) => (
                <option key={budget.id} value={budget.id}>
                  {budget.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <div style={summaryGridStyle}>
        <div style={expenseSummaryStyle}>
          <div style={summaryLabelStyle}>Dépenses prévisionnelles</div>
          <div style={summaryValueStyle}>{euros(totalExpenseForecast)} €</div>
        </div>

        <div style={expenseSummaryStyle}>
          <div style={summaryLabelStyle}>Dépenses réalisées</div>
          <div style={summaryValueStyle}>{euros(totalExpenseActual)} €</div>
        </div>

        <div style={incomeSummaryStyle}>
          <div style={summaryLabelStyle}>Recettes prévisionnelles</div>
          <div style={summaryValueStyle}>{euros(totalIncomeForecast)} €</div>
        </div>

        <div style={incomeSummaryStyle}>
          <div style={summaryLabelStyle}>Recettes réalisées</div>
          <div style={summaryValueStyle}>{euros(totalIncomeActual)} €</div>
        </div>
      </div>

      <div style={columnsStyle}>
        <section style={expenseSectionStyle}>
          <h2 style={sectionTitleStyle}>💸 Dépenses</h2>
          <ReportTable blocks={expenseBlocks} kind="expense" />
        </section>

        <section style={incomeSectionStyle}>
          <h2 style={sectionTitleStyle}>💰 Recettes</h2>
          <ReportTable blocks={incomeBlocks} kind="income" />
        </section>
      </div>
    </main>
  )
}

function ReportTable({
  blocks,
  kind,
}: {
  blocks: CategoryBlock[]
  kind: 'income' | 'expense'
}) {
  if (blocks.length === 0) {
    return <div style={emptyStyle}>Aucune ligne.</div>
  }

  return (
    <div style={listStyle}>
      {blocks.map((block) => {
        const categoryForecast = block.lines.reduce((sum, line) => sum + line.forecastCents, 0)
        const categoryActual = block.lines.reduce((sum, line) => sum + line.actualCents, 0)
        const categoryDiff = categoryActual - categoryForecast

        return (
          <div
            key={block.categoryId}
            style={kind === 'expense' ? categoryCardExpenseStyle : categoryCardIncomeStyle}
          >
            <div style={categoryHeaderStyle}>
              <div style={categoryTitleStyle}>{block.categoryName}</div>
              <div style={{ ...categoryAmountStyle, color: diffColor(kind, categoryDiff) }}>
                {euros(categoryDiff)} €
              </div>
            </div>

            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thLeftStyle}>Ligne</th>
                  <th style={thRightStyle}>Prévisionnel</th>
                  <th style={thRightStyle}>Réalisé</th>
                  <th style={thRightStyle}>Écart</th>
                </tr>
              </thead>
              <tbody>
                {block.lines.map((line) => {
                  const diff = line.actualCents - line.forecastCents

                  return (
                    <tr key={`${line.categoryId}-${line.subcategoryId ?? 'none'}`}>
                      <td style={tdLeftStyle}>{line.label}</td>
                      <td style={tdRightStyle}>{euros(line.forecastCents)} €</td>
                      <td style={tdRightStyle}>{euros(line.actualCents)} €</td>
                      <td
                        style={{
                          ...tdRightStyle,
                          fontWeight: 700,
                          color: diffColor(kind, diff),
                        }}
                      >
                        {euros(diff)} €
                      </td>
                    </tr>
                  )
                })}

                <tr>
                  <td style={totalLeftStyle}>Total {block.categoryName}</td>
                  <td style={totalRightStyle}>{euros(categoryForecast)} €</td>
                  <td style={totalRightStyle}>{euros(categoryActual)} €</td>
                  <td
                    style={{
                      ...totalRightStyle,
                      color: diffColor(kind, categoryDiff),
                    }}
                  >
                    {euros(categoryDiff)} €
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  padding: 24,
  fontFamily: 'system-ui',
  maxWidth: 1500,
}

const titleStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 900,
  marginBottom: 18,
}

const errorBoxStyle: React.CSSProperties = {
  marginTop: 16,
  marginBottom: 16,
  padding: 12,
  borderRadius: 10,
  background: '#fff3f3',
  border: '1px solid #e0b4b4',
  color: '#8a1f1f',
  whiteSpace: 'pre-wrap',
}

const topCardStyle: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 16,
  background: 'white',
  padding: 18,
  marginBottom: 22,
}

const topRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  alignItems: 'end',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
}

const labelStyle: React.CSSProperties = {
  fontWeight: 700,
  marginBottom: 8,
}

const selectStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #ccc',
  width: '100%',
}

const summaryGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr 1fr',
  gap: 14,
  marginBottom: 22,
}

const expenseSummaryStyle: React.CSSProperties = {
  border: '1px solid #f0cfcf',
  background: '#fff6f6',
  borderRadius: 14,
  padding: 16,
}

const incomeSummaryStyle: React.CSSProperties = {
  border: '1px solid #cfe8cf',
  background: '#f5fff5',
  borderRadius: 14,
  padding: 16,
}

const summaryLabelStyle: React.CSSProperties = {
  fontSize: 14,
  opacity: 0.75,
}

const summaryValueStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 26,
  fontWeight: 900,
}

const columnsStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 20,
  alignItems: 'start',
}

const expenseSectionStyle: React.CSSProperties = {
  border: '1px solid #f0cfcf',
  background: '#fffafa',
  borderRadius: 16,
  padding: 18,
}

const incomeSectionStyle: React.CSSProperties = {
  border: '1px solid #cfe8cf',
  background: '#f7fff7',
  borderRadius: 16,
  padding: 18,
}

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: 14,
  fontSize: 22,
  fontWeight: 800,
}

const listStyle: React.CSSProperties = {
  display: 'grid',
  gap: 14,
}

const categoryCardExpenseStyle: React.CSSProperties = {
  border: '1px solid #ead6d6',
  background: 'white',
  borderRadius: 14,
  padding: 14,
}

const categoryCardIncomeStyle: React.CSSProperties = {
  border: '1px solid #d6ead6',
  background: 'white',
  borderRadius: 14,
  padding: 14,
}

const categoryHeaderStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 10,
  alignItems: 'center',
  marginBottom: 10,
}

const categoryTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
}

const categoryAmountStyle: React.CSSProperties = {
  fontWeight: 800,
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
}

const thLeftStyle: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 13,
  opacity: 0.7,
  padding: '8px 10px',
  borderBottom: '1px solid #eee',
}

const thRightStyle: React.CSSProperties = {
  textAlign: 'right',
  fontSize: 13,
  opacity: 0.7,
  padding: '8px 10px',
  borderBottom: '1px solid #eee',
}

const tdLeftStyle: React.CSSProperties = {
  padding: '10px',
  borderBottom: '1px solid #f3f3f3',
}

const tdRightStyle: React.CSSProperties = {
  padding: '10px',
  textAlign: 'right',
  borderBottom: '1px solid #f3f3f3',
  fontVariantNumeric: 'tabular-nums',
}

const totalLeftStyle: React.CSSProperties = {
  padding: '10px',
  fontWeight: 800,
  borderTop: '2px solid #e5e5e5',
}

const totalRightStyle: React.CSSProperties = {
  padding: '10px',
  textAlign: 'right',
  fontWeight: 800,
  borderTop: '2px solid #e5e5e5',
  fontVariantNumeric: 'tabular-nums',
}

const emptyStyle: React.CSSProperties = {
  opacity: 0.7,
  padding: 12,
}
