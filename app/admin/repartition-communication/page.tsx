'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Budget = {
  id: string
  name: string
  ordre: number
  is_archived: boolean | null
}

type Category = {
  id: string
  budget_id: string
  kind: 'income' | 'expense'
  name: string
  ordre?: number
}

type Subcategory = {
  id: string
  category_id: string
  name: string
  ordre?: number
}

type RuleRowDb = {
  id: string
  budget_id: string
  category_id: string
  subcategory_id: string | null
  percentage: number
  ordre: number
}

type RuleDraft = {
  localId: string
  budget_id: string
  category_id: string
  subcategory_id: string
  percentage: string
  ordre: number
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function percentToNumber(value: string) {
  const s = value.replace(',', '.').trim()
  if (!s) return 0
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

export default function AdminRepartitionCommunicationPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [rules, setRules] = useState<RuleDraft[]>([])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

    const [
      { data: b, error: e1 },
      { data: c, error: e2 },
      { data: s, error: e3 },
      { data: r, error: e4 },
    ] = await Promise.all([
      supabase.from('budgets').select('id,name,ordre,is_archived').eq('is_archived', false).order('ordre'),
      supabase.from('categories').select('id,budget_id,kind,name,ordre').order('ordre'),
      supabase.from('subcategories').select('id,category_id,name,ordre').order('ordre'),
      supabase.from('communication_split_rules').select('*').order('ordre'),
    ])

    if (e1 || e2 || e3 || e4) {
      console.error(e1 || e2 || e3 || e4)
      alert('Erreur chargement répartition communication')
      setLoading(false)
      return
    }

    setBudgets((b ?? []) as Budget[])
    setCategories((c ?? []) as Category[])
    setSubcategories((s ?? []) as Subcategory[])

    const dbRules = (r ?? []) as RuleRowDb[]
    if (dbRules.length > 0) {
      setRules(
        dbRules.map((row) => ({
          localId: row.id,
          budget_id: row.budget_id,
          category_id: row.category_id,
          subcategory_id: row.subcategory_id ?? '',
          percentage: String(row.percentage),
          ordre: row.ordre,
        }))
      )
    } else {
      setRules([
        {
          localId: uid(),
          budget_id: '',
          category_id: '',
          subcategory_id: '',
          percentage: '',
          ordre: 1,
        },
      ])
    }

    setLoading(false)
  }

  function categoriesForBudget(budgetId: string) {
    return categories
      .filter((c) => c.budget_id === budgetId && c.kind === 'expense')
      .sort((a, b) => (a.ordre ?? 999) - (b.ordre ?? 999) || a.name.localeCompare(b.name))
  }

  function subcategoriesForCategory(categoryId: string) {
    return subcategories
      .filter((s) => s.category_id === categoryId)
      .sort((a, b) => (a.ordre ?? 999) - (b.ordre ?? 999) || a.name.localeCompare(b.name))
  }

  function updateRule(localId: string, patch: Partial<RuleDraft>) {
    setRules((prev) =>
      prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r))
    )
  }

  function addRule() {
    setRules((prev) => [
      ...prev,
      {
        localId: uid(),
        budget_id: '',
        category_id: '',
        subcategory_id: '',
        percentage: '',
        ordre: prev.length + 1,
      },
    ])
  }

  function removeRule(localId: string) {
    setRules((prev) =>
      prev
        .filter((r) => r.localId !== localId)
        .map((r, index) => ({ ...r, ordre: index + 1 }))
    )
  }

  const totalPercent = useMemo(
    () => rules.reduce((sum, r) => sum + percentToNumber(r.percentage), 0),
    [rules]
  )

  const isValid = useMemo(() => {
    if (rules.length === 0) return false

    for (const r of rules) {
      if (!r.budget_id) return false
      if (!r.category_id) return false
      if (percentToNumber(r.percentage) <= 0) return false
    }

    return Math.abs(totalPercent - 100) < 0.0001
  }, [rules, totalPercent])

  async function save() {
    if (!isValid) {
      alert('La répartition doit être complète et totaliser exactement 100 %.')
      return
    }

    setSaving(true)

    try {
      const rows = rules.map((r, index) => ({
        budget_id: r.budget_id,
        category_id: r.category_id,
        subcategory_id: r.subcategory_id || null,
        percentage: percentToNumber(r.percentage),
        ordre: index + 1,
      }))

      const { error: delErr } = await supabase
        .from('communication_split_rules')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000')

      if (delErr) throw delErr

      const { error: insErr } = await supabase
        .from('communication_split_rules')
        .insert(rows)

      if (insErr) throw insErr

      alert('✅ Répartition communication sauvegardée')
      await load()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur sauvegarde : ${e?.message ?? 'inconnue'}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Chargement…</main>
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1100 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900 }}>Admin — Répartition communication</h1>

      <div style={{ marginTop: 8, opacity: 0.8 }}>
        Cette répartition s’appliquera uniquement aux <b>nouvelles</b> transactions créées avec la case
        <b> “Dépense de communication”</b>. Les anciennes transactions ne seront jamais recalculées.
      </div>

      <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
        {rules.map((rule, index) => {
          const cats = rule.budget_id ? categoriesForBudget(rule.budget_id) : []
          const subs = rule.category_id ? subcategoriesForCategory(rule.category_id) : []

          return (
            <div
              key={rule.localId}
              style={{
                border: '1px solid #ddd',
                borderRadius: 12,
                padding: 14,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr 140px 100px auto',
                gap: 10,
                alignItems: 'end',
              }}
            >
              <label>
                Budget
                <select
                  value={rule.budget_id}
                  onChange={(e) =>
                    updateRule(rule.localId, {
                      budget_id: e.target.value,
                      category_id: '',
                      subcategory_id: '',
                    })
                  }
                  style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
                >
                  <option value="">—</option>
                  {budgets.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Catégorie
                <select
                  value={rule.category_id}
                  onChange={(e) =>
                    updateRule(rule.localId, {
                      category_id: e.target.value,
                      subcategory_id: '',
                    })
                  }
                  style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
                  disabled={!rule.budget_id}
                >
                  <option value="">—</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Sous-catégorie
                <select
                  value={rule.subcategory_id}
                  onChange={(e) => updateRule(rule.localId, { subcategory_id: e.target.value })}
                  style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
                  disabled={!rule.category_id}
                >
                  <option value="">—</option>
                  {subs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Pourcentage
                <input
                  value={rule.percentage}
                  onChange={(e) => updateRule(rule.localId, { percentage: e.target.value })}
                  placeholder="0"
                  style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
                />
              </label>

              <label>
                Ordre
                <input
                  type="number"
                  value={rule.ordre}
                  onChange={(e) =>
                    updateRule(rule.localId, { ordre: Number(e.target.value || index + 1) })
                  }
                  style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
                />
              </label>

              <button onClick={() => removeRule(rule.localId)} style={{ padding: '10px 12px' }}>
                Supprimer
              </button>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 16, fontSize: 16 }}>
        Total : <b>{totalPercent.toFixed(2)} %</b>
        {Math.abs(totalPercent - 100) >= 0.0001 && (
          <span style={{ color: 'crimson' }}> — le total doit faire 100 %</span>
        )}
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
        <button onClick={addRule} style={{ padding: '10px 12px' }}>
          + Ajouter une ligne
        </button>

        <button
          onClick={save}
          disabled={saving || !isValid}
          style={{ padding: '10px 12px', opacity: saving || !isValid ? 0.5 : 1 }}
        >
          {saving ? 'Sauvegarde…' : 'Sauvegarder la répartition'}
        </button>
      </div>
    </main>
  )
}
