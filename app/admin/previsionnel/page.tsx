'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Budget = {
  id: string
  name: string
  ordre: number
}

type Category = {
  id: string
  name: string
}

type Subcategory = {
  id: string
  name: string
  category_id: string | null
}

type ForecastRow = {
  budget_id: string | null
  kind: 'income' | 'expense' | string | null
  category_id: string | null
  subcategory_id: string | null
  amount_cents: number | null
}

type CategoryMappingRow = {
  budget_id: string | null
  category_id: string | null
}

type SubcategoryMappingRow = {
  budget_id: string | null
  subcategory_id: string | null
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

function eurosStringToCents(value: string) {
  if (!value.trim()) return 0
  const normalized = value.replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0
}

function centsToInputValue(cents: number) {
  if (!cents) return ''
  return (cents / 100).toFixed(2)
}

function keyOf(kind: 'income' | 'expense', subcategoryId: string) {
  return `${kind}__${subcategoryId}`
}

export default function AdminPrevisionnelPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [forecastRows, setForecastRows] = useState<ForecastRow[]>([])
  const [categoryMappings, setCategoryMappings] = useState<CategoryMappingRow[]>([])
  const [subcategoryMappings, setSubcategoryMappings] = useState<SubcategoryMappingRow[]>([])

  const [selectedBudgetId, setSelectedBudgetId] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!selectedBudgetId) return

    const selectedRows = forecastRows.filter(
      (row) => row.budget_id === selectedBudgetId
    )

    const nextValues: Record<string, string> = {}

    for (const row of selectedRows) {
      if (
        (row.kind !== 'income' && row.kind !== 'expense') ||
        !row.subcategory_id
      ) {
        continue
      }

      nextValues[keyOf(row.kind, row.subcategory_id)] = centsToInputValue(
        row.amount_cents ?? 0
      )
    }

    setValues(nextValues)
  }, [selectedBudgetId, forecastRows])

  async function load() {
    setLoading(true)
    setMessage('')

    const [
      { data: budgetsData, error: e1 },
      { data: categoriesData, error: e2 },
      { data: subcategoriesData, error: e3 },
      { data: forecastsData, error: e4 },
      { data: categoryMappingsData, error: e5 },
      { data: subcategoryMappingsData, error: e6 },
    ] = await Promise.all([
      supabase
        .from('budgets')
        .select('id,name,ordre')
        .eq('is_archived', false)
        .order('ordre'),

      supabase
        .from('categories')
        .select('id,name')
        .order('name'),

      supabase
        .from('subcategories')
        .select('id,name,category_id')
        .order('name'),

      supabase
        .from('budget_forecasts')
        .select('budget_id,kind,category_id,subcategory_id,amount_cents'),

      supabase
        .from('category_mapping')
        .select('budget_id,category_id'),

      supabase
        .from('subcategory_mapping')
        .select('budget_id,subcategory_id'),
    ])

    if (e1 || e2 || e3 || e4 || e5 || e6) {
      console.error(e1 || e2 || e3 || e4 || e5 || e6)
      alert('Erreur chargement admin prévisionnel')
      setLoading(false)
      return
    }

    const loadedBudgets = (budgetsData ?? []) as Budget[]

    setBudgets(loadedBudgets)
    setCategories((categoriesData ?? []) as Category[])
    setSubcategories((subcategoriesData ?? []) as Subcategory[])
    setForecastRows((forecastsData ?? []) as ForecastRow[])
    setCategoryMappings((categoryMappingsData ?? []) as CategoryMappingRow[])
    setSubcategoryMappings((subcategoryMappingsData ?? []) as SubcategoryMappingRow[])

    if (loadedBudgets.length > 0) {
      setSelectedBudgetId((prev) => prev || loadedBudgets[0].id)
    }

    setLoading(false)
  }

  function updateValue(kind: 'income' | 'expense', subcategoryId: string, value: string) {
    setValues((prev) => ({
      ...prev,
      [keyOf(kind, subcategoryId)]: value,
    }))
  }

  const allowedCategoryIds = useMemo(() => {
    return new Set(
      categoryMappings
        .filter((row) => row.budget_id === selectedBudgetId && row.category_id)
        .map((row) => row.category_id as string)
    )
  }, [categoryMappings, selectedBudgetId])

  const allowedSubcategoryIds = useMemo(() => {
    return new Set(
      subcategoryMappings
        .filter((row) => row.budget_id === selectedBudgetId && row.subcategory_id)
        .map((row) => row.subcategory_id as string)
    )
  }, [subcategoryMappings, selectedBudgetId])

  const visibleSubcategories = useMemo(() => {
    return subcategories.filter((sub) => {
      if (allowedSubcategoryIds.has(sub.id)) return true
      if (sub.category_id && allowedCategoryIds.has(sub.category_id)) return true
      return false
    })
  }, [subcategories, allowedSubcategoryIds, allowedCategoryIds])

  const categoriesWithSubs = useMemo(() => {
    return categories
      .map((category) => ({
        ...category,
        subcategories: visibleSubcategories.filter((s) => s.category_id === category.id),
      }))
      .filter((category) => category.subcategories.length > 0)
  }, [categories, visibleSubcategories])

  const expenseTotalCents = useMemo(() => {
    return visibleSubcategories.reduce((sum, sub) => {
      return sum + eurosStringToCents(values[keyOf('expense', sub.id)] ?? '')
    }, 0)
  }, [visibleSubcategories, values])

  const incomeTotalCents = useMemo(() => {
    return visibleSubcategories.reduce((sum, sub) => {
      return sum + eurosStringToCents(values[keyOf('income', sub.id)] ?? '')
    }, 0)
  }, [visibleSubcategories, values])

  const isBalanced = expenseTotalCents === incomeTotalCents

  async function saveBudgetForecast() {
    if (!selectedBudgetId) {
      alert('Choisis un budget')
      return
    }

    setSaving(true)
    setMessage('')

    try {
      const { error: deleteError } = await supabase
        .from('budget_forecasts')
        .delete()
        .eq('budget_id', selectedBudgetId)

      if (deleteError) throw deleteError

      const rowsToInsert: {
        budget_id: string
        kind: 'income' | 'expense'
        category_id: string | null
        subcategory_id: string
        amount_cents: number
        updated_at?: string
      }[] = []

      for (const sub of visibleSubcategories) {
        const expenseCents = eurosStringToCents(values[keyOf('expense', sub.id)] ?? '')
        const incomeCents = eurosStringToCents(values[keyOf('income', sub.id)] ?? '')

        if (expenseCents > 0) {
          rowsToInsert.push({
            budget_id: selectedBudgetId,
            kind: 'expense',
            category_id: sub.category_id,
            subcategory_id: sub.id,
            amount_cents: expenseCents,
            updated_at: new Date().toISOString(),
          })
        }

        if (incomeCents > 0) {
          rowsToInsert.push({
            budget_id: selectedBudgetId,
            kind: 'income',
            category_id: sub.category_id,
            subcategory_id: sub.id,
            amount_cents: incomeCents,
            updated_at: new Date().toISOString(),
          })
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
      alert(`Erreur sauvegarde prévisionnel : ${e?.message ?? 'inconnue'}`)
    } finally {
      setSaving(false)
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
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1400 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900 }}>Admin prévisionnel</h1>

      <div
        style={{
          marginTop: 18,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <label style={{ fontWeight: 700 }}>Budget :</label>

        <select
          value={selectedBudgetId}
          onChange={(e) => setSelectedBudgetId(e.target.value)}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #ccc',
            minWidth: 260,
          }}
        >
          {budgets.map((budget) => (
            <option key={budget.id} value={budget.id}>
              {budget.name}
            </option>
          ))}
        </select>

        <button
          onClick={saveBudgetForecast}
          disabled={saving || !selectedBudgetId}
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid #ccc',
            background: 'white',
            cursor: 'pointer',
          }}
        >
          {saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>

        {message && <div style={{ fontWeight: 700 }}>{message}</div>}
      </div>

      <div
        style={{
          marginTop: 22,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr auto',
          gap: 16,
          alignItems: 'stretch',
        }}
      >
        <div
          style={{
            border: '1px solid #f0cfcf',
            background: '#fff6f6',
            borderRadius: 14,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 15, opacity: 0.75 }}>Total prévisionnel dépenses</div>
          <div style={{ marginTop: 8, fontSize: 30, fontWeight: 900 }}>
            {centsToEuros(expenseTotalCents)} €
          </div>
        </div>

        <div
          style={{
            border: '1px solid #cfe8cf',
            background: '#f5fff5',
            borderRadius: 14,
            padding: 16,
          }}
        >
          <div style={{ fontSize: 15, opacity: 0.75 }}>Total prévisionnel recettes</div>
          <div style={{ marginTop: 8, fontSize: 30, fontWeight: 900 }}>
            {centsToEuros(incomeTotalCents)} €
          </div>
        </div>

        <div
          style={{
            border: '1px solid #ddd',
            background: isBalanced ? '#f2fff2' : '#fff8e8',
            borderRadius: 14,
            padding: 16,
            minWidth: 220,
          }}
        >
          <div style={{ fontSize: 15, opacity: 0.75 }}>Équilibre</div>
          <div
            style={{
              marginTop: 8,
              fontSize: 24,
              fontWeight: 900,
              color: isBalanced ? 'green' : '#a06a00',
            }}
          >
            {isBalanced ? 'Équilibré' : 'À ajuster'}
          </div>
          <div style={{ marginTop: 8, fontSize: 14, opacity: 0.75 }}>
            Écart : {centsToEuros(incomeTotalCents - expenseTotalCents)} €
          </div>
        </div>
      </div>

      {categoriesWithSubs.length === 0 ? (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            border: '1px solid #eee',
            borderRadius: 12,
            background: 'white',
            opacity: 0.8,
          }}
        >
          Aucune catégorie liée à ce budget dans le référentiel admin.
        </div>
      ) : (
        <div
          style={{
            marginTop: 26,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 20,
            alignItems: 'start',
          }}
        >
          <section
            style={{
              border: '1px solid #f0cfcf',
              background: '#fffafa',
              borderRadius: 14,
              padding: 18,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Dépenses</h2>

            <div style={{ marginTop: 18, display: 'grid', gap: 18 }}>
              {categoriesWithSubs.map((category) => {
                const categoryTotal = category.subcategories.reduce((sum, sub) => {
                  return sum + eurosStringToCents(values[keyOf('expense', sub.id)] ?? '')
                }, 0)

                return (
                  <div key={`expense-${category.id}`}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        fontWeight: 800,
                        fontSize: 16,
                        marginBottom: 10,
                      }}
                    >
                      <div>{category.name}</div>
                      <div>{centsToEuros(categoryTotal)} €</div>
                    </div>

                    <div style={{ display: 'grid', gap: 8 }}>
                      {category.subcategories.map((sub) => (
                        <div
                          key={`expense-${sub.id}`}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 140px',
                            gap: 12,
                            alignItems: 'center',
                          }}
                        >
                          <div style={{ paddingLeft: 12 }}>{sub.name}</div>

                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={values[keyOf('expense', sub.id)] ?? ''}
                            onChange={(e) => updateValue('expense', sub.id, e.target.value)}
                            placeholder="0.00"
                            style={{
                              padding: '8px 10px',
                              borderRadius: 8,
                              border: '1px solid #ccc',
                              textAlign: 'right',
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section
            style={{
              border: '1px solid #cfe8cf',
              background: '#f9fff9',
              borderRadius: 14,
              padding: 18,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Recettes</h2>

            <div style={{ marginTop: 18, display: 'grid', gap: 18 }}>
              {categoriesWithSubs.map((category) => {
                const categoryTotal = category.subcategories.reduce((sum, sub) => {
                  return sum + eurosStringToCents(values[keyOf('income', sub.id)] ?? '')
                }, 0)

                return (
                  <div key={`income-${category.id}`}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        fontWeight: 800,
                        fontSize: 16,
                        marginBottom: 10,
                      }}
                    >
                      <div>{category.name}</div>
                      <div>{centsToEuros(categoryTotal)} €</div>
                    </div>

                    <div style={{ display: 'grid', gap: 8 }}>
                      {category.subcategories.map((sub) => (
                        <div
                          key={`income-${sub.id}`}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 140px',
                            gap: 12,
                            alignItems: 'center',
                          }}
                        >
                          <div style={{ paddingLeft: 12 }}>{sub.name}</div>

                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={values[keyOf('income', sub.id)] ?? ''}
                            onChange={(e) => updateValue('income', sub.id, e.target.value)}
                            placeholder="0.00"
                            style={{
                              padding: '8px 10px',
                              borderRadius: 8,
                              border: '1px solid #ccc',
                              textAlign: 'right',
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
