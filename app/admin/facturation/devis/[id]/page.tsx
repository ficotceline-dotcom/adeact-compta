'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Quote = {
  id: string
  quote_number: string
  customer_name: string
  customer_address: string | null
  total_cents: number
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

export default function QuotePage() {
  const params = useParams()
  const id = params?.id as string
  const printRef = useRef<HTMLDivElement | null>(null)

  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!id) return

      const { data, error } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error || !data) {
        alert('Erreur chargement devis')
        setLoading(false)
        return
      }

      setQuote(data)
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
          <title>Devis</title>
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
  if (!quote) return <div>Devis introuvable</div>

  return (
    <main style={{ padding: 24 }}>
      <button onClick={handlePrint}>Télécharger / PDF</button>

      <div ref={printRef} style={{ background: 'white', padding: 40 }}>
        <h1>DEVIS {quote.quote_number}</h1>

        <p><b>Client :</b> {quote.customer_name}</p>
        <p>{quote.customer_address}</p>

        <h2>Total : {centsToEuros(quote.total_cents)} €</h2>
      </div>
    </main>
  )
}
