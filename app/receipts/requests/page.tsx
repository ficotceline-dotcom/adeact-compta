'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type RequestRow = {
  id: string
  transaction_id: string
  message: string | null
  status: 'open' | 'fulfilled' | 'cancelled'
  created_at: string
  fulfilled_at: string | null
}

type Tx = {
  id: string
  tx_date: string
  kind: 'income' | 'expense'
  description: string
  amount_cents: number
  receipt_status: string
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

async function uploadReceipt(txId: string, file: File) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${txId}/${Date.now()}_${safeName}`

  const { error: upErr } = await supabase.storage.from('receipts').upload(path, file, {
    upsert: true,
  })
  if (upErr) throw upErr

  const { error: txErr } = await supabase
    .from('transactions')
    .update({
      receipt_status: 'PJ fournie',
      receipt_path: path,
      receipt_uploaded_at: new Date().toISOString(),
    })
    .eq('id', txId)

  if (txErr) throw txErr

  const { error: reqErr } = await supabase
    .from('receipt_requests')
    .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString() })
    .eq('transaction_id', txId)
    .eq('status', 'open')

  if (reqErr) throw reqErr
}

export default function ReceiptRequestsPage() {
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [txById, setTxById] = useState<Record<string, Tx>>({})
  const [filesByTx, setFilesByTx] = useState<Record<string, File | null>>({})
  const [filter, setFilter] = useState<'open' | 'fulfilled' | 'all'>('open')

  useEffect(() => {
    load()
  }, [filter])

  async function load() {
    setLoading(true)

    let q = supabase.from('receipt_requests').select('*').order('created_at', { ascending: false })
    if (filter !== 'all') q = q.eq('status', filter)

    const { data: reqs, error: reqErr } = await q
    if (reqErr) {
      console.error(reqErr)
      alert('Erreur chargement demandes')
      setLoading(false)
      return
    }

    const list = (reqs ?? []) as RequestRow[]
    setRequests(list)

    const txIds = Array.from(new Set(list.map((r) => r.transaction_id)))
    if (txIds.length === 0) {
      setTxById({})
      setLoading(false)
      return
    }

    const { data: txs, error: txErr } = await supabase
      .from('transactions')
      .select('*')
      .in('id', txIds)

    if (txErr) {
      console.error(txErr)
      alert('Erreur chargement transactions liées')
      setLoading(false)
      return
    }

    const map: Record<string, Tx> = {}
    ;((txs ?? []) as Tx[]).forEach((t) => (map[t.id] = t))
    setTxById(map)

    setLoading(false)
  }

  async function cancelRequest(reqId: string) {
    const { error } = await supabase
      .from('receipt_requests')
      .update({ status: 'cancelled' })
      .eq('id', reqId)

    if (error) {
      console.error(error)
      alert('Erreur annulation')
      return
    }
    await load()
  }

  if (loading) return <main style={{ padding: 24 }}>Chargement…</main>

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1000 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Demandes de justificatifs</h1>

      <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
        <label>
          Filtre:{' '}
          <select value={filter} onChange={(e) => setFilter(e.target.value as any)} style={{ padding: 8 }}>
            <option value="open">Ouvertes</option>
            <option value="fulfilled">Clôturées</option>
            <option value="all">Toutes</option>
          </select>
        </label>
        <button onClick={load} style={{ padding: '10px 12px' }}>
          Rafraîchir
        </button>
      </div>

      {requests.length === 0 && <p style={{ marginTop: 16 }}>Aucune demande.</p>}

      <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        {requests.map((r) => {
          const tx = txById[r.transaction_id]
          return (
            <div key={r.id} style={{ border: '1px solid #ddd', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {tx ? tx.description : 'Transaction inconnue'}
                  </div>
                  <div style={{ fontSize: 14, opacity: 0.7, marginTop: 4 }}>
                    Demande: {new Date(r.created_at).toLocaleString()} — Statut: {r.status}
                  </div>
                  {tx && (
                    <div style={{ fontSize: 14, opacity: 0.8, marginTop: 4 }}>
                      {tx.tx_date} — {tx.kind === 'expense' ? 'Dépense' : 'Recette'} —{' '}
                      {tx.kind === 'expense' ? '-' : '+'}
                      {centsToEuros(tx.amount_cents)} €
                    </div>
                  )}
                  {r.message && (
                    <div style={{ marginTop: 8, padding: 10, background: '#f6f6f6', borderRadius: 8 }}>
                      {r.message}
                    </div>
                  )}
                </div>

                <div style={{ width: 320 }}>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    disabled={r.status !== 'open'}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null
                      setFilesByTx((prev) => ({ ...prev, [r.transaction_id]: file }))
                    }}
                  />

                  <button
                    disabled={r.status !== 'open'}
                    onClick={async () => {
                      const file = filesByTx[r.transaction_id]
                      if (!file) {
                        alert('Choisis un fichier avant.')
                        return
                      }
                      try {
                        await uploadReceipt(r.transaction_id, file)
                        alert('✅ PJ uploadée + demande clôturée')
                        setFilesByTx((prev) => ({ ...prev, [r.transaction_id]: null }))
                        await load()
                      } catch (e: any) {
                        console.error(e)
                        alert(`Erreur upload: ${e?.message ?? 'inconnue'}`)
                      }
                    }}
                    style={{ marginTop: 8, padding: '10px 12px', width: '100%', opacity: r.status === 'open' ? 1 : 0.5 }}
                  >
                    Uploader & clôturer
                  </button>

                 
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}
