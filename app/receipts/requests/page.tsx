'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { compressFile } from '@/lib/compressImage'
import { useUserPermissions } from '@/lib/useUserPermissions'

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

type ReceiptRequest = {
  id: string
  transaction_id: string
  message: string | null
  status: 'open' | 'fulfilled' | 'cancelled'
  created_at: string
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

  const { error: upErr } = await supabase.storage.from('receipts').upload(path, compressed, { upsert: true })
  if (upErr) throw upErr

  const { error: txErr } = await supabase
    .from('transactions')
    .update({ receipt_status: 'PJ fournie', receipt_path: path, receipt_uploaded_at: new Date().toISOString() })
    .eq('id', txId)
  if (txErr) throw txErr

  await supabase
    .from('receipt_requests')
    .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString() })
    .eq('transaction_id', txId)
    .eq('status', 'open')
}

export default function ReceiptRequestsPage() {
  const [loading, setLoading] = useState(true)
  const [txs, setTxs] = useState<Tx[]>([])
  const [reqByTxId, setReqByTxId] = useState<Record<string, ReceiptRequest>>({})
  const [members, setMembers] = useState<Member[]>([])
  const [receiptContacts, setReceiptContacts] = useState<{ id: string; name: string; discord_handle: string | null }[]>([])
  const [filesByTx, setFilesByTx] = useState<Record<string, File | null>>({})
  const [filter, setFilter] = useState<'manquante' | 'abandonnee' | 'all'>('manquante')
  const [filterMemberId, setFilterMemberId] = useState('')
  const [sendingBatch, setSendingBatch] = useState(false)

  const { permissions } = useUserPermissions()
  const isAdmin = permissions.includes('admin_reimbursements')

  // PJ anticipées
  const [pendingReceipts, setPendingReceipts] = useState<PendingReceipt[]>([])
  const [showPreUploadForm, setShowPreUploadForm] = useState(false)
  const [preSubmitterName, setPreSubmitterName] = useState('')
  const [preStoreName, setPreStoreName] = useState('')
  const [preAmountInput, setPreAmountInput] = useState('')
  const [preFile, setPreFile] = useState<File | null>(null)
  const [preSaving, setPreSaving] = useState(false)

  useEffect(() => { load(); loadPendingReceipts() }, [filter])

  async function load() {
    setLoading(true)

    // Statuts à afficher selon le filtre
    const statuts =
      filter === 'manquante'  ? ['PJ manquante'] :
      filter === 'abandonnee' ? ['PJ abandonnée'] :
      ['PJ manquante', 'PJ abandonnée']

    const { data: txData, error: txErr } = await supabase
      .from('transactions')
      .select('id,tx_date,kind,description,amount_cents,receipt_status,member_id,receipt_contact_id')
      .in('receipt_status', statuts)
      .eq('kind', 'expense')
      .order('tx_date', { ascending: false })
      .limit(300)

    if (txErr) { console.error(txErr); alert('Erreur chargement'); setLoading(false); return }

    const list = (txData ?? []) as Tx[]
    setTxs(list)

    // Charger les receipt_requests associées (pour afficher quand la demande a été envoyée)
    if (list.length > 0) {
      const txIds = list.map((t) => t.id)
      const { data: reqs } = await supabase
        .from('receipt_requests')
        .select('id,transaction_id,message,status,created_at')
        .in('transaction_id', txIds)
        .order('created_at', { ascending: false })

      const map: Record<string, ReceiptRequest> = {}
      for (const r of (reqs ?? []) as ReceiptRequest[]) {
        if (!map[r.transaction_id]) map[r.transaction_id] = r // garder la plus récente
      }
      setReqByTxId(map)
    } else {
      setReqByTxId({})
    }

    const [{ data: memberData }, { data: contactData }] = await Promise.all([
      supabase.from('members').select('id,full_name').eq('is_active', true).order('full_name'),
      supabase.from('receipt_contacts').select('id,name,discord_handle').order('ordre'),
    ])
    setMembers((memberData ?? []) as Member[])
    setReceiptContacts((contactData ?? []) as { id: string; name: string; discord_handle: string | null }[])

    setLoading(false)
  }

  async function updateContact(transactionId: string, contactId: string) {
    const value = contactId || null
    await supabase.from('transactions').update({ receipt_contact_id: value }).eq('id', transactionId)
    setTxs((prev) => prev.map((t) => t.id === transactionId ? { ...t, receipt_contact_id: value } : t))
  }

  async function abandonner(txId: string) {
    const motif = window.prompt('Motif de l\'abandon (obligatoire) :')
    if (!motif?.trim()) return

    await supabase.from('transactions').update({ receipt_status: 'PJ abandonnée' }).eq('id', txId)
    await supabase
      .from('receipt_requests')
      .update({ status: 'cancelled', message: `[Abandonné] ${motif.trim()}` })
      .eq('transaction_id', txId)
      .eq('status', 'open')

    await load()
  }

  async function sendBatchNotifications() {
    const webhookUrl = process.env.NEXT_PUBLIC_DISCORD_RECEIPT_WEBHOOK_URL
      || process.env.NEXT_PUBLIC_DISCORD_WEBHOOK_URL
    if (!webhookUrl) { alert('Aucun webhook Discord configuré.'); return }

    const avecContact = txs.filter((t) => t.receipt_status === 'PJ manquante' && t.receipt_contact_id)
    if (avecContact.length === 0) { alert('Aucune transaction avec un contact renseigné.'); return }

    setSendingBatch(true)
    let sent = 0

    const contactMap = new Map(receiptContacts.map((c) => [c.id, c]))

    for (const tx of avecContact) {
      const contact = tx.receipt_contact_id ? contactMap.get(tx.receipt_contact_id) : null
      if (!contact) continue

      const mention = contact.discord_handle ?? `**${contact.name}**`
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
      setPreSubmitterName(''); setPreStoreName(''); setPreAmountInput(''); setPreFile(null)
      setShowPreUploadForm(false)
      loadPendingReceipts()
    } catch (e: any) {
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
    return id ? (members.find((m) => m.id === id)?.full_name ?? null) : null
  }

  const filteredTxs = filterMemberId
    ? txs.filter((t) => t.member_id === filterMemberId)
    : txs

  if (loading) return <main style={{ padding: 24 }}>Chargement…</main>

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1000 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Demandes de justificatifs</h1>

      {/* ── Section : Déposer une PJ à l'avance ── */}
      <div style={{
        marginTop: 20, border: '1px solid #e0e7ff', borderLeft: '4px solid #6366f1',
        borderRadius: 10, padding: 16, background: '#f5f3ff',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#4338ca' }}>📎 Déposer un justificatif à l'avance</div>
            <div style={{ fontSize: 13, color: '#6366f1', marginTop: 2 }}>Tu as une facture mais la dépense n'a pas encore été saisie ? Dépose-la ici.</div>
          </div>
          <button onClick={() => setShowPreUploadForm((v) => !v)} style={{
            padding: '8px 14px', borderRadius: 8, border: '1px solid #6366f1',
            background: 'white', color: '#4338ca', fontWeight: 700, cursor: 'pointer', fontSize: 13,
          }}>
            {showPreUploadForm ? 'Fermer' : '+ Nouveau dépôt'}
          </button>
        </div>

        {showPreUploadForm && (
          <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
            {[
              { label: 'Ton prénom et nom *', val: preSubmitterName, set: setPreSubmitterName, placeholder: 'Ex : Marie Dupont' },
              { label: 'Magasin / fournisseur *', val: preStoreName, set: setPreStoreName, placeholder: 'Ex : Cultura, Amazon…' },
            ].map(({ label, val, set, placeholder }) => (
              <label key={label} style={{ fontSize: 13 }}>
                {label}
                <input value={val} onChange={(e) => set(e.target.value)} placeholder={placeholder}
                  style={{ display: 'block', width: '100%', padding: 8, marginTop: 4, borderRadius: 6, border: '1px solid #c7d2fe' }} />
              </label>
            ))}
            <label style={{ fontSize: 13 }}>
              Montant de la dépense (€) *
              <input value={preAmountInput} onChange={(e) => setPreAmountInput(e.target.value)} placeholder="Ex : 24,90"
                style={{ display: 'block', width: 160, padding: 8, marginTop: 4, borderRadius: 6, border: '1px solid #c7d2fe' }} />
            </label>
            <label style={{ fontSize: 13 }}>
              Fichier justificatif (PDF, image) *
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setPreFile(e.target.files?.[0] ?? null)}
                style={{ display: 'block', marginTop: 4 }} />
            </label>
            <button onClick={submitPreUpload} disabled={preSaving}
              style={{ padding: '10px 16px', width: 200, borderRadius: 8, border: 'none', background: '#6366f1', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
              {preSaving ? 'Dépôt…' : 'Déposer le justificatif'}
            </button>
          </div>
        )}

        {pendingReceipts.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#4338ca', marginBottom: 6 }}>
              {pendingReceipts.length} justificatif(s) en attente de liaison :
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {pendingReceipts.map((pr) => (
                <div key={pr.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: 'white', border: '1px solid #c7d2fe', borderRadius: 8, padding: '8px 12px', fontSize: 13,
                }}>
                  <span>
                    <b>{pr.submitter_name}</b> — {pr.store_name} — <b>{centsToEuros(pr.amount_cents)} €</b>{' '}
                    <span style={{ color: '#9ca3af' }}>({new Date(pr.created_at).toLocaleDateString('fr-FR')})</span>
                  </span>
                  <button onClick={() => deletePendingReceipt(pr.id, pr.file_path)}
                    style={{ marginLeft: 12, color: '#c8202e', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12 }}>
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
            <option value="manquante">PJ manquantes</option>
            <option value="abandonnee">PJ abandonnées</option>
            <option value="all">Toutes</option>
          </select>
        </label>
        <label>
          Membre:{' '}
          <select value={filterMemberId} onChange={(e) => setFilterMemberId(e.target.value)} style={{ padding: 8 }}>
            <option value="">Tous</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </label>
        <button onClick={load} style={{ padding: '10px 12px' }}>Rafraîchir</button>
        {filter !== 'abandonnee' && (
          <button onClick={sendBatchNotifications} disabled={sendingBatch}
            style={{ padding: '10px 14px', background: '#5865f2', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
            {sendingBatch ? 'Envoi…' : '🔔 Relancer tout sur Discord'}
          </button>
        )}
      </div>

      <div style={{ marginTop: 8, fontSize: 13, color: '#64748b' }}>
        {filteredTxs.length} transaction(s)
      </div>

      {filteredTxs.length === 0 && <p style={{ marginTop: 16 }}>Aucune transaction.</p>}

      <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
        {filteredTxs.map((tx) => {
          const req = reqByTxId[tx.id]
          const isAbandonne = tx.receipt_status === 'PJ abandonnée'

          return (
            <div key={tx.id} style={{
              border: `1px solid ${isAbandonne ? '#fca5a5' : '#ddd'}`,
              borderLeft: `4px solid ${isAbandonne ? '#dc2626' : '#f59e0b'}`,
              borderRadius: 10, padding: 12,
              background: isAbandonne ? '#fff7f7' : 'white',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{tx.description}</div>

                  <div style={{ fontSize: 13, color: '#374151', marginTop: 4 }}>
                    {tx.tx_date} · {(Math.abs(tx.amount_cents) / 100).toFixed(2).replace('.', ',')} €
                    {isAbandonne && <span style={{ marginLeft: 8, color: '#dc2626', fontWeight: 600 }}>🚫 Abandonnée</span>}
                  </div>

                  {tx.member_id && (
                    <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>👤 {memberName(tx.member_id)}</div>
                  )}

                  {receiptContacts.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#555' }}>📄 Contact :</span>
                      <select
                        value={tx.receipt_contact_id ?? ''}
                        onChange={(e) => updateContact(tx.id, e.target.value)}
                        style={{ fontSize: 13, padding: '3px 6px', borderRadius: 6, border: '1px solid #d1d5db' }}
                      >
                        <option value="">— Aucun —</option>
                        {receiptContacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  )}

                  {req && (
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                      Demande envoyée le {new Date(req.created_at).toLocaleDateString('fr-FR')}
                    </div>
                  )}

                  {/* Motif d'abandon */}
                  {req?.message?.startsWith('[Abandonné]') && (
                    <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 6, background: '#fef2f2', color: '#991b1b', fontSize: 13 }}>
                      🚫 {req.message.replace('[Abandonné] ', '')}
                    </div>
                  )}
                </div>

                {/* Actions */}
                {!isAbandonne && (
                  <div style={{ width: 300, flexShrink: 0 }}>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null
                        setFilesByTx((prev) => ({ ...prev, [tx.id]: file }))
                      }}
                    />
                    <button
                      onClick={async () => {
                        const file = filesByTx[tx.id]
                        if (!file) { alert('Choisis un fichier avant.'); return }
                        try {
                          await uploadReceipt(tx.id, file)
                          alert('✅ PJ uploadée !')
                          setFilesByTx((prev) => ({ ...prev, [tx.id]: null }))
                          await load()
                        } catch (e: any) {
                          alert(`Erreur upload: ${e?.message ?? 'inconnue'}`)
                        }
                      }}
                      style={{ marginTop: 8, padding: '10px 12px', width: '100%' }}
                    >
                      Uploader & clôturer
                    </button>

                    {isAdmin && (
                      <button
                        onClick={() => abandonner(tx.id)}
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
                )}
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}
