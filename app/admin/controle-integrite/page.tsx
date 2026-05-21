'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type TxKind = 'income' | 'expense'

type FiscalYear = {
  id: string
  year: number
  start_date: string
  end_date: string
}

type Transaction = {
  id: string
  tx_date: string
  kind: TxKind
  description: string | null
  amount_cents: number
  fiscal_year_id: string | null
}

type Allocation = {
  id: string
  transaction_id: string
  budget_id: string | null
  category_id: string | null
  subcategory_id: string | null
  amount_cents: number
  poste_cr: string | null
  poste_bilan: string | null
  transaction:
    | {
        id: string
        tx_date: string
        kind: TxKind
        description: string | null
        amount_cents: number
        fiscal_year_id: string | null
      }
    | {
        id: string
        tx_date: string
        kind: TxKind
        description: string | null
        amount_cents: number
        fiscal_year_id: string | null
      }[]
    | null
}

type Issue = {
  id: string
  level: 'error' | 'warning'
  type: string
  transactionId: string
  txDate: string
  description: string
  amount_cents: number
  allocated_cents: number
  missing_cents: number
  details: string
}

function euros(cents: number) {
  return `${(cents / 100).toFixed(2)} €`
}

function getTxFromAllocation(a: Allocation): Transaction | null {
  const tx = a.transaction as any
  if (!tx) return null
  if (Array.isArray(tx)) return tx[0] ?? null
  return tx
}

function isDateInFiscalYear(txDate: string, year: FiscalYear) {
  return txDate >= year.start_date && txDate <= year.end_date
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 14,
  padding: 14,
  background: 'white',
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: 10,
  borderBottom: '1px solid #e5e7eb',
  fontSize: 13,
}

const tdStyle: React.CSSProperties = {
  padding: 10,
  borderBottom: '1px solid #f1f5f9',
  verticalAlign: 'top',
  fontSize: 13,
}

export default function ControleIntegritePage() {
  const [loading, setLoading] = useState(true)
  const [years, setYears] = useState<FiscalYear[]>([])
  const [yearId, setYearId] = useState('')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [filter, setFilter] = useState<'all' | 'error' | 'warning'>('all')

  useEffect(() => {
    init()
  }, [])

  async function init() {
    setLoading(true)

    const { data, error } = await supabase
      .from('fiscal_years')
      .select('id,year,start_date,end_date')
      .order('year', { ascending: false })

    if (error) {
      console.error(error)
      alert('Erreur chargement des exercices')
      setLoading(false)
      return
    }

    const list = (data ?? []) as FiscalYear[]
    setYears(list)

    if (list.length > 0) {
      setYearId(list[0].id)
      await loadData(list[0].id)
    }

    setLoading(false)
  }

  async function loadData(selectedYearId = yearId) {
    if (!selectedYearId) return

    setLoading(true)

    const [{ data: txData, error: txError }, { data: allocData, error: allocError }] = await Promise.all([
      supabase
        .from('transactions')
        .select('id,tx_date,kind,description,amount_cents,fiscal_year_id')
        .eq('fiscal_year_id', selectedYearId)
        .order('tx_date', { ascending: false })
        .range(0, 9999),

      supabase
        .from('transaction_allocations')
        .select(`
          id,
          transaction_id,
          budget_id,
          category_id,
          subcategory_id,
          amount_cents,
          poste_cr,
          poste_bilan,
          transaction:transactions(
            id,
            tx_date,
            kind,
            description,
            amount_cents,
            fiscal_year_id
          )
        `)
        .range(0, 9999),
    ])

    if (txError || allocError) {
      console.error(txError || allocError)
      alert('Erreur chargement du contrôle')
      setLoading(false)
      return
    }

    const txs = (txData ?? []) as Transaction[]
    const allocs = ((allocData ?? []) as Allocation[]).filter((a) => {
      const tx = getTxFromAllocation(a)
      return tx?.fiscal_year_id === selectedYearId
    })

    setTransactions(txs)
    setAllocations(allocs)
    setLoading(false)
  }

  async function handleYearChange(nextYearId: string) {
    setYearId(nextYearId)
    await loadData(nextYearId)
  }

  const selectedYear = years.find((y) => y.id === yearId)

  const analysis = useMemo(() => {
    const allocationsByTx = new Map<string, Allocation[]>()

    for (const a of allocations) {
      if (!allocationsByTx.has(a.transaction_id)) allocationsByTx.set(a.transaction_id, [])
      allocationsByTx.get(a.transaction_id)!.push(a)
    }

    const issues: Issue[] = []

    for (const tx of transactions) {
      const txAllocs = allocationsByTx.get(tx.id) ?? []
      const allocated = txAllocs.reduce((sum, a) => sum + (a.amount_cents ?? 0), 0)
      const missing = tx.amount_cents - allocated

      if (txAllocs.length === 0) {
        issues.push({
          id: `${tx.id}-no-allocation`,
          level: 'error',
          type: 'Transaction sans affectation',
          transactionId: tx.id,
          txDate: tx.tx_date,
          description: tx.description ?? 'Sans libellé',
          amount_cents: tx.amount_cents,
          allocated_cents: allocated,
          missing_cents: missing,
          details: 'Cette transaction n’est liée à aucun budget, aucune catégorie, aucun CR et aucun bilan.',
        })
        continue
      }

      if (allocated !== tx.amount_cents) {
        issues.push({
          id: `${tx.id}-amount-mismatch`,
          level: 'error',
          type: 'Montant mal ventilé',
          transactionId: tx.id,
          txDate: tx.tx_date,
          description: tx.description ?? 'Sans libellé',
          amount_cents: tx.amount_cents,
          allocated_cents: allocated,
          missing_cents: missing,
          details: `Le total des affectations ne correspond pas au montant de la transaction. Écart : ${euros(missing)}.`,
        })
      }

      if (selectedYear && !isDateInFiscalYear(tx.tx_date, selectedYear)) {
        issues.push({
          id: `${tx.id}-year-mismatch`,
          level: 'warning',
          type: 'Date hors exercice',
          transactionId: tx.id,
          txDate: tx.tx_date,
          description: tx.description ?? 'Sans libellé',
          amount_cents: tx.amount_cents,
          allocated_cents: allocated,
          missing_cents: 0,
          details: `La transaction est rattachée à l’exercice ${selectedYear.year}, mais sa date est hors période.`,
        })
      }

      const hasMissingBudget = txAllocs.some((a) => !a.budget_id)
      const hasMissingCategory = txAllocs.some((a) => !a.category_id)
      const hasMissingSubcategory = txAllocs.some((a) => !a.subcategory_id)
      const hasMissingCr = txAllocs.some((a) => !a.poste_cr)
      const hasMissingBilan = txAllocs.some((a) => !a.poste_bilan)

      if (hasMissingBudget) {
        issues.push({
          id: `${tx.id}-missing-budget`,
          level: 'error',
          type: 'Budget manquant',
          transactionId: tx.id,
          txDate: tx.tx_date,
          description: tx.description ?? 'Sans libellé',
          amount_cents: tx.amount_cents,
          allocated_cents: allocated,
          missing_cents: 0,
          details: 'Au moins une ligne d’affectation n’a pas de budget projet.',
        })
      }

      if (hasMissingCategory) {
        issues.push({
          id: `${tx.id}-missing-category`,
          level: 'error',
          type: 'Catégorie manquante',
          transactionId: tx.id,
          txDate: tx.tx_date,
          description: tx.description ?? 'Sans libellé',
          amount_cents: tx.amount_cents,
          allocated_cents: allocated,
          missing_cents: 0,
          details: 'Au moins une ligne d’affectation n’a pas de catégorie.',
        })
      }

      if (hasMissingCr) {
        issues.push({
          id: `${tx.id}-missing-cr`,
          level: 'error',
          type: 'Compte de résultat manquant',
          transactionId: tx.id,
          txDate: tx.tx_date,
          description: tx.description ?? 'Sans libellé',
          amount_cents: tx.amount_cents,
          allocated_cents: allocated,
          missing_cents: 0,
          details: 'Au moins une ligne d’affectation ne remonte pas dans le compte de résultat.',
        })
      }

      if (hasMissingBilan) {
        issues.push({
          id: `${tx.id}-missing-bilan`,
          level: 'error',
          type: 'Bilan manquant',
          transactionId: tx.id,
          txDate: tx.tx_date,
          description: tx.description ?? 'Sans libellé',
          amount_cents: tx.amount_cents,
          allocated_cents: allocated,
          missing_cents: 0,
          details: 'Au moins une ligne d’affectation ne remonte pas dans le bilan.',
        })
      }
    }

    const totalTransactions = transactions.reduce((sum, tx) => sum + tx.amount_cents, 0)
    const totalAllocations = allocations.reduce((sum, a) => sum + a.amount_cents, 0)
    const totalBudget = allocations.filter((a) => !!a.budget_id).reduce((sum, a) => sum + a.amount_cents, 0)
    const totalCr = allocations.filter((a) => !!a.poste_cr).reduce((sum, a) => sum + a.amount_cents, 0)
    const totalBilan = allocations.filter((a) => !!a.poste_bilan).reduce((sum, a) => sum + a.amount_cents, 0)

    const actif = allocations
      .filter((a) => a.poste_bilan?.startsWith('Actif'))
      .reduce((sum, a) => sum + a.amount_cents, 0)

    const passif = allocations
      .filter((a) => a.poste_bilan && !a.poste_bilan.startsWith('Actif'))
      .reduce((sum, a) => sum + a.amount_cents, 0)

    return {
      issues,
      errors: issues.filter((i) => i.level === 'error').length,
      warnings: issues.filter((i) => i.level === 'warning').length,
      totalTransactions,
      totalAllocations,
      totalBudget,
      totalCr,
      totalBilan,
      actif,
      passif,
      globalGap: totalTransactions - totalAllocations,
      budgetGap: totalTransactions - totalBudget,
      crGap: totalTransactions - totalCr,
      bilanGap: totalTransactions - totalBilan,
      bilanBalanceGap: actif - passif,
    }
  }, [transactions, allocations, selectedYear])

  const visibleIssues = analysis.issues.filter((i) => {
    if (filter === 'all') return true
    return i.level === filter
  })

  const isClean = analysis.errors === 0 && analysis.warnings === 0 && analysis.globalGap === 0

  if (loading && years.length === 0) {
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Chargement…</main>
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1400 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>Contrôle d’intégrité comptable</h1>
          <p style={{ marginTop: 8, color: '#64748b' }}>
            Vérifie que chaque transaction est bien affectée aux budgets, au compte de résultat et au bilan.
          </p>
        </div>

        <button
          onClick={() => loadData()}
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          Rafraîchir
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <label>
          Exercice :{' '}
          <select value={yearId} onChange={(e) => handleYearChange(e.target.value)} style={{ padding: 9 }}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.year}
              </option>
            ))}
          </select>
        </label>

        {selectedYear && (
          <span style={{ marginLeft: 12, color: '#64748b' }}>
            Période : {selectedYear.start_date} → {selectedYear.end_date}
          </span>
        )}
      </div>

      <section
        style={{
          ...cardStyle,
          marginTop: 18,
          borderColor: isClean ? '#86efac' : '#fecaca',
          background: isClean ? '#f0fdf4' : '#fff7ed',
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 900 }}>
          {isClean ? '✅ Tout est cohérent' : '⚠️ Des anomalies sont à corriger'}
        </div>
        <div style={{ marginTop: 6, color: '#475569' }}>
          {analysis.errors} erreur(s) bloquante(s) · {analysis.warnings} alerte(s) · écart global :{' '}
          <b>{euros(analysis.globalGap)}</b>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginTop: 16 }}>
        <div style={cardStyle}>
          <div style={{ color: '#64748b', fontSize: 13 }}>Transactions</div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{euros(analysis.totalTransactions)}</div>
        </div>

        <div style={cardStyle}>
          <div style={{ color: '#64748b', fontSize: 13 }}>Allocations</div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{euros(analysis.totalAllocations)}</div>
          <div style={{ color: analysis.globalGap === 0 ? '#16a34a' : '#dc2626', fontSize: 12 }}>
            Écart : {euros(analysis.globalGap)}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ color: '#64748b', fontSize: 13 }}>Budgets</div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{euros(analysis.totalBudget)}</div>
          <div style={{ color: analysis.budgetGap === 0 ? '#16a34a' : '#dc2626', fontSize: 12 }}>
            Écart : {euros(analysis.budgetGap)}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ color: '#64748b', fontSize: 13 }}>Compte de résultat</div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{euros(analysis.totalCr)}</div>
          <div style={{ color: analysis.crGap === 0 ? '#16a34a' : '#dc2626', fontSize: 12 }}>
            Écart : {euros(analysis.crGap)}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ color: '#64748b', fontSize: 13 }}>Bilan</div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{euros(analysis.totalBilan)}</div>
          <div style={{ color: analysis.bilanGap === 0 ? '#16a34a' : '#dc2626', fontSize: 12 }}>
            Écart : {euros(analysis.bilanGap)}
          </div>
        </div>
      </section>

      <section style={{ ...cardStyle, marginTop: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Contrôle spécifique du bilan</h2>
        <div style={{ display: 'flex', gap: 24, marginTop: 10, flexWrap: 'wrap' }}>
          <div>
            Actif : <b>{euros(analysis.actif)}</b>
          </div>
          <div>
            Passif : <b>{euros(analysis.passif)}</b>
          </div>
          <div style={{ color: analysis.bilanBalanceGap === 0 ? '#16a34a' : '#dc2626' }}>
            Écart actif/passif : <b>{euros(analysis.bilanBalanceGap)}</b>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Anomalies détectées</h2>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setFilter('all')} style={{ padding: 8 }}>
              Toutes
            </button>
            <button onClick={() => setFilter('error')} style={{ padding: 8 }}>
              Erreurs
            </button>
            <button onClick={() => setFilter('warning')} style={{ padding: 8 }}>
              Alertes
            </button>
          </div>
        </div>

        {visibleIssues.length === 0 ? (
          <div style={{ ...cardStyle, marginTop: 12 }}>Aucune anomalie dans ce filtre.</div>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 12, border: '1px solid #e5e7eb', borderRadius: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white' }}>
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  <th style={thStyle}>Niveau</th>
                  <th style={thStyle}>Problème</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Transaction</th>
                  <th style={thStyle}>Montant</th>
                  <th style={thStyle}>Affecté</th>
                  <th style={thStyle}>Détail</th>
                  <th style={thStyle}>Action</th>
                </tr>
              </thead>

              <tbody>
                {visibleIssues.map((issue) => (
                  <tr key={issue.id}>
                    <td style={tdStyle}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '4px 8px',
                          borderRadius: 999,
                          background: issue.level === 'error' ? '#fee2e2' : '#fef3c7',
                          color: issue.level === 'error' ? '#991b1b' : '#92400e',
                          fontWeight: 800,
                        }}
                      >
                        {issue.level === 'error' ? 'Erreur' : 'Alerte'}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <b>{issue.type}</b>
                    </td>
                    <td style={tdStyle}>{issue.txDate}</td>
                    <td style={tdStyle}>{issue.description}</td>
                    <td style={tdStyle}>{euros(issue.amount_cents)}</td>
                    <td style={tdStyle}>{euros(issue.allocated_cents)}</td>
                    <td style={tdStyle}>{issue.details}</td>
                    <td style={tdStyle}>
                      <Link
                        href={`/transactions/${issue.transactionId}/edit`}
                        style={{
                          display: 'inline-block',
                          padding: '8px 10px',
                          borderRadius: 10,
                          background: '#0f172a',
                          color: 'white',
                          textDecoration: 'none',
                          fontWeight: 800,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Corriger
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}