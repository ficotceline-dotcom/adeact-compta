'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { compressFile } from '@/lib/compressImage'
import { useUserPermissions } from '@/lib/useUserPermissions'

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
  member_id: string | null
  receipt_contact_id: string | null
}

type Member = {
  id: string
  full_name: string
}

type PendingReceipt = {
  id: string
  submitter_name: string
  store_name: string
  amount_cents: number
  file_path: string
  created_at: string
  linked_transaction_id: string | null
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

function eurosToCents(value: string): number {
  const normalized = value.replace(',', '.').trim()
  if (!normalized) return 0
  const num = Number(normalized)
  if (!Number.isFinite(num)) return 0
  return Math.round(num * 100)
}

async function uploadReceipt(txId: string, file: File) {
  const compressed = await compressFile(file)
  const safeName = compressed.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${txId}/${Date.now()}_${safeName}`

  const { error: upErr } = await supabase.storage.from('receipts').upload(path, compressed, {
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
  const [members, setMembers] = useState<Member[]>([])
  const [filesByTx, setFilesByTx] = useState<Record<string, File | null>>({})
  const [filter, setFilter] = useState<'open' | 'fulfilled' | 'all'>('open')
  const [filterMemberId, setFilterMemberId] = useState('')

  const { permissions } = useUserPermissions()
  const isAdmin = permissions.includes('admin_reimbursements')

  const [sendingBatch, setSendingBatch] = useState(false)
  const [receiptContacts, setReceiptContacts] = useState<{ id: string; name: string; discord_handle: string | null }[]>([])

  // PJ anticipées
  const [pendingReceipts, setPendingReceipts] = useState<PendingReceipt[]>([])
  const [showPreUploadForm, setShowPreUploadForm] = useState(false)
  const [preSubmitterName, setPreSubmitterName] = useState('')
  const [preStoreName, setPreStoreName] = useState('')
  const [preAmountInput, setPreAmountInput] = useState('')
  const [preFile, setPreFile] = useState<File | null>(null)
  const [preSaving, setPreSaving] = useState(false)

  useEffect(() => {
    load()
    loadPendingReceipts()
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

    const { data: memberData } = await supabase
      .from('members')
      .select('id,full_name')
      .eq('is_active', true)
      .order('full_name')
    setMembers((memberData ?? []) as Member[])

    const { data: contactData } = await supabase
      .from('receipt_contacts')
      .select('id,name,discord_handle')
      .order('ordre')
    setReceiptContacts((contactData ?? []) as { id: string; name: string; discord_handle: string | null }[])

    setLoading(false)
  }

  async function sendBatchNotifications() {
    const webhookUrl = process.env.NEXT_PUBLIC_DISCORD_RECEIPT_WEBHOOK_URL
      || process.env.NEXT_PUBLIC_DISCORD_WEBHOOK_URL
    if (!webhookUrl) { alert('Aucun webhook Discord configuré.'); return }

    const openRequests = requests.filter((r) => r.status === 'open')
    if (openRequests.length === 0) { alert('Aucune demande ouverte à notifier.'); return }

    setSendingBatch(true)
    let sent = 0

    // Charger les contacts pour les @mentions
    const { data: contacts } = await supabase
      .from('receipt_contacts')
      .select('id,name,discord_handle')
    const contactMap = new Map((contacts ?? []).map((c: any) => [c.id, c]))

    for (const req of openRequests) {
      const tx = txById[req.transaction_id]
      if (!tx) continue

      // Skipped si aucun contact renseigné
      const contact = tx.receipt_contact_id ? contactMap.get(tx.receipt_contact_id) : null
      if (!contact) continue

      const mention = contact?.discord_handle
        ? contact.discord_handle
        : contact?.name
        ? `**${contact.name}**`
        : '**@concerné(e)**'

      const montant = (Math.abs(tx.amount_cents) / 100).toFixed(2).replace('.', ',')
      const txUrl = `${window.location.origin}/receipts/requests`

      const message = [
        `📄 Facture en attente — ${mention}`,
        ``,
        `**${tx.description}** · ${tx.tx_date} · ${montant} €`,
        `👉 ${txUrl}`,
        ``,
        `Mets un ✅ sur ce message quand tu l'as uploadée, merci !`,
      ].join('\n')

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: message }),
      }).catch(() => {})
      sent++
      // Petite pause pour ne pas saturer Discord
      await new Promise((r) => setTimeout(r, 500))
    }

    setSendingBatch(false)
    alert(`${sent} notification(s) envoyée(s) sur Discord.`)
  }

  async function loadPendingReceipts() {
    const { data, error } = await supabase
      .from('pending_receipts')
      .select('*')
      .is('linked_transaction_id', null)
      .order('created_at', { ascending: false })

    if (!error) setPendingReceipts((data ?? []) as PendingReceipt[])
  }

  async function submitPreUpload() {
    if (!preSubmitterName.trim()) { alert('Merci d\'indiquer ton prénom et nom.'); return }
    if (!preStoreName.trim()) { alert('Merci d\'indiquer le magasin / fournisseur.'); return }
    const amountCents = eurosToCents(preAmountInput)
    if (amountCents <= 0) { alert('Merci d\'indiquer un montant valide.'); return }
    if (!preFile) { alert('Merci de sélectionner un fichier.'); return }

    setPreSaving(true)
    try {
      const compressedPre = await compressFile(preFile)
      const safeName = compressedPre.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `pending/${Date.now()}_${safeName}`

      const { error: upErr } = await supabase.storage.from('receipts').upload(path, compressedPre, { upsert: true })
      if (upErr) throw upErr

      const { error: insertErr } = await supabase.from('pending_receipts').insert({
        submitter_name: preSubmitterName.trim(),
        store_name: preStoreName.trim(),
        amount_cents: amountCents,
        file_path: path,
      })
      if (insertErr) throw insertErr

      alert('✅ Justificatif déposé ! Il sera proposé lors de la saisie de la dépense correspondante.')
      setPreSubmitterName('')
      setPreStoreName('')
      setPreAmountInput('')
      setPreFile(null)
      setShowPreUploadForm(false)
      loadPendingReceipts()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur : ${e?.message ?? 'inconnue'}`)
    } finally {
      setPreSaving(false)
    }
  }

  async function deletePendingReceipt(id: string, filePath: string) {
    if (!confirm('Supprimer ce justificatif en attente ?')) return
    await supabase.storage.from('receipts').remove([filePath])
    await supabase.from('pending_receipts').delete().eq('id', id)
    loadPendingReceipts()
  }

  function memberName(id: string | null) {
    if (!id) return null
    return members.find((m) => m.id === id)?.full_name ?? null
  }

  const filteredRequests = filterMemberId
    ? requests.filter((r) => txById[r.transaction_id]?.member_id === filterMemberId)
    : requests

  async function updateContact(transactionId: string, contactId: string) {
    const value = contactId || null
    const { error } = await supabase
      .from('transactions')
      .update({ receipt_contact_id: value })
      .eq('id', transactionId)
    if (error) { console.error(error); return }
    setTxById((prev) => ({
      ...prev,
      [transactionId]: { ...prev[transactionId], receipt_contact_id: value },
    }))
  }

  async function cancelRequest(reqId: string, transactionId: string) {
    const motif = window.prompt('Motif de l\'abandon (obligatoire) :')
    if (!motif?.trim()) return

    const { error } = await supabase
      .from('receipt_requests')
      .update({ status: 'cancelled', message: `[Abandonné] ${motif.trim()}` })
      .eq('id', reqId)

    if (error) { console.error(error); alert('Erreur annulation'); return }

    await supabase
      .from('transactions')
      .update({ receipt_status: 'PJ abandonnée' })
      .eq('id', transactionId)

    await load()
  }

  if (loading) return <main style={{ padding: 24 }}>Chargement…</main>

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1000 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Demandes de justificatifs</h1>

      {/* ── Section : Déposer une PJ à l'avance ── */}
      <div style={{
        marginTop: 20,
        border: '1px solid #e0e7ff',
        borderLeft: '4px solid #6366f1',
        borderRadius: 10,
        padding: 16,
        background: '#f5f3ff',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#4338ca' }}>
              📎 Déposer un justificatif à l'avance
            </div>
            <div style={{ fontSize: 13, color: '#6366f1', marginTop: 2 }}>
              Tu as une facture mais la dépense n'a pas encore été saisie ? Dépose-la ici.
            </div>
          </div>
          <button
            onClick={() => setShowPreUploadForm((v) => !v)}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #6366f1',
              background: 'white',
              color: '#4338ca',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {showPreUploadForm ? 'Fermer' : '+ Nouveau dépôt'}
          </button>
        </div>

        {showPreUploadForm && (
          <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
            <label style={{ fontSize: 13 }}>
              Ton prénom et nom *
              <input
                value={preSubmitterName}
                onChange={(e) => setPreSubmitterName(e.target.value)}
                placeholder="Ex : Marie Dupont"
                style={{ display: 'block', width: '100%', padding: 8, marginTop: 4, borderRadius: 6, border: '1px solid #c7d2fe' }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              Magasin / fournisseur *
              <input
                value={preStoreName}
                onChange={(e) => setPreStoreName(e.target.value)}
                placeholder="Ex : Cultura, Amazon, Brico Dépôt…"
                style={{ display: 'block', width: '100%', padding: 8, marginTop: 4, borderRadius: 6, border: '1px solid #c7d2fe' }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              Montant de la dépense (€) *
              <input
                value={preAmountInput}
                onChange={(e) => setPreAmountInput(e.target.value)}
                placeholder="Ex : 24,90"
                style={{ display: 'block', width: 160, padding: 8, marginTop: 4, borderRadius: 6, border: '1px solid #c7d2fe' }}
              />
            </label>
            <label style={{ fontSize: 13 }}>
              Fichier justificatif (PDF, image) *
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(e) => setPreFile(e.target.files?.[0] ?? null)}
                style={{ display: 'block', marginTop: 4 }}
              />
            </label>
            <button
              onClick={submitPreUpload}
              disabled={preSaving}
              style={{
                padding: '10px 16px',
                width: 200,
                borderRadius: 8,
                border: 'none',
                background: '#6366f1',
                color: 'white',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {preSaving ? 'Dépôt…' : 'Déposer le justificatif'}
            </button>
          </div>
        )}

        {/* PJ en attente non liées */}
        {pendingReceipts.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#4338ca', marginBottom: 6 }}>
              {pendingReceipts.length} justificatif(s) en attente de liaison :
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {pendingReceipts.map((pr) => (
                <div key={pr.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'white',
                  border: '1px solid #c7d2fe',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 13,
                }}>
                  <span>
                    <b>{pr.submitter_name}</b> — {pr.store_name} —{' '}
                    <b>{centsToEuros(pr.amount_cents)} €</b>{' '}
                    <span style={{ color: '#9ca3af' }}>
                      ({new Date(pr.created_at).toLocaleDateString('fr-FR')})
                    </span>
                  </span>
                  <button
                    onClick={() => deletePendingReceipt(pr.id, pr.file_path)}
                    style={{ marginLeft: 12, color: '#c8202e', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12 }}
                  >
                    Supprimer
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Filtres ── */}
      <div style={{ display: 'flex', gap: 10, marginTop: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          Statut:{' '}
          <select value={filter} onChange={(e) => setFilter(e.target.value as any)} style={{ padding: 8 }}>
            <option value="open">Ouvertes</option>
            <option value="fulfilled">Clôturées</option>
            <option value="all">Toutes</option>
          </select>
        </label>
        <label>
          Membre:{' '}
          <select value={filterMemberId} onChange={(e) => setFilterMemberId(e.target.value)} style={{ padding: 8 }}>
            <option value="">Tous</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.full_name}</option>
            ))}
          </select>
        </label>
        <button onClick={load} style={{ padding: '10px 12px' }}>
          Rafraîchir
        </button>
        <button
          onClick={sendBatchNotifications}
          disabled={sendingBatch}
          style={{ padding: '10px 14px', background: '#5865f2', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
        >
          {sendingBatch ? 'Envoi…' : '🔔 Relancer tout sur Discord'}
        </button>
      </div>

      {filteredRequests.length === 0 && <p style={{ marginTop: 16 }}>Aucune demande.</p>}

      <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        {filteredRequests.map((r) => {
          const tx = txById[r.transaction_id]
          return (
            <div key={r.id} style={{ border: '1px solid #ddd', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {tx ? tx.description : 'Transaction inconnue'}
                  </div>
                  {tx?.member_id && (
                    <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
                      👤 {memberName(tx.member_id)}
                    </div>
                  )}
                  {tx && receiptContacts.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#555' }}>📄 Contact facture :</span>
                      <select
                        value={tx.receipt_contact_id ?? ''}
                        onChange={(e) => updateContact(tx.id, e.target.value)}
                        style={{ fontSize: 13, padding: '3px 6px', borderRadius: 6, border: '1px solid #d1d5db' }}
                      >
                        <option value="">— Aucun —</option>
                        {receiptContacts.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div style={{ fontSize: 14, opacity: 0.7, marginTop: 4 }}>
                    Demande: {new Date(r.created_at).toLocaleString()} - Statut: {r.status}
                  </div>
                  {tx && (
                    <div style={{ fontSize: 14, opacity: 0.8, marginTop: 4 }}>
                      {tx.tx_date} - {tx.kind === 'expense' ? 'Dépense' : 'Recette'} -{' '}
                      {tx.kind === 'expense' ? '-' : '+'}
                      {centsToEuros(tx.amount_cents)} €
                    </div>
                  )}
                  {r.message && (
                    <div style={{
                      marginTop: 8, padding: 10, borderRadius: 8,
                      background: r.message.startsWith('[Abandonné]') ? '#fef2f2' : '#f6f6f6',
                      color: r.message.startsWith('[Abandonné]') ? '#991b1b' : undefined,
                      fontSize: 13,
                    }}>
                      {r.message.startsWith('[Abandonné]')
                        ? `🚫 ${r.message.replace('[Abandonné] ', '')}`
                        : r.message}
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

                  {isAdmin && r.status === 'open' && (
                    <button
                      onClick={() => cancelRequest(r.id, r.transaction_id)}
                      style={{
                        marginTop: 6, padding: '8px 12px', width: '100%',
                        background: 'white', border: '1px solid #dc2626',
                        color: '#dc2626', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                      }}
                    >
                      🚫 Abandonner la demande
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}
