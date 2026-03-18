'use client'

import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'

const GRIMM_BUDGET_ID = '9c35a7b5-7560-4899-b9a3-9855eea21a2c'

type FiscalYear = { id: string; year: number; start_date: string; end_date: string }
type Cat = { id: string; name: string; kind: 'income' | 'expense'; budget_id: string }
type Sub = { id: string; name: string; category_id: string }

function norm(v: any) {
  return String(v ?? '').trim().toLowerCase()
}

function findFiscalYearId(fys: FiscalYear[], dateISO: string) {
  return fys.find((fy) => dateISO >= fy.start_date && dateISO <= fy.end_date)?.id ?? null
}

function toIsoDate(v: any): string | null {
  if (v === null || v === undefined || v === '') return null

  // JS Date
  if (v instanceof Date && !isNaN(v.getTime())) {
    const yyyy = v.getFullYear()
    const mm = String(v.getMonth() + 1).padStart(2, '0')
    const dd = String(v.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  // Excel serial
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    if (!d || !d.y || !d.m || !d.d) return null
    const yyyy = String(d.y).padStart(4, '0')
    const mm = String(d.m).padStart(2, '0')
    const dd = String(d.d).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  const s = String(v).trim()

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // DD/MM/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) {
    const dd = String(m[1]).padStart(2, '0')
    const mm = String(m[2]).padStart(2, '0')
    const yyyy = m[3]
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

  // si déjà num (xlsx peut convertir)
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Math.round(v * 100)
  }

  let s = String(v).trim()

  // enlever espaces insécables + espaces (milliers)
  s = s.replace(/\u00A0/g, '').replace(/\s/g, '')

  // enlever symboles / lettres (€, etc.) -> on garde chiffres + , . -
  s = s.replace(/[^\d,.\-]/g, '')

  if (!s) return null

  const hasComma = s.includes(',')
  const hasDot = s.includes('.')

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',')
    const lastDot = s.lastIndexOf('.')
    if (lastComma > lastDot) {
      // virgule = décimales, points = milliers
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      // point = décimales, virgules = milliers
      s = s.replace(/,/g, '')
    }
  } else if (hasComma) {
    // uniquement virgule -> décimales
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

// récupère une valeur en testant plusieurs titres possibles + fallback "contient montant"
function pick(r: any, keys: string[]) {
  // 1) match exact
  for (const k of keys) {
    if (r[k] !== undefined) return r[k]
  }

  // 2) match normalisé
  const rKeys = Object.keys(r)
  const wanted = keys.map((k) => norm(k))
  for (const rk of rKeys) {
    const n = norm(rk)
    if (wanted.includes(n)) return r[rk]
  }

  // 3) fallback contient "montant" / "amount"
  const wantsAmount = wanted.some((x) => x.includes('montant') || x.includes('amount'))
  if (wantsAmount) {
    const found = rKeys.find((rk) => {
      const n = norm(rk)
      return n.includes('montant') || n.includes('amount')
    })
    if (found) return r[found]
  }

  return undefined
}

export default function ImportGrimmXlsxPage() {
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string>('')

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('fiscal_years')
        .select('id,year,start_date,end_date')
        .order('year', { ascending: false })
      setFiscalYears((data ?? []) as FiscalYear[])
    })()
  }, [])

  async function ensureCategory(kind: 'income' | 'expense', name: string): Promise<Cat> {
    const { data: existing } = await supabase
      .from('categories')
      .select('id,name,kind,budget_id')
      .eq('budget_id', GRIMM_BUDGET_ID)
      .eq('kind', kind)
      .eq('name', name)
      .maybeSingle()

    if (existing) return existing as Cat

    const { data: created, error } = await supabase
      .from('categories')
      .insert({ budget_id: GRIMM_BUDGET_ID, kind, name })
      .select('id,name,kind,budget_id')
      .single()

    if (error || !created) throw error ?? new Error('Cat create failed')
    return created as Cat
  }

  async function ensureSubcategory(category_id: string, name: string): Promise<Sub> {
    const { data: existing } = await supabase
      .from('subcategories')
      .select('id,name,category_id')
      .eq('category_id', category_id)
      .eq('name', name)
      .maybeSingle()

    if (existing) return existing as Sub

    const { data: created, error } = await supabase
      .from('subcategories')
      .insert({ category_id, name })
      .select('id,name,category_id')
      .single()

    if (error || !created) throw error ?? new Error('Subcat create failed')
    return created as Sub
  }

  async function handleFile(e: any) {
    const file: File | undefined = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setMsg('Lecture du fichier…')

    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[]

      if (!rows.length) {
        alert('Fichier vide.')
        setLoading(false)
        return
      }

      const keyDate = ['date', 'Date', 'DATE', 'date transaction', 'Date transaction']
      const keyType = ['type', 'Type', 'TYPE', 'nature', 'Nature']
      const keyDesc = ['description', 'Description', 'libelle', 'libellé', 'Libellé', 'Libelle']
      const keyAmount = ['montant', 'Montant', 'amount', 'Amount', 'Montant (€)', 'Montant TTC']
      const keyCat = ['categorie', 'catégorie', 'Categorie', 'Catégorie', 'category', 'Category']
      const keySub = ['sous_categorie', 'sous catégorie', 'Sous-catégorie', 'Sous categorie', 'subcategory', 'Subcategory']
      const keyFacture = ['facture', 'Facture', 'FACTURE', 'pj', 'PJ', 'Justificatif', 'justificatif']

      let imported = 0

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]

        const rawDate = pick(r, keyDate)
        const rawType = pick(r, keyType)
        const rawDesc = pick(r, keyDesc)
        const rawAmount = pick(r, keyAmount)
        const rawCat = pick(r, keyCat)
        const rawSub = pick(r, keySub)
        const rawFacture = pick(r, keyFacture)

        const tx_date = toIsoDate(rawDate)
        const kind = parseKind(rawType)
        const description = String(rawDesc ?? '').trim()
        const amount_cents = eurosToCents(rawAmount)
        const categoryName = String(rawCat ?? '').trim()
        const subcategoryName = String(rawSub ?? '').trim()

        if (!tx_date) throw new Error(`Ligne ${i + 2}: date invalide/absente`)
        if (!kind) throw new Error(`Ligne ${i + 2}: type invalide (recette/dépense)`)
        if (!amount_cents || amount_cents <= 0) {
          console.log('DEBUG MONTANT', { rawAmount, keys: Object.keys(r), row: r })
          throw new Error(`Ligne ${i + 2}: montant invalide`)
        }
        if (!categoryName) throw new Error(`Ligne ${i + 2}: catégorie vide`)

        // libellé non obligatoire
        const descriptionFinal =
          description || (subcategoryName ? `${categoryName} - ${subcategoryName}` : categoryName) || 'Sans libellé'

        // règle PJ
        const receipt_missing = kind === 'expense' && !isOui(rawFacture)
        const receipt_status = receipt_missing ? 'PJ manquante' : 'PJ fournie'

        // année fiscale (civil)
        const fiscal_year_id = fiscalYears.length ? findFiscalYearId(fiscalYears, tx_date) : null

        // auto create cat/subcat
        const cat = await ensureCategory(kind, categoryName)
        const sub = subcategoryName ? await ensureSubcategory(cat.id, subcategoryName) : null

        setMsg(`Import… ${i + 1}/${rows.length}`)

        const { data: tx, error: txErr } = await supabase
          .from('transactions')
          .insert({
            tx_date,
            kind,
            description: descriptionFinal,
            amount_cents,
            receipt_status,
            fiscal_year_id,
          })
          .select('id')
          .single()

        if (txErr || !tx) throw txErr ?? new Error(`Insert transaction failed ligne ${i + 2}`)

        const { error: allocErr } = await supabase.from('transaction_allocations').insert({
          transaction_id: tx.id,
          budget_id: GRIMM_BUDGET_ID,
          category_id: cat.id,
          subcategory_id: sub?.id ?? null,
          amount_cents,
        })

        if (allocErr) throw allocErr

        imported++
      }

      alert(`✅ Import terminé : ${imported} lignes importées dans Grimm`)
      setMsg(`✅ Import terminé : ${imported} lignes`)
    } catch (err: any) {
      console.error(err)
      alert(`❌ Erreur import : ${err?.message ?? String(err)}`)
      setMsg(`❌ Erreur : ${err?.message ?? String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 900 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900 }}>Import Grimm — Excel (.xlsx)</h1>

      <p style={{ opacity: 0.8 }}>
        Colonnes acceptées (variantes) : <br />
        <code>date | type | description/libellé | montant | categorie | sous_categorie | facture</code>
        <br />
        Règle PJ : si <b>dépense</b> et facture ≠ “oui” → <b>PJ manquante</b>.
      </p>

      <input type="file" accept=".xlsx" onChange={handleFile} disabled={loading} />

      <div style={{ marginTop: 12, padding: 12, border: '1px solid #eee', borderRadius: 12 }}>
        {loading ? <b>Import en cours…</b> : <b>Prêt</b>} <span style={{ marginLeft: 8 }}>{msg}</span>
      </div>
    </main>
  )
}
