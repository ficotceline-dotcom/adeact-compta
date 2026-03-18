'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Budget = {
  id: string
  name: string
  ordre: number
}

type Category = {
  id: string
  budget_id: string
  kind: 'income' | 'expense'
  name: string
  ordre?: number
}

type Subcategory = {
  id: string
  category_id: string
  name: string
  ordre?: number
}

function eurosToCents(value: string): number {
  const normalized = value.replace(',', '.').trim()
  if (!normalized) return 0
  const num = Number(normalized)
  if (!Number.isFinite(num)) return 0
  return Math.round(num * 100)
}

export default function ReimbursementRequestPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])

  const [requesterName, setRequesterName] = useState('')
  const [amountInput, setAmountInput] = useState('')
  const [iban, setIban] = useState('')
  const [budgetId, setBudgetId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [subcategoryId, setSubcategoryId] = useState('')
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)

  useEffect(() => {
    loadRefs()
  }, [])

  async function loadRefs() {
    setLoading(true)

    const [
      { data: b, error: e1 },
      { data: c, error: e2 },
      { data: s, error: e3 },
    ] = await Promise.all([
      supabase
        .from('budgets')
        .select('id,name,ordre')
        .eq('is_archived', false)
        .order('ordre'),

      supabase
        .from('categories')
        .select('id,budget_id,kind,name,ordre')
        .eq('kind', 'expense')
        .order('ordre'),

      supabase
        .from('subcategories')
        .select('id,category_id,name,ordre')
        .order('ordre'),
    ])

    if (e1 || e2 || e3) {
      console.error(e1 || e2 || e3)
      alert('Erreur chargement du formulaire')
      setLoading(false)
      return
    }

    setBudgets((b ?? []) as Budget[])
    setCategories((c ?? []) as Category[])
    setSubcategories((s ?? []) as Subcategory[])
    setLoading(false)
  }

  const availableCategories = useMemo(() => {
    return categories
      .filter((c) => c.budget_id === budgetId)
      .sort((a, b) => (a.ordre ?? 999) - (b.ordre ?? 999) || a.name.localeCompare(b.name))
  }, [categories, budgetId])

  const availableSubcategories = useMemo(() => {
    return subcategories
      .filter((s) => s.category_id === categoryId)
      .sort((a, b) => (a.ordre ?? 999) - (b.ordre ?? 999) || a.name.localeCompare(b.name))
  }, [subcategories, categoryId])

  async function submit() {
    const amountCents = eurosToCents(amountInput)

    if (!requesterName.trim()) {
      alert('Merci de renseigner ton nom / prénom.')
      return
    }

    if (amountCents <= 0) {
      alert('Merci de renseigner un montant valide.')
      return
    }

    if (!invoiceFile) {
      alert('La facture en pièce jointe est obligatoire.')
      return
    }

    if (!budgetId || !categoryId) {
      alert('Merci de choisir le budget et la catégorie.')
      return
    }

    setSaving(true)

    try {
      const safeName = invoiceFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `reimbursement_requests/${Date.now()}_${safeName}`

      const { error: uploadErr } = await supabase.storage
        .from('receipts')
        .upload(path, invoiceFile, { upsert: true })

      if (uploadErr) throw uploadErr

      const { error: insertErr } = await supabase
        .from('reimbursement_requests')
        .insert({
          requester_name: requesterName.trim(),
          amount_cents: amountCents,
          invoice_path: path,
          iban: iban.trim() || null,
          budget_id: budgetId,
          category_id: categoryId,
          subcategory_id: subcategoryId || null,
          status: 'pending',
        })

      if (insertErr) throw insertErr

      alert('✅ Demande envoyée')

      setRequesterName('')
      setAmountInput('')
      setIban('')
      setBudgetId('')
      setCategoryId('')
      setSubcategoryId('')
      setInvoiceFile(null)
    } catch (e: any) {
      console.error(e)
      alert(`Erreur envoi demande : ${e?.message ?? 'inconnue'}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Chargement…</main>
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 800 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900 }}>Demande de remboursement</h1>

      <div style={{ marginTop: 8, opacity: 0.8 }}>
        Remplis ce formulaire pour envoyer une demande de remboursement.
      </div>

      <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
        <label>
          Nom / prénom
          <input
            value={requesterName}
            onChange={(e) => setRequesterName(e.target.value)}
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
          />
        </label>

        <label>
          Montant
          <input
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="Ex: 25,90"
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
          />
        </label>

        <label>
          IBAN (optionnel)
          <input
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
          />
        </label>

        <label>
          Budget
          <select
            value={budgetId}
            onChange={(e) => {
              setBudgetId(e.target.value)
              setCategoryId('')
              setSubcategoryId('')
            }}
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
          >
            <option value="">—</option>
            {budgets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Catégorie
          <select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value)
              setSubcategoryId('')
            }}
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
          >
            <option value="">—</option>
            {availableCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Sous-catégorie
          <select
            value={subcategoryId}
            onChange={(e) => setSubcategoryId(e.target.value)}
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
          >
            <option value="">—</option>
            {availableSubcategories.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Facture / justificatif (obligatoire)
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
            style={{ display: 'block', width: '100%', marginTop: 6 }}
          />
        </label>

        <button
          onClick={submit}
          disabled={saving}
          style={{ padding: '12px 16px', width: 220 }}
        >
          {saving ? 'Envoi…' : 'Envoyer la demande'}
        </button>
      </div>
    </main>
  )
}
