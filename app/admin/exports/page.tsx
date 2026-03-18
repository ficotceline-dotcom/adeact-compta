'use client'

import { useEffect, useMemo, useState } from 'react'
import JSZip from 'jszip'
import { supabase } from '@/lib/supabase'

type Budget = {
  id: string
  name: string
  is_archived: boolean | null
  ordre: number
}

type FiscalYear = {
  id: string
  year: number
  start_date: string
  end_date: string
}

type ExportRow = {
  transaction_id: string
  amount_cents: number
  budget_id: string
  category_id: string | null
  subcategory_id: string | null
  transaction:
    | {
        id: string
        tx_date: string
        kind: 'income' | 'expense'
        description: string | null
        amount_cents: number
        receipt_status: string | null
        receipt_path: string | null
        fiscal_year_id: string | null
      }
    | {
        id: string
        tx_date: string
        kind: 'income' | 'expense'
        description: string | null
        amount_cents: number
        receipt_status: string | null
        receipt_path: string | null
        fiscal_year_id: string | null
      }[]
    | null
  budget:
    | { name: string }
    | { name: string }[]
    | null
  category:
    | { name: string }
    | { name: string }[]
    | null
  subcategory:
    | { name: string }
    | { name: string }[]
    | null
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

function firstObj<T>(value: T | T[] | null): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function escapeCsv(value: string | number | null | undefined) {
  const s = String(value ?? '')
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function sanitizeFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w.-]+/g, '_')
}

function getExtensionFromPath(path: string | null | undefined) {
  if (!path) return ''
  const base = path.split('/').pop() ?? ''
  const idx = base.lastIndexOf('.')
  if (idx === -1) return ''
  return base.slice(idx)
}

function getOriginalFileName(path: string | null | undefined) {
  if (!path) return ''
  const base = path.split('/').pop() ?? ''
  const underscoreIndex = base.indexOf('_')
  if (underscoreIndex !== -1 && underscoreIndex < base.length - 1) {
    return base.slice(underscoreIndex + 1)
  }
  return base
}

function getExportFileName(transactionId: string, receiptPath: string | null | undefined) {
  const ext = getExtensionFromPath(receiptPath) || '.bin'
  return `${transactionId}${ext}`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function AdminExportsPage() {
  const [loading, setLoading] = useState(true)
  const [exportingCsv, setExportingCsv] = useState(false)
  const [exportingZip, setExportingZip] = useState(false)

  const [budgets, setBudgets] = useState<Budget[]>([])
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([])

  const [selectedBudgetId, setSelectedBudgetId] = useState('')
  const [selectedFiscalYearId, setSelectedFiscalYearId] = useState('')

  useEffect(() => {
    loadRefs()
  }, [])

  async function loadRefs() {
    setLoading(true)

    const [
      { data: b, error: e1 },
      { data: fy, error: e2 },
    ] = await Promise.all([
      supabase.from('budgets').select('id,name,is_archived,ordre').order('ordre'),
      supabase.from('fiscal_years').select('id,year,start_date,end_date').order('year', { ascending: false }),
    ])

    if (e1 || e2) {
      console.error(e1 || e2)
      alert('Erreur chargement exports')
      setLoading(false)
      return
    }

    const budgetsData = (b ?? []) as Budget[]
    const yearsData = (fy ?? []) as FiscalYear[]

    setBudgets(budgetsData)
    setFiscalYears(yearsData)

    if (!selectedBudgetId && budgetsData.length) {
      const firstActive = budgetsData.find((x) => !x.is_archived) ?? budgetsData[0]
      setSelectedBudgetId(firstActive.id)
    }

    if (!selectedFiscalYearId && yearsData.length) {
      setSelectedFiscalYearId(yearsData[0].id)
    }

    setLoading(false)
  }

  const selectedBudget = useMemo(
    () => budgets.find((b) => b.id === selectedBudgetId) ?? null,
    [budgets, selectedBudgetId]
  )

  const selectedFiscalYear = useMemo(
    () => fiscalYears.find((fy) => fy.id === selectedFiscalYearId) ?? null,
    [fiscalYears, selectedFiscalYearId]
  )

  async function fetchRows(): Promise<ExportRow[]> {
    const { data, error } = await supabase
      .from('transaction_allocations')
      .select(`
        transaction_id,
        amount_cents,
        budget_id,
        category_id,
        subcategory_id,
        transaction:transactions(id,tx_date,kind,description,amount_cents,receipt_status,receipt_path,fiscal_year_id),
        budget:budgets(name),
        category:categories(name),
        subcategory:subcategories(name)
      `)
      .order('transaction_id')

    if (error) throw error

    const rows = ((data ?? []) as ExportRow[]).filter((row) => {
      const tx = firstObj(row.transaction)
      if (!tx) return false

      const matchBudget = selectedBudgetId ? row.budget_id === selectedBudgetId : true
      const matchYear = selectedFiscalYearId ? tx.fiscal_year_id === selectedFiscalYearId : true

      return matchBudget && matchYear
    })

    return rows
  }

  async function exportTransactionsCsv() {
    if (!selectedBudgetId || !selectedFiscalYearId) {
      alert('Choisis un budget et une année.')
      return
    }

    setExportingCsv(true)

    try {
      const rows = await fetchRows()

      const header = [
        'transaction_id',
        'date',
        'type',
        'description',
        'montant_transaction_eur',
        'montant_ligne_eur',
        'budget',
        'categorie',
        'sous_categorie',
        'receipt_status',
        'receipt_path',
        'pj_nom_original',
        'pj_export_name',
      ]

      const csvLines = [header.join(',')]

      for (const row of rows) {
        const tx = firstObj(row.transaction)
        const budget = firstObj(row.budget)
        const category = firstObj(row.category)
        const subcategory = firstObj(row.subcategory)

        if (!tx) continue

        const originalName = getOriginalFileName(tx.receipt_path)
        const exportName = tx.receipt_path ? getExportFileName(tx.id, tx.receipt_path) : ''

        csvLines.push(
          [
            escapeCsv(tx.id),
            escapeCsv(tx.tx_date),
            escapeCsv(tx.kind),
            escapeCsv(tx.description ?? ''),
            escapeCsv(centsToEuros(tx.amount_cents)),
            escapeCsv(centsToEuros(row.amount_cents)),
            escapeCsv(budget?.name ?? ''),
            escapeCsv(category?.name ?? ''),
            escapeCsv(subcategory?.name ?? ''),
            escapeCsv(tx.receipt_status ?? ''),
            escapeCsv(tx.receipt_path ?? ''),
            escapeCsv(originalName),
            escapeCsv(exportName),
          ].join(',')
        )
      }

      const csv = '\uFEFF' + csvLines.join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })

      const budgetLabel = sanitizeFileName(selectedBudget?.name ?? 'budget')
      const yearLabel = selectedFiscalYear?.year ?? 'annee'

      downloadBlob(blob, `transactions_${budgetLabel}_${yearLabel}.csv`)
    } catch (e: any) {
      console.error(e)
      alert('Erreur export transactions')
    } finally {
      setExportingCsv(false)
    }
  }

  async function exportReceiptsZip() {
    if (!selectedBudgetId || !selectedFiscalYearId) {
      alert('Choisis un budget et une année.')
      return
    }

    setExportingZip(true)

    try {
      const rows = await fetchRows()

      const txMap = new Map<
        string,
        {
          id: string
          tx_date: string
          description: string | null
          amount_cents: number
          receipt_path: string | null
        }
      >()

      for (const row of rows) {
        const tx = firstObj(row.transaction)
        if (!tx?.receipt_path) continue
        if (!txMap.has(tx.id)) {
          txMap.set(tx.id, {
            id: tx.id,
            tx_date: tx.tx_date,
            description: tx.description ?? '',
            amount_cents: tx.amount_cents,
            receipt_path: tx.receipt_path,
          })
        }
      }

      if (txMap.size === 0) {
        alert('Aucune PJ à exporter pour ce budget / cette année.')
        setExportingZip(false)
        return
      }

      const zip = new JSZip()
      const manifest: string[] = [
        [
          'transaction_id',
          'date',
          'description',
          'montant_transaction_eur',
          'receipt_path',
          'pj_nom_original',
          'pj_export_name',
        ].join(','),
      ]

      const errors: string[] = []

      for (const tx of txMap.values()) {
        try {
          const receiptPath = tx.receipt_path!
          const exportName = getExportFileName(tx.id, receiptPath)
          const originalName = getOriginalFileName(receiptPath)

          const { data, error } = await supabase.storage
            .from('receipts')
            .download(receiptPath)

          if (error || !data) {
            errors.push(`${tx.id} | ${receiptPath}`)
            continue
          }

          zip.file(exportName, data)

          manifest.push(
            [
              escapeCsv(tx.id),
              escapeCsv(tx.tx_date),
              escapeCsv(tx.description ?? ''),
              escapeCsv(centsToEuros(tx.amount_cents)),
              escapeCsv(receiptPath),
              escapeCsv(originalName),
              escapeCsv(exportName),
            ].join(',')
          )
        } catch (e) {
          errors.push(tx.id)
        }
      }

      zip.file('manifest.csv', '\uFEFF' + manifest.join('\n'))

      if (errors.length > 0) {
        zip.file('erreurs_export.txt', errors.join('\n'))
      }

      const blob = await zip.generateAsync({ type: 'blob' })

      const budgetLabel = sanitizeFileName(selectedBudget?.name ?? 'budget')
      const yearLabel = selectedFiscalYear?.year ?? 'annee'

      downloadBlob(blob, `receipts_${budgetLabel}_${yearLabel}.zip`)

      if (errors.length > 0) {
        alert(`ZIP généré, mais ${errors.length} PJ n'ont pas pu être téléchargées. Voir erreurs_export.txt dans le ZIP.`)
      }
    } catch (e: any) {
      console.error(e)
      alert('Erreur export PJ')
    } finally {
      setExportingZip(false)
    }
  }

  if (loading) {
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Chargement…</main>
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 900 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900 }}>Admin — Exports</h1>

      <div
        style={{
          marginTop: 20,
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <select
          value={selectedBudgetId}
          onChange={(e) => setSelectedBudgetId(e.target.value)}
          style={{ padding: 8, minWidth: 220 }}
        >
          <option value="">Budget</option>
          {budgets
            .filter((b) => !b.is_archived)
            .sort((a, b) => a.ordre - b.ordre || a.name.localeCompare(b.name))
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </select>

        <select
          value={selectedFiscalYearId}
          onChange={(e) => setSelectedFiscalYearId(e.target.value)}
          style={{ padding: 8, minWidth: 140 }}
        >
          <option value="">Année</option>
          {fiscalYears.map((fy) => (
            <option key={fy.id} value={fy.id}>
              {fy.year}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 24, display: 'grid', gap: 16 }}>
        <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Export des transactions</h2>
          <div style={{ marginTop: 8, opacity: 0.8 }}>
            Le CSV contiendra :
            <br />
            <code>transaction_id</code>, <code>pj_nom_original</code> et <code>pj_export_name</code>.
          </div>

          <button
            onClick={exportTransactionsCsv}
            disabled={exportingCsv || !selectedBudgetId || !selectedFiscalYearId}
            style={{ marginTop: 14, padding: '10px 12px' }}
          >
            {exportingCsv ? 'Export CSV…' : 'Exporter les transactions (CSV)'}
          </button>
        </div>

        <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Export des PJ</h2>
          <div style={{ marginTop: 8, opacity: 0.8 }}>
            Le ZIP renommera automatiquement chaque PJ sous la forme :
            <br />
            <code>transaction_id.extension</code>
            <br />
            et inclura un <code>manifest.csv</code> avec la correspondance.
          </div>

          <button
            onClick={exportReceiptsZip}
            disabled={exportingZip || !selectedBudgetId || !selectedFiscalYearId}
            style={{ marginTop: 14, padding: '10px 12px' }}
          >
            {exportingZip ? 'Export ZIP…' : 'Exporter les PJ (ZIP)'}
          </button>
        </div>
      </div>
    </main>
  )
}
