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
  start_date: string
  end_date: string
}

type Category = {
  id: string
  budget_id: string
  kind: 'income' | 'expense'
  name: string
  ordre: number
}

type Subcategory = {
  id: string
  category_id: string
  name: string
  ordre: number
}

type BudgetForecast = {
  id: string
  budget_id: string
  fiscal_year_id: string
  kind: 'income' | 'expense'
  category_id: string
  subcategory_id: string | null
  amount_cents: number
  ordre: number
}

type ForecastLine = {
  key: string
  category_id: string
  subcategory_id: string | null
  label: string
  ordre: number
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

function eurosToCents(value: string): number {
  const normalized = value.replace(',', '.').trim()
  if (!normalized) return 0
  const num = Number(normalized)
  if (!Number.isFinite(num)) return 0
  return Math.round(num * 100)
}

export default function AdminPrevisionnelPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [budgets, setBudgets] = useState<Budget[]>([])
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [forecasts, setForecasts] = useState<BudgetForecast[]>([])

  const [selectedBudgetId, setSelectedBudgetId] = useState('')
  const [selectedFiscalYearId, setSelectedFiscalYearId] = useState('')
  const [selectedKind, setSelectedKind] = useState<'income' | 'expense'>('expense')

  const [amounts, setAmounts] = useState<Record<string, string>>({})

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

    const [
      { data: b, error: e1 },
      { data: fy, error: e2 },
      { data: c, error: e3 },
      { data: s, error: e4 },
      { data: f, error: e5 },
    ] = await Promise.all([
      supabase.from('budgets').select('id,name,is_archived,ordre').order('ordre'),
      supabase.from('fiscal_years').select('id,year,start_date,end_date').order('year', { ascending: false }),
      supabase.from('categories').select('id,budget_id,kind,name,ordre').order('ordre'),
      supabase.from('subcategories').select('id,category_id,name,ordre').order('ordre'),
      supabase.from('budget_forecasts').select('*').order('ordre'),
    ])

    if (e1 || e2 || e3 || e4 || e5) {
      console.error(e1 || e2 || e3 || e4 || e5)
      alert('Erreur chargement prévisionnel')
      setLoading(false)
      return
    }

    const budgetsData = (b ?? []) as Budget[]
    const fiscalYearsData = (fy ?? []) as FiscalYear[]

    setBudgets(budgetsData)
    setFiscalYears(fiscalYearsData)
    setCategories((c ?? []) as Category[])
    setSubcategories((s ?? []) as Subcategory[])
    setForecasts((f ?? []) as BudgetForecast[])

    if (!selectedBudgetId && budgetsData.length) {
      const firstActive = budgetsData.find((x) => !x.is_archived) ?? budgetsData[0]
      setSelectedBudgetId(firstActive.id)
    }

    if (!selectedFiscalYearId && fiscalYearsData.length) {
      setSelectedFiscalYearId(fiscalYearsData[0].id)
    }

    setLoading(false)
  }

  const visibleCategories = useMemo(() => {
    return categories
      .filter((c) => c.budget_id === selectedBudgetId && c.kind === selectedKind)
      .sort((a, b) => a.ordre - b.ordre || a.name.localeCompare(b.name))
  }, [categories, selectedBudgetId, selectedKind])

  const lines = useMemo<ForecastLine[]>(() => {
    const out: ForecastLine[] = []

    for (const c of visibleCategories) {
      const subs = subcategories
        .filter((s) => s.category_id === c.id)
        .sort((a, b) => a.ordre - b.ordre || a.name.localeCompare(b.name))

      if (subs.length === 0) {
        out.push({
          key: `${c.id}__`,
          category_id: c.id,
          subcategory_id: null,
          label: c.name,
          ordre: c.ordre,
        })
      } else {
        for (const s of subs) {
          out.push({
            key: `${c.id}__${s.id}`,
            category_id: c.id,
            subcategory_id: s.id,
            label: `${c.name} • ${s.name}`,
            ordre: c.ordre * 1000 + s.ordre,
          })
        }
      }
    }

    return out
  }, [visibleCategories, subcategories])

  useEffect(() => {
    if (!selectedBudgetId || !selectedFiscalYearId) return

    const nextAmounts: Record<string, string> = {}

    for (const line of lines) {
      const existing = forecasts.find(
        (f) =>
          f.budget_id === selectedBudgetId &&
          f.fiscal_year_id === selectedFiscalYearId &&
          f.kind === selectedKind &&
          f.category_id === line.category_id &&
          (f.subcategory_id ?? '') === (line.subcategory_id ?? '')
      )

      nextAmounts[line.key] = existing ? centsToEuros(existing.amount_cents) : ''
    }

    setAmounts(nextAmounts)
  }, [selectedBudgetId, selectedFiscalYearId, selectedKind, lines, forecasts])

  const totalForecast = useMemo(() => {
    return Object.values(amounts).reduce((sum, x) => sum + eurosToCents(x), 0)
  }, [amounts])

  async function saveAll() {
    if (!selectedBudgetId || !selectedFiscalYearId) return

    setSaving(true)

    try {
      const { error: delErr } = await supabase
        .from('budget_forecasts')
        .delete()
        .eq('budget_id', selectedBudgetId)
        .eq('fiscal_year_id', selectedFiscalYearId)
        .eq('kind', selectedKind)

      if (delErr) throw delErr

      const rows = lines
        .map((line, index) => ({
          budget_id: selectedBudgetId,
          fiscal_year_id: selectedFiscalYearId,
          kind: selectedKind,
          category_id: line.category_id,
          subcategory_id: line.subcategory_id,
          amount_cents: eurosToCents(amounts[line.key] ?? ''),
          ordre: index + 1,
        }))
        .filter((r) => r.amount_cents > 0)

      if (rows.length > 0) {
        const { error: insErr } = await supabase.from('budget_forecasts').insert(rows)
        if (insErr) throw insErr
      }

      alert('✅ Prévisionnel sauvegardé')
      await load()
    } catch (e: any) {
      console.error(e)
      alert('Erreur sauvegarde prévisionnel')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Chargement…</main>
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1100 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900 }}>Admin — Prévisionnel</h1>

      <div
        style={{
          marginTop: 20,
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <select
          value={selectedBudgetId}
          onChange={(e) => setSelectedBudgetId(e.target.value)}
          style={{ padding: 8, minWidth: 220 }}
        >
          <option value="">Budget</option>
          {budgets
            .filter((b) => !b.is_archived)
            .sort((a, b) => a.ordre - b.ordre || a.name.localeCompare(b.name))
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </select>

        <select
          value={selectedFiscalYearId}
          onChange={(e) => setSelectedFiscalYearId(e.target.value)}
          style={{ padding: 8, minWidth: 140 }}
        >
          <option value="">Année</option>
          {fiscalYears.map((fy) => (
            <option key={fy.id} value={fy.id}>
              {fy.year}
            </option>
          ))}
        </select>

        <select
          value={selectedKind}
          onChange={(e) => setSelectedKind(e.target.value as 'income' | 'expense')}
          style={{ padding: 8, minWidth: 140 }}
        >
          <option value="expense">Dépenses</option>
          <option value="income">Recettes</option>
        </select>

        <button onClick={saveAll} disabled={saving || !selectedBudgetId || !selectedFiscalYearId}>
          {saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
      </div>

      <div style={{ marginTop: 12, fontSize: 15 }}>
        Total prévisionnel : <b>{centsToEuros(totalForecast)} €</b>
      </div>

      <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
        {lines.map((line) => (
          <div
            key={line.key}
            style={{
              border: '1px solid #eee',
              borderRadius: 10,
              padding: 12,
              display: 'grid',
              gridTemplateColumns: '1fr 180px',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <div>{line.label}</div>

            <input
              value={amounts[line.key] ?? ''}
              onChange={(e) =>
                setAmounts((prev) => ({
                  ...prev,
                  [line.key]: e.target.value,
                }))
              }
              placeholder="0,00"
              style={{ padding: 8 }}
            />
          </div>
        ))}

        {lines.length === 0 && (
          <div style={{ opacity: 0.7 }}>
            Aucune ligne pour ce budget / type.
          </div>
        )}
      </div>
    </main>
  )
}
