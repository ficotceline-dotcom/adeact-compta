'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
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
}

type QuoteLine = {
  id: string
  quote_id: string
  ordre: number
  label: string
  quantity: number
  unit_price_ttc_cents: number
  line_total_ttc_cents: number
}

type BillingSettings = {
  id: string
  association_name: string
  address_line1: string | null
  address_line2: string | null
  postal_code: string | null
  city: string | null
  email: string | null
  phone: string | null
  iban: string | null
  siret: string | null
  legal_note: string | null
  logo_path: string | null
  president_name: string | null
  signature_city: string | null
  president_signature_path: string | null
  rescrit_legal_text: string | null
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

function formatFrDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

export default function QuotePage() {
  const params = useParams()
  const id = params?.id as string
  const printRef = useRef<HTMLDivElement | null>(null)

  const [quote, setQuote] = useState<Quote | null>(null)
  const [lines, setLines] = useState<QuoteLine[]>([])
  const [settings, setSettings] = useState<BillingSettings | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!id) return

      const [
        { data: quoteData, error: quoteErr },
        { data: linesData, error: linesErr },
        { data: settingsData, error: settingsErr },
      ] = await Promise.all([
        supabase.from('quotes').select('*').eq('id', id).maybeSingle(),
        supabase.from('quote_lines').select('*').eq('quote_id', id).order('ordre'),
        supabase.from('billing_settings').select('*').eq('id', 'main').maybeSingle(),
      ])

      if (quoteErr || !quoteData || linesErr || settingsErr || !settingsData) {
        console.error(quoteErr || linesErr || settingsErr)
        alert('Erreur chargement devis')
        setLoading(false)
        return
      }

      setQuote(quoteData as Quote)
      setLines((linesData ?? []) as QuoteLine[])
      setSettings(settingsData as BillingSettings)
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

    const content = printRef.current.innerHTML
    const win = window.open('', '_blank')

    if (!win) {
      alert("Le navigateur a bloqué la fenêtre d'impression.")
      return
    }

    win.document.write(`
      <html>
        <head>
          <title>Devis</title>
          <style>
            body {
              font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              padding: 24px;
              color: #111827;
            }
            h1, h2, h3, p { margin: 0; }
            .top {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 24px;
              margin-bottom: 28px;
            }
            .company, .client-box {
              border: 1px solid #e5e7eb;
              border-radius: 14px;
              padding: 16px;
              background: #fff;
            }
            .company {
              flex: 1;
            }
            .doc-meta {
              min-width: 260px;
              text-align: right;
            }
            .logo {
              max-height: 72px;
              max-width: 220px;
              object-fit: contain;
              margin-bottom: 12px;
            }
            .subject {
              margin-top: 22px;
              margin-bottom: 10px;
              padding: 14px;
              border-radius: 12px;
              background: #f9fafb;
              border: 1px solid #e5e7eb;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 24px;
            }
            th, td {
              border-bottom: 1px solid #e5e7eb;
              padding: 12px 10px;
              text-align: left;
              font-size: 14px;
            }
            th {
              background: #f9fafb;
              font-weight: 700;
            }
            .right { text-align: right; }
            .total-wrap {
              margin-top: 22px;
              display: flex;
              justify-content: flex-end;
            }
            .total-box {
              min-width: 280px;
              border: 1px solid #dbeafe;
              background: #eff6ff;
              border-radius: 14px;
              padding: 16px;
            }
            .footer {
              margin-top: 36px;
              padding-top: 16px;
              border-top: 1px solid #e5e7eb;
              font-size: 12px;
              color: #4b5563;
              line-height: 1.5;
            }
            @page { size: A4; margin: 14mm; }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `)

    win.document.close()
    setTimeout(() => win.print(), 300)
  }

  if (loading) {
    return <main style={{ padding: 24 }}>Chargement…</main>
  }

  if (!quote || !settings) {
    return <main style={{ padding: 24 }}>Devis introuvable</main>
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1100 }}>
      <button
        onClick={handlePrint}
        style={{
          marginBottom: 16,
          padding: '10px 14px',
          borderRadius: 10,
          border: '1px solid #d1d5db',
          background: 'white',
          cursor: 'pointer',
          fontWeight: 700,
        }}
      >
        Télécharger / PDF
      </button>

      <div
        ref={printRef}
        style={{
          background: 'white',
          padding: 32,
          border: '1px solid #e5e7eb',
          borderRadius: 18,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 24,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              flex: 1,
              border: '1px solid #e5e7eb',
              borderRadius: 14,
              padding: 16,
            }}
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo ADEACT"
                style={{
                  maxHeight: 72,
                  maxWidth: 220,
                  objectFit: 'contain',
                  marginBottom: 12,
                }}
              />
            ) : (
              <div
                style={{
                  width: 180,
                  height: 60,
                  border: '1px dashed #d1d5db',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6b7280',
                  fontSize: 12,
                  marginBottom: 12,
                }}
              >
                Logo indisponible
              </div>
            )}

            <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>
              {settings.association_name || 'ADEACT'}
            </div>

            {settings.address_line1 ? <div>{settings.address_line1}</div> : null}
            {settings.address_line2 ? <div>{settings.address_line2}</div> : null}
            {(settings.postal_code || settings.city) ? (
              <div>
                {[settings.postal_code, settings.city].filter(Boolean).join(' ')}
              </div>
            ) : null}
            {settings.siret ? <div style={{ marginTop: 8 }}>SIRET : {settings.siret}</div> : null}
          </div>

          <div style={{ minWidth: 260, textAlign: 'right' }}>
            <div style={{ fontSize: 30, fontWeight: 900, marginBottom: 8 }}>DEVIS</div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{quote.quote_number}</div>
            <div>Date : {formatFrDate(quote.quote_date)}</div>
            <div style={{ marginTop: 6 }}>Statut : {quote.status}</div>
          </div>
        </div>

        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 14,
            padding: 16,
            marginBottom: 22,
            maxWidth: 420,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Client</div>
          <div style={{ fontWeight: 700 }}>{quote.customer_name}</div>
          {quote.customer_address ? (
            <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{quote.customer_address}</div>
          ) : null}
        </div>

        {quote.subject ? (
          <div
            style={{
              marginBottom: 10,
              padding: 14,
              borderRadius: 12,
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Objet</div>
            <div>{quote.subject}</div>
          </div>
        ) : null}

        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 24 }}>
          <thead>
            <tr>
              <th style={thStyle}>Désignation</th>
              <th style={thRightStyle}>Quantité</th>
              <th style={thRightStyle}>PU TTC</th>
              <th style={thRightStyle}>Total TTC</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td style={tdStyle}>{line.label}</td>
                <td style={tdRightStyle}>{line.quantity}</td>
                <td style={tdRightStyle}>{centsToEuros(line.unit_price_ttc_cents)} €</td>
                <td style={tdRightStyle}>{centsToEuros(line.line_total_ttc_cents)} €</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end' }}>
          <div
            style={{
              minWidth: 280,
              border: '1px solid #dbeafe',
              background: '#eff6ff',
              borderRadius: 14,
              padding: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontWeight: 900,
                fontSize: 20,
              }}
            >
              <span>Total TTC</span>
              <span>{centsToEuros(quote.total_ttc_cents)} €</span>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 36,
            paddingTop: 16,
            borderTop: '1px solid #e5e7eb',
            fontSize: 12,
            color: '#4b5563',
            lineHeight: 1.5,
          }}
        >
          {settings.email ? <div>Email : {settings.email}</div> : null}
          {settings.phone ? <div>Téléphone : {settings.phone}</div> : null}
          {settings.iban ? <div>IBAN : {settings.iban}</div> : null}
        </div>
      </div>
    </main>
  )
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 10px',
  borderBottom: '1px solid #e5e7eb',
  background: '#f9fafb',
  fontWeight: 700,
  fontSize: 14,
}

const thRightStyle: React.CSSProperties = {
  ...thStyle,
  textAlign: 'right',
}

const tdStyle: React.CSSProperties = {
  padding: '12px 10px',
  borderBottom: '1px solid #e5e7eb',
  fontSize: 14,
}

const tdRightStyle: React.CSSProperties = {
  ...tdStyle,
  textAlign: 'right',
}
