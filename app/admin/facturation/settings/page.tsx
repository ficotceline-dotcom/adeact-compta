'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

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

export default function BillingSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingSignature, setUploadingSignature] = useState(false)

  const [settings, setSettings] = useState<BillingSettings>({
    id: 'main',
    association_name: 'ADEACT',
    address_line1: '',
    address_line2: '',
    postal_code: '',
    city: '',
    email: '',
    phone: '',
    iban: '',
    siret: '',
    legal_note: '',
    logo_path: '',
    president_name: '',
    signature_city: 'LILLE',
    president_signature_path: '',
    rescrit_legal_text: '',
  })

  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [signatureFile, setSignatureFile] = useState<File | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('billing_settings')
      .select('*')
      .eq('id', 'main')
      .maybeSingle()

    if (error) {
      console.error(error)
      alert('Erreur chargement paramètres facturation')
      setLoading(false)
      return
    }

    if (data) {
      setSettings({
        id: data.id,
        association_name: data.association_name ?? 'ADEACT',
        address_line1: data.address_line1 ?? '',
        address_line2: data.address_line2 ?? '',
        postal_code: data.postal_code ?? '',
        city: data.city ?? '',
        email: data.email ?? '',
        phone: data.phone ?? '',
        iban: data.iban ?? '',
        siret: data.siret ?? '',
        legal_note: data.legal_note ?? '',
        logo_path: data.logo_path ?? '',
        president_name: data.president_name ?? '',
        signature_city: data.signature_city ?? 'LILLE',
        president_signature_path: data.president_signature_path ?? '',
        rescrit_legal_text: data.rescrit_legal_text ?? '',
      })
    }

    setLoading(false)
  }

  const logoUrl = useMemo(() => {
    if (!settings.logo_path) return ''
    return supabase.storage.from('receipts').getPublicUrl(settings.logo_path).data.publicUrl
  }, [settings.logo_path])

  const signatureUrl = useMemo(() => {
    if (!settings.president_signature_path) return ''
    return supabase.storage.from('receipts').getPublicUrl(settings.president_signature_path).data.publicUrl
  }, [settings.president_signature_path])

  async function uploadFile(file: File, target: 'logo' | 'signature') {
    const ext = file.name.split('.').pop() || 'png'
    const path =
      target === 'logo'
        ? `billing/logo_${Date.now()}.${ext}`
        : `billing/signature_${Date.now()}.${ext}`

    const { error } = await supabase.storage
      .from('receipts')
      .upload(path, file, { upsert: true })

    if (error) throw error

    if (target === 'logo') {
      setSettings((prev) => ({ ...prev, logo_path: path }))
    } else {
      setSettings((prev) => ({ ...prev, president_signature_path: path }))
    }
  }

  async function uploadLogo() {
    if (!logoFile) {
      alert('Choisis un logo.')
      return
    }
    setUploadingLogo(true)
    try {
      await uploadFile(logoFile, 'logo')
      alert('✅ Logo uploadé. Pense à sauvegarder.')
    } catch (e: any) {
      console.error(e)
      alert(`Erreur upload logo : ${e?.message ?? 'inconnue'}`)
    } finally {
      setUploadingLogo(false)
    }
  }

  async function uploadSignature() {
    if (!signatureFile) {
      alert('Choisis une signature.')
      return
    }
    setUploadingSignature(true)
    try {
      await uploadFile(signatureFile, 'signature')
      alert('✅ Signature uploadée. Pense à sauvegarder.')
    } catch (e: any) {
      console.error(e)
      alert(`Erreur upload signature : ${e?.message ?? 'inconnue'}`)
    } finally {
      setUploadingSignature(false)
    }
  }

  async function save() {
    setSaving(true)
    try {
      const { error } = await supabase.from('billing_settings').upsert({
        id: 'main',
        association_name: settings.association_name.trim() || 'ADEACT',
        address_line1: settings.address_line1 || null,
        address_line2: settings.address_line2 || null,
        postal_code: settings.postal_code || null,
        city: settings.city || null,
        email: settings.email || null,
        phone: settings.phone || null,
        iban: settings.iban || null,
        siret: settings.siret || null,
        legal_note: settings.legal_note || null,
        logo_path: settings.logo_path || null,
        president_name: settings.president_name || null,
        signature_city: settings.signature_city || 'LILLE',
        president_signature_path: settings.president_signature_path || null,
        rescrit_legal_text: settings.rescrit_legal_text || null,
        updated_at: new Date().toISOString(),
      })

      if (error) throw error

      alert('✅ Paramètres sauvegardés')
      await load()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur sauvegarde : ${e?.message ?? 'inconnue'}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <main style={{ padding: 24 }}>Chargement…</main>

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 950 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900 }}>Admin — Paramètres facturation</h1>

      <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
        <label>
          Nom association
          <input
            value={settings.association_name}
            onChange={(e) => setSettings((p) => ({ ...p, association_name: e.target.value }))}
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
          />
        </label>

        <label>
          Adresse ligne 1
          <input
            value={settings.address_line1 ?? ''}
            onChange={(e) => setSettings((p) => ({ ...p, address_line1: e.target.value }))}
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
          />
        </label>

        <label>
          Adresse ligne 2
          <input
            value={settings.address_line2 ?? ''}
            onChange={(e) => setSettings((p) => ({ ...p, address_line2: e.target.value }))}
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 10 }}>
          <label>
            Code postal
            <input
              value={settings.postal_code ?? ''}
              onChange={(e) => setSettings((p) => ({ ...p, postal_code: e.target.value }))}
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
            />
          </label>

          <label>
            Ville
            <input
              value={settings.city ?? ''}
              onChange={(e) => setSettings((p) => ({ ...p, city: e.target.value }))}
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
            />
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label>
            Email
            <input
              value={settings.email ?? ''}
              onChange={(e) => setSettings((p) => ({ ...p, email: e.target.value }))}
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
            />
          </label>

          <label>
            Téléphone
            <input
              value={settings.phone ?? ''}
              onChange={(e) => setSettings((p) => ({ ...p, phone: e.target.value }))}
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
            />
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label>
            IBAN
            <input
              value={settings.iban ?? ''}
              onChange={(e) => setSettings((p) => ({ ...p, iban: e.target.value }))}
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
            />
          </label>

          <label>
            SIRET
            <input
              value={settings.siret ?? ''}
              onChange={(e) => setSettings((p) => ({ ...p, siret: e.target.value }))}
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
            />
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 10 }}>
          <label>
            Nom du président
            <input
              value={settings.president_name ?? ''}
              onChange={(e) => setSettings((p) => ({ ...p, president_name: e.target.value }))}
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
            />
          </label>

          <label>
            Ville de signature
            <input
              value={settings.signature_city ?? ''}
              onChange={(e) => setSettings((p) => ({ ...p, signature_city: e.target.value }))}
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
            />
          </label>
        </div>

        <label>
          Mentions devis / facture
          <textarea
            rows={4}
            value={settings.legal_note ?? ''}
            onChange={(e) => setSettings((p) => ({ ...p, legal_note: e.target.value }))}
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 6, resize: 'vertical' }}
          />
        </label>

        <label>
          Texte légal du rescrit
          <textarea
            rows={5}
            value={settings.rescrit_legal_text ?? ''}
            onChange={(e) => setSettings((p) => ({ ...p, rescrit_legal_text: e.target.value }))}
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 6, resize: 'vertical' }}
          />
        </label>
      </div>

      <div style={{ marginTop: 24, display: 'grid', gap: 20 }}>
        <div style={{ borderTop: '1px solid #eee', paddingTop: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Logo</div>
          {logoUrl ? <img src={logoUrl} alt="Logo" style={{ maxHeight: 100, marginBottom: 10 }} /> : <div style={{ opacity: 0.7 }}>Aucun logo</div>}
          <input type="file" accept=".png,.jpg,.jpeg,.webp,.svg" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
          <div>
            <button onClick={uploadLogo} disabled={uploadingLogo} style={{ marginTop: 10 }}>
              {uploadingLogo ? 'Upload…' : 'Uploader le logo'}
            </button>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #eee', paddingTop: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Signature du président</div>
          {signatureUrl ? <img src={signatureUrl} alt="Signature" style={{ maxHeight: 120, marginBottom: 10 }} /> : <div style={{ opacity: 0.7 }}>Aucune signature</div>}
          <input type="file" accept=".png,.jpg,.jpeg,.webp" onChange={(e) => setSignatureFile(e.target.files?.[0] ?? null)} />
          <div>
            <button onClick={uploadSignature} disabled={uploadingSignature} style={{ marginTop: 10 }}>
              {uploadingSignature ? 'Upload…' : 'Uploader la signature'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <button onClick={save} disabled={saving} style={{ padding: '12px 16px' }}>
          {saving ? 'Sauvegarde…' : 'Sauvegarder les paramètres'}
        </button>
      </div>
    </main>
  )
}
