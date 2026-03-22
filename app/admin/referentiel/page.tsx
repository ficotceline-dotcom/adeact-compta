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
  budget_id: string
  kind: 'income' | 'expense'
}

type Subcategory = {
  id: string
  name: string
  category_id: string
}

export default function Page() {
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])

  const [selectedBudgetId, setSelectedBudgetId] = useState('')

  const [newBudgetName, setNewBudgetName] = useState('')
  const [newCategory, setNewCategory] = useState({ income: '', expense: '' })
  const [newSub, setNewSub] = useState<Record<string, string>>({})

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [b, c, s] = await Promise.all([
      supabase.from('budgets').select('*').order('ordre'),
      supabase.from('categories').select('*'),
      supabase.from('subcategories').select('*'),
    ])

    setBudgets(b.data || [])
    setCategories(c.data || [])
    setSubcategories(s.data || [])

    if (b.data?.length && !selectedBudgetId) {
      setSelectedBudgetId(b.data[0].id)
    }
  }

  // ========================
  // CREATE BUDGET
  // ========================
  async function createBudget() {
    if (!newBudgetName.trim()) return

    await supabase.from('budgets').insert({
      name: newBudgetName,
      ordre: budgets.length + 1,
    })

    setNewBudgetName('')
    await load()
  }

  // ========================
  // CREATE CATEGORY
  // ========================
  async function createCategory(kind: 'income' | 'expense') {
    const name = newCategory[kind].trim()
    if (!name) return

    await supabase.from('categories').insert({
      name,
      budget_id: selectedBudgetId,
      kind,
    })

    setNewCategory((prev) => ({ ...prev, [kind]: '' }))
    await load()
  }

  // ========================
  // CREATE SUBCATEGORY
  // ========================
  async function createSubcategory(categoryId: string) {
    const name = newSub[categoryId]?.trim()
    if (!name) return

    await supabase.from('subcategories').insert({
      name,
      category_id: categoryId,
    })

    setNewSub((prev) => ({ ...prev, [categoryId]: '' }))
    await load()
  }

  // ========================
  // DELETE CATEGORY SAFE
  // ========================
  async function deleteCategory(id: string) {
    const { count: tx } = await supabase
      .from('transaction_allocations')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id)

    const { count: sub } = await supabase
      .from('subcategories')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', id)

    if ((tx || 0) > 0 || (sub || 0) > 0) {
      alert('Catégorie utilisée → suppression impossible')
      return
    }

    await supabase.from('categories').delete().eq('id', id)
    await load()
  }

  // ========================
  // DATA FILTER
  // ========================
  const filtered = useMemo(() => {
    const cats = categories.filter((c) => c.budget_id === selectedBudgetId)

    return {
      income: cats.filter((c) => c.kind === 'income'),
      expense: cats.filter((c) => c.kind === 'expense'),
    }
  }, [categories, selectedBudgetId])

  function getSubs(categoryId: string) {
    return subcategories.filter((s) => s.category_id === categoryId)
  }

  // ========================
  // UI
  // ========================
  return (
    <main style={{ padding: 24, maxWidth: 1200 }}>
      <h1>Admin référentiel</h1>

      {/* CREATE BUDGET */}
      <div style={{ marginBottom: 20 }}>
        <input
          placeholder="Nouveau budget"
          value={newBudgetName}
          onChange={(e) => setNewBudgetName(e.target.value)}
        />
        <button onClick={createBudget}>Ajouter budget</button>
      </div>

      {/* FILTER */}
      <select
        value={selectedBudgetId}
        onChange={(e) => setSelectedBudgetId(e.target.value)}
      >
        {budgets.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>

      {/* ================== RECETTES ================== */}
      <h2>💰 Recettes</h2>

      <input
        placeholder="Nouvelle catégorie recette"
        value={newCategory.income}
        onChange={(e) =>
          setNewCategory((prev) => ({ ...prev, income: e.target.value }))
        }
      />
      <button onClick={() => createCategory('income')}>Ajouter</button>

      {filtered.income.map((cat) => (
        <div key={cat.id} style={{ border: '1px solid #ccc', margin: 10, padding: 10 }}>
          <b>{cat.name}</b>
          <button onClick={() => deleteCategory(cat.id)}>Supprimer</button>

          {getSubs(cat.id).map((sub) => (
            <div key={sub.id}>- {sub.name}</div>
          ))}

          <input
            placeholder="Sous-catégorie"
            value={newSub[cat.id] || ''}
            onChange={(e) =>
              setNewSub((prev) => ({ ...prev, [cat.id]: e.target.value }))
            }
          />
          <button onClick={() => createSubcategory(cat.id)}>Ajouter</button>
        </div>
      ))}

      {/* ================== DEPENSES ================== */}
      <h2>💸 Dépenses</h2>

      <input
        placeholder="Nouvelle catégorie dépense"
        value={newCategory.expense}
        onChange={(e) =>
          setNewCategory((prev) => ({ ...prev, expense: e.target.value }))
        }
      />
      <button onClick={() => createCategory('expense')}>Ajouter</button>

      {filtered.expense.map((cat) => (
        <div key={cat.id} style={{ border: '1px solid #ccc', margin: 10, padding: 10 }}>
          <b>{cat.name}</b>
          <button onClick={() => deleteCategory(cat.id)}>Supprimer</button>

          {getSubs(cat.id).map((sub) => (
            <div key={sub.id}>- {sub.name}</div>
          ))}

          <input
            placeholder="Sous-catégorie"
            value={newSub[cat.id] || ''}
            onChange={(e) =>
              setNewSub((prev) => ({ ...prev, [cat.id]: e.target.value }))
            }
          />
          <button onClick={() => createSubcategory(cat.id)}>Ajouter</button>
        </div>
      ))}
    </main>
  )
}
