'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Quote = {
  id: string
  quote_number: string
  quote_date: string
  customer_name: string
  customer_address: string | null
  subject: string | null
  status: string
  total_ttc_cents: number
  created_at: string
}

type QuoteLineDraft = {
  localId: string
  label: string
  quantity: string
  unitPriceTTC: string
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

async function getNextQuoteNumber(date: string) {
  const yyyy = date.slice(0, 4)
  const mm = date.slice(5, 7)
  const prefix = `DEV-${yyyy}-${mm}-`

  const { data, error } = await supabase
    .from('quotes')
    .select('quote_number')
    .like('quote_number', `${prefix}%`)
    .order('quote_number', { ascending: false })
    .limit(1)

  if (error) throw error

  const last = data && data.length > 0 ? data[0].quote_number : null
  const next = last ? Number(last.slice(-2)) + 1 : 1
  return `${prefix}${String(next).padStart(2, '0')}`
}

export default function QuotesPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [quotes, setQuotes] = useState<Quote[]>([])

  const [quoteDate, setQuoteDate] = useState(new Date().toISOString().slice(0, 10))
  const [customerName, setCustomerName] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [subject, setSubject] = useState('')
  const [lines, setLines] = useState<QuoteLineDraft[]>([
    { localId: uid(), label: '', quantity: '1', unitPriceTTC: '' },
  ])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

    const { data, error } = await supabase
      .from('quotes')
      .select('*')
      .order('quote_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      alert('Erreur chargement devis')
      setLoading(false)
      return
    }

    setQuotes((data ?? []) as Quote[])
    setLoading(false)
  }

  function addLine() {
    setLines((prev) => [...prev, { localId: uid(), label: '', quantity: '1', unitPriceTTC: '' }])
  }

  function removeLine(localId: string) {
    setLines((prev) => prev.filter((l) => l.localId !== localId))
  }

  function updateLine(localId: string, patch: Partial<QuoteLineDraft>) {
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

  async function createQuote() {
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
      const quoteNumber = await getNextQuoteNumber(quoteDate)
      const total = computeTotal()

      const { data: quote, error: quoteErr } = await supabase
        .from('quotes')
        .insert({
          quote_number: quoteNumber,
          quote_date: quoteDate,
          customer_name: customerName.trim(),
          customer_address: customerAddress.trim() || null,
          subject: subject.trim() || null,
          status: 'draft',
          total_ttc_cents: total,
        })
        .select('id')
        .single()

      if (quoteErr || !quote) throw quoteErr ?? new Error('Erreur création devis')

      const rows = lines.map((line, index) => {
        const qty = quantityToNumber(line.quantity)
        const unit = eurosToCents(line.unitPriceTTC)
        return {
          quote_id: quote.id,
          ordre: index + 1,
          label: line.label.trim(),
          quantity: qty,
          unit_price_ttc_cents: unit,
          line_total_ttc_cents: Math.round(qty * unit),
        }
      })

      const { error: linesErr } = await supabase.from('quote_lines').insert(rows)
      if (linesErr) throw linesErr

      alert('✅ Devis créé')
      setQuoteDate(new Date().toISOString().slice(0, 10))
      setCustomerName('')
      setCustomerAddress('')
      setSubject('')
      setLines([{ localId: uid(), label: '', quantity: '1', unitPriceTTC: '' }])

      await load()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur création devis : ${e?.message ?? 'inconnue'}`)
    } finally {
      setSaving(false)
    }
  }

  async function transformToInvoice(quoteId: string) {
    try {
      const { data: quote, error: quoteErr } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', quoteId)
        .maybeSingle()

      if (quoteErr || !quote) throw quoteErr ?? new Error('Devis introuvable')

      const { data: quoteLines, error: linesErr } = await supabase
        .from('quote_lines')
        .select('*')
        .eq('quote_id', quoteId)
        .order('ordre')

      if (linesErr) throw linesErr

      const today = new Date().toISOString().slice(0, 10)
      const yyyy = today.slice(0, 4)
      const mm = today.slice(5, 7)
      const prefix = `FAC-${yyyy}-${mm}-`

      const { data: lastInvoices, error: invErr } = await supabase
        .from('invoices')
        .select('invoice_number')
        .like('invoice_number', `${prefix}%`)
        .order('invoice_number', { ascending: false })
        .limit(1)

      if (invErr) throw invErr

      const last = lastInvoices && lastInvoices.length > 0 ? lastInvoices[0].invoice_number : null
      const next = last ? Number(last.slice(-2)) + 1 : 1
      const invoiceNumber = `${prefix}${String(next).padStart(2, '0')}`

      const { data: invoice, error: createInvoiceErr } = await supabase
        .from('invoices')
        .insert({
          invoice_number: invoiceNumber,
          invoice_date: today,
          customer_name: quote.customer_name,
          customer_address: quote.customer_address,
          subject: quote.subject,
          status: 'issued',
          total_ttc_cents: quote.total_ttc_cents,
          quote_id: quote.id,
        })
        .select('id')
        .single()

      if (createInvoiceErr || !invoice) throw createInvoiceErr ?? new Error('Erreur création facture')

      if ((quoteLines ?? []).length > 0) {
        const invoiceLines = quoteLines.map((line: any) => ({
          invoice_id: invoice.id,
          ordre: line.ordre,
          label: line.label,
          quantity: line.quantity,
          unit_price_ttc_cents: line.unit_price_ttc_cents,
          line_total_ttc_cents: line.line_total_ttc_cents,
        }))

        const { error: insertInvoiceLinesErr } = await supabase
          .from('invoice_lines')
          .insert(invoiceLines)

        if (insertInvoiceLinesErr) throw insertInvoiceLinesErr
      }

      const { error: updErr } = await supabase
        .from('quotes')
        .update({ status: 'invoiced' })
        .eq('id', quoteId)

      if (updErr) throw updErr

      alert('✅ Devis transformé en facture')
      await load()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur transformation : ${e?.message ?? 'inconnue'}`)
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1200 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900 }}>Admin — Devis</h1>

      <section style={{ marginTop: 20, border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Créer un devis</h2>

        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <label>
            Date
            <input
              type="date"
              value={quoteDate}
              onChange={(e) => setQuoteDate(e.target.value)}
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

          <button onClick={createQuote} disabled={saving} style={{ width: 220, padding: '12px 16px' }}>
            {saving ? 'Création…' : 'Créer le devis'}
          </button>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Tableau des devis</h2>

        {loading ? (
          <div style={{ marginTop: 12 }}>Chargement…</div>
        ) : (
          <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
            {quotes.map((quote) => (
              <div
                key={quote.id}
                style={{
                  border: '1px solid #ddd',
                  borderRadius: 12,
                  padding: 16,
                  background: 'white',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>{quote.quote_number}</div>
                    <div style={{ marginTop: 4, opacity: 0.75 }}>
                      {formatFrDate(quote.quote_date)} — {quote.customer_name}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      Total TTC : <b>{centsToEuros(quote.total_ttc_cents)} €</b>
                    </div>
                    <div style={{ marginTop: 6 }}>
                      Statut : <b>{quote.status}</b>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 8, minWidth: 220 }}>
                    <a
                      href={`/admin/facturation/devis/${quote.id}`}
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

                    <button
                      onClick={() => transformToInvoice(quote.id)}
                      disabled={quote.status === 'invoiced'}
                    >
                      Transformer en facture
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {quotes.length === 0 && (
              <div style={{ opacity: 0.7 }}>Aucun devis pour le moment.</div>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
