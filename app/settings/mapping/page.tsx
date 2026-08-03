'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Category = {
  id: string
  name: string
  kind: 'income' | 'expense'
}

type Subcategory = {
  id: string
  name: string
  category_id: string
}

type Mapping = {
  id?: string
  poste_cr: string | null
  poste_bilan: string | null
}

export default function MappingPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [mappings, setMappings] = useState<Record<string, Mapping>>({})
  const [crPostes, setCrPostes] = useState<string[]>([])
  const [bilanPostes, setBilanPostes] = useState<string[]>([])
  const [recalculating, setRecalculating] = useState(false)
  const [recalcResult, setRecalcResult] = useState<string | null>(null)

  const searchParams = useSearchParams()
  const highlight = searchParams.get('highlight')
  const highlightRef = useRef<HTMLTableRowElement | null>(null)

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (highlight && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlight, subcategories])

  async function load() {
    const { data: c } = await supabase.from('categories').select('id,name,kind')
    const { data: s } = await supabase.from('subcategories').select('id,name,category_id')
    const { data: m } = await supabase.from('subcategory_mapping').select('*')
    const { data: crp } = await supabase.from('cr_postes').select('label').order('label')
    const { data: bip } = await supabase.from('bilan_postes').select('label').order('label')

    setCategories(c ?? [])
    setSubcategories(s ?? [])
    setCrPostes((crp ?? []).map((x: any) => x.label))
    setBilanPostes((bip ?? []).map((x: any) => x.label))

    const map: Record<string, Mapping> = {}

    for (const row of m ?? []) {
      map[row.subcategory_id] = {
        id: row.id,
        poste_cr: row.poste_cr,
        poste_bilan: row.poste_bilan,
      }
    }

    setMappings(map)
  }

  async function recalculateMappings() {
    setRecalculating(true)
    setRecalcResult(null)

    // Fetch all mappings (subcategory + category fallback)
    const [{ data: subcatMappings }, { data: catMappings }, { data: allocs }] = await Promise.all([
      supabase.from('subcategory_mapping').select('subcategory_id, poste_cr, poste_bilan'),
      supabase.from('category_mapping').select('category_id, poste_cr, poste_bilan'),
      supabase.from('transaction_allocations').select('id, category_id, subcategory_id').range(0, 99999),
    ])

    const subcatMap = new Map((subcatMappings ?? []).map((m: any) => [m.subcategory_id, m]))
    const catMap = new Map((catMappings ?? []).map((m: any) => [m.category_id, m]))

    // Group allocations by their resolved (poste_cr, poste_bilan) to batch updates
    const groups = new Map<string, string[]>()

    for (const alloc of allocs ?? []) {
      let poste_cr: string | null = null
      let poste_bilan: string | null = null

      if (alloc.subcategory_id && subcatMap.has(alloc.subcategory_id)) {
        const m = subcatMap.get(alloc.subcategory_id) as any
        poste_cr = m.poste_cr ?? null
        poste_bilan = m.poste_bilan ?? null
      } else if (alloc.category_id && catMap.has(alloc.category_id)) {
        const m = catMap.get(alloc.category_id) as any
        poste_cr = m.poste_cr ?? null
        poste_bilan = m.poste_bilan ?? null
      }

      const key = `${poste_cr ?? ''}|||${poste_bilan ?? ''}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(alloc.id)
    }

    let updated = 0
    let errors = 0

    for (const [key, ids] of groups.entries()) {
      const [crPart, bilanPart] = key.split('|||')
      const poste_cr = crPart || null
      const poste_bilan = bilanPart || null

      const { error } = await supabase
        .from('transaction_allocations')
        .update({ poste_cr, poste_bilan })
        .in('id', ids)

      if (error) errors += ids.length
      else updated += ids.length
    }

    setRecalculating(false)
    setRecalcResult(`${updated} affectation(s) recalculée(s)${errors > 0 ? `, ${errors} erreur(s)` : ''}.`)
  }

  async function save(subcategoryId: string) {
    const mapping = mappings[subcategoryId]

    if (!mapping) return

    const { error } = await supabase
      .from('subcategory_mapping')
      .upsert({
        subcategory_id: subcategoryId,
        poste_cr: mapping.poste_cr,
        poste_bilan: mapping.poste_bilan,
      })

    if (error) {
      alert('Erreur sauvegarde')
      return
    }

    alert('Mapping sauvegardé')
  }

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0 }}>Mapping Comptable</h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {recalcResult && (
            <span style={{ fontSize: 13, color: '#15803d', fontWeight: 600 }}>✓ {recalcResult}</span>
          )}
          <button
            onClick={recalculateMappings}
            disabled={recalculating}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: '1px solid #c8202e',
              background: recalculating ? '#f5f5f5' : '#c8202e',
              color: recalculating ? '#999' : 'white',
              fontWeight: 700,
              cursor: recalculating ? 'not-allowed' : 'pointer',
              fontSize: 14,
            }}
          >
            {recalculating ? 'Recalcul en cours…' : '🔄 Recalculer tous les mappings'}
          </button>
        </div>
      </div>

      <p style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>
        Le bouton "Recalculer" applique les mappings actuels à toutes les affectations existantes — utile après avoir ajouté ou modifié des mappings.
      </p>

      <table style={{ width: '100%', marginTop: 20 }}>
        <thead>
          <tr>
            <th>Catégorie</th>
            <th>Type</th>
            <th>Sous-catégorie</th>
            <th>Poste CR</th>
            <th>Poste Bilan</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          {subcategories.map((s) => {
            const cat = categories.find((c) => c.id === s.category_id)
            const mapping = mappings[s.id] ?? { poste_cr: '', poste_bilan: '' }

            const isHighlighted = s.id === highlight

            return (
              <tr
                key={s.id}
                ref={isHighlighted ? highlightRef : null}
                style={isHighlighted ? {
                  background: '#fef9c3',
                  outline: '2px solid #ca8a04',
                  outlineOffset: -2,
                } : undefined}
              >
                <td>{cat?.name}</td>

                <td>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    background: cat?.kind === 'income' ? '#dcfce7' : '#fee2e2',
                    color: cat?.kind === 'income' ? '#15803d' : '#b91c1c',
                  }}>
                    {cat?.kind === 'income' ? 'Recette' : 'Charge'}
                  </span>
                </td>

                <td>{s.name}</td>

                <td>
<select
  value={mapping.poste_cr ?? ''}
  onChange={(e) =>
    setMappings({
      ...mappings,
      [s.id]: { ...mapping, poste_cr: e.target.value },
    })
  }
>
  <option value="">—</option>
  {crPostes.map((p) => (
    <option key={p} value={p}>
      {p}
    </option>
  ))}
</select>                </td>

                <td>
<select
  value={mapping.poste_bilan ?? ''}
  onChange={(e) =>
    setMappings({
      ...mappings,
      [s.id]: { ...mapping, poste_bilan: e.target.value },
    })
  }
>
  <option value="">—</option>
  {bilanPostes.map((p) => (
    <option key={p} value={p}>
      {p}
    </option>
  ))}
</select>
                </td>

                <td>
                  <button onClick={() => save(s.id)}>Sauvegarder</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </main>
  )
}
