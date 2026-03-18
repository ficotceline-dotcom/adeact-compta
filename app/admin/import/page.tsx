'use client'

import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'

type Budget = {
  id: string
  name: string
  is_archived: boolean | null
  ordre: number
}

type Category = {
  id: string
  budget_id: string
  kind: 'income' | 'expense'
  name: string
}

type Subcategory = {
  id: string
  category_id: string
  name: string
}

function norm(v: any) {
  return String(v ?? '').trim().toLowerCase()
}

function pick(row: any, keys: string[]) {
  for (const k of keys) {
    if (row[k] !== undefined) return row[k]
  }

  const rowKeys = Object.keys(row)
  const wanted = keys.map((k) => norm(k))

  for (const rk of rowKeys) {
    if (wanted.includes(norm(rk))) return row[rk]
  }

  return undefined
}

function toIsoDate(v: any): string | null {
  if (v === null || v === undefined || v === '') return null

  if (v instanceof Date && !isNaN(v.getTime())) {
    const yyyy = v.getFullYear()
    const mm = String(v.getMonth() + 1).padStart(2, '0')
    const dd = String(v.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    if (!d || !d.y || !d.m || !d.d) return null
    return `${String(d.y).padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }

  const s = String(v).trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  const fr = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (fr) {
    const dd = String(fr[1]).padStart(2, '0')
    const mm = String(fr[2]).padStart(2, '0')
    const yyyy = fr[3]
    return `${yyyy}-${mm}-${dd}`
  }

  return null
}

function parseKind(v: any): 'income' | 'expense' | null {
  const x = norm(v)
  if (x.includes('recette') || x === 'income') return 'income'
  if (x.includes('dépense') || x.includes('depense') || x === 'expense') return 'expense'
  return null
}

function eurosToCents(v: any): number | null {
  if (v === null || v === undefined || v === '') return null

  if (typeof v === 'number' && Number.isFinite(v)) {
    return Math.round(v * 100)
  }

  let s = String(v).trim()
  s = s.replace(/\u00A0/g, '').replace(/\s/g, '')
  s = s.replace(/[^\d,.\-]/g, '')

  if (!s) return null

  const hasComma = s.includes(',')
  const hasDot = s.includes('.')

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',')
    const lastDot = s.lastIndexOf('.')

    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (hasComma) {
    s = s.replace(',', '.')
  }

  const n = Number(s)
  if (!Number.isFinite(n)) return null

  return Math.round(n * 100)
}

function isOui(v: any) {
  const x = norm(v)
  return x === 'oui' || x === 'yes' || x === 'true' || x === '1'
}

async function findPotentialDuplicates(tx_date: string, amount_cents: number) {
  const { data, error } = await supabase
    .from('transactions')
    .select('id,tx_date,description,kind')
    .eq('tx_date', tx_date)
    .eq('amount_cents', amount_cents)
    .limit(10)

  if (error) throw error
  return data ?? []
}

export default function AdminImportPage() {
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)

  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])

  const [selectedBudgetId, setSelectedBudgetId] = useState('')
  const [log, setLog] = useState<string>('')

  useEffect(() => {
    loadRefs()
  }, [])

  async function loadRefs() {
    setLoading(true)

    const [
      { data: b, error: e1 },
      { data: c, error: e2 },
      { data: s, error: e3 },
    ] = await Promise.all([
      supabase.from('budgets').select('id,name,is_archived,ordre').eq('is_archived', false).order('ordre'),
      supabase.from('categories').select('id,budget_id,kind,name'),
      supabase.from('subcategories').select('id,category_id,name'),
    ])

    if (e1 || e2 || e3) {
      console.error(e1 || e2 || e3)
      alert('Erreur chargement référentiels import')
      setLoading(false)
      return
    }

    const budgetsData = (b ?? []) as Budget[]
    setBudgets(budgetsData)
    setCategories((c ?? []) as Category[])
    setSubcategories((s ?? []) as Subcategory[])

    if (budgetsData.length > 0 && !selectedBudgetId) {
      setSelectedBudgetId(budgetsData[0].id)
    }

    setLoading(false)
  }

  const selectedBudget = useMemo(
    () => budgets.find((b) => b.id === selectedBudgetId) ?? null,
    [budgets, selectedBudgetId]
  )

  function findCategory(budgetId: string, kind: 'income' | 'expense', categoryName: string) {
    const wanted = norm(categoryName)
    return categories.find(
      (c) =>
        c.budget_id === budgetId &&
        c.kind === kind &&
        norm(c.name) === wanted
    ) ?? null
  }

  function findSubcategory(categoryId: string, subcategoryName: string) {
    const wanted = norm(subcategoryName)
    return subcategories.find(
      (s) => s.category_id === categoryId && norm(s.name) === wanted
    ) ?? null
  }

  async function getMapping(category_id: string, subcategory_id: string | null) {
    let poste_cr: string | null = null
    let poste_bilan: string | null = null

    if (subcategory_id) {
      const { data } = await supabase
        .from('subcategory_mapping')
        .select('poste_cr, poste_bilan')
        .eq('subcategory_id', subcategory_id)
        .maybeSingle()

      if (data) {
        poste_cr = data.poste_cr
        poste_bilan = data.poste_bilan
      }
    }

    if (!poste_cr) {
      const { data } = await supabase
        .from('category_mapping')
        .select('poste_cr, poste_bilan')
        .eq('category_id', category_id)
        .maybeSingle()

      if (data) {
        poste_cr = data.poste_cr
        poste_bilan = data.poste_bilan
      }
    }

    return { poste_cr, poste_bilan }
  }

  async function handleFile(e: any) {
    const file: File | undefined = e.target.files?.[0]
    if (!file) return

    if (!selectedBudgetId) {
      alert('Choisis un budget avant d’importer.')
      return
    }

    setImporting(true)
    setLog('Lecture du fichier…')

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[]

      if (!rows.length) {
        alert('Fichier vide.')
        setImporting(false)
        return
      }

      const keyDate = ['date', 'Date']
      const keyType = ['type', 'Type']
      const keyDesc = ['description', 'Description', 'libellé', 'Libellé', 'libelle', 'Libelle']
      const keyAmount = ['montant', 'Montant', 'montant (€)', 'Montant (€)']
      const keyCat = ['categorie', 'catégorie', 'Categorie', 'Catégorie', 'category', 'Category']
      const keySub = ['sous_categorie', 'sous catégorie', 'Sous-catégorie', 'Sous categorie', 'subcategory', 'Subcategory']
      const keyFacture = ['facture', 'Facture', 'pj', 'PJ', 'justificatif', 'Justificatif']

      let imported = 0
      const errors: string[] = []
      let duplicateDecisionAll: boolean | null = null

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]

        try {
          const rawDate = pick(r, keyDate)
          const rawType = pick(r, keyType)
          const rawDesc = pick(r, keyDesc)
          const rawAmount = pick(r, keyAmount)
          const rawCat = pick(r, keyCat)
          const rawSub = pick(r, keySub)
          const rawFacture = pick(r, keyFacture)

          const tx_date = toIsoDate(rawDate)
          const kind = parseKind(rawType)
          const amount_cents = eurosToCents(rawAmount)
          const categoryName = String(rawCat ?? '').trim()
          const subcategoryName = String(rawSub ?? '').trim()
          const description = String(rawDesc ?? '').trim()

          if (!tx_date) throw new Error('date invalide/absente')
          if (!kind) throw new Error('type invalide (recette/dépense)')
          if (!amount_cents || amount_cents <= 0) throw new Error('montant invalide')
          if (!categoryName) throw new Error('catégorie vide')

          const duplicates = await findPotentialDuplicates(tx_date, amount_cents)
          if (duplicates.length > 0) {
            const details = duplicates
              .map((d: any) => `- ${d.tx_date} | ${d.kind === 'expense' ? 'Dépense' : 'Recette'} | ${d.description ?? 'Sans libellé'}`)
              .join('\n')

            const shouldContinue = window.confirm(
              `⚠️ Ligne ${i + 2} : une ou plusieurs transactions existent déjà avec la même date et le même montant.\n\n${details}\n\nCliquer sur OK pour importer quand même cette ligne, ou Annuler pour la sauter.`
            )

            if (!shouldContinue) {
              errors.push(`Ligne ${i + 2}: import annulé car doublon potentiel`)
              continue
            }
          }

          const category = findCategory(selectedBudgetId, kind, categoryName)
          if (!category) {
            throw new Error(`catégorie introuvable dans le budget "${selectedBudget?.name}" : ${categoryName}`)
          }

          let subcategoryId: string | null = null
          if (subcategoryName) {
            const sub = findSubcategory(category.id, subcategoryName)
            if (!sub) {
              throw new Error(`sous-catégorie introuvable : ${subcategoryName}`)
            }
            subcategoryId = sub.id
          }

          const receipt_status =
            kind === 'expense'
              ? isOui(rawFacture)
                ? 'PJ fournie'
                : 'PJ manquante'
              : 'PJ fournie'

          const finalDescription =
            description ||
            (subcategoryName
              ? `${categoryName} - ${subcategoryName}`
              : categoryName)

          const { data: tx, error: txErr } = await supabase
            .from('transactions')
            .insert({
              tx_date,
              kind,
              description: finalDescription,
              amount_cents,
              receipt_status,
            })
            .select('id')
            .single()

          if (txErr || !tx) throw txErr ?? new Error('erreur création transaction')

          const mapping = await getMapping(category.id, subcategoryId)

          const { error: allocErr } = await supabase
            .from('transaction_allocations')
            .insert({
              transaction_id: tx.id,
              budget_id: selectedBudgetId,
              category_id: category.id,
              subcategory_id: subcategoryId,
              amount_cents,
              poste_cr: mapping.poste_cr,
              poste_bilan: mapping.poste_bilan,
            })

          if (allocErr) throw allocErr

          imported++
          setLog(`Import… ${i + 1}/${rows.length}`)
        } catch (lineError: any) {
          errors.push(`Ligne ${i + 2}: ${lineError?.message ?? String(lineError)}`)
        }
      }

      const summary =
        `✅ ${imported} ligne(s) importée(s)` +
        (errors.length ? `\n\n❌ ${errors.length} erreur(s) :\n${errors.join('\n')}` : '')

      setLog(summary)
      alert(summary)
      await loadRefs()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur import : ${e?.message ?? String(e)}`)
      setLog(`Erreur import : ${e?.message ?? String(e)}`)
    } finally {
      setImporting(false)
      if (e?.target) e.target.value = ''
    }
  }

  if (loading) {
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Chargement…</main>
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1000 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900 }}>Admin — Import de masse</h1>

      <div style={{ marginTop: 8, opacity: 0.8 }}>
        Colonnes attendues : <code>date</code>, <code>type</code>, <code>description/libellé</code>,
        <code> montant</code>, <code>categorie</code>, <code>sous_categorie</code>, <code>facture</code>.
      </div>

      <div style={{ marginTop: 20, display: 'grid', gap: 12, maxWidth: 520 }}>
        <label>
          Budget
          <select
            value={selectedBudgetId}
            onChange={(e) => setSelectedBudgetId(e.target.value)}
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
          Fichier Excel (.xlsx)
          <input
            type="file"
            accept=".xlsx"
            onChange={handleFile}
            disabled={importing || !selectedBudgetId}
            style={{ display: 'block', width: '100%', marginTop: 6 }}
          />
        </label>
      </div>

      <div style={{ marginTop: 20, border: '1px solid #ddd', borderRadius: 12, padding: 16, whiteSpace: 'pre-wrap' }}>
        {importing ? 'Import en cours…' : 'Prêt'}
        {log ? `\n\n${log}` : ''}
      </div>

      <div style={{ marginTop: 20, opacity: 0.8 }}>
        Pour la colonne <b>facture</b> :
        <br />
        - <code>oui</code> → PJ fournie
        <br />
        - vide / <code>non</code> → PJ manquante pour une dépense
      </div>
    </main>
  )
}
