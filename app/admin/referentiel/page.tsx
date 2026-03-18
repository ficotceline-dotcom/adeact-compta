'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Budget = {
  id: string
  name: string
  is_archived: boolean | null
  is_closed?: boolean | null
  ordre: number
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

type CategoryMapping = {
  id?: string
  category_id: string
  poste_cr: string | null
  poste_bilan: string | null
}

type SubcategoryMapping = {
  id?: string
  subcategory_id: string
  poste_cr: string | null
  poste_bilan: string | null
}

type TxRef = {
  transaction_id: string
  tx_date: string
  description: string
  amount_cents: number
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

function hasFullMapping(poste_cr?: string | null, poste_bilan?: string | null) {
  return !!poste_cr && !!poste_bilan
}

export default function AdminReferentielPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])

  const [categoryMappings, setCategoryMappings] = useState<Record<string, CategoryMapping>>({})
  const [subcategoryMappings, setSubcategoryMappings] = useState<Record<string, SubcategoryMapping>>({})

  const [crPostes, setCrPostes] = useState<string[]>([])
  const [bilanPostes, setBilanPostes] = useState<string[]>([])

  const [newBudgetName, setNewBudgetName] = useState('')
  const [newCategoryBudgetId, setNewCategoryBudgetId] = useState('')
  const [newCategoryKind, setNewCategoryKind] = useState<'income' | 'expense'>('expense')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newSubcategoryCategoryId, setNewSubcategoryCategoryId] = useState('')
  const [newSubcategoryName, setNewSubcategoryName] = useState('')

  const [duplicateSourceBudgetId, setDuplicateSourceBudgetId] = useState('')
  const [duplicateTargetName, setDuplicateTargetName] = useState('')

  // filtres d'affichage
  const [categoryFilterBudgetId, setCategoryFilterBudgetId] = useState('')
  const [categoryFilterKind, setCategoryFilterKind] = useState<'income' | 'expense'>('expense')

  const [subcategoryFilterBudgetId, setSubcategoryFilterBudgetId] = useState('')
  const [subcategoryFilterKind, setSubcategoryFilterKind] = useState<'income' | 'expense'>('expense')

  const [mappingCategoryFilterBudgetId, setMappingCategoryFilterBudgetId] = useState('')
  const [mappingCategoryFilterKind, setMappingCategoryFilterKind] = useState<'income' | 'expense'>('expense')
  const [showMappedCategories, setShowMappedCategories] = useState(false)

  const [mappingSubcategoryFilterBudgetId, setMappingSubcategoryFilterBudgetId] = useState('')
  const [mappingSubcategoryFilterKind, setMappingSubcategoryFilterKind] = useState<'income' | 'expense'>('expense')
  const [showMappedSubcategories, setShowMappedSubcategories] = useState(false)

  const budgetsSorted = useMemo(
    () => [...budgets].sort((a, b) => a.ordre - b.ordre || a.name.localeCompare(b.name)),
    [budgets]
  )

  const categoriesSorted = useMemo(
    () => [...categories].sort((a, b) => a.ordre - b.ordre || a.name.localeCompare(b.name)),
    [categories]
  )

  const subcategoriesSorted = useMemo(
    () => [...subcategories].sort((a, b) => a.ordre - b.ordre || a.name.localeCompare(b.name)),
    [subcategories]
  )

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!categoryFilterBudgetId && budgetsSorted.length) {
      const firstActive = budgetsSorted.find((b) => !b.is_archived) ?? budgetsSorted[0]
      setCategoryFilterBudgetId(firstActive.id)
      setSubcategoryFilterBudgetId(firstActive.id)
      setMappingCategoryFilterBudgetId(firstActive.id)
      setMappingSubcategoryFilterBudgetId(firstActive.id)
      setNewCategoryBudgetId(firstActive.id)
    }
  }, [budgetsSorted, categoryFilterBudgetId])

  async function load() {
    setLoading(true)

    const [
      { data: b, error: e1 },
      { data: c, error: e2 },
      { data: s, error: e3 },
      { data: cm, error: e4 },
      { data: sm, error: e5 },
      { data: crp, error: e6 },
      { data: bip, error: e7 },
    ] = await Promise.all([
      supabase.from('budgets').select('id,name,is_archived,is_closed,ordre').order('ordre'),
      supabase.from('categories').select('id,budget_id,kind,name,ordre').order('ordre'),
      supabase.from('subcategories').select('id,category_id,name,ordre').order('ordre'),
      supabase.from('category_mapping').select('*'),
      supabase.from('subcategory_mapping').select('*'),
      supabase.from('cr_postes').select('label').order('label'),
      supabase.from('bilan_postes').select('label').order('label'),
    ])

    if (e1 || e2 || e3 || e4 || e5 || e6 || e7) {
      console.error(e1 || e2 || e3 || e4 || e5 || e6 || e7)
      alert('Erreur chargement référentiel')
      setLoading(false)
      return
    }

    setBudgets((b ?? []) as Budget[])
    setCategories((c ?? []) as Category[])
    setSubcategories((s ?? []) as Subcategory[])

    const cmMap: Record<string, CategoryMapping> = {}
    for (const row of (cm ?? []) as CategoryMapping[]) {
      cmMap[row.category_id] = row
    }
    setCategoryMappings(cmMap)

    const smMap: Record<string, SubcategoryMapping> = {}
    for (const row of (sm ?? []) as SubcategoryMapping[]) {
      smMap[row.subcategory_id] = row
    }
    setSubcategoryMappings(smMap)

    setCrPostes((crp ?? []).map((x: any) => x.label))
    setBilanPostes((bip ?? []).map((x: any) => x.label))

    setLoading(false)
  }

  async function recalcCategoryMapping(categoryId: string, poste_cr: string | null, poste_bilan: string | null) {
    const { error } = await supabase
      .from('transaction_allocations')
      .update({
        poste_cr,
        poste_bilan,
      })
      .eq('category_id', categoryId)
      .is('subcategory_id', null)

    if (error) throw error
  }

  async function recalcSubcategoryMapping(subcategoryId: string, poste_cr: string | null, poste_bilan: string | null) {
    const { error } = await supabase
      .from('transaction_allocations')
      .update({
        poste_cr,
        poste_bilan,
      })
      .eq('subcategory_id', subcategoryId)

    if (error) throw error
  }

  async function createBudget() {
    if (!newBudgetName.trim()) return
    setSaving(true)

    const nextOrdre = budgets.length ? Math.max(...budgets.map((b) => b.ordre ?? 999)) + 1 : 1

    const { error } = await supabase.from('budgets').insert({
      name: newBudgetName.trim(),
      is_archived: false,
      is_closed: false,
      ordre: nextOrdre,
    })

    setSaving(false)

    if (error) {
      console.error(error)
      alert('Erreur création budget')
      return
    }

    setNewBudgetName('')
    await load()
  }

  async function updateBudget(budgetId: string, patch: Partial<Budget>) {
    const { error } = await supabase.from('budgets').update(patch).eq('id', budgetId)
    if (error) {
      console.error(error)
      alert('Erreur modification budget')
      return
    }
    await load()
  }

  async function createCategory() {
    if (!newCategoryBudgetId || !newCategoryName.trim()) return
    setSaving(true)

    const sameBudgetCats = categories.filter(
      (c) => c.budget_id === newCategoryBudgetId && c.kind === newCategoryKind
    )
    const nextOrdre = sameBudgetCats.length
      ? Math.max(...sameBudgetCats.map((c) => c.ordre ?? 999)) + 1
      : 1

    const { error } = await supabase.from('categories').insert({
      budget_id: newCategoryBudgetId,
      kind: newCategoryKind,
      name: newCategoryName.trim(),
      ordre: nextOrdre,
    })

    setSaving(false)

    if (error) {
      console.error(error)
      alert('Erreur création catégorie')
      return
    }

    setNewCategoryName('')
    await load()
  }

  async function updateCategory(categoryId: string, patch: Partial<Category>) {
    const { error } = await supabase.from('categories').update(patch).eq('id', categoryId)
    if (error) {
      console.error(error)
      alert('Erreur modification catégorie')
      return
    }
    await load()
  }

  async function createSubcategory() {
    if (!newSubcategoryCategoryId || !newSubcategoryName.trim()) return
    setSaving(true)

    const sameCatSubs = subcategories.filter((s) => s.category_id === newSubcategoryCategoryId)
    const nextOrdre = sameCatSubs.length
      ? Math.max(...sameCatSubs.map((s) => s.ordre ?? 999)) + 1
      : 1

    const { error } = await supabase.from('subcategories').insert({
      category_id: newSubcategoryCategoryId,
      name: newSubcategoryName.trim(),
      ordre: nextOrdre,
    })

    setSaving(false)

    if (error) {
      console.error(error)
      alert('Erreur création sous-catégorie')
      return
    }

    setNewSubcategoryName('')
    await load()
  }

  async function updateSubcategory(subcategoryId: string, patch: Partial<Subcategory>) {
    const { error } = await supabase.from('subcategories').update(patch).eq('id', subcategoryId)
    if (error) {
      console.error(error)
      alert('Erreur modification sous-catégorie')
      return
    }
    await load()
  }

  async function getLinkedTransactionsForCategory(categoryId: string): Promise<TxRef[]> {
    const { data, error } = await supabase
      .from('transaction_allocations')
      .select('transaction_id, transactions!inner(tx_date,description,amount_cents)')
      .eq('category_id', categoryId)

    if (error) {
      console.error(error)
      return []
    }

    return ((data ?? []) as any[]).map((row) => ({
      transaction_id: row.transaction_id,
      tx_date: row.transactions?.tx_date,
      description: row.transactions?.description,
      amount_cents: row.transactions?.amount_cents,
    }))
  }

  async function getLinkedTransactionsForSubcategory(subcategoryId: string): Promise<TxRef[]> {
    const { data, error } = await supabase
      .from('transaction_allocations')
      .select('transaction_id, transactions!inner(tx_date,description,amount_cents)')
      .eq('subcategory_id', subcategoryId)

    if (error) {
      console.error(error)
      return []
    }

    return ((data ?? []) as any[]).map((row) => ({
      transaction_id: row.transaction_id,
      tx_date: row.transactions?.tx_date,
      description: row.transactions?.description,
      amount_cents: row.transactions?.amount_cents,
    }))
  }

  async function deleteCategory(categoryId: string) {
    const linked = await getLinkedTransactionsForCategory(categoryId)

    if (linked.length > 0) {
      const msg =
        `Impossible de supprimer cette catégorie : ${linked.length} transaction(s) y sont rattachée(s).\n\n` +
        linked
          .slice(0, 10)
          .map(
            (t) =>
              `- ${t.tx_date} | ${t.description ?? 'Sans libellé'} | ${centsToEuros(t.amount_cents)} €`
          )
          .join('\n') +
        `\n\nVa les modifier dans Transactions > Modifier.`
      alert(msg)
      return
    }

    const ok = confirm('Supprimer cette catégorie ?')
    if (!ok) return

    const { error } = await supabase.from('categories').delete().eq('id', categoryId)
    if (error) {
      console.error(error)
      alert('Erreur suppression catégorie')
      return
    }

    await load()
  }

  async function deleteSubcategory(subcategoryId: string) {
    const linked = await getLinkedTransactionsForSubcategory(subcategoryId)

    if (linked.length > 0) {
      const msg =
        `Impossible de supprimer cette sous-catégorie : ${linked.length} transaction(s) y sont rattachée(s).\n\n` +
        linked
          .slice(0, 10)
          .map(
            (t) =>
              `- ${t.tx_date} | ${t.description ?? 'Sans libellé'} | ${centsToEuros(t.amount_cents)} €`
          )
          .join('\n') +
        `\n\nVa les modifier dans Transactions > Modifier.`
      alert(msg)
      return
    }

    const ok = confirm('Supprimer cette sous-catégorie ?')
    if (!ok) return

    const { error } = await supabase.from('subcategories').delete().eq('id', subcategoryId)
    if (error) {
      console.error(error)
      alert('Erreur suppression sous-catégorie')
      return
    }

    await load()
  }

  async function saveCategoryMapping(categoryId: string) {
    const mapping = categoryMappings[categoryId]
    if (!mapping) return

    const { error } = await supabase.from('category_mapping').upsert({
      category_id: categoryId,
      poste_cr: mapping.poste_cr,
      poste_bilan: mapping.poste_bilan,
    })

    if (error) {
      console.error(error)
      alert('Erreur sauvegarde mapping catégorie')
      return
    }

    await recalcCategoryMapping(categoryId, mapping.poste_cr, mapping.poste_bilan)
    alert('✅ Mapping catégorie sauvegardé')
    await load()
  }

  async function saveSubcategoryMapping(subcategoryId: string) {
    const mapping = subcategoryMappings[subcategoryId]
    if (!mapping) return

    const { error } = await supabase.from('subcategory_mapping').upsert({
      subcategory_id: subcategoryId,
      poste_cr: mapping.poste_cr,
      poste_bilan: mapping.poste_bilan,
    })

    if (error) {
      console.error(error)
      alert('Erreur sauvegarde mapping sous-catégorie')
      return
    }

    await recalcSubcategoryMapping(subcategoryId, mapping.poste_cr, mapping.poste_bilan)
    alert('✅ Mapping sous-catégorie sauvegardé')
    await load()
  }

  async function duplicateBudget() {
    if (!duplicateSourceBudgetId || !duplicateTargetName.trim()) return

    const sourceBudget = budgets.find((b) => b.id === duplicateSourceBudgetId)
    if (!sourceBudget) return

    setSaving(true)

    try {
      const nextBudgetOrdre = budgets.length ? Math.max(...budgets.map((b) => b.ordre ?? 999)) + 1 : 1

      const { data: newBudget, error: budgetErr } = await supabase
        .from('budgets')
        .insert({
          name: duplicateTargetName.trim(),
          is_archived: false,
          is_closed: false,
          ordre: nextBudgetOrdre,
        })
        .select('id')
        .single()

      if (budgetErr || !newBudget) throw budgetErr ?? new Error('Erreur création budget')

      const sourceCategories = categories
        .filter((c) => c.budget_id === duplicateSourceBudgetId)
        .sort((a, b) => a.ordre - b.ordre)

      const sourceSubcategories = subcategories
      const sourceCategoryMapByOldId = new Map<string, string>()

      for (const cat of sourceCategories) {
        const { data: newCat, error: catErr } = await supabase
          .from('categories')
          .insert({
            budget_id: newBudget.id,
            kind: cat.kind,
            name: cat.name,
            ordre: cat.ordre,
          })
          .select('id')
          .single()

        if (catErr || !newCat) throw catErr ?? new Error('Erreur duplication catégorie')
        sourceCategoryMapByOldId.set(cat.id, newCat.id)

        const cm = categoryMappings[cat.id]
        if (cm) {
          const { error: mapErr } = await supabase.from('category_mapping').upsert({
            category_id: newCat.id,
            poste_cr: cm.poste_cr,
            poste_bilan: cm.poste_bilan,
          })
          if (mapErr) throw mapErr
        }
      }

      for (const sub of sourceSubcategories.filter((s) => sourceCategoryMapByOldId.has(s.category_id))) {
        const newCategoryId = sourceCategoryMapByOldId.get(sub.category_id)!
        const { data: newSub, error: subErr } = await supabase
          .from('subcategories')
          .insert({
            category_id: newCategoryId,
            name: sub.name,
            ordre: sub.ordre,
          })
          .select('id')
          .single()

        if (subErr || !newSub) throw subErr ?? new Error('Erreur duplication sous-catégorie')

        const sm = subcategoryMappings[sub.id]
        if (sm) {
          const { error: mapErr } = await supabase.from('subcategory_mapping').upsert({
            subcategory_id: newSub.id,
            poste_cr: sm.poste_cr,
            poste_bilan: sm.poste_bilan,
          })
          if (mapErr) throw mapErr
        }
      }

      alert('✅ Budget dupliqué')
      setDuplicateSourceBudgetId('')
      setDuplicateTargetName('')
      await load()
    } catch (e: any) {
      console.error(e)
      alert('Erreur duplication budget')
    } finally {
      setSaving(false)
    }
  }

  function budgetName(budgetId: string) {
    return budgets.find((b) => b.id === budgetId)?.name ?? '—'
  }

  function categoryById(categoryId: string) {
    return categories.find((x) => x.id === categoryId)
  }

  function categoryLabel(categoryId: string) {
    const c = categoryById(categoryId)
    if (!c) return '—'
    return `${budgetName(c.budget_id)} • ${c.kind === 'income' ? 'Recette' : 'Dépense'} • ${c.name}`
  }

  const visibleCategories = useMemo(() => {
    return categoriesSorted.filter((c) => {
      if (!categoryFilterBudgetId) return true
      return c.budget_id === categoryFilterBudgetId && c.kind === categoryFilterKind
    })
  }, [categoriesSorted, categoryFilterBudgetId, categoryFilterKind])

  const visibleSubcategories = useMemo(() => {
    return subcategoriesSorted.filter((s) => {
      const cat = categoryById(s.category_id)
      if (!cat) return false
      if (!subcategoryFilterBudgetId) return true
      return cat.budget_id === subcategoryFilterBudgetId && cat.kind === subcategoryFilterKind
    })
  }, [subcategoriesSorted, subcategoryFilterBudgetId, subcategoryFilterKind, categories])

  const visibleCategoryMappings = useMemo(() => {
    const filtered = categoriesSorted.filter((c) => {
      if (!mappingCategoryFilterBudgetId) return true
      return c.budget_id === mappingCategoryFilterBudgetId && c.kind === mappingCategoryFilterKind
    })

    const unmapped = filtered.filter((c) => {
      const m = categoryMappings[c.id]
      return !hasFullMapping(m?.poste_cr, m?.poste_bilan)
    })

    const mapped = filtered.filter((c) => {
      const m = categoryMappings[c.id]
      return hasFullMapping(m?.poste_cr, m?.poste_bilan)
    })

    return showMappedCategories ? [...unmapped, ...mapped] : unmapped
  }, [
    categoriesSorted,
    mappingCategoryFilterBudgetId,
    mappingCategoryFilterKind,
    categoryMappings,
    showMappedCategories,
  ])

  const visibleSubcategoryMappings = useMemo(() => {
    const filtered = subcategoriesSorted.filter((s) => {
      const cat = categoryById(s.category_id)
      if (!cat) return false
      if (!mappingSubcategoryFilterBudgetId) return true
      return cat.budget_id === mappingSubcategoryFilterBudgetId && cat.kind === mappingSubcategoryFilterKind
    })

    const unmapped = filtered.filter((s) => {
      const m = subcategoryMappings[s.id]
      return !hasFullMapping(m?.poste_cr, m?.poste_bilan)
    })

    const mapped = filtered.filter((s) => {
      const m = subcategoryMappings[s.id]
      return hasFullMapping(m?.poste_cr, m?.poste_bilan)
    })

    return showMappedSubcategories ? [...unmapped, ...mapped] : unmapped
  }, [
    subcategoriesSorted,
    mappingSubcategoryFilterBudgetId,
    mappingSubcategoryFilterKind,
    subcategoryMappings,
    showMappedSubcategories,
    categories,
  ])

  if (loading) {
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Chargement…</main>
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1300 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900 }}>Admin — Référentiel</h1>

      <section style={{ marginTop: 24, border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Budgets</h2>

        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <input
            placeholder="Nom du nouveau budget"
            value={newBudgetName}
            onChange={(e) => setNewBudgetName(e.target.value)}
            style={{ padding: 8, minWidth: 260 }}
          />
          <button onClick={createBudget} disabled={saving}>Créer le budget</button>
        </div>

        <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
          {budgetsSorted.map((b) => (
            <div key={b.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 120px 120px auto auto', gap: 10, alignItems: 'center' }}>
                <input
                  value={b.name}
                  onChange={(e) => {
                    setBudgets((prev) => prev.map((x) => (x.id === b.id ? { ...x, name: e.target.value } : x)))
                  }}
                  style={{ padding: 8 }}
                />

                <input
                  type="number"
                  value={b.ordre}
                  onChange={(e) => {
                    const ordre = Number(e.target.value || 999)
                    setBudgets((prev) => prev.map((x) => (x.id === b.id ? { ...x, ordre } : x)))
                  }}
                  style={{ padding: 8 }}
                />

                <button onClick={() => updateBudget(b.id, { name: b.name, ordre: b.ordre })}>
                  Sauver
                </button>

                <button onClick={() => updateBudget(b.id, { is_archived: !(b.is_archived ?? false) })}>
                  {b.is_archived ? 'Réouvrir' : 'Archiver'}
                </button>

                <span>{b.is_archived ? 'Archivé' : 'Actif'}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24, borderTop: '1px solid #eee', paddingTop: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800 }}>Dupliquer un budget</h3>
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <select
              value={duplicateSourceBudgetId}
              onChange={(e) => setDuplicateSourceBudgetId(e.target.value)}
              style={{ padding: 8, minWidth: 220 }}
            >
              <option value="">Budget source</option>
              {budgetsSorted.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            <input
              placeholder="Nom du nouveau budget"
              value={duplicateTargetName}
              onChange={(e) => setDuplicateTargetName(e.target.value)}
              style={{ padding: 8, minWidth: 260 }}
            />

            <button onClick={duplicateBudget} disabled={saving}>Dupliquer</button>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 24, border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Catégories</h2>

        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <select
            value={newCategoryBudgetId}
            onChange={(e) => setNewCategoryBudgetId(e.target.value)}
            style={{ padding: 8, minWidth: 220 }}
          >
            <option value="">Budget</option>
            {budgetsSorted.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <select
            value={newCategoryKind}
            onChange={(e) => setNewCategoryKind(e.target.value as 'income' | 'expense')}
            style={{ padding: 8 }}
          >
            <option value="expense">Dépense</option>
            <option value="income">Recette</option>
          </select>

          <input
            placeholder="Nom de la catégorie"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            style={{ padding: 8, minWidth: 260 }}
          />

          <button onClick={createCategory} disabled={saving}>Créer la catégorie</button>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <select
            value={categoryFilterBudgetId}
            onChange={(e) => setCategoryFilterBudgetId(e.target.value)}
            style={{ padding: 8, minWidth: 220 }}
          >
            <option value="">Tous les budgets</option>
            {budgetsSorted.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <select
            value={categoryFilterKind}
            onChange={(e) => setCategoryFilterKind(e.target.value as 'income' | 'expense')}
            style={{ padding: 8 }}
          >
            <option value="expense">Dépenses</option>
            <option value="income">Recettes</option>
          </select>
        </div>

        <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
          {visibleCategories.map((c) => (
            <div key={c.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '220px 140px 1fr 100px auto auto', gap: 10, alignItems: 'center' }}>
                <div>{budgetName(c.budget_id)}</div>

                <select
                  value={c.kind}
                  onChange={(e) => {
                    const kind = e.target.value as 'income' | 'expense'
                    setCategories((prev) => prev.map((x) => (x.id === c.id ? { ...x, kind } : x)))
                  }}
                  style={{ padding: 8 }}
                >
                  <option value="expense">Dépense</option>
                  <option value="income">Recette</option>
                </select>

                <input
                  value={c.name}
                  onChange={(e) => {
                    setCategories((prev) => prev.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))
                  }}
                  style={{ padding: 8 }}
                />

                <input
                  type="number"
                  value={c.ordre}
                  onChange={(e) => {
                    const ordre = Number(e.target.value || 999)
                    setCategories((prev) => prev.map((x) => (x.id === c.id ? { ...x, ordre } : x)))
                  }}
                  style={{ padding: 8 }}
                />

                <button onClick={() => updateCategory(c.id, { name: c.name, kind: c.kind, ordre: c.ordre })}>
                  Sauver
                </button>

                <button onClick={() => deleteCategory(c.id)}>
                  Supprimer
                </button>
              </div>
            </div>
          ))}

          {visibleCategories.length === 0 && (
            <div style={{ opacity: 0.7 }}>Aucune catégorie pour ce filtre.</div>
          )}
        </div>
      </section>

      <section style={{ marginTop: 24, border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Sous-catégories</h2>

        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <select
            value={newSubcategoryCategoryId}
            onChange={(e) => setNewSubcategoryCategoryId(e.target.value)}
            style={{ padding: 8, minWidth: 320 }}
          >
            <option value="">Catégorie</option>
            {categoriesSorted.map((c) => (
              <option key={c.id} value={c.id}>
                {budgetName(c.budget_id)} • {c.kind === 'income' ? 'Recette' : 'Dépense'} • {c.name}
              </option>
            ))}
          </select>

          <input
            placeholder="Nom de la sous-catégorie"
            value={newSubcategoryName}
            onChange={(e) => setNewSubcategoryName(e.target.value)}
            style={{ padding: 8, minWidth: 260 }}
          />

          <button onClick={createSubcategory} disabled={saving}>Créer la sous-catégorie</button>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <select
            value={subcategoryFilterBudgetId}
            onChange={(e) => setSubcategoryFilterBudgetId(e.target.value)}
            style={{ padding: 8, minWidth: 220 }}
          >
            <option value="">Tous les budgets</option>
            {budgetsSorted.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <select
            value={subcategoryFilterKind}
            onChange={(e) => setSubcategoryFilterKind(e.target.value as 'income' | 'expense')}
            style={{ padding: 8 }}
          >
            <option value="expense">Dépenses</option>
            <option value="income">Recettes</option>
          </select>
        </div>

        <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
          {visibleSubcategories.map((s) => (
            <div key={s.id} style={{ border: '1px solid #eee', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr 100px auto auto', gap: 10, alignItems: 'center' }}>
                <div>{categoryLabel(s.category_id)}</div>

                <input
                  value={s.name}
                  onChange={(e) => {
                    setSubcategories((prev) => prev.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))
                  }}
                  style={{ padding: 8 }}
                />

                <input
                  type="number"
                  value={s.ordre}
                  onChange={(e) => {
                    const ordre = Number(e.target.value || 999)
                    setSubcategories((prev) => prev.map((x) => (x.id === s.id ? { ...x, ordre } : x)))
                  }}
                  style={{ padding: 8 }}
                />

                <button onClick={() => updateSubcategory(s.id, { name: s.name, ordre: s.ordre })}>
                  Sauver
                </button>

                <button onClick={() => deleteSubcategory(s.id)}>
                  Supprimer
                </button>
              </div>
            </div>
          ))}

          {visibleSubcategories.length === 0 && (
            <div style={{ opacity: 0.7 }}>Aucune sous-catégorie pour ce filtre.</div>
          )}
        </div>
      </section>

      <section style={{ marginTop: 24, border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Mapping CR / Bilan — Catégories</h2>

        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <select
            value={mappingCategoryFilterBudgetId}
            onChange={(e) => setMappingCategoryFilterBudgetId(e.target.value)}
            style={{ padding: 8, minWidth: 220 }}
          >
            <option value="">Tous les budgets</option>
            {budgetsSorted.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <select
            value={mappingCategoryFilterKind}
            onChange={(e) => setMappingCategoryFilterKind(e.target.value as 'income' | 'expense')}
            style={{ padding: 8 }}
          >
            <option value="expense">Dépenses</option>
            <option value="income">Recettes</option>
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={showMappedCategories}
              onChange={(e) => setShowMappedCategories(e.target.checked)}
            />
            Voir aussi les catégories déjà mappées
          </label>
        </div>

        <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
          {visibleCategoryMappings.map((c) => {
            const mapping = categoryMappings[c.id] ?? {
              category_id: c.id,
              poste_cr: '',
              poste_bilan: '',
            }

            const unmapped = !hasFullMapping(mapping.poste_cr, mapping.poste_bilan)

            return (
              <div
                key={c.id}
                style={{
                  border: '1px solid #eee',
                  borderRadius: 10,
                  padding: 12,
                  background: unmapped ? '#fffaf0' : 'white',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr 1fr auto', gap: 10, alignItems: 'center' }}>
                  <div>{budgetName(c.budget_id)} • {c.kind === 'income' ? 'Recette' : 'Dépense'} • {c.name}</div>

                  <select
                    value={mapping.poste_cr ?? ''}
                    onChange={(e) =>
                      setCategoryMappings({
                        ...categoryMappings,
                        [c.id]: { ...mapping, poste_cr: e.target.value },
                      })
                    }
                    style={{ padding: 8 }}
                  >
                    <option value="">—</option>
                    {crPostes.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>

                  <select
                    value={mapping.poste_bilan ?? ''}
                    onChange={(e) =>
                      setCategoryMappings({
                        ...categoryMappings,
                        [c.id]: { ...mapping, poste_bilan: e.target.value },
                      })
                    }
                    style={{ padding: 8 }}
                  >
                    <option value="">—</option>
                    {bilanPostes.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>

                  <button onClick={() => saveCategoryMapping(c.id)}>Sauvegarder</button>
                </div>
              </div>
            )
          })}

          {visibleCategoryMappings.length === 0 && (
            <div style={{ opacity: 0.7 }}>Aucune catégorie à afficher pour ce filtre.</div>
          )}
        </div>
      </section>

      <section style={{ marginTop: 24, border: '1px solid #ddd', borderRadius: 12, padding: 16, marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Mapping CR / Bilan — Sous-catégories</h2>

        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <select
            value={mappingSubcategoryFilterBudgetId}
            onChange={(e) => setMappingSubcategoryFilterBudgetId(e.target.value)}
            style={{ padding: 8, minWidth: 220 }}
          >
            <option value="">Tous les budgets</option>
            {budgetsSorted.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <select
            value={mappingSubcategoryFilterKind}
            onChange={(e) => setMappingSubcategoryFilterKind(e.target.value as 'income' | 'expense')}
            style={{ padding: 8 }}
          >
            <option value="expense">Dépenses</option>
            <option value="income">Recettes</option>
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={showMappedSubcategories}
              onChange={(e) => setShowMappedSubcategories(e.target.checked)}
            />
            Voir aussi les sous-catégories déjà mappées
          </label>
        </div>

        <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
          {visibleSubcategoryMappings.map((s) => {
            const mapping = subcategoryMappings[s.id] ?? {
              subcategory_id: s.id,
              poste_cr: '',
              poste_bilan: '',
            }

            const unmapped = !hasFullMapping(mapping.poste_cr, mapping.poste_bilan)

            return (
              <div
                key={s.id}
                style={{
                  border: '1px solid #eee',
                  borderRadius: 10,
                  padding: 12,
                  background: unmapped ? '#fffaf0' : 'white',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr 1fr auto', gap: 10, alignItems: 'center' }}>
                  <div>{categoryLabel(s.category_id)} • {s.name}</div>

                  <select
                    value={mapping.poste_cr ?? ''}
                    onChange={(e) =>
                      setSubcategoryMappings({
                        ...subcategoryMappings,
                        [s.id]: { ...mapping, poste_cr: e.target.value },
                      })
                    }
                    style={{ padding: 8 }}
                  >
                    <option value="">—</option>
                    {crPostes.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>

                  <select
                    value={mapping.poste_bilan ?? ''}
                    onChange={(e) =>
                      setSubcategoryMappings({
                        ...subcategoryMappings,
                        [s.id]: { ...mapping, poste_bilan: e.target.value },
                      })
                    }
                    style={{ padding: 8 }}
                  >
                    <option value="">—</option>
                    {bilanPostes.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>

                  <button onClick={() => saveSubcategoryMapping(s.id)}>Sauvegarder</button>
                </div>
              </div>
            )
          })}

          {visibleSubcategoryMappings.length === 0 && (
            <div style={{ opacity: 0.7 }}>Aucune sous-catégorie à afficher pour ce filtre.</div>
          )}
        </div>
      </section>
    </main>
  )
}
