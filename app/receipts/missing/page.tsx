'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type MissingRow = {
  id: string
  tx_date: string
  description: string | null
  amount_cents: number
  receipt_status: string
  receipt_abandoned: boolean
  member_id: string | null
}

type RequestRow = {
  transaction_id: string
  status: string
}

type Member = {
  id: string
  full_name: string
}

const DISCORD_WEBHOOK = 'https://discord.com/api/webhooks/1533772402725621892/v1FlGgeJIbLvVny2y5e1jKhr_okuXc31l9sBxFozghPvqvHL5IO-IroquS2OApEPA8aT'


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
  const [members, setMembers] = useState<Member[]>([])
  const [openRequestIds, setOpenRequestIds] = useState<string[]>([])
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [filterMemberId, setFilterMemberId] = useState('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

    const [
      { data: txData, error: e1 },
      { data: reqData, error: e2 },
      { data: memberData, error: e3 },
    ] = await Promise.all([
      supabase
        .from('transactions')
        .select('id,tx_date,description,amount_cents,receipt_status,receipt_abandoned,member_id')
        .eq('kind', 'expense')
        .eq('receipt_status', 'PJ manquante')
        .eq('receipt_abandoned', false)
        .order('tx_date', { ascending: false }),

      supabase
        .from('receipt_requests')
        .select('transaction_id,status')
        .eq('status', 'open'),

      supabase
        .from('members')
        .select('id,full_name')
        .eq('is_active', true)
        .order('full_name'),
    ])

    if (e1 || e2 || e3) {
      console.error(e1 || e2 || e3)
      alert('Erreur chargement PJ manquantes')
      setLoading(false)
      return
    }

    setRows((txData ?? []) as MissingRow[])
    setMembers((memberData ?? []) as Member[])
    setOpenRequestIds(
      Array.from(
        new Set(((reqData ?? []) as RequestRow[]).map((r) => r.transaction_id))
      )
    )
    setLoading(false)
  }

  const filteredRows = useMemo(() => {
    if (!filterMemberId) return rows
    return rows.filter((r) => r.member_id === filterMemberId)
  }, [rows, filterMemberId])

  function memberName(id: string | null) {
    if (!id) return null
    return members.find((m) => m.id === id)?.full_name ?? null
  }

  async function sendDiscordNotification(row: MissingRow, name: string | null) {
    const txUrl = `${window.location.origin}/transactions/${row.id}/edit`
    const prenom = name ?? 'à la personne concernée'
    const montant = centsToEuros(row.amount_cents)
    const date = formatFrDate(row.tx_date)
    const libelle = row.description || 'Sans libellé'

    const message = [
      `Bonjour **${prenom}**,`,
      ``,
      `Peux-tu ajouter le justificatif correspondant à cette transaction stp ?`,
      ``,
      `📄 **${libelle}** — ${date} — ${montant} €`,
      `🔗 ${txUrl}`,
    ].join('\n')

    await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    })
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

      const row = rows.find((r) => r.id === transactionId)!
      const name = memberName(row.member_id)
      await sendDiscordNotification(row, name)

      alert('✅ Demande PJ créée + message Discord envoyé')
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

      <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>
          Filtrer par membre :{' '}
          <select
            value={filterMemberId}
            onChange={(e) => setFilterMemberId(e.target.value)}
            style={{ padding: 8, marginLeft: 6 }}
          >
            <option value="">Tous</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
        </label>
        <button onClick={load} style={{ padding: '8px 12px' }}>Rafraîchir</button>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        {filteredRows.map((row) => {
          const hasOpenRequest = openRequestIds.includes(row.id)
          const name = memberName(row.member_id)

          return (
            <div
              key={row.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: 12,
                padding: 16,
                background: 'white',
                display: 'grid',
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 800 }}>
                {row.description || 'Sans libellé'}
              </div>

              <div style={{ opacity: 0.75, fontSize: 14 }}>
                {formatFrDate(row.tx_date)} — {centsToEuros(row.amount_cents)} €
              </div>

              {name && (
                <div style={{ fontSize: 13, color: '#555' }}>
                  👤 {name}
                </div>
              )}

              {hasOpenRequest && (
                <div style={{ fontSize: 13, color: '#f59e0b', fontWeight: 600 }}>
                  ⏳ Demande PJ déjà envoyée
                </div>
              )}

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

        {filteredRows.length === 0 && (
          <div style={{ opacity: 0.7 }}>Aucune PJ manquante{filterMemberId ? ' pour ce membre' : ''}.</div>
        )}
      </div>
    </main>
  )
}
