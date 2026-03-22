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
  id?: string
  budget_id: string | null
  kind: 'income' | 'expense' | string | null
  category_id: string | null
  subcategory_id: string | null
  amount_cents: number | null
  ordre?: number | null
}

type DisplayLine = {
  categoryId: string
  categoryName: string
  categoryKind: 'income' | 'expense'
  subcategoryId: string | null
  label: string
  value: string
}

type CategoryBlock = {
  categoryId: string
  categoryName: string
  lines: DisplayLine[]
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

function centsToInputValue(cents: number) {
  if (!cents) return ''
  return (cents / 100).toFixed(2)
}

function eurosStringToCents(value: string) {
  if (!value.trim()) return 0
  const normalized = value.replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0
}

function keyOf(kind: 'income' | 'expense', categoryId: string, subcategoryId: string | null) {
  return `${kind}__${categoryId}__${subcategoryId ?? 'none'}`
}

export default function AdminPrevisionnelPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [debugError, setDebugError] = useState('')

  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [forecastRows, setForecastRows] = useState<ForecastRow[]>([])

  const [selectedBudgetId, setSelectedBudgetId] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!selectedBudgetId) return

    const selectedRows = forecastRows.filter((row) => row.budget_id === selectedBudgetId)
    const nextValues: Record<string, string> = {}

    for (const row of selectedRows) {
      if (!row.category_id) continue
      if (row.kind !== 'income' && row.kind !== 'expense') continue

      nextValues[keyOf(row.kind, row.category_id, row.subcategory_id)] = centsToInputValue(
        row.amount_cents ?? 0
      )
    }

    setValues(nextValues)
  }, [selectedBudgetId, forecastRows])

  async function load() {
    setLoading(true)
    setMessage('')
    setDebugError('')

    const [budgetsRes, categoriesRes, subcategoriesRes, forecastsRes] = await Promise.all([
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
        .select('id,budget_id,kind,category_id,subcategory_id,amount_cents,ordre'),
    ])

    const firstError =
      budgetsRes.error || categoriesRes.error || subcategoriesRes.error || forecastsRes.error

    if (firstError) {
      console.error({
        budgets: budgetsRes.error,
        categories: categoriesRes.error,
        subcategories: subcategoriesRes.error,
        forecasts: forecastsRes.error,
      })
      setDebugError(firstError.message)
      alert('Erreur chargement admin prévisionnel')
      setLoading(false)
      return
    }

    const loadedBudgets = ((budgetsRes.data ?? []) as Budget[]).filter((b) => !b.is_archived)

    setBudgets(loadedBudgets)
    setCategories((categoriesRes.data ?? []) as Category[])
    setSubcategories((subcategoriesRes.data ?? []) as Subcategory[])
    setForecastRows((forecastsRes.data ?? []) as ForecastRow[])

    if (loadedBudgets.length > 0) {
      setSelectedBudgetId((prev) => prev || loadedBudgets[0].id)
    }

    setLoading(false)
  }

  const visibleCategories = useMemo(() => {
    return categories.filter(
      (c) =>
        c.budget_id === selectedBudgetId &&
        (c.kind === 'income' || c.kind === 'expense')
    )
  }, [categories, selectedBudgetId])

  const visibleSubcategories = useMemo(() => {
    const visibleCategoryIds = new Set(visibleCategories.map((c) => c.id))
    return subcategories.filter((s) => visibleCategoryIds.has(s.category_id))
  }, [subcategories, visibleCategories])

  const displayLines = useMemo<DisplayLine[]>(() => {
    const lines: DisplayLine[] = []

    for (const category of visibleCategories) {
      const subs = visibleSubcategories
        .filter((s) => s.category_id === category.id)
        .sort((a, b) => a.name.localeCompare(b.name))

      if (subs.length === 0) {
        lines.push({
          categoryId: category.id,
          categoryName: category.name,
          categoryKind: category.kind as 'income' | 'expense',
          subcategoryId: null,
          label: category.name,
          value: values[keyOf(category.kind as 'income' | 'expense', category.id, null)] ?? '',
        })
      } else {
        for (const sub of subs) {
          lines.push({
            categoryId: category.id,
            categoryName: category.name,
            categoryKind: category.kind as 'income' | 'expense',
            subcategoryId: sub.id,
            label: sub.name,
            value:
              values[keyOf(category.kind as 'income' | 'expense', category.id, sub.id)] ?? '',
          })
        }
      }
    }

    return lines
  }, [visibleCategories, visibleSubcategories, values])

  const incomeBlocks = useMemo<CategoryBlock[]>(() => {
    return visibleCategories
      .filter((c) => c.kind === 'income')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((category) => ({
        categoryId: category.id,
        categoryName: category.name,
        lines: displayLines.filter(
          (line) => line.categoryId === category.id && line.categoryKind === 'income'
        ),
      }))
  }, [visibleCategories, displayLines])

  const expenseBlocks = useMemo<CategoryBlock[]>(() => {
    return visibleCategories
      .filter((c) => c.kind === 'expense')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((category) => ({
        categoryId: category.id,
        categoryName: category.name,
        lines: displayLines.filter(
          (line) => line.categoryId === category.id && line.categoryKind === 'expense'
        ),
      }))
  }, [visibleCategories, displayLines])

  const incomeTotalCents = useMemo(() => {
    return incomeBlocks
      .flatMap((b) => b.lines)
      .reduce((sum, line) => sum + eurosStringToCents(line.value), 0)
  }, [incomeBlocks])

  const expenseTotalCents = useMemo(() => {
    return expenseBlocks
      .flatMap((b) => b.lines)
      .reduce((sum, line) => sum + eurosStringToCents(line.value), 0)
  }, [expenseBlocks])

  const isBalanced = incomeTotalCents === expenseTotalCents

  function updateLineValue(line: DisplayLine, nextValue: string) {
    setValues((prev) => ({
      ...prev,
      [keyOf(line.categoryKind, line.categoryId, line.subcategoryId)]: nextValue,
    }))
  }

  async function saveBudgetForecast() {
    if (!selectedBudgetId) {
      alert('Choisis un budget')
      return
    }

    setSaving(true)
    setMessage('')
    setDebugError('')

    try {
      const { error: deleteError } = await supabase
        .from('budget_forecasts')
        .delete()
        .eq('budget_id', selectedBudgetId)

      if (deleteError) throw deleteError

      const rowsToInsert: {
        budget_id: string
        kind: 'income' | 'expense'
        category_id: string
        subcategory_id: string | null
        amount_cents: number
        ordre: number
      }[] = []

      let ordre = 1

      for (const line of displayLines) {
        const amount = eurosStringToCents(line.value)
        if (amount > 0) {
          rowsToInsert.push({
            budget_id: selectedBudgetId,
            kind: line.categoryKind,
            category_id: line.categoryId,
            subcategory_id: line.subcategoryId,
            amount_cents: amount,
            ordre,
          })
          ordre += 1
        }
      }

      if (rowsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('budget_forecasts')
          .insert(rowsToInsert)

        if (insertError) throw insertError
      }

      setMessage('✅ Prévisionnel sauvegardé')
      await load()
    } catch (e: any) {
      console.error(e)
      setDebugError(e?.message ?? 'Erreur inconnue')
      alert(`Erreur sauvegarde prévisionnel : ${e?.message ?? 'inconnue'}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <main style={pageStyle}>Chargement…</main>
  }

  return (
    <main style={pageStyle}>
      <h1 style={titleStyle}>Admin prévisionnel</h1>

      {debugError && (
        <div style={errorBoxStyle}>
          <b>Détail erreur :</b> {debugError}
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

          <div>
            <button
              onClick={saveBudgetForecast}
              disabled={saving || !selectedBudgetId}
              style={primaryButtonStyle}
            >
              {saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
          </div>
        </div>

        {message && <div style={messageStyle}>{message}</div>}
      </section>

      <div style={summaryGridStyle}>
        <div style={expenseSummaryStyle}>
          <div style={summaryLabelStyle}>Total prévisionnel dépenses</div>
          <div style={summaryValueStyle}>{centsToEuros(expenseTotalCents)} €</div>
        </div>

        <div style={incomeSummaryStyle}>
          <div style={summaryLabelStyle}>Total prévisionnel recettes</div>
          <div style={summaryValueStyle}>{centsToEuros(incomeTotalCents)} €</div>
        </div>

        <div style={balanceCardStyle}>
          <div style={summaryLabelStyle}>Équilibre</div>
          <div
            style={{
              ...summaryValueStyle,
              color: isBalanced ? 'green' : '#a06a00',
              fontSize: 24,
            }}
          >
            {isBalanced ? 'Équilibré' : 'À ajuster'}
          </div>
          <div style={{ opacity: 0.7, marginTop: 6 }}>
            Écart : {centsToEuros(incomeTotalCents - expenseTotalCents)} €
          </div>
        </div>
      </div>

      <div style={columnsStyle}>
        <section style={expenseSectionStyle}>
          <h2 style={sectionTitleStyle}>💸 Dépenses</h2>

          <div style={listStyle}>
            {expenseBlocks.length === 0 ? (
              <div style={emptyStyle}>Aucune dépense.</div>
            ) : (
              expenseBlocks.map((block) => (
                <div key={block.categoryId} style={categoryCardExpenseStyle}>
                  <div style={categoryHeaderStyle}>
                    <div style={categoryTitleStyle}>{block.categoryName}</div>
                    <div style={categoryAmountStyle}>
                      {centsToEuros(
                        block.lines.reduce((sum, line) => sum + eurosStringToCents(line.value), 0)
                      )}{' '}
                      €
                    </div>
                  </div>

                  <div style={subListStyle}>
                    {block.lines.length === 0 ? (
                      <div style={emptySubStyle}>Aucune ligne</div>
                    ) : (
                      block.lines.map((line) => (
                        <div
                          key={keyOf(line.categoryKind, line.categoryId, line.subcategoryId)}
                          style={forecastRowStyle}
                        >
                          <div style={subTextStyle}>{line.label}</div>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.value}
                            onChange={(e) => updateLineValue(line, e.target.value)}
                            placeholder="0.00"
                            style={amountInputStyle}
                          />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section style={incomeSectionStyle}>
          <h2 style={sectionTitleStyle}>💰 Recettes</h2>

          <div style={listStyle}>
            {incomeBlocks.length === 0 ? (
              <div style={emptyStyle}>Aucune recette.</div>
            ) : (
              incomeBlocks.map((block) => (
                <div key={block.categoryId} style={categoryCardIncomeStyle}>
                  <div style={categoryHeaderStyle}>
                    <div style={categoryTitleStyle}>{block.categoryName}</div>
                    <div style={categoryAmountStyle}>
                      {centsToEuros(
                        block.lines.reduce((sum, line) => sum + eurosStringToCents(line.value), 0)
                      )}{' '}
                      €
                    </div>
                  </div>

                  <div style={subListStyle}>
                    {block.lines.length === 0 ? (
                      <div style={emptySubStyle}>Aucune ligne</div>
                    ) : (
                      block.lines.map((line) => (
                        <div
                          key={keyOf(line.categoryKind, line.categoryId, line.subcategoryId)}
                          style={forecastRowStyle}
                        >
                          <div style={subTextStyle}>{line.label}</div>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.value}
                            onChange={(e) => updateLineValue(line, e.target.value)}
                            placeholder="0.00"
                            style={amountInputStyle}
                          />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

const pageStyle: React.CSSProperties = {
  padding: 24,
  fontFamily: 'system-ui',
  maxWidth: 1400,
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

const primaryButtonStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid #ccc',
  background: 'white',
  cursor: 'pointer',
}

const messageStyle: React.CSSProperties = {
  marginTop: 14,
  fontWeight: 700,
}

const summaryGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr auto',
  gap: 16,
  alignItems: 'stretch',
  marginBottom: 24,
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

const balanceCardStyle: React.CSSProperties = {
  border: '1px solid #ddd',
  background: '#fffdf4',
  borderRadius: 14,
  padding: 16,
  minWidth: 220,
}

const summaryLabelStyle: React.CSSProperties = {
  fontSize: 15,
  opacity: 0.75,
}

const summaryValueStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 30,
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
}

const categoryTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
}

const categoryAmountStyle: React.CSSProperties = {
  fontWeight: 800,
}

const subListStyle: React.CSSProperties = {
  marginTop: 12,
  display: 'grid',
  gap: 8,
}

const forecastRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 140px',
  gap: 12,
  alignItems: 'center',
  paddingLeft: 12,
}

const subTextStyle: React.CSSProperties = {
  opacity: 0.95,
}

const amountInputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #ccc',
  textAlign: 'right',
}

const emptyStyle: React.CSSProperties = {
  opacity: 0.7,
  padding: 12,
}

const emptySubStyle: React.CSSProperties = {
  opacity: 0.55,
  paddingLeft: 12,
}
