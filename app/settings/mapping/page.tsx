'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Category = {
  id: string
  name: string
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

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data: c } = await supabase.from('categories').select('id,name')
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
      <h1>Mapping Comptable</h1>

      <table style={{ width: '100%', marginTop: 20 }}>
        <thead>
          <tr>
            <th>Catégorie</th>
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

            return (
              <tr key={s.id}>
                <td>{cat?.name}</td>

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
