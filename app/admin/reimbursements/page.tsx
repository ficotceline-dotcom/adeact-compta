'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type FiscalYear = {
  id: string
  year: number
  start_date: string
  end_date: string
}

type RequestRow = {
  id: string
  requester_name: string
  amount_cents: number
  invoice_path: string
  iban: string | null
  budget_id: string
  category_id: string
  subcategory_id: string | null
  status: 'pending' | 'reimbursed'
  requested_at: string
  reimbursed_on: string | null
  reimbursed_transaction_id: string | null
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

function formatFrDate(dateStr: string | null) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

function formatFrDateTime(value: string) {
  const d = new Date(value)
  return d.toLocaleString('fr-FR')
}

function firstObj<T>(value: T | T[] | null): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function findFiscalYear(date: string, fiscalYears: FiscalYear[]) {
  return fiscalYears.find((fy) => date >= fy.start_date && date <= fy.end_date) ?? null
}

export default function AdminReimbursementsPage() {
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const [rows, setRows] = useState<RequestRow[]>([])
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'reimbursed'>('pending')
  const [reimbursedDateById, setReimbursedDateById] = useState<Record<string, string>>({})

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

    const [
      { data: requestsData, error: e1 },
      { data: fyData, error: e2 },
    ] = await Promise.all([
      supabase
        .from('reimbursement_requests')
        .select(`
          id,
          requester_name,
          amount_cents,
          invoice_path,
          iban,
          budget_id,
          category_id,
          subcategory_id,
          status,
          requested_at,
          reimbursed_on,
          reimbursed_transaction_id,
          budget:budgets(name),
          category:categories(name),
          subcategory:subcategories(name)
        `)
        .order('requested_at', { ascending: false }),

      supabase
        .from('fiscal_years')
        .select('id,year,start_date,end_date')
        .order('year', { ascending: false }),
    ])

    if (e1 || e2) {
      console.error(e1 || e2)
      alert('Erreur chargement remboursements')
      setLoading(false)
      return
    }

    const requestRows = (requestsData ?? []) as RequestRow[]
    const years = (fyData ?? []) as FiscalYear[]

    setRows(requestRows)
    setFiscalYears(years)

    const dates: Record<string, string> = {}
    for (const row of requestRows) {
      dates[row.id] = row.reimbursed_on ?? new Date().toISOString().slice(0, 10)
    }
    setReimbursedDateById(dates)

    setLoading(false)
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

  async function markAsReimbursed(row: RequestRow) {
    if (row.status === 'reimbursed') {
      alert('Cette demande est déjà marquée comme remboursée.')
      return
    }

    const reimbursedOn = reimbursedDateById[row.id]
    if (!reimbursedOn) {
      alert('Merci de renseigner une date de remboursement.')
      return
    }

    setProcessingId(row.id)

    try {
      const fy = findFiscalYear(reimbursedOn, fiscalYears)
      const mapping = await getMapping(row.category_id, row.subcategory_id)

      const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .insert({
          tx_date: reimbursedOn,
          kind: 'expense',
          description: `Remboursement - ${row.requester_name}`,
          amount_cents: row.amount_cents,
          receipt_status: 'PJ fournie',
          receipt_path: row.invoice_path,
          fiscal_year_id: fy?.id ?? null,
        })
        .select('id')
        .single()

      if (txErr || !tx) throw txErr ?? new Error('Erreur création transaction remboursement')

      const { error: allocErr } = await supabase
        .from('transaction_allocations')
        .insert({
          transaction_id: tx.id,
          budget_id: row.budget_id,
          category_id: row.category_id,
          subcategory_id: row.subcategory_id,
          amount_cents: row.amount_cents,
          poste_cr: mapping.poste_cr,
          poste_bilan: mapping.poste_bilan,
        })

      if (allocErr) throw allocErr

      const { error: updateErr } = await supabase
        .from('reimbursement_requests')
        .update({
          status: 'reimbursed',
          reimbursed_on: reimbursedOn,
          reimbursed_transaction_id: tx.id,
        })
        .eq('id', row.id)

      if (updateErr) throw updateErr

      alert('✅ Remboursement enregistré et transaction créée')
      await load()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur remboursement : ${e?.message ?? 'inconnue'}`)
    } finally {
      setProcessingId(null)
    }
  }

  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return rows
    return rows.filter((r) => r.status === statusFilter)
  }, [rows, statusFilter])

  if (loading) {
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Chargement…</main>
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1100 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900 }}>Admin — Gestion remboursements</h1>

      <div style={{ marginTop: 16 }}>
        <label>Statut :</label>{' '}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'pending' | 'reimbursed')}
          style={{ padding: 8 }}
        >
          <option value="pending">En attente</option>
          <option value="reimbursed">Remboursés</option>
          <option value="all">Tous</option>
        </select>
      </div>

      <div style={{ marginTop: 24, display: 'grid', gap: 16 }}>
        {filteredRows.map((row) => {
          const budget = firstObj(row.budget)
          const category = firstObj(row.category)
          const subcategory = firstObj(row.subcategory)

          return (
            <div
              key={row.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: 12,
                padding: 16,
                background: row.status === 'pending' ? '#fffaf5' : '#f7fff7',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>
                    {row.requester_name} — {centsToEuros(row.amount_cents)} €
                  </div>

                  <div style={{ marginTop: 4, opacity: 0.75 }}>
                    Demandé le {formatFrDateTime(row.requested_at)}
                  </div>
                </div>

                <div
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    border: '1px solid #ddd',
                    background: 'white',
                  }}
                >
                  {row.status === 'pending' ? 'En attente' : 'Remboursé'}
                </div>
              </div>

              <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
                <div>
                  <b>Budget :</b> {budget?.name ?? '—'}
                </div>
                <div>
                  <b>Catégorie :</b> {category?.name ?? '—'}
                  {subcategory?.name ? ` → ${subcategory.name}` : ''}
                </div>
                <div>
                  <b>IBAN :</b> {row.iban || 'Non renseigné'}
                </div>
                <div>
                  <b>Facture :</b>{' '}
                  <code>{row.invoice_path}</code>
                </div>
              </div>

              {row.status === 'pending' ? (
                <div
                  style={{
                    marginTop: 16,
                    display: 'flex',
                    gap: 10,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                  }}
                >
                  <label>
                    Date du remboursement
                    <input
                      type="date"
                      value={reimbursedDateById[row.id] ?? ''}
                      onChange={(e) =>
                        setReimbursedDateById((prev) => ({
                          ...prev,
                          [row.id]: e.target.value,
                        }))
                      }
                      style={{ display: 'block', padding: 8, marginTop: 6 }}
                    />
                  </label>

                  <button
                    onClick={() => markAsReimbursed(row)}
                    disabled={processingId === row.id}
                    style={{ padding: '12px 16px', marginTop: 24 }}
                  >
                    {processingId === row.id ? 'Traitement…' : 'Remboursé'}
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: 16, opacity: 0.8 }}>
                  Remboursé le <b>{formatFrDate(row.reimbursed_on)}</b>
                  {row.reimbursed_transaction_id ? (
                    <>
                      {' '}—{' '}
                      <a href={`/transactions/${row.reimbursed_transaction_id}/edit`}>
                        Voir la transaction créée
                      </a>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          )
        })}

        {filteredRows.length === 0 && (
          <div style={{ opacity: 0.7 }}>Aucune demande pour ce filtre.</div>
        )}
      </div>
    </main>
  )
}

