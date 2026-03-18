'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type MissingRow = {
  id: string
  tx_date: string
  description: string | null
  amount_cents: number
  receipt_status: string
  receipt_abandoned: boolean
}

type RequestRow = {
  transaction_id: string
  status: string
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

function formatFrDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

export default function MissingReceiptsPage() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<MissingRow[]>([])
  const [openRequestIds, setOpenRequestIds] = useState<string[]>([])
  const [processingId, setProcessingId] = useState<string | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

    const [
      { data: txData, error: e1 },
      { data: reqData, error: e2 },
    ] = await Promise.all([
      supabase
        .from('transactions')
        .select('id,tx_date,description,amount_cents,receipt_status,receipt_abandoned')
        .eq('kind', 'expense')
        .eq('receipt_status', 'PJ manquante')
        .eq('receipt_abandoned', false)
        .order('tx_date', { ascending: false }),

      supabase
        .from('receipt_requests')
        .select('transaction_id,status')
        .eq('status', 'open'),
    ])

    if (e1 || e2) {
      console.error(e1 || e2)
      alert('Erreur chargement PJ manquantes')
      setLoading(false)
      return
    }

    setRows((txData ?? []) as MissingRow[])
    setOpenRequestIds(
      Array.from(
        new Set(((reqData ?? []) as RequestRow[]).map((r) => r.transaction_id))
      )
    )
    setLoading(false)
  }

  async function requestReceipt(transactionId: string) {
    if (openRequestIds.includes(transactionId)) {
      alert('Une demande PJ est déjà ouverte pour cette transaction.')
      return
    }

    setProcessingId(transactionId)

    try {
      const { error } = await supabase
        .from('receipt_requests')
        .insert({
          transaction_id: transactionId,
          status: 'open',
        })

      if (error) throw error

      alert('✅ Demande PJ créée')
      await load()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur demande PJ : ${e?.message ?? 'inconnue'}`)
    } finally {
      setProcessingId(null)
    }
  }

  async function abandonReceipt(transactionId: string) {
    const ok = confirm("Confirmer l'abandon de PJ ? Cette transaction ne sera plus comptée dans les PJ manquantes.")
    if (!ok) return

    setProcessingId(transactionId)

    try {
      const { error } = await supabase
        .from('transactions')
        .update({ receipt_abandoned: true })
        .eq('id', transactionId)

      if (error) throw error

      alert('✅ PJ abandonnée')
      await load()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur abandon PJ : ${e?.message ?? 'inconnue'}`)
    } finally {
      setProcessingId(null)
    }
  }

  if (loading) {
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Chargement…</main>
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1100 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900 }}>PJ manquantes</h1>

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        {rows.map((row) => {
          const hasOpenRequest = openRequestIds.includes(row.id)

          return (
            <div
              key={row.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: 12,
                padding: 16,
                background: 'white',
                display: 'grid',
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 800 }}>
                {row.description || 'Sans libellé'}
              </div>

              <div style={{ opacity: 0.75 }}>
                {formatFrDate(row.tx_date)} — {centsToEuros(row.amount_cents)} €
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={() => requestReceipt(row.id)}
                  disabled={hasOpenRequest || processingId === row.id}
                  style={{ padding: '10px 12px' }}
                >
                  {hasOpenRequest
                    ? 'Demande déjà envoyée'
                    : processingId === row.id
                    ? 'Traitement…'
                    : 'Demander PJ'}
                </button>

                <button
                  onClick={() => abandonReceipt(row.id)}
                  disabled={processingId === row.id}
                  style={{
                    padding: '10px 12px',
                    border: '1px solid #ddd',
                    borderRadius: 8,
                    background: '#fffaf0',
                  }}
                >
                  Abandon de PJ
                </button>
              </div>
            </div>
          )
        })}

        {rows.length === 0 && (
          <div style={{ opacity: 0.7 }}>Aucune PJ manquante.</div>
        )}
      </div>
    </main>
  )
}
