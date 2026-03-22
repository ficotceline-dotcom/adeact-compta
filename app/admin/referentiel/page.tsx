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
  budget_id: string | null
}

type Subcategory = {
  id: string
  name: string
  category_id: string | null
}

type CategoryBlock = {
  category: Category
  subcategories: Subcategory[]
}

export default function AdminReferentielPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [errorDetails, setErrorDetails] = useState('')

  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])

  const [selectedBudgetId, setSelectedBudgetId] = useState('')

  const [newCategoryName, setNewCategoryName] = useState('')
  const [newSubcategoryNames, setNewSubcategoryNames] = useState<Record<string, string>>({})

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingCategoryValue, setEditingCategoryValue] = useState('')

  const [editingSubcategoryId, setEditingSubcategoryId] = useState<string | null>(null)
  const [editingSubcategoryValue, setEditingSubcategoryValue] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setMessage('')
    setErrorDetails('')

    const [budgetsRes, categoriesRes, subcategoriesRes] = await Promise.all([
      supabase
        .from('budgets')
        .select('id,name,ordre,is_archived')
        .order('ordre'),

      supabase
        .from('categories')
        .select('id,name,budget_id')
        .order('name'),

      supabase
        .from('subcategories')
        .select('id,name,category_id')
        .order('name'),
    ])

    const firstError = budgetsRes.error || categoriesRes.error || subcategoriesRes.error

    if (firstError) {
      console.error({
        budgets: budgetsRes.error,
        categories: categoriesRes.error,
        subcategories: subcategoriesRes.error,
      })
      setErrorDetails(firstError.message)
      alert('Erreur chargement admin référentiel')
      setLoading(false)
      return
    }

    const loadedBudgets = ((budgetsRes.data ?? []) as Budget[]).filter((b) => !b.is_archived)

    setBudgets(loadedBudgets)
    setCategories((categoriesRes.data ?? []) as Category[])
    setSubcategories((subcategoriesRes.data ?? []) as Subcategory[])

    if (loadedBudgets.length > 0) {
      setSelectedBudgetId((prev) => prev || loadedBudgets[0].id)
    }

    setLoading(false)
  }

  const visibleCategories = useMemo(() => {
    return categories.filter((c) => c.budget_id === selectedBudgetId)
  }, [categories, selectedBudgetId])

  const blocks = useMemo<CategoryBlock[]>(() => {
    return visibleCategories
      .map((category) => ({
        category,
        subcategories: subcategories
          .filter((s) => s.category_id === category.id)
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.category.name.localeCompare(b.category.name))
  }, [visibleCategories, subcategories])

  async function createCategory() {
    const name = newCategoryName.trim()
    if (!selectedBudgetId) {
      alert('Choisis un budget')
      return
    }
    if (!name) {
      alert('Renseigne un nom de catégorie')
      return
    }

    setSaving(true)
    setMessage('')
    setErrorDetails('')

    try {
      const { error } = await supabase.from('categories').insert({
        name,
        budget_id: selectedBudgetId,
      })

      if (error) throw error

      setNewCategoryName('')
      setMessage('✅ Catégorie ajoutée')
      await load()
    } catch (e: any) {
      console.error(e)
      setErrorDetails(e?.message ?? 'Erreur inconnue')
      alert(`Erreur ajout catégorie : ${e?.message ?? 'inconnue'}`)
    } finally {
      setSaving(false)
    }
  }

  async function createSubcategory(categoryId: string) {
    const raw = newSubcategoryNames[categoryId] ?? ''
    const name = raw.trim()

    if (!name) {
      alert('Renseigne un nom de sous-catégorie')
      return
    }

    setSaving(true)
    setMessage('')
    setErrorDetails('')

    try {
      const { error } = await supabase.from('subcategories').insert({
        name,
        category_id: categoryId,
      })

      if (error) throw error

      setNewSubcategoryNames((prev) => ({
        ...prev,
        [categoryId]: '',
      }))
      setMessage('✅ Sous-catégorie ajoutée')
      await load()
    } catch (e: any) {
      console.error(e)
      setErrorDetails(e?.message ?? 'Erreur inconnue')
      alert(`Erreur ajout sous-catégorie : ${e?.message ?? 'inconnue'}`)
    } finally {
      setSaving(false)
    }
  }

  function startEditCategory(category: Category) {
    setEditingCategoryId(category.id)
    setEditingCategoryValue(category.name)
  }

  async function saveCategoryEdit() {
    if (!editingCategoryId) return

    const name = editingCategoryValue.trim()
    if (!name) {
      alert('Le nom ne peut pas être vide')
      return
    }

    setSaving(true)
    setMessage('')
    setErrorDetails('')

    try {
      const { error } = await supabase
        .from('categories')
        .update({ name })
        .eq('id', editingCategoryId)

      if (error) throw error

      setEditingCategoryId(null)
      setEditingCategoryValue('')
      setMessage('✅ Catégorie modifiée')
      await load()
    } catch (e: any) {
      console.error(e)
      setErrorDetails(e?.message ?? 'Erreur inconnue')
      alert(`Erreur modification catégorie : ${e?.message ?? 'inconnue'}`)
    } finally {
      setSaving(false)
    }
  }

  function startEditSubcategory(subcategory: Subcategory) {
    setEditingSubcategoryId(subcategory.id)
    setEditingSubcategoryValue(subcategory.name)
  }

  async function saveSubcategoryEdit() {
    if (!editingSubcategoryId) return

    const name = editingSubcategoryValue.trim()
    if (!name) {
      alert('Le nom ne peut pas être vide')
      return
    }

    setSaving(true)
    setMessage('')
    setErrorDetails('')

    try {
      const { error } = await supabase
        .from('subcategories')
        .update({ name })
        .eq('id', editingSubcategoryId)

      if (error) throw error

      setEditingSubcategoryId(null)
      setEditingSubcategoryValue('')
      setMessage('✅ Sous-catégorie modifiée')
      await load()
    } catch (e: any) {
      console.error(e)
      setErrorDetails(e?.message ?? 'Erreur inconnue')
      alert(`Erreur modification sous-catégorie : ${e?.message ?? 'inconnue'}`)
    } finally {
      setSaving(false)
    }
  }

  async function deleteCategory(categoryId: string) {
    const ok = window.confirm(
      "Supprimer cette catégorie ? La suppression est bloquée si elle a des transactions, du prévisionnel ou des sous-catégories."
    )
    if (!ok) return

    setSaving(true)
    setMessage('')
    setErrorDetails('')

    try {
      const [{ count: txCount }, { count: forecastCount }, { count: subCount }] = await Promise.all([
        supabase
          .from('transaction_allocations')
          .select('*', { count: 'exact', head: true })
          .eq('category_id', categoryId),

        supabase
          .from('budget_forecasts')
          .select('*', { count: 'exact', head: true })
          .eq('category_id', categoryId),

        supabase
          .from('subcategories')
          .select('*', { count: 'exact', head: true })
          .eq('category_id', categoryId),
      ])

      if ((txCount ?? 0) > 0 || (forecastCount ?? 0) > 0 || (subCount ?? 0) > 0) {
        alert("Impossible de supprimer cette catégorie car elle est déjà utilisée.")
        return
      }

      const { error } = await supabase.from('categories').delete().eq('id', categoryId)
      if (error) throw error

      setMessage('✅ Catégorie supprimée')
      await load()
    } catch (e: any) {
      console.error(e)
      setErrorDetails(e?.message ?? 'Erreur inconnue')
      alert(`Erreur suppression catégorie : ${e?.message ?? 'inconnue'}`)
    } finally {
      setSaving(false)
    }
  }

  async function deleteSubcategory(subcategoryId: string) {
    const ok = window.confirm(
      "Supprimer cette sous-catégorie ? La suppression est bloquée si elle a des transactions ou du prévisionnel."
    )
    if (!ok) return

    setSaving(true)
    setMessage('')
    setErrorDetails('')

    try {
      const [{ count: txCount }, { count: forecastCount }] = await Promise.all([
        supabase
          .from('transaction_allocations')
          .select('*', { count: 'exact', head: true })
          .eq('subcategory_id', subcategoryId),

        supabase
          .from('budget_forecasts')
          .select('*', { count: 'exact', head: true })
          .eq('subcategory_id', subcategoryId),
      ])

      if ((txCount ?? 0) > 0 || (forecastCount ?? 0) > 0) {
        alert("Impossible de supprimer cette sous-catégorie car elle est déjà utilisée.")
        return
      }

      const { error } = await supabase.from('subcategories').delete().eq('id', subcategoryId)
      if (error) throw error

      setMessage('✅ Sous-catégorie supprimée')
      await load()
    } catch (e: any) {
      console.error(e)
      setErrorDetails(e?.message ?? 'Erreur inconnue')
      alert(`Erreur suppression sous-catégorie : ${e?.message ?? 'inconnue'}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Chargement…</main>
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1200 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900 }}>Admin référentiel</h1>

      {errorDetails && (
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
          <b>Détail erreur :</b> {errorDetails}
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

        {message && <div style={{ fontWeight: 700 }}>{message}</div>}
      </div>

      <section
        style={{
          marginTop: 22,
          border: '1px solid #ddd',
          borderRadius: 14,
          padding: 16,
          background: 'white',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Ajouter une catégorie</h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="Nom de la catégorie"
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #ccc',
            }}
          />

          <button
            onClick={createCategory}
            disabled={saving || !selectedBudgetId}
            style={buttonStyle}
          >
            Ajouter
          </button>
        </div>
      </section>

      <div style={{ marginTop: 22, display: 'grid', gap: 16 }}>
        {blocks.length === 0 ? (
          <div style={{ opacity: 0.7 }}>Aucune catégorie pour ce budget.</div>
        ) : (
          blocks.map((block) => (
            <section
              key={block.category.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: 14,
                padding: 16,
                background: 'white',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                {editingCategoryId === block.category.id ? (
                  <>
                    <input
                      type="text"
                      value={editingCategoryValue}
                      onChange={(e) => setEditingCategoryValue(e.target.value)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid #ccc',
                      }}
                    />
                    <button onClick={saveCategoryEdit} disabled={saving} style={buttonStyle}>
                      Enregistrer
                    </button>
                    <button
                      onClick={() => {
                        setEditingCategoryId(null)
                        setEditingCategoryValue('')
                      }}
                      disabled={saving}
                      style={secondaryButtonStyle}
                    >
                      Annuler
                    </button>
                  </>
                ) : (
                  <>
                    <h2 style={{ margin: 0, fontSize: 20 }}>{block.category.name}</h2>
                    <button
                      onClick={() => startEditCategory(block.category)}
                      disabled={saving}
                      style={secondaryButtonStyle}
                    >
                      Renommer
                    </button>
                    <button
                      onClick={() => deleteCategory(block.category.id)}
                      disabled={saving}
                      style={dangerButtonStyle}
                    >
                      Supprimer
                    </button>
                  </>
                )}
              </div>

              <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                {block.subcategories.length === 0 ? (
                  <div style={{ opacity: 0.6 }}>Aucune sous-catégorie.</div>
                ) : (
                  block.subcategories.map((sub) => (
                    <div
                      key={sub.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto auto',
                        gap: 10,
                        alignItems: 'center',
                        paddingLeft: 12,
                      }}
                    >
                      {editingSubcategoryId === sub.id ? (
                        <>
                          <input
                            type="text"
                            value={editingSubcategoryValue}
                            onChange={(e) => setEditingSubcategoryValue(e.target.value)}
                            style={{
                              padding: '10px 12px',
                              borderRadius: 8,
                              border: '1px solid #ccc',
                            }}
                          />
                          <button
                            onClick={saveSubcategoryEdit}
                            disabled={saving}
                            style={buttonStyle}
                          >
                            Enregistrer
                          </button>
                          <button
                            onClick={() => {
                              setEditingSubcategoryId(null)
                              setEditingSubcategoryValue('')
                            }}
                            disabled={saving}
                            style={secondaryButtonStyle}
                          >
                            Annuler
                          </button>
                        </>
                      ) : (
                        <>
                          <div>{sub.name}</div>
                          <button
                            onClick={() => startEditSubcategory(sub)}
                            disabled={saving}
                            style={secondaryButtonStyle}
                          >
                            Renommer
                          </button>
                          <button
                            onClick={() => deleteSubcategory(sub.id)}
                            disabled={saving}
                            style={dangerButtonStyle}
                          >
                            Supprimer
                          </button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div
                style={{
                  marginTop: 16,
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                <input
                  type="text"
                  value={newSubcategoryNames[block.category.id] ?? ''}
                  onChange={(e) =>
                    setNewSubcategoryNames((prev) => ({
                      ...prev,
                      [block.category.id]: e.target.value,
                    }))
                  }
                  placeholder="Nom de la sous-catégorie"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #ccc',
                  }}
                />

                <button
                  onClick={() => createSubcategory(block.category.id)}
                  disabled={saving}
                  style={buttonStyle}
                >
                  Ajouter la sous-catégorie
                </button>
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  )
}

const buttonStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid #ccc',
  background: 'white',
  cursor: 'pointer',
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #ccc',
  background: '#f7f7f7',
  cursor: 'pointer',
}

const dangerButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #d8b0b0',
  background: '#fff3f3',
  cursor: 'pointer',
}
