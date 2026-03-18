'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type FiscalYear = { id: string; year: number; start_date: string; end_date: string }

type Row = {
  poste_cr: string | null
  amount_cents: number
  transaction:
  | { kind: 'income' | 'expense'; fiscal_year_id: string | null }
  | { kind: 'income' | 'expense'; fiscal_year_id: string | null }[]
  | null
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

function txObj(r: Row): { kind: 'income' | 'expense'; fiscal_year_id: string | null } | null {
  const t = r.transaction as any
  if (!t) return null
  if (Array.isArray(t)) return t[0] ?? null
  return t ?? null
}

function txKind(r: Row): 'income' | 'expense' | null {
  return txObj(r)?.kind ?? null
}

function txFiscalYearId(r: Row): string | null {
  return txObj(r)?.fiscal_year_id ?? null
}

export default function CRPage() {
  const [loading, setLoading] = useState(true)
  const [years, setYears] = useState<FiscalYear[]>([])
  const [yearId, setYearId] = useState<string>('')

  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    init()
  }, [])

  async function init() {
    setLoading(true)
    const { data: fy, error } = await supabase
      .from('fiscal_years')
      .select('id,year,start_date,end_date')
      .order('year', { ascending: false })

    if (error) {
      console.error(error)
      alert('Erreur chargement années')
      setLoading(false)
      return
    }

    const list = (fy ?? []) as FiscalYear[]
    setYears(list)
    setYearId(list[0]?.id ?? '')
    setLoading(false)
  }

  useEffect(() => {
    if (!yearId) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId])

  async function load() {
    setLoading(true)

    const { data, error } = await supabase
      .from('transaction_allocations')
      .select('poste_cr, amount_cents, transaction:transactions(kind,fiscal_year_id)')
      .not('poste_cr', 'is', null)

    if (error) {
      console.error(error)
      alert('Erreur chargement CR')
      setLoading(false)
      return
    }

    const filtered = ((data ?? []) as Row[]).filter((r) => txFiscalYearId(r) === yearId)
    setRows(filtered)

    setLoading(false)
  }

  const totals = useMemo(() => {
    const produits: Record<string, number> = {}
    const charges: Record<string, number> = {}

    for (const r of rows) {
      const poste = r.poste_cr ?? 'Non classé'
      const kind = txKind(r)
      if (kind === 'income') produits[poste] = (produits[poste] ?? 0) + r.amount_cents
      if (kind === 'expense') charges[poste] = (charges[poste] ?? 0) + r.amount_cents
    }

    const totalProduits = Object.values(produits).reduce((a, b) => a + b, 0)
    const totalCharges = Object.values(charges).reduce((a, b) => a + b, 0)

    return { produits, charges, totalProduits, totalCharges, resultat: totalProduits - totalCharges }
  }, [rows])

  const selectedYear = years.find((y) => y.id === yearId)

  if (loading && years.length === 0) return <main style={{ padding: 24 }}>Chargement…</main>

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1100 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900 }}>Compte de résultat</h1>

      <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          Année :{' '}
          <select value={yearId} onChange={(e) => setYearId(e.target.value)} style={{ padding: 8 }}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.year}
              </option>
            ))}
          </select>
        </label>

        {selectedYear && (
          <span style={{ opacity: 0.7 }}>
            Période : {selectedYear.start_date} → {selectedYear.end_date}
          </span>
        )}

        <button onClick={load} style={{ padding: '10px 12px' }}>
          Rafraîchir
        </button>
      </div>

      <div style={{ marginTop: 16, padding: 12, border: '1px solid #eee', borderRadius: 12 }}>
        <div>Produits : <b>{centsToEuros(totals.totalProduits)} €</b></div>
        <div>Charges : <b>{centsToEuros(totals.totalCharges)} €</b></div>
        <div style={{ marginTop: 6, fontSize: 16, fontWeight: 900 }}>
          Résultat : {centsToEuros(totals.resultat)} €
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Produits</h2>
          {Object.keys(totals.produits).length === 0 ? (
            <p style={{ marginTop: 10 }}>Aucune donnée.</p>
          ) : (
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              {Object.entries(totals.produits)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([poste, amount]) => (
                  <div key={poste} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{poste}</span>
                    <b>{centsToEuros(amount)} €</b>
                  </div>
                ))}
            </div>
          )}
        </section>

        <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Charges</h2>
          {Object.keys(totals.charges).length === 0 ? (
            <p style={{ marginTop: 10 }}>Aucune donnée.</p>
          ) : (
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              {Object.entries(totals.charges)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([poste, amount]) => (
                  <div key={poste} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{poste}</span>
                    <b>{centsToEuros(amount)} €</b>
                  </div>
                ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
