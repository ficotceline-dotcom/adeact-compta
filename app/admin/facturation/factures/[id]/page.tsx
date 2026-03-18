'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Invoice = {
  id: string
  invoice_number: string
  customer_name: string
  customer_address: string | null
  total_cents: number
  status: string
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

export default function InvoicePage() {
  const params = useParams()
  const id = params?.id as string
  const printRef = useRef<HTMLDivElement | null>(null)

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!id) return

      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error || !data) {
        alert('Erreur chargement facture')
        setLoading(false)
        return
      }

      setInvoice(data)
      setLoading(false)
    }

    load()
  }, [id])

  function handlePrint() {
    if (!printRef.current) return

    const content = printRef.current.innerHTML
    const win = window.open('', '_blank')

    if (!win) return

    win.document.write(`
      <html>
        <head>
          <title>Facture</title>
          <style>
            body { font-family: system-ui; padding: 24px }
            @page { size: A4; margin: 14mm }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `)

    win.document.close()

    setTimeout(() => win.print(), 300)
  }

  if (loading) return <div>Chargement…</div>
  if (!invoice) return <div>Facture introuvable</div>

  return (
    <main style={{ padding: 24 }}>
      <button onClick={handlePrint}>Télécharger / PDF</button>

      <div ref={printRef} style={{ background: 'white', padding: 40 }}>
        <h1>FACTURE {invoice.invoice_number}</h1>

        <p><b>Client :</b> {invoice.customer_name}</p>
        <p>{invoice.customer_address}</p>

        <h2>Total : {centsToEuros(invoice.total_cents)} €</h2>
        <p>Status : {invoice.status}</p>
      </div>
    </main>
  )
}
