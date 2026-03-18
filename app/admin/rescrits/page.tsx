'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Row = {
  id: string
  status: 'open' | 'fulfilled'
  fulfilled_at: string | null
  transaction_id: string
  transaction: {
    id: string
    tx_date: string
    description: string | null
    amount_cents: number
  } | {
    id: string
    tx_date: string
    description: string | null
    amount_cents: number
  }[] | null
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

function txObj(row: Row): { id: string; tx_date: string; description: string | null; amount_cents: number } | null {
  const t = row.transaction as any
  if (!t) return null
  if (Array.isArray(t)) return t[0] ?? null
  return t ?? null
}

export default function AdminRescritsPage() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

    const { data, error } = await supabase
      .from('rescrit_requests')
      .select('id,status,fulfilled_at,transaction_id,transaction:transactions(id,tx_date,description,amount_cents)')
      .eq('status', 'open')
      .order('created_at', { ascending: true })

    if (error) {
      console.error(error)
      alert('Erreur chargement rescrits')
      setLoading(false)
      return
    }

    setRows((data ?? []) as Row[])
    setLoading(false)
  }

  async function markProvided(id: string) {
    const { error } = await supabase
      .from('rescrit_requests')
      .update({
        status: 'fulfilled',
        fulfilled_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      console.error(error)
      alert('Erreur mise à jour rescrit')
      return
    }

    await load()
  }

  if (loading) {
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Chargement…</main>
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1100 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900 }}>Admin — Rescrits à fournir</h1>

      <div style={{ marginTop: 12, opacity: 0.75 }}>
        Toutes les recettes classées en <b>Don / Dons</b> apparaissent ici automatiquement.
      </div>

      <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
        {rows.map((row) => {
          const tx = txObj(row)
          if (!tx) return null

          return (
            <div
              key={row.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: 12,
                padding: 14,
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 12,
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>
                  {tx.description || 'Sans libellé'}
                </div>

                <div style={{ marginTop: 4, fontSize: 14, opacity: 0.75 }}>
                  {tx.tx_date} — {centsToEuros(tx.amount_cents)} €
                </div>

                <div style={{ marginTop: 8 }}>
                  <a
                    href={`/transactions/${tx.id}/edit`}
                    style={{
                      display: 'inline-block',
                      textDecoration: 'none',
                      border: '1px solid #ddd',
                      borderRadius: 8,
                      padding: '8px 10px',
                      color: 'inherit',
                    }}
                  >
                    Voir / modifier la transaction
                  </a>
                </div>
              </div>

              <button
                onClick={() => markProvided(row.id)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #ddd',
                  cursor: 'pointer',
                }}
              >
                Rescrit fourni
              </button>
            </div>
          )
        })}

        {rows.length === 0 && (
          <div style={{ opacity: 0.7 }}>
            Aucun rescrit à fournir 🎉
          </div>
        )}
      </div>
    </main>
  )
}
