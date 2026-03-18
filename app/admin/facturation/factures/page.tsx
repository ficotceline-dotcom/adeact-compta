'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Invoice = {
  id: string
  invoice_number: string
  invoice_date: string
  customer_name: string
  customer_address: string | null
  subject: string | null
  status: string
  total_ttc_cents: number
  linked_transaction_id: string | null
  paid_at: string | null
  paid_manually: boolean
  created_at: string
}

type InvoiceLineDraft = {
  localId: string
  label: string
  quantity: string
  unitPriceTTC: string
}

type CandidateTransaction = {
  id: string
  tx_date: string
  description: string
  amount_cents: number
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function eurosToCents(value: string) {
  const n = Number(value.replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

function quantityToNumber(value: string) {
  const n = Number(value.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

function formatFrDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

async function getNextInvoiceNumber(date: string) {
  const yyyy = date.slice(0, 4)
  const mm = date.slice(5, 7)
  const prefix = `FAC-${yyyy}-${mm}-`

  const { data, error } = await supabase
    .from('invoices')
    .select('invoice_number')
    .like('invoice_number', `${prefix}%`)
    .order('invoice_number', { ascending: false })
    .limit(1)

  if (error) throw error

  const last = data && data.length > 0 ? data[0].invoice_number : null
  const next = last ? Number(last.slice(-2)) + 1 : 1
  return `${prefix}${String(next).padStart(2, '0')}`
}

export default function InvoicesPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10))
  const [customerName, setCustomerName] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [subject, setSubject] = useState('')
  const [lines, setLines] = useState<InvoiceLineDraft[]>([
    { localId: uid(), label: '', quantity: '1', unitPriceTTC: '' },
  ])

  const [candidateTransactionsByInvoice, setCandidateTransactionsByInvoice] = useState<Record<string, CandidateTransaction[]>>({})
  const [searchedInvoiceIds, setSearchedInvoiceIds] = useState<string[]>([])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .order('invoice_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      alert('Erreur chargement factures')
      setLoading(false)
      return
    }

    setInvoices((data ?? []) as Invoice[])
    setLoading(false)
  }

  function addLine() {
    setLines((prev) => [...prev, { localId: uid(), label: '', quantity: '1', unitPriceTTC: '' }])
  }

  function removeLine(localId: string) {
    setLines((prev) => prev.filter((l) => l.localId !== localId))
  }

  function updateLine(localId: string, patch: Partial<InvoiceLineDraft>) {
    setLines((prev) => prev.map((l) => (l.localId === localId ? { ...l, ...patch } : l)))
  }

  function computeTotal() {
    let total = 0
    for (const line of lines) {
      const qty = quantityToNumber(line.quantity)
      const unit = eurosToCents(line.unitPriceTTC)
      total += Math.round(qty * unit)
    }
    return total
  }

  async function createInvoice() {
    if (!customerName.trim()) {
      alert('Merci de renseigner le nom du client.')
      return
    }

    for (const line of lines) {
      if (!line.label.trim()) {
        alert('Merci de renseigner toutes les lignes.')
        return
      }
      if (quantityToNumber(line.quantity) <= 0) {
        alert('Merci de renseigner une quantité valide.')
        return
      }
    }

    setSaving(true)

    try {
      const invoiceNumber = await getNextInvoiceNumber(invoiceDate)
      const total = computeTotal()

      const { data: invoice, error: invoiceErr } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          invoice_date: invoiceDate,
          customer_name: customerName.trim(),
          customer_address: customerAddress.trim() || null,
          subject: subject.trim() || null,
          status: 'issued',
          total_ttc_cents: total,
        })
        .select('id')
        .single()

      if (invoiceErr || !invoice) throw invoiceErr ?? new Error('Erreur création facture')

      const rows = lines.map((line, index) => {
        const qty = quantityToNumber(line.quantity)
        const unit = eurosToCents(line.unitPriceTTC)
        return {
          invoice_id: invoice.id,
          ordre: index + 1,
          label: line.label.trim(),
          quantity: qty,
          unit_price_ttc_cents: unit,
          line_total_ttc_cents: Math.round(qty * unit),
        }
      })

      const { error: linesErr } = await supabase.from('invoice_lines').insert(rows)
      if (linesErr) throw linesErr

      alert('✅ Facture créée')
      setInvoiceDate(new Date().toISOString().slice(0, 10))
      setCustomerName('')
      setCustomerAddress('')
      setSubject('')
      setLines([{ localId: uid(), label: '', quantity: '1', unitPriceTTC: '' }])

      await load()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur création facture : ${e?.message ?? 'inconnue'}`)
    } finally {
      setSaving(false)
    }
  }

  async function searchMatchingTransactions(invoice: Invoice) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id,tx_date,description,amount_cents')
      .eq('kind', 'income')
      .eq('amount_cents', invoice.total_ttc_cents)
      .order('tx_date', { ascending: false })

    if (error) {
      console.error(error)
      alert('Erreur recherche transactions')
      return
    }

    setCandidateTransactionsByInvoice((prev) => ({
      ...prev,
      [invoice.id]: (data ?? []) as CandidateTransaction[],
    }))

    setSearchedInvoiceIds((prev) =>
      prev.includes(invoice.id) ? prev : [...prev, invoice.id]
    )
  }

  async function linkTransaction(invoice: Invoice, tx: CandidateTransaction) {
    setProcessingId(invoice.id)

    try {
      const { error } = await supabase
        .from('invoices')
        .update({
          linked_transaction_id: tx.id,
          status: 'paid',
          paid_at: tx.tx_date,
          paid_manually: false,
        })
        .eq('id', invoice.id)

      if (error) throw error

      alert('✅ Transaction associée')
      await load()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur association : ${e?.message ?? 'inconnue'}`)
    } finally {
      setProcessingId(null)
    }
  }

  async function markPaidManually(invoice: Invoice) {
    setProcessingId(invoice.id)

    try {
      const today = new Date().toISOString().slice(0, 10)

      const { error } = await supabase
        .from('invoices')
        .update({
          status: 'paid',
          paid_at: today,
          paid_manually: true,
        })
        .eq('id', invoice.id)

      if (error) throw error

      alert('✅ Facture marquée comme payée')
      await load()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur marquage payé : ${e?.message ?? 'inconnue'}`)
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1200 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900 }}>Factures</h1>

      <section style={{ marginTop: 20, border: '1px solid #ddd', borderRadius: 12, padding: 16, background: 'white' }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Créer une facture</h2>

        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <label>
            Date
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
            />
          </label>

          <label>
            Nom personne / structure
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
            />
          </label>

          <label>
            Adresse postale
            <textarea
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              rows={4}
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
            />
          </label>

          <label>
            Objet
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
            />
          </label>

          <div style={{ marginTop: 8, fontWeight: 700 }}>Lignes</div>

          {lines.map((line) => (
            <div
              key={line.localId}
              style={{
                border: '1px solid #eee',
                borderRadius: 10,
                padding: 12,
                display: 'grid',
                gridTemplateColumns: '1fr 120px 160px auto',
                gap: 10,
                alignItems: 'end',
              }}
            >
              <label>
                Produit / prestation
                <input
                  value={line.label}
                  onChange={(e) => updateLine(line.localId, { label: e.target.value })}
                  style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
                />
              </label>

              <label>
                Quantité
                <input
                  value={line.quantity}
                  onChange={(e) => updateLine(line.localId, { quantity: e.target.value })}
                  style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
                />
              </label>

              <label>
                Tarif TTC unitaire
                <input
                  value={line.unitPriceTTC}
                  onChange={(e) => updateLine(line.localId, { unitPriceTTC: e.target.value })}
                  placeholder="Ex: 49,90"
                  style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
                />
              </label>

              <button onClick={() => removeLine(line.localId)}>Supprimer</button>
            </div>
          ))}

          <button onClick={addLine} style={{ width: 180 }}>
            + Ajouter une ligne
          </button>

          <div style={{ marginTop: 8, fontSize: 18 }}>
            Total TTC : <b>{centsToEuros(computeTotal())} €</b>
          </div>

          <button onClick={createInvoice} disabled={saving} style={{ width: 220, padding: '12px 16px' }}>
            {saving ? 'Création…' : 'Créer la facture'}
          </button>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Tableau des factures</h2>

        {loading ? (
          <div style={{ marginTop: 12 }}>Chargement…</div>
        ) : (
          <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
            {invoices.map((invoice) => {
              const candidates = candidateTransactionsByInvoice[invoice.id] ?? []
              const searched = searchedInvoiceIds.includes(invoice.id)

              return (
                <div
                  key={invoice.id}
                  style={{
                    border: '1px solid #ddd',
                    borderRadius: 12,
                    padding: 16,
                    background: 'white',
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 18 }}>{invoice.invoice_number}</div>
                      <div style={{ marginTop: 4, opacity: 0.75 }}>
                        {formatFrDate(invoice.invoice_date)} — {invoice.customer_name}
                      </div>
                      <div style={{ marginTop: 6 }}>
                        Total TTC : <b>{centsToEuros(invoice.total_ttc_cents)} €</b>
                      </div>
                      <div style={{ marginTop: 6 }}>
                        Statut : <b>{invoice.status}</b>
                        {invoice.paid_at ? ` — payé le ${formatFrDate(invoice.paid_at)}` : ''}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: 8, minWidth: 220 }}>
                      <a
                        href={`/admin/facturation/factures/${invoice.id}`}
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

                      <button onClick={() => searchMatchingTransactions(invoice)}>
                        Rechercher une transaction associée
                      </button>

                      {invoice.status !== 'paid' && (
                        <button
                          onClick={() => markPaidManually(invoice)}
                          disabled={processingId === invoice.id}
                        >
                          {processingId === invoice.id ? 'Traitement…' : 'Marquer comme payée'}
                        </button>
                      )}
                    </div>
                  </div>

                  {searched && candidates.length === 0 && (
                    <div
                      style={{
                        marginTop: 14,
                        padding: 12,
                        borderRadius: 10,
                        background: '#fafafa',
                        border: '1px solid #eee',
                        opacity: 0.8,
                      }}
                    >
                      Aucune transaction recette au même montant n’a été trouvée.
                    </div>
                  )}

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
                              onClick={() => linkTransaction(invoice, tx)}
                              disabled={processingId === invoice.id}
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

            {invoices.length === 0 && (
              <div style={{ opacity: 0.7 }}>Aucune facture pour le moment.</div>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
