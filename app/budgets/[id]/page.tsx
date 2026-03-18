'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Budget = { id: string; name: string }

type Category = { id: string; name: string; kind: 'income' | 'expense' }

type Subcategory = { id: string; name: string; category_id: string }

type AllocationRow = {
  amount_cents: number
  category_id: string | null
  subcategory_id: string | null
  transaction: { kind: 'income' | 'expense' } | { kind: 'income' | 'expense' }[] | null
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}
function txKind(row: AllocationRow): 'income' | 'expense' | null {
  const t = row.transaction as any
  if (!t) return null
  if (Array.isArray(t)) return t[0]?.kind ?? null
  return t.kind ?? null
}

export default function BudgetDetailPage() {
  const params = useParams()
  const budgetId = params?.id as string

  const [loading, setLoading] = useState(true)
  const [budget, setBudget] = useState<Budget | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [allocations, setAllocations] = useState<AllocationRow[]>([])

  useEffect(() => {
    if (!budgetId) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetId])

  async function load() {
    setLoading(true)

    const { data: b, error: bErr } = await supabase
      .from('budgets')
      .select('id,name')
      .eq('id', budgetId)
      .single()

    if (bErr) {
      console.error(bErr)
      alert('Budget introuvable')
      setLoading(false)
      return
    }
    setBudget(b as Budget)

    const [{ data: c, error: cErr }, { data: s, error: sErr }, { data: a, error: aErr }] =
      await Promise.all([
        supabase.from('categories').select('id,name,kind').eq('budget_id', budgetId),
        supabase
          .from('subcategories')
          .select('id,name,category_id')
          .in(
            'category_id',
            (await supabase.from('categories').select('id').eq('budget_id', budgetId)).data?.map((x: any) => x.id) ??
              []
          ),
        supabase
          .from('transaction_allocations')
          .select('amount_cents,category_id,subcategory_id, transaction:transactions(kind)')
          .eq('budget_id', budgetId),
      ])

    if (cErr || sErr || aErr) {
      console.error(cErr || sErr || aErr)
      alert('Erreur chargement détail')
      setLoading(false)
      return
    }

    setCategories((c ?? []) as Category[])
    setSubcategories((s ?? []) as Subcategory[])
    setAllocations((a ?? []) as AllocationRow[])
    setLoading(false)
  }

  const totals = useMemo(() => {
    let income = 0
    let expense = 0
    for (const row of allocations) {
      const k = txKind(row)
      if (k === 'income') income += row.amount_cents
      if (k === 'expense') expense += row.amount_cents
    }
    return { income, expense, net: income - expense }
  }, [allocations])

  const byCategory = useMemo(() => {
    // category_id -> { income, expense }
    const map: Record<string, { income: number; expense: number }> = {}
    for (const c of categories) {
      map[c.id] = { income: 0, expense: 0 }
    }

    for (const row of allocations) {
      if (!row.category_id) continue
      const bucket = map[row.category_id] ?? { income: 0, expense: 0 }
      const k = txKind(row)
      if (k === 'income') bucket.income += row.amount_cents
      if (k === 'expense') bucket.expense += row.amount_cents
      map[row.category_id] = bucket
    }
    return map
  }, [categories, allocations])

  const bySubcategory = useMemo(() => {
    // subcategory_id -> { income, expense }
    const map: Record<string, { income: number; expense: number }> = {}
    for (const s of subcategories) {
      map[s.id] = { income: 0, expense: 0 }
    }
    for (const row of allocations) {
      if (!row.subcategory_id) continue
      const bucket = map[row.subcategory_id] ?? { income: 0, expense: 0 }
      const k = txKind(row)
      if (k === 'income') bucket.income += row.amount_cents
      if (k === 'expense') bucket.expense += row.amount_cents
      map[row.subcategory_id] = bucket
    }
    return map
  }, [subcategories, allocations])

  if (loading) return <main style={{ padding: 24 }}>Chargement…</main>

  if (!budget) return <main style={{ padding: 24 }}>Budget introuvable</main>

  const incomeCats = categories.filter((c) => c.kind === 'income').sort((a, b) => a.name.localeCompare(b.name))
  const expenseCats = categories.filter((c) => c.kind === 'expense').sort((a, b) => a.name.localeCompare(b.name))

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1100 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>{budget.name} — Détail</h1>

      <div style={{ marginTop: 10, padding: 12, border: '1px solid #eee', borderRadius: 12 }}>
        <div>Recettes: <b>{centsToEuros(totals.income)} €</b></div>
        <div>Dépenses: <b>{centsToEuros(totals.expense)} €</b></div>
        <div style={{ marginTop: 6, fontSize: 16, fontWeight: 800 }}>
          Solde: {centsToEuros(totals.net)} €
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Recettes</h2>

          {incomeCats.length === 0 && <p>Aucune catégorie</p>}

          {incomeCats.map((cat) => {
            const catTot = byCategory[cat.id] ?? { income: 0, expense: 0 }
            const subs = subcategories.filter((s) => s.category_id === cat.id).sort((a, b) => a.name.localeCompare(b.name))

            return (
              <div key={cat.id} style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #eee' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{cat.name}</strong>
                  <span>{centsToEuros(catTot.income)} €</span>
                </div>

                <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                  {subs.map((s) => {
                    const t = bySubcategory[s.id] ?? { income: 0, expense: 0 }
                    return (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, opacity: 0.9 }}>
                        <span>— {s.name}</span>
                        <span>{centsToEuros(t.income)} €</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </section>

        <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Dépenses</h2>

          {expenseCats.length === 0 && <p>Aucune catégorie</p>}

          {expenseCats.map((cat) => {
            const catTot = byCategory[cat.id] ?? { income: 0, expense: 0 }
            const subs = subcategories.filter((s) => s.category_id === cat.id).sort((a, b) => a.name.localeCompare(b.name))

            return (
              <div key={cat.id} style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #eee' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{cat.name}</strong>
                  <span>{centsToEuros(catTot.expense)} €</span>
                </div>

                <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                  {subs.map((s) => {
                    const t = bySubcategory[s.id] ?? { income: 0, expense: 0 }
                    return (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, opacity: 0.9 }}>
                        <span>— {s.name}</span>
                        <span>{centsToEuros(t.expense)} €</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </section>
      </div>
    </main>
  )
}
