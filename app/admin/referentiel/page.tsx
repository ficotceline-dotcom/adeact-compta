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

  const [newBudgetName, setNewBudgetName] = useState('')
  const [newCategoryNames, setNewCategoryNames] = useState({
    income: '',
    expense: '',
  })
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
        .select('id,name,budget_id,kind')
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

  const incomeBlocks = useMemo<CategoryBlock[]>(() => {
    return visibleCategories
      .filter((c) => c.kind === 'income')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((category) => ({
        category,
        subcategories: subcategories
          .filter((s) => s.category_id === category.id)
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
  }, [visibleCategories, subcategories])

  const expenseBlocks = useMemo<CategoryBlock[]>(() => {
    return visibleCategories
      .filter((c) => c.kind === 'expense')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((category) => ({
        category,
        subcategories: subcategories
          .filter((s) => s.category_id === category.id)
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
  }, [visibleCategories, subcategories])

  async function createBudget() {
    const name = newBudgetName.trim()
    if (!name) {
      alert('Renseigne un nom de budget')
      return
    }

    setSaving(true)
    setMessage('')
    setErrorDetails('')

    try {
      const nextOrdre =
        budgets.length > 0 ? Math.max(...budgets.map((b) => b.ordre ?? 0)) + 1 : 1

      const { error } = await supabase.from('budgets').insert({
        name,
        ordre: nextOrdre,
      })

      if (error) throw error

      setNewBudgetName('')
      setMessage('✅ Budget ajouté')
      await load()
    } catch (e: any) {
      console.error(e)
      setErrorDetails(e?.message ?? 'Erreur inconnue')
      alert(`Erreur ajout budget : ${e?.message ?? 'inconnue'}`)
    } finally {
      setSaving(false)
    }
  }

  async function createCategory(kind: 'income' | 'expense') {
    const name = newCategoryNames[kind].trim()

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
        kind,
      })

      if (error) throw error

      setNewCategoryNames((prev) => ({ ...prev, [kind]: '' }))
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
    const name = (newSubcategoryNames[categoryId] ?? '').trim()

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
    return <main style={pageStyle}>Chargement…</main>
  }

  return (
    <main style={pageStyle}>
      <h1 style={titleStyle}>Admin référentiel</h1>

      {errorDetails && (
        <div style={errorBoxStyle}>
          <b>Détail erreur :</b> {errorDetails}
        </div>
      )}

      <section style={topCardStyle}>
        <div style={topGridStyle}>
          <div>
            <div style={labelStyle}>Ajouter un budget</div>
            <div style={rowStyle}>
              <input
                type="text"
                value={newBudgetName}
                onChange={(e) => setNewBudgetName(e.target.value)}
                placeholder="Nom du nouveau budget"
                style={inputStyle}
              />
              <button onClick={createBudget} disabled={saving} style={primaryButtonStyle}>
                Ajouter le budget
              </button>
            </div>
          </div>

          <div>
            <div style={labelStyle}>Budget affiché</div>
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

        {message && <div style={messageStyle}>{message}</div>}
      </section>

      <div style={columnsStyle}>
        <section style={incomeSectionStyle}>
          <div style={sectionHeaderStyle}>
            <h2 style={sectionTitleStyle}>💰 Recettes</h2>
          </div>

          <div style={addCardStyle}>
            <div style={labelStyle}>Ajouter une catégorie recette</div>
            <div style={rowStyle}>
              <input
                type="text"
                value={newCategoryNames.income}
                onChange={(e) =>
                  setNewCategoryNames((prev) => ({ ...prev, income: e.target.value }))
                }
                placeholder="Nom de la catégorie recette"
                style={inputStyle}
              />
              <button
                onClick={() => createCategory('income')}
                disabled={saving || !selectedBudgetId}
                style={primaryButtonStyle}
              >
                Ajouter
              </button>
            </div>
          </div>

          <div style={listStyle}>
            {incomeBlocks.length === 0 ? (
              <div style={emptyStyle}>Aucune catégorie recette.</div>
            ) : (
              incomeBlocks.map((block) => (
                <div key={block.category.id} style={categoryCardIncomeStyle}>
                  {editingCategoryId === block.category.id ? (
                    <div style={editRowStyle}>
                      <input
                        type="text"
                        value={editingCategoryValue}
                        onChange={(e) => setEditingCategoryValue(e.target.value)}
                        style={inputStyle}
                      />
                      <button onClick={saveCategoryEdit} disabled={saving} style={primaryButtonStyle}>
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
                    </div>
                  ) : (
                    <div style={categoryHeaderStyle}>
                      <div style={categoryTitleStyle}>{block.category.name}</div>
                      <div style={actionsStyle}>
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
                      </div>
                    </div>
                  )}

                  <div style={subListStyle}>
                    {block.subcategories.length === 0 ? (
                      <div style={emptySubStyle}>Aucune sous-catégorie</div>
                    ) : (
                      block.subcategories.map((sub) => (
                        <div key={sub.id} style={subRowStyle}>
                          {editingSubcategoryId === sub.id ? (
                            <>
                              <input
                                type="text"
                                value={editingSubcategoryValue}
                                onChange={(e) => setEditingSubcategoryValue(e.target.value)}
                                style={inputStyle}
                              />
                              <button
                                onClick={saveSubcategoryEdit}
                                disabled={saving}
                                style={primaryButtonStyle}
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
                              <div style={subTextStyle}>{sub.name}</div>
                              <div style={actionsStyle}>
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
                              </div>
                            </>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  <div style={subAddStyle}>
                    <input
                      type="text"
                      value={newSubcategoryNames[block.category.id] ?? ''}
                      onChange={(e) =>
                        setNewSubcategoryNames((prev) => ({
                          ...prev,
                          [block.category.id]: e.target.value,
                        }))
                      }
                      placeholder="Nouvelle sous-catégorie"
                      style={inputStyle}
                    />
                    <button
                      onClick={() => createSubcategory(block.category.id)}
                      disabled={saving}
                      style={primaryButtonStyle}
                    >
                      Ajouter
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section style={expenseSectionStyle}>
          <div style={sectionHeaderStyle}>
            <h2 style={sectionTitleStyle}>💸 Dépenses</h2>
          </div>

          <div style={addCardStyle}>
            <div style={labelStyle}>Ajouter une catégorie dépense</div>
            <div style={rowStyle}>
              <input
                type="text"
                value={newCategoryNames.expense}
                onChange={(e) =>
                  setNewCategoryNames((prev) => ({ ...prev, expense: e.target.value }))
                }
                placeholder="Nom de la catégorie dépense"
                style={inputStyle}
              />
              <button
                onClick={() => createCategory('expense')}
                disabled={saving || !selectedBudgetId}
                style={primaryButtonStyle}
              >
                Ajouter
              </button>
            </div>
          </div>

          <div style={listStyle}>
            {expenseBlocks.length === 0 ? (
              <div style={emptyStyle}>Aucune catégorie dépense.</div>
            ) : (
              expenseBlocks.map((block) => (
                <div key={block.category.id} style={categoryCardExpenseStyle}>
                  {editingCategoryId === block.category.id ? (
                    <div style={editRowStyle}>
                      <input
                        type="text"
                        value={editingCategoryValue}
                        onChange={(e) => setEditingCategoryValue(e.target.value)}
                        style={inputStyle}
                      />
                      <button onClick={saveCategoryEdit} disabled={saving} style={primaryButtonStyle}>
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
                    </div>
                  ) : (
                    <div style={categoryHeaderStyle}>
                      <div style={categoryTitleStyle}>{block.category.name}</div>
                      <div style={actionsStyle}>
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
                      </div>
                    </div>
                  )}

                  <div style={subListStyle}>
                    {block.subcategories.length === 0 ? (
                      <div style={emptySubStyle}>Aucune sous-catégorie</div>
                    ) : (
                      block.subcategories.map((sub) => (
                        <div key={sub.id} style={subRowStyle}>
                          {editingSubcategoryId === sub.id ? (
                            <>
                              <input
                                type="text"
                                value={editingSubcategoryValue}
                                onChange={(e) => setEditingSubcategoryValue(e.target.value)}
                                style={inputStyle}
                              />
                              <button
                                onClick={saveSubcategoryEdit}
                                disabled={saving}
                                style={primaryButtonStyle}
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
                              <div style={subTextStyle}>{sub.name}</div>
                              <div style={actionsStyle}>
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
                              </div>
                            </>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  <div style={subAddStyle}>
                    <input
                      type="text"
                      value={newSubcategoryNames[block.category.id] ?? ''}
                      onChange={(e) =>
                        setNewSubcategoryNames((prev) => ({
                          ...prev,
                          [block.category.id]: e.target.value,
                        }))
                      }
                      placeholder="Nouvelle sous-catégorie"
                      style={inputStyle}
                    />
                    <button
                      onClick={() => createSubcategory(block.category.id)}
                      disabled={saving}
                      style={primaryButtonStyle}
                    >
                      Ajouter
                    </button>
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

const topGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.2fr 0.8fr',
  gap: 18,
  alignItems: 'end',
}

const columnsStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 20,
  alignItems: 'start',
}

const incomeSectionStyle: React.CSSProperties = {
  border: '1px solid #cfe8cf',
  background: '#f7fff7',
  borderRadius: 16,
  padding: 18,
}

const expenseSectionStyle: React.CSSProperties = {
  border: '1px solid #f0cfcf',
  background: '#fff9f9',
  borderRadius: 16,
  padding: 18,
}

const sectionHeaderStyle: React.CSSProperties = {
  marginBottom: 14,
}

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 800,
}

const addCardStyle: React.CSSProperties = {
  border: '1px dashed #d7d7d7',
  borderRadius: 12,
  padding: 14,
  background: 'rgba(255,255,255,0.8)',
  marginBottom: 16,
}

const labelStyle: React.CSSProperties = {
  fontWeight: 700,
  marginBottom: 8,
}

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 12,
  alignItems: 'center',
}

const editRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto auto',
  gap: 10,
  alignItems: 'center',
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #ccc',
  width: '100%',
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

const secondaryButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px solid #ccc',
  background: '#f6f6f6',
  cursor: 'pointer',
}

const dangerButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 10,
  border: '1px solid #e0b4b4',
  background: '#fff3f3',
  cursor: 'pointer',
}

const messageStyle: React.CSSProperties = {
  marginTop: 14,
  fontWeight: 700,
}

const listStyle: React.CSSProperties = {
  display: 'grid',
  gap: 14,
}

const categoryCardIncomeStyle: React.CSSProperties = {
  border: '1px solid #d6ead6',
  background: 'white',
  borderRadius: 14,
  padding: 14,
}

const categoryCardExpenseStyle: React.CSSProperties = {
  border: '1px solid #ead6d6',
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

const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  flexWrap: 'wrap',
}

const subListStyle: React.CSSProperties = {
  marginTop: 12,
  display: 'grid',
  gap: 8,
}

const subRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 10,
  alignItems: 'center',
  paddingLeft: 12,
}

const subTextStyle: React.CSSProperties = {
  opacity: 0.95,
}

const subAddStyle: React.CSSProperties = {
  marginTop: 14,
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 12,
  alignItems: 'center',
}

const emptyStyle: React.CSSProperties = {
  opacity: 0.7,
  padding: 12,
}

const emptySubStyle: React.CSSProperties = {
  opacity: 0.55,
  paddingLeft: 12,
}
