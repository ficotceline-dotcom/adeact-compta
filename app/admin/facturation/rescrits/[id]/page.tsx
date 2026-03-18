'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type BillingSettings = {
  association_name: string
  address_line1: string | null
  address_line2: string | null
  postal_code: string | null
  city: string | null
  president_name: string | null
  signature_city: string | null
  president_signature_path: string | null
  logo_path: string | null
  rescrit_legal_text: string | null
}

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
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(0)
}

function formatFrDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

export default function TaxReceiptDocumentPage() {
  const params = useParams()
  const id = params?.id as string
  const printRef = useRef<HTMLDivElement | null>(null)

  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<BillingSettings | null>(null)
  const [receipt, setReceipt] = useState<TaxReceipt | null>(null)

  useEffect(() => {
    async function load() {
      if (!id) return

      setLoading(true)

      const [
        { data: settingsData, error: e1 },
        { data: receiptData, error: e2 },
      ] = await Promise.all([
        supabase.from('billing_settings').select('*').eq('id', 'main').maybeSingle(),
        supabase.from('tax_receipts').select('*').eq('id', id).maybeSingle(),
      ])

      if (e1 || e2 || !receiptData) {
        console.error(e1 || e2)
        alert('Erreur chargement rescrit')
        setLoading(false)
        return
      }

      setSettings(settingsData as BillingSettings)
      setReceipt(receiptData as TaxReceipt)
      setLoading(false)
    }

    load()
  }, [id])

  const logoUrl = useMemo(() => {
    if (!settings?.logo_path) return ''
    return supabase.storage.from('receipts').getPublicUrl(settings.logo_path).data.publicUrl
  }, [settings?.logo_path])

  const signatureUrl = useMemo(() => {
    if (!settings?.president_signature_path) return ''
    return supabase.storage.from('receipts').getPublicUrl(settings.president_signature_path).data.publicUrl
  }, [settings?.president_signature_path])

  function handlePrint() {
    if (!printRef.current) return

    const content = printRef.current.innerHTML
    const printWindow = window.open('', '_blank', 'width=900,height=1200')

    if (!printWindow) {
      alert("Le navigateur a bloqué la fenêtre d'impression.")
      return
    }

    printWindow.document.open()
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="fr">
        <head>
          <meta charset="UTF-8" />
          <title>Rescrit ${receipt?.receipt_number ?? ''}</title>
          <style>
            body {
              margin: 0;
              padding: 24px;
              font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              background: white;
              color: black;
            }
            .doc {
              max-width: 900px;
              margin: 0 auto;
              background: white;
              padding: 40px;
              box-sizing: border-box;
            }
            img {
              max-width: 100%;
            }
            @page {
              size: A4;
              margin: 14mm;
            }
            @media print {
              body {
                padding: 0;
              }
              .doc {
                padding: 0;
                max-width: none;
              }
            }
          </style>
        </head>
        <body>
          <div class="doc">${content}</div>
        </body>
      </html>
    `)
    printWindow.document.close()

    printWindow.focus()

    setTimeout(() => {
      printWindow.print()
    }, 300)
  }

  if (loading) {
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Chargement…</main>
  }

  if (!receipt) {
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Rescrit introuvable.</main>
  }

  const issueDate = new Date().toISOString().slice(0, 10)

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', background: '#f5f5f5', minHeight: '100vh' }}>
      <div style={{ marginBottom: 16 }}>
        <button onClick={handlePrint} style={{ padding: '10px 14px' }}>
          Télécharger / imprimer en PDF
        </button>
      </div>

      <div
        ref={printRef}
        style={{
          maxWidth: 900,
          margin: '0 auto',
          background: 'white',
          padding: 40,
          borderRadius: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20 }}>
          <div>
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" style={{ maxHeight: 90, objectFit: 'contain' }} />
            ) : (
              <div style={{ fontSize: 28, fontWeight: 900 }}>ADEACT</div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 20, fontSize: 28, fontWeight: 900 }}>
          REÇU FISCAL POUR DON
        </div>

        <div style={{ marginTop: 20, whiteSpace: 'pre-line' }}>
          <b>{settings?.association_name ?? 'ADEACT'}</b>
          {settings?.address_line1 ? `\n${settings.address_line1}` : ''}
          {settings?.address_line2 ? `\n${settings.address_line2}` : ''}
          {settings?.postal_code || settings?.city
            ? `\n${settings?.postal_code ?? ''} ${settings?.city ?? ''}`
            : ''}
        </div>

        <div style={{ marginTop: 18 }}>
          Organisme d’intérêt général (Art et Culture)
        </div>

        <div style={{ marginTop: 18 }}>
          <b>OBJET :</b> Association ayant pour objectif de réunir les talents de l’agglomération lilloise au sein de productions artistiques à des fins solidaires.
        </div>

        <div style={{ marginTop: 18 }}>
          <b>N° ORDRE DE REÇU :</b> {receipt.receipt_number}
        </div>

        <div style={{ marginTop: 24 }}>
          <b>DONATEUR :</b>
          <div style={{ marginTop: 8, whiteSpace: 'pre-line' }}>
            {receipt.donor_name}
            {receipt.donor_address ? `\n${receipt.donor_address}` : ''}
          </div>
        </div>

        <div style={{ marginTop: 24 }}>
          <b>BÉNÉFICIAIRE :</b>
          <div style={{ marginTop: 8 }}>
            {settings?.association_name ?? 'ADEACT'} reconnaît avoir reçu, au titre des versements ouvrant droit à une réduction d’impôt, la somme de <b>{centsToEuros(receipt.amount_cents)} euros</b>.
          </div>
        </div>

        <div style={{ marginTop: 24, display: 'grid', gap: 8 }}>
          <div><b>Date du don :</b> {formatFrDate(receipt.donation_date)}</div>
          <div><b>Forme du don :</b> {receipt.donation_form}</div>
          <div><b>Nature du don :</b> {receipt.donation_nature}</div>
        </div>

        <div style={{ marginTop: 36 }}>
          Fait à {settings?.signature_city ?? 'LILLE'}, le {formatFrDate(issueDate)}
        </div>

        <div style={{ marginTop: 36 }}>
          {signatureUrl ? (
            <img src={signatureUrl} alt="Signature président" style={{ maxHeight: 100 }} />
          ) : (
            <div style={{ height: 70 }} />
          )}
        </div>

        <div style={{ marginTop: 8, whiteSpace: 'pre-line' }}>
          <b>{settings?.president_name ?? 'Martin MESUROLLE'}</b>
          {'\n'}Président d’ADEACT
        </div>

        <div style={{ marginTop: 28, fontSize: 13, opacity: 0.85, whiteSpace: 'pre-line' }}>
          {settings?.rescrit_legal_text ?? ''}
        </div>
      </div>
    </main>
  )
}
