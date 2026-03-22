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
  id?: string
  budget_id: string | null
  kind: 'income' | 'expense' | string | null
  category_id: string | null
  subcategory_id: string | null
  amount_cents: number | null
  ordre?: number | null
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

type DisplayLine = {
  categoryId: string
  categoryName: string
  subcategoryId: string | null
  subcategoryName: string | null
  label: string
  kind: 'income' | 'expense'
  value: string
}

type CategoryBlock = {
  id: string
  name: string
  lines: DisplayLine[]
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
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

function inferKindFromText(value: string | null | undefined): 'income' | 'expense' | null {
  const t = normalizeText(value)
  if (!t) return null

  const incomeHints = [
    'subvention',
    'fondation',
    'vente',
    'billet',
    'billetterie',
    'don',
    'cotisation',
    'mecenat',
    'partenariat',
    'sponsor',
    'prestation',
    'produit',
    'caisse des depots',
    'mairie',
    'departement',
    'region',
    'credit agricole',
    'banque alimentaire', // au cas où un jour
  ]

  const expenseHints = [
    'frais',
    'communication',
    'representation',
    'restauration',
    'solidarite',
    'location',
    'sacem',
    'son',
    'lumiere',
    'lumieres',
    'maquillage',
    'decor',
    'decors',
    'costume',
    'costumes',
    'vehicule',
    'theatre',
    'securite',
    'impression',
    'accessoire',
    'accessoires',
    'repetition',
    'repetitions',
    'gite',
    'main d oeuvre',
    "main d'oeuvre",
    'captation',
    'livret',
    'livrets',
  ]

  if (incomeHints.some((hint) => t.includes(hint))) return 'income'
  if (expenseHints.some((hint) => t.includes(hint))) return 'expense'

  return null
}

function singleObservedKind(kinds: Array<'income' | 'expense'>): 'income' | 'expense' | null {
  const uniq = Array.from(new Set(kinds))
  return uniq.length === 1 ? uniq[0] : null
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
  const [allocationRows, setAllocationRows] = useState<AllocationRow[]>([])
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [categoryMappings, setCategoryMappings] = useState<CategoryMappingRow[]>([])
  const [subcategoryMappings, setSubcategoryMappings] = useState<SubcategoryMappingRow[]>([])

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
        .select('id,budget_id,kind,category_id,subcategory_id,amount_cents,ordre'),

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

  const transactionKindMap = useMemo(() => {
    const map = new Map<string, 'income' | 'expense'>()
    for (const tx of transactions) {
      if (tx.kind === 'income' || tx.kind === 'expense') {
        map.set(tx.id, tx.kind)
      }
    }
    return map
  }, [transactions])

  const visibleCategories = useMemo(() => {
    return categories.filter((c) => c.budget_id === selectedBudgetId)
  }, [categories, selectedBudgetId])

  const visibleCategoryIds = useMemo(() => {
    return new Set(visibleCategories.map((c) => c.id))
  }, [visibleCategories])

  const visibleSubcategories = useMemo(() => {
    return subcategories.filter(
      (s) => s.category_id && visibleCategoryIds.has(s.category_id)
    )
  }, [subcategories, visibleCategoryIds])

  const categoryNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of visibleCategories) {
      map.set(c.id, c.name)
    }
    return map
  }, [visibleCategories])

  const subcategoryNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of visibleSubcategories) {
      map.set(s.id, s.name)
    }
    return map
  }, [visibleSubcategories])

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

  const forecastKindsByLine = useMemo(() => {
    const map = new Map<string, Array<'income' | 'expense'>>()

    for (const row of forecastRows) {
      if (row.budget_id !== selectedBudgetId) continue
      if (!row.category_id) continue
      if (row.kind !== 'income' && row.kind !== 'expense') continue

      const key = `${row.category_id}__${row.subcategory_id ?? 'none'}`
      const current = map.get(key) ?? []
      current.push(row.kind)
      map.set(key, current)
    }

    return map
  }, [forecastRows, selectedBudgetId])

  const actualKindsByLine = useMemo(() => {
    const map = new Map<string, Array<'income' | 'expense'>>()

    for (const row of allocationRows) {
      if (row.budget_id !== selectedBudgetId) continue
      if (!row.category_id) continue
      if (!row.transaction_id) continue

      const txKind = transactionKindMap.get(row.transaction_id)
      if (!txKind) continue

      const key = `${row.category_id}__${row.subcategory_id ?? 'none'}`
      const current = map.get(key) ?? []
      current.push(txKind)
      map.set(key, current)
    }

    return map
  }, [allocationRows, selectedBudgetId, transactionKindMap])

  function resolveKind(categoryId: string, subcategoryId: string | null): 'income' | 'expense' {
    const lineKey = `${categoryId}__${subcategoryId ?? 'none'}`

    const observedForecastKind = singleObservedKind(forecastKindsByLine.get(lineKey) ?? [])
    if (observedForecastKind) return observedForecastKind

    const observedActualKind = singleObservedKind(actualKindsByLine.get(lineKey) ?? [])
    if (observedActualKind) return observedActualKind

    if (subcategoryId) {
      const fromSubPoste = inferKindFromText(subcategoryPosteMap.get(subcategoryId))
      if (fromSubPoste) return fromSubPoste

      const fromSubName = inferKindFromText(subcategoryNameMap.get(subcategoryId))
      if (fromSubName) return fromSubName
    }

    const fromCatPoste = inferKindFromText(categoryPosteMap.get(categoryId))
    if (fromCatPoste) return fromCatPoste

    const fromCatName = inferKindFromText(categoryNameMap.get(categoryId))
    if (fromCatName) return fromCatName

    return 'expense'
  }

  const displayLines = useMemo<DisplayLine[]>(() => {
    const lines: DisplayLine[] = []

    for (const category of visibleCategories) {
      const subs = visibleSubcategories.filter((s) => s.category_id === category.id)

      if (subs.length === 0) {
        const kind = resolveKind(category.id, null)

        lines.push({
          categoryId: category.id,
          categoryName: category.name,
          subcategoryId: null,
          subcategoryName: null,
          label: category.name,
          kind,
          value: values[keyOf(kind, category.id, null)] ?? '',
        })
      } else {
        for (const sub of subs) {
          const kind = resolveKind(category.id, sub.id)

          lines.push({
            categoryId: category.id,
            categoryName: category.name,
            subcategoryId: sub.id,
            subcategoryName: sub.name,
            label: sub.name,
            kind,
            value: values[keyOf(kind, category.id, sub.id)] ?? '',
          })
        }
      }
    }

    return lines
  }, [visibleCategories, visibleSubcategories, values, forecastKindsByLine, actualKindsByLine])

  const expenseBlocks = useMemo<CategoryBlock[]>(() => {
    return visibleCategories
      .map((category) => ({
        id: category.id,
        name: category.name,
        lines: displayLines.filter(
          (line) => line.categoryId === category.id && line.kind === 'expense'
        ),
      }))
      .filter((block) => block.lines.length > 0)
  }, [visibleCategories, displayLines])

  const incomeBlocks = useMemo<CategoryBlock[]>(() => {
    return visibleCategories
      .map((category) => ({
        id: category.id,
        name: category.name,
        lines: displayLines.filter(
          (line) => line.categoryId === category.id && line.kind === 'income'
        ),
      }))
      .filter((block) => block.lines.length > 0)
  }, [visibleCategories, displayLines])

  const expenseTotalCents = useMemo(() => {
    return expenseBlocks
      .flatMap((b) => b.lines)
      .reduce((sum, line) => sum + eurosStringToCents(line.value), 0)
  }, [expenseBlocks])

  const incomeTotalCents = useMemo(() => {
    return incomeBlocks
      .flatMap((b) => b.lines)
      .reduce((sum, line) => sum + eurosStringToCents(line.value), 0)
  }, [incomeBlocks])

  const isBalanced = expenseTotalCents === incomeTotalCents

  function updateLineValue(line: DisplayLine, nextValue: string) {
    setValues((prev) => ({
      ...prev,
      [keyOf(line.kind, line.categoryId, line.subcategoryId)]: nextValue,
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
            kind: line.kind,
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
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Chargement…</main>
  }

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
            {expenseBlocks.length === 0 ? (
              <div style={{ opacity: 0.7 }}>Aucune dépense.</div>
            ) : (
              expenseBlocks.map((category) => (
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
                    <div>
                      {centsToEuros(
                        category.lines.reduce((sum, line) => sum + eurosStringToCents(line.value), 0)
                      )}{' '}
                      €
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 8 }}>
                    {category.lines.map((line) => (
                      <div
                        key={keyOf(line.kind, line.categoryId, line.subcategoryId)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 140px',
                          gap: 12,
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ paddingLeft: 12 }}>{line.label}</div>

                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.value}
                          onChange={(e) => updateLineValue(line, e.target.value)}
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
              ))
            )}
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
            {incomeBlocks.length === 0 ? (
              <div style={{ opacity: 0.7 }}>Aucune recette.</div>
            ) : (
              incomeBlocks.map((category) => (
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
                    <div>
                      {centsToEuros(
                        category.lines.reduce((sum, line) => sum + eurosStringToCents(line.value), 0)
                      )}{' '}
                      €
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 8 }}>
                    {category.lines.map((line) => (
                      <div
                        key={keyOf(line.kind, line.categoryId, line.subcategoryId)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 140px',
                          gap: 12,
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ paddingLeft: 12 }}>{line.label}</div>

                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.value}
                          onChange={(e) => updateLineValue(line, e.target.value)}
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
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
