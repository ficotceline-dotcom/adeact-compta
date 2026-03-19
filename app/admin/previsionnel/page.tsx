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
  budget_id: string | null
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

type AllocationRow = {
  budget_id: string | null
  category_id: string | null
  subcategory_id: string | null
  transaction_id: string | null
}

type TransactionRow = {
  id: string
  kind: 'income' | 'expense' | string
}

type CategoryMappingRow = {
  category_id: string | null
  poste_cr: string | null
}

type SubcategoryMappingRow = {
  subcategory_id: string | null
  poste_cr: string | null
}

type BudgetCategoryBlock = {
  id: string
  name: string
  subcategories: Subcategory[]
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

function inferKindFromPosteCR(poste: string | null | undefined): 'income' | 'expense' | null {
  if (!poste) return null
  const p = poste.toLowerCase()

  const incomeHints = [
    'vente',
    'ventes',
    'cotisation',
    'cotisations',
    'mécénat',
    'mecenat',
    'subvention',
    'subventions',
    'produit',
    'produits',
    'prestations',
    'prestation',
    'concours publics',
    'don',
    'dons',
  ]

  const expenseHints = [
    'achat',
    'achats',
    'charge',
    'charges',
    'fourniture',
    'fournitures',
    'autres achats',
    'autres charges',
  ]

  if (incomeHints.some((hint) => p.includes(hint))) return 'income'
  if (expenseHints.some((hint) => p.includes(hint))) return 'expense'

  return null
}

export default function AdminPrevisionnelPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [forecastRows, setForecastRows] = useState<ForecastRow[]>([])
  const [allocationRows, setAllocationRows] = useState<AllocationRow[]>([])
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [categoryMappings, setCategoryMappings] = useState<CategoryMappingRow[]>([])
  const [subcategoryMappings, setSubcategoryMappings] = useState<SubcategoryMappingRow[]>([])

  const [selectedBudgetId, setSelectedBudgetId] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [debugError, setDebugError] = useState('')

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
    setSaving(false)
    setMessage('')
    setDebugError('')

    const [
      budgetsRes,
      categoriesRes,
      subcategoriesRes,
      forecastsRes,
      allocationsRes,
      transactionsRes,
      categoryMappingsRes,
      subcategoryMappingsRes,
    ] = await Promise.all([
      supabase
        .from('budgets')
        .select('id,name,ordre')
        .eq('is_archived', false)
        .order('ordre'),

      supabase
        .from('categories')
        .select('id,name,budget_id')
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
        .select('budget_id,category_id,subcategory_id,transaction_id'),

      supabase
        .from('transactions')
        .select('id,kind'),

      supabase
        .from('category_mapping')
        .select('category_id,poste_cr'),

      supabase
        .from('subcategory_mapping')
        .select('subcategory_id,poste_cr'),
    ])

    const firstError =
      budgetsRes.error ||
      categoriesRes.error ||
      subcategoriesRes.error ||
      forecastsRes.error ||
      allocationsRes.error ||
      transactionsRes.error ||
      categoryMappingsRes.error ||
      subcategoryMappingsRes.error

    if (firstError) {
      console.error({
        budgets: budgetsRes.error,
        categories: categoriesRes.error,
        subcategories: subcategoriesRes.error,
        forecasts: forecastsRes.error,
        allocations: allocationsRes.error,
        transactions: transactionsRes.error,
        categoryMappings: categoryMappingsRes.error,
        subcategoryMappings: subcategoryMappingsRes.error,
      })
      setDebugError(firstError.message)
      alert('Erreur chargement admin prévisionnel')
      setLoading(false)
      return
    }

    const loadedBudgets = (budgetsRes.data ?? []) as Budget[]
    setBudgets(loadedBudgets)
    setCategories((categoriesRes.data ?? []) as Category[])
    setSubcategories((subcategoriesRes.data ?? []) as Subcategory[])
    setForecastRows((forecastsRes.data ?? []) as ForecastRow[])
    setAllocationRows((allocationsRes.data ?? []) as AllocationRow[])
    setTransactions((transactionsRes.data ?? []) as TransactionRow[])
    setCategoryMappings((categoryMappingsRes.data ?? []) as CategoryMappingRow[])
    setSubcategoryMappings((subcategoryMappingsRes.data ?? []) as SubcategoryMappingRow[])

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

  const transactionKindMap = useMemo(() => {
    const map = new Map<string, 'income' | 'expense'>()

    for (const tx of transactions) {
      if (tx.kind === 'income' || tx.kind === 'expense') {
        map.set(tx.id, tx.kind)
      }
    }

    return map
  }, [transactions])

  const categoryPosteMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of categoryMappings) {
      if (row.category_id && row.poste_cr) {
        map.set(row.category_id, row.poste_cr)
      }
    }
    return map
  }, [categoryMappings])

  const subcategoryPosteMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of subcategoryMappings) {
      if (row.subcategory_id && row.poste_cr) {
        map.set(row.subcategory_id, row.poste_cr)
      }
    }
    return map
  }, [subcategoryMappings])

  const visibleCategories = useMemo(() => {
    return categories.filter((category) => category.budget_id === selectedBudgetId)
  }, [categories, selectedBudgetId])

  const visibleCategoryIds = useMemo(() => {
    return new Set(visibleCategories.map((c) => c.id))
  }, [visibleCategories])

  const visibleSubcategories = useMemo(() => {
    return subcategories.filter(
      (sub) => sub.category_id && visibleCategoryIds.has(sub.category_id)
    )
  }, [subcategories, visibleCategoryIds])

  const forecastKindBySubcategory = useMemo(() => {
    const map = new Map<string, 'income' | 'expense'>()

    for (const row of forecastRows) {
      if (
        row.budget_id === selectedBudgetId &&
        row.subcategory_id &&
        (row.kind === 'income' || row.kind === 'expense')
      ) {
        map.set(row.subcategory_id, row.kind)
      }
    }

    return map
  }, [forecastRows, selectedBudgetId])

  const actualKindBySubcategory = useMemo(() => {
    const map = new Map<string, 'income' | 'expense'>()

    for (const row of allocationRows) {
      if (
        row.budget_id === selectedBudgetId &&
        row.subcategory_id &&
        row.transaction_id
      ) {
        const txKind = transactionKindMap.get(row.transaction_id)
        if (txKind) {
          map.set(row.subcategory_id, txKind)
        }
      }
    }

    return map
  }, [allocationRows, transactionKindMap, selectedBudgetId])

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>()
    for (const c of categories) map.set(c.id, c)
    return map
  }, [categories])

  function resolveSubcategoryKind(sub: Subcategory): 'income' | 'expense' {
    const byForecast = forecastKindBySubcategory.get(sub.id)
    if (byForecast) return byForecast

    const byActual = actualKindBySubcategory.get(sub.id)
    if (byActual) return byActual

    const subPoste = subcategoryPosteMap.get(sub.id)
    const bySubPoste = inferKindFromPosteCR(subPoste)
    if (bySubPoste) return bySubPoste

    const category = sub.category_id ? categoryById.get(sub.category_id) : null
    const catPoste = category?.id ? categoryPosteMap.get(category.id) : null
    const byCatPoste = inferKindFromPosteCR(catPoste)
    if (byCatPoste) return byCatPoste

    return 'expense'
  }

  const expenseBlocks = useMemo<BudgetCategoryBlock[]>(() => {
    return visibleCategories
      .map((category) => ({
        id: category.id,
        name: category.name,
        subcategories: visibleSubcategories.filter(
          (s) => s.category_id === category.id && resolveSubcategoryKind(s) === 'expense'
        ),
      }))
      .filter((c) => c.subcategories.length > 0)
  }, [visibleCategories, visibleSubcategories, forecastKindBySubcategory, actualKindBySubcategory, subcategoryPosteMap, categoryPosteMap])

  const incomeBlocks = useMemo<BudgetCategoryBlock[]>(() => {
    return visibleCategories
      .map((category) => ({
        id: category.id,
        name: category.name,
        subcategories: visibleSubcategories.filter(
          (s) => s.category_id === category.id && resolveSubcategoryKind(s) === 'income'
        ),
      }))
      .filter((c) => c.subcategories.length > 0)
  }, [visibleCategories, visibleSubcategories, forecastKindBySubcategory, actualKindBySubcategory, subcategoryPosteMap, categoryPosteMap])

  const expenseSubcategories = useMemo(
    () => expenseBlocks.flatMap((b) => b.subcategories),
    [expenseBlocks]
  )

  const incomeSubcategories = useMemo(
    () => incomeBlocks.flatMap((b) => b.subcategories),
    [incomeBlocks]
  )

  const expenseTotalCents = useMemo(() => {
    return expenseSubcategories.reduce((sum, sub) => {
      return sum + eurosStringToCents(values[keyOf('expense', sub.id)] ?? '')
    }, 0)
  }, [expenseSubcategories, values])

  const incomeTotalCents = useMemo(() => {
    return incomeSubcategories.reduce((sum, sub) => {
      return sum + eurosStringToCents(values[keyOf('income', sub.id)] ?? '')
    }, 0)
  }, [incomeSubcategories, values])

  const isBalanced = expenseTotalCents === incomeTotalCents

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
        category_id: string | null
        subcategory_id: string
        amount_cents: number
      }[] = []

      for (const sub of expenseSubcategories) {
        const cents = eurosStringToCents(values[keyOf('expense', sub.id)] ?? '')
        if (cents > 0) {
          rowsToInsert.push({
            budget_id: selectedBudgetId,
            kind: 'expense',
            category_id: sub.category_id,
            subcategory_id: sub.id,
            amount_cents: cents,
          })
        }
      }

      for (const sub of incomeSubcategories) {
        const cents = eurosStringToCents(values[keyOf('income', sub.id)] ?? '')
        if (cents > 0) {
          rowsToInsert.push({
            budget_id: selectedBudgetId,
            kind: 'income',
            category_id: sub.category_id,
            subcategory_id: sub.id,
            amount_cents: cents,
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
      setDebugError(e?.message ?? 'Erreur inconnue')
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

  const noData = expenseBlocks.length === 0 && incomeBlocks.length === 0

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1400 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900 }}>Admin prévisionnel</h1>

      {debugError && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 10,
            background: '#fff3f3',
            border: '1px solid #e0b4b4',
            color: '#8a1f1f',
            whiteSpace: 'pre-wrap',
          }}
        >
          <b>Détail erreur :</b> {debugError}
        </div>
      )}

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

      {noData ? (
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
              {expenseBlocks.map((category) => {
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
              {incomeBlocks.map((category) => {
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
