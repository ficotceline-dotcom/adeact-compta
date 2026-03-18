'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type FiscalYear = { id: string; year: number }

type Row = {
  poste_bilan: string | null
  amount_cents: number
  transaction: { fiscal_year_id: string | null } | { fiscal_year_id: string | null }[] | null
}

function euros(cents: number) {
  return (cents / 100).toFixed(2)
}

function txFiscalYearId(r: Row): string | null {
  const t = r.transaction as any
  if (!t) return null
  if (Array.isArray(t)) return t[0]?.fiscal_year_id ?? null
  return t.fiscal_year_id ?? null
}

export default function BilanPage() {
  const [years, setYears] = useState<FiscalYear[]>([])
  const [yearId, setYearId] = useState<string>('')
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    loadYears()
  }, [])

  async function loadYears() {
    const { data } = await supabase
      .from('fiscal_years')
      .select('id,year')
      .order('year', { ascending: false })

    setYears(data ?? [])
    if (data?.length) setYearId(data[0].id)
  }

  useEffect(() => {
    if (yearId) loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId])

  async function loadData() {
    const { data, error } = await supabase
      .from('transaction_allocations')
      .select('poste_bilan, amount_cents, transaction:transactions(fiscal_year_id)')
      .not('poste_bilan', 'is', null)

    if (error) {
      console.error(error)
      alert('Erreur chargement bilan')
      return
    }

const filtered = ((data ?? []) as Row[]).filter(
  (r) => txFiscalYearId(r) === yearId
)

    setRows(filtered)
  }

  const totals = useMemo(() => {
    const actif: Record<string, number> = {}
    const passif: Record<string, number> = {}

    for (const r of rows) {
      const poste = r.poste_bilan ?? 'Autres'
      if (poste.startsWith('Actif')) actif[poste] = (actif[poste] ?? 0) + r.amount_cents
      else passif[poste] = (passif[poste] ?? 0) + r.amount_cents
    }

    const totalActif = Object.values(actif).reduce((a, b) => a + b, 0)
    const totalPassif = Object.values(passif).reduce((a, b) => a + b, 0)

    return { actif, passif, totalActif, totalPassif }
  }, [rows])

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1100 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900 }}>Bilan annuel</h1>

      <div style={{ marginTop: 12 }}>
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

        <button onClick={loadData} style={{ marginLeft: 10, padding: '8px 10px' }}>
          Rafraîchir
        </button>
      </div>

      <div style={{ marginTop: 16, padding: 12, border: '1px solid #eee', borderRadius: 12 }}>
        <div>Total Actif : <b>{euros(totals.totalActif)} €</b></div>
        <div>Total Passif : <b>{euros(totals.totalPassif)} €</b></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 20 }}>
        <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Actif</h2>
          {Object.keys(totals.actif).length === 0 ? (
            <p style={{ marginTop: 10 }}>Aucune donnée.</p>
          ) : (
            Object.entries(totals.actif).map(([poste, amount]) => (
              <div key={poste} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{poste.replace('Actif - ', '')}</span>
                <b>{euros(amount)} €</b>
              </div>
            ))
          )}
        </section>

        <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Passif</h2>
          {Object.keys(totals.passif).length === 0 ? (
            <p style={{ marginTop: 10 }}>Aucune donnée.</p>
          ) : (
            Object.entries(totals.passif).map(([poste, amount]) => (
              <div key={poste} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{poste.replace('Passif - ', '')}</span>
                <b>{euros(amount)} €</b>
              </div>
            ))
          )}
        </section>
      </div>
    </main>
  )
}
