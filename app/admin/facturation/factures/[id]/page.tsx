'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
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
  paid_at: string | null
}

type InvoiceLine = {
  id: string
  label: string
  quantity: number
  unit_price_ttc_cents: number
  line_total_ttc_cents: number
}

type Settings = {
  association_name: string
  address_line1: string
  address_line2: string | null
  postal_code: string
  city: string
  email: string | null
  phone: string | null
  iban: string | null
  siret: string | null
  legal_note: string | null
  logo_path: string | null
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

function formatDate(date: string) {
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}

export default function Page() {
  const { id } = useParams()
  const printRef = useRef<HTMLDivElement>(null)

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [lines, setLines] = useState<InvoiceLine[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [
        { data: invoiceData },
        { data: linesData },
        { data: settingsData }
      ] = await Promise.all([
        supabase.from('invoices').select('*').eq('id', id).single(),
        supabase.from('invoice_lines').select('*').eq('invoice_id', id).order('ordre'),
        supabase.from('billing_settings').select('*').eq('id', 'main').single(),
      ])

      setInvoice(invoiceData)
      setLines(linesData || [])
      setSettings(settingsData)
      setLoading(false)
    }

    load()
  }, [id])

  const logoUrl = useMemo(() => {
    if (!settings?.logo_path) return ''
    return supabase.storage.from('receipts').getPublicUrl(settings.logo_path).data.publicUrl
  }, [settings?.logo_path])

  function handlePrint() {
    if (!printRef.current) return

    const win = window.open('', '_blank')
    if (!win) return

    win.document.write(`
      <html>
        <head>
          <title>Facture</title>
          <style>
            body { font-family: system-ui; padding: 24px }
            table { width: 100%; border-collapse: collapse; margin-top: 20px }
            th, td { padding: 10px; border-bottom: 1px solid #ddd }
            .right { text-align: right }
          </style>
        </head>
        <body>${printRef.current.innerHTML}</body>
      </html>
    `)

    win.document.close()
    win.print()
  }

  if (loading) return <div style={{ padding: 24 }}>Chargement…</div>
  if (!invoice || !settings) return <div>Erreur</div>

  return (
    <main style={{ padding: 24 }}>
      <button onClick={handlePrint}>Télécharger / PDF</button>

      <div ref={printRef} style={{ marginTop: 20, background: 'white', padding: 40 }}>

        {/* HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            {logoUrl && (
              <img src={logoUrl} style={{ height: 60, marginBottom: 10 }} />
            )}
            <h2>{settings.association_name}</h2>
            <p>{settings.address_line1}</p>
            <p>{settings.postal_code} {settings.city}</p>
            <p>SIRET : {settings.siret}</p>
          </div>

          <div style={{ textAlign: 'right' }}>
            <h1>FACTURE</h1>
            <p><b>{invoice.invoice_number}</b></p>
            <p>Date : {formatDate(invoice.invoice_date)}</p>
            <p>
              Statut : {invoice.status}
              {invoice.paid_at ? ` (payée le ${formatDate(invoice.paid_at)})` : ''}
            </p>
          </div>
        </div>

        {/* CLIENT */}
        <div style={{ marginTop: 30 }}>
          <h3>Client</h3>
          <p><b>{invoice.customer_name}</b></p>
          <p>{invoice.customer_address}</p>
        </div>

        {/* OBJET */}
        {invoice.subject && (
          <div style={{ marginTop: 20 }}>
            <h3>Objet</h3>
            <p>{invoice.subject}</p>
          </div>
        )}

        {/* TABLE */}
        <table>
          <thead>
            <tr>
              <th>Désignation</th>
              <th className="right">Qté</th>
              <th className="right">PU</th>
              <th className="right">Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td>{l.label}</td>
                <td className="right">{l.quantity}</td>
                <td className="right">{centsToEuros(l.unit_price_ttc_cents)} €</td>
                <td className="right">{centsToEuros(l.line_total_ttc_cents)} €</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* TOTAL */}
        <div style={{ marginTop: 20, textAlign: 'right' }}>
          <h2>Total : {centsToEuros(invoice.total_ttc_cents)} €</h2>
        </div>

        {/* FOOTER */}
        <div style={{ marginTop: 40, fontSize: 12 }}>
          {settings.legal_note && <p>{settings.legal_note}</p>}
          {settings.iban && <p>IBAN : {settings.iban}</p>}
        </div>

      </div>
    </main>
  )
}