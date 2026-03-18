'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type TaxReceipt = {
  id: string
  receipt_number: string
  donation_date: string
  donor_name: string
  donor_address: string | null
  amount_cents: number
  donation_form: string
  donation_nature: string
  status: string
  linked_transaction_id: string | null
  created_at: string
}

type CandidateTransaction = {
  id: string
  tx_date: string
  description: string
  amount_cents: number
}

function eurosToCents(value: string) {
  const n = Number(value.replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

function formatFrDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

async function getNextReceiptNumber(date: string) {
  const yyyy = date.slice(0, 4)
  const prefix = `${yyyy}-ADEACT-`

  const { data, error } = await supabase
    .from('tax_receipts')
    .select('receipt_number')
    .like('receipt_number', `${prefix}%`)
    .order('receipt_number', { ascending: false })
    .limit(1)

  if (error) throw error

  const last = data && data.length > 0 ? data[0].receipt_number : null
  const next = last ? Number(last.slice(-2)) + 1 : 1
  return `${prefix}${String(next).padStart(2, '0')}`
}

export default function TaxReceiptsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const [rows, setRows] = useState<TaxReceipt[]>([])
  const [donationDate, setDonationDate] = useState(new Date().toISOString().slice(0, 10))
  const [donorName, setDonorName] = useState('')
  const [donorAddress, setDonorAddress] = useState('')
  const [amountInput, setAmountInput] = useState('')
  const [donationForm, setDonationForm] = useState('Virement bancaire')
  const [donationNature, setDonationNature] = useState('Aide aux projets de l’association')
  const [candidateTransactionsByReceipt, setCandidateTransactionsByReceipt] = useState<Record<string, CandidateTransaction[]>>({})

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

    const { data, error } = await supabase
      .from('tax_receipts')
      .select('*')
      .order('donation_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      alert('Erreur chargement rescrits')
      setLoading(false)
      return
    }

    setRows((data ?? []) as TaxReceipt[])
    setLoading(false)
  }

  async function createReceipt() {
    const amount = eurosToCents(amountInput)

    if (!donorName.trim()) {
      alert('Merci de renseigner le donateur.')
      return
    }

    if (amount <= 0) {
      alert('Merci de renseigner un montant valide.')
      return
    }

    setSaving(true)

    try {
      const receiptNumber = await getNextReceiptNumber(donationDate)

      const { error } = await supabase
        .from('tax_receipts')
        .insert({
          receipt_number: receiptNumber,
          donation_date: donationDate,
          donor_name: donorName.trim(),
          donor_address: donorAddress.trim() || null,
          amount_cents: amount,
          donation_form: donationForm.trim() || 'Virement bancaire',
          donation_nature: donationNature.trim() || 'Aide aux projets de l’association',
          status: 'issued',
        })

      if (error) throw error

      alert('✅ Rescrit créé')

      setDonationDate(new Date().toISOString().slice(0, 10))
      setDonorName('')
      setDonorAddress('')
      setAmountInput('')
      setDonationForm('Virement bancaire')
      setDonationNature('Aide aux projets de l’association')

      await load()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur création rescrit : ${e?.message ?? 'inconnue'}`)
    } finally {
      setSaving(false)
    }
  }

  async function searchMatchingTransactions(row: TaxReceipt) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id,tx_date,description,amount_cents')
      .eq('kind', 'income')
      .eq('amount_cents', row.amount_cents)
      .order('tx_date', { ascending: false })

    if (error) {
      console.error(error)
      alert('Erreur recherche transactions')
      return
    }

    setCandidateTransactionsByReceipt((prev) => ({
      ...prev,
      [row.id]: (data ?? []) as CandidateTransaction[],
    }))
  }

  async function linkTransaction(row: TaxReceipt, tx: CandidateTransaction) {
    setProcessingId(row.id)

    try {
      const { error } = await supabase
        .from('tax_receipts')
        .update({ linked_transaction_id: tx.id })
        .eq('id', row.id)

      if (error) throw error

      alert('✅ Transaction associée')
      await load()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur association transaction : ${e?.message ?? 'inconnue'}`)
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1200 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900 }}>Admin — Rescrits</h1>

      <section style={{ marginTop: 20, border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Créer un rescrit</h2>

        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <label>
            Date du don
            <input
              type="date"
              value={donationDate}
              onChange={(e) => setDonationDate(e.target.value)}
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
            />
          </label>

          <label>
            Donateur
            <input
              value={donorName}
              onChange={(e) => setDonorName(e.target.value)}
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
            />
          </label>

          <label>
            Adresse du donateur
            <textarea
              value={donorAddress}
              onChange={(e) => setDonorAddress(e.target.value)}
              rows={4}
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
            />
          </label>

          <label>
            Montant
            <input
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="Ex: 1000"
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
            />
          </label>

          <label>
            Forme du don
            <input
              value={donationForm}
              onChange={(e) => setDonationForm(e.target.value)}
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
            />
          </label>

          <label>
            Nature du don
            <input
              value={donationNature}
              onChange={(e) => setDonationNature(e.target.value)}
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
            />
          </label>

          <button onClick={createReceipt} disabled={saving} style={{ width: 220, padding: '12px 16px' }}>
            {saving ? 'Création…' : 'Créer le rescrit'}
          </button>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Tableau des rescrits</h2>

        {loading ? (
          <div style={{ marginTop: 12 }}>Chargement…</div>
        ) : (
          <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
            {rows.map((row) => {
              const candidates = candidateTransactionsByReceipt[row.id] ?? []

              return (
                <div
                  key={row.id}
                  style={{
                    border: '1px solid #ddd',
                    borderRadius: 12,
                    padding: 16,
                    background: 'white',
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 18 }}>{row.receipt_number}</div>
                      <div style={{ marginTop: 4, opacity: 0.75 }}>
                        {formatFrDate(row.donation_date)} — {row.donor_name}
                      </div>
                      <div style={{ marginTop: 6 }}>
                        Montant : <b>{centsToEuros(row.amount_cents)} €</b>
                      </div>
                      <div style={{ marginTop: 6 }}>
                        Transaction liée : <b>{row.linked_transaction_id ? 'Oui' : 'Non'}</b>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: 8, minWidth: 220 }}>
                      <a
                        href={`/admin/facturation/rescrits/${row.id}`}
                        style={{
                          textDecoration: 'none',
                          border: '1px solid #ddd',
                          borderRadius: 8,
                          padding: '8px 10px',
                          textAlign: 'center',
                          color: 'inherit',
                        }}
                      >
                        Voir / PDF
                      </a>

                      <button onClick={() => searchMatchingTransactions(row)}>
                        Rechercher une transaction associée
                      </button>
                    </div>
                  </div>

                  {candidates.length > 0 && (
                    <div style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 12 }}>
                      <div style={{ fontWeight: 700, marginBottom: 8 }}>
                        Transactions recette avec le même montant
                      </div>

                      <div style={{ display: 'grid', gap: 8 }}>
                        {candidates.map((tx) => (
                          <div
                            key={tx.id}
                            style={{
                              border: '1px solid #eee',
                              borderRadius: 8,
                              padding: 10,
                              display: 'grid',
                              gridTemplateColumns: '1fr auto',
                              gap: 10,
                              alignItems: 'center',
                            }}
                          >
                            <div>
                              {formatFrDate(tx.tx_date)} — {tx.description} — <b>{centsToEuros(tx.amount_cents)} €</b>
                            </div>

                            <button
                              onClick={() => linkTransaction(row, tx)}
                              disabled={processingId === row.id}
                            >
                              Associer cette transaction
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {rows.length === 0 && (
              <div style={{ opacity: 0.7 }}>Aucun rescrit pour le moment.</div>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
