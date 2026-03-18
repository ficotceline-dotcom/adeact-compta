'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type TxKind = 'income' | 'expense'

type Transaction = {
  id: string
  tx_date: string
  kind: TxKind
  description: string | null
  amount_cents: number
  receipt_status: string
  receipt_path: string | null
  fiscal_year_id: string | null
}

type Budget = {
  id: string
  name: string
  ordre: number
}

type Category = {
  id: string
  budget_id: string
  kind: TxKind
  name: string
  ordre?: number
}

type Subcategory = {
  id: string
  category_id: string
  name: string
  ordre?: number
}

type FiscalYear = {
  id: string
  year: number
  start_date: string
  end_date: string
}

type Allocation = {
  id?: string
  budget_id: string
  category_id: string
  subcategory_id: string
  amount_cents: number
}

type AllocationRowDb = {
  id: string
  budget_id: string
  category_id: string | null
  subcategory_id: string | null
  amount_cents: number
}

function eurosToCents(value: string): number {
  const normalized = value.replace(',', '.').trim()
  if (!normalized) return 0
  const num = Number(normalized)
  if (!Number.isFinite(num)) return 0
  return Math.round(num * 100)
}

function centsToEuros(cents: number): string {
  return (cents / 100).toFixed(2)
}

function findFiscalYear(date: string, fiscalYears: FiscalYear[]) {
  return fiscalYears.find((fy) => date >= fy.start_date && date <= fy.end_date) ?? null
}

async function uploadReceipt(txId: string, file: File) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${txId}/${Date.now()}_${safeName}`

  const { error: upErr } = await supabase.storage
    .from('receipts')
    .upload(path, file, { upsert: true })

  if (upErr) throw upErr

  const { error: txErr } = await supabase
    .from('transactions')
    .update({
      receipt_status: 'PJ fournie',
      receipt_path: path,
      receipt_uploaded_at: new Date().toISOString(),
    })
    .eq('id', txId)

  if (txErr) throw txErr

  const { error: reqErr } = await supabase
    .from('receipt_requests')
    .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString() })
    .eq('transaction_id', txId)
    .eq('status', 'open')

  if (reqErr) throw reqErr
}

export default function EditTransactionPage() {
  const params = useParams()
  const router = useRouter()
  const txId = params?.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([])

  const [kind, setKind] = useState<TxKind>('expense')
  const [txDate, setTxDate] = useState('')
  const [description, setDescription] = useState('')
  const [amountInput, setAmountInput] = useState('')
  const [receiptStatus, setReceiptStatus] = useState<'PJ fournie' | 'PJ manquante'>('PJ fournie')
  const [receiptPath, setReceiptPath] = useState<string | null>(null)
  const [newReceiptFile, setNewReceiptFile] = useState<File | null>(null)

  const [allocations, setAllocations] = useState<Allocation[]>([
    { budget_id: '', category_id: '', subcategory_id: '', amount_cents: 0 },
  ])

  useEffect(() => {
    load()
  }, [txId])

  async function load() {
    setLoading(true)

    const [
      { data: txData, error: e1 },
      { data: allocData, error: e2 },
      { data: b, error: e3 },
      { data: c, error: e4 },
      { data: s, error: e5 },
      { data: fy, error: e6 },
    ] = await Promise.all([
      supabase
        .from('transactions')
        .select('id,tx_date,kind,description,amount_cents,receipt_status,receipt_path,fiscal_year_id')
        .eq('id', txId)
        .maybeSingle(),

      supabase
        .from('transaction_allocations')
        .select('id,budget_id,category_id,subcategory_id,amount_cents')
        .eq('transaction_id', txId)
        .order('id'),

      supabase
        .from('budgets')
        .select('id,name,ordre')
        .eq('is_archived', false)
        .order('ordre'),

      supabase
        .from('categories')
        .select('id,budget_id,kind,name,ordre')
        .order('ordre'),

      supabase
        .from('subcategories')
        .select('id,category_id,name,ordre')
        .order('ordre'),

      supabase
        .from('fiscal_years')
        .select('id,year,start_date,end_date')
        .order('year', { ascending: false }),
    ])

    if (e1 || e2 || e3 || e4 || e5 || e6 || !txData) {
      console.error(e1 || e2 || e3 || e4 || e5 || e6)
      alert('Erreur chargement transaction')
      setLoading(false)
      return
    }

    const tx = txData as Transaction
    const allocs = (allocData ?? []) as AllocationRowDb[]

    setBudgets((b ?? []) as Budget[])
    setCategories((c ?? []) as Category[])
    setSubcategories((s ?? []) as Subcategory[])
    setFiscalYears((fy ?? []) as FiscalYear[])

    setKind(tx.kind)
    setTxDate(tx.tx_date)
    setDescription(tx.description ?? '')
    setAmountInput(centsToEuros(tx.amount_cents))
    setReceiptStatus((tx.receipt_status as 'PJ fournie' | 'PJ manquante') ?? 'PJ fournie')
    setReceiptPath(tx.receipt_path ?? null)

    if (allocs.length > 0) {
      setAllocations(
        allocs.map((a) => ({
          id: a.id,
          budget_id: a.budget_id,
          category_id: a.category_id ?? '',
          subcategory_id: a.subcategory_id ?? '',
          amount_cents: a.amount_cents,
        }))
      )
    } else {
      setAllocations([{ budget_id: '', category_id: '', subcategory_id: '', amount_cents: tx.amount_cents }])
    }

    setLoading(false)
  }

  function filteredCategories(budgetId: string) {
    return categories.filter((c) => c.budget_id === budgetId && c.kind === kind)
  }

  function filteredSubcategories(categoryId: string) {
    return subcategories.filter((s) => s.category_id === categoryId)
  }

  function updateAlloc(index: number, patch: Partial<Allocation>) {
    setAllocations((prev) =>
      prev.map((a, i) => (i === index ? { ...a, ...patch } : a))
    )
  }

  function addAlloc() {
    setAllocations((prev) => [
      ...prev,
      { budget_id: '', category_id: '', subcategory_id: '', amount_cents: 0 },
    ])
  }

  function removeAlloc(index: number) {
    setAllocations((prev) => prev.filter((_, i) => i !== index))
  }

  async function getMapping(category_id: string, subcategory_id: string) {
    let poste_cr: string | null = null
    let poste_bilan: string | null = null

    if (subcategory_id) {
      const { data } = await supabase
        .from('subcategory_mapping')
        .select('poste_cr, poste_bilan')
        .eq('subcategory_id', subcategory_id)
        .maybeSingle()

      if (data) {
        poste_cr = data.poste_cr
        poste_bilan = data.poste_bilan
      }
    }

    if (!poste_cr && category_id) {
      const { data } = await supabase
        .from('category_mapping')
        .select('poste_cr, poste_bilan')
        .eq('category_id', category_id)
        .maybeSingle()

      if (data) {
        poste_cr = data.poste_cr
        poste_bilan = data.poste_bilan
      }
    }

    return { poste_cr, poste_bilan }
  }

  const totalCents = useMemo(() => eurosToCents(amountInput), [amountInput])

  const allocationsSum = useMemo(
    () => allocations.reduce((sum, a) => sum + (a.amount_cents || 0), 0),
    [allocations]
  )

  const canSave = useMemo(() => {
    if (!txDate) return false
    if (totalCents <= 0) return false
    if (allocations.length < 1) return false
    if (allocationsSum !== totalCents) return false

    for (const a of allocations) {
      if (!a.budget_id || !a.category_id) return false
      if (!a.amount_cents || a.amount_cents <= 0) return false
    }

    return true
  }, [txDate, totalCents, allocations, allocationsSum])

  async function save() {
    if (!canSave) {
      alert('Merci de vérifier le montant total et les allocations.')
      return
    }

    setSaving(true)

    try {
      const fy = findFiscalYear(txDate, fiscalYears)

      const finalReceiptStatus =
        kind === 'expense'
          ? newReceiptFile
            ? 'PJ fournie'
            : receiptStatus
          : 'PJ fournie'

      const { error: txErr } = await supabase
        .from('transactions')
        .update({
          tx_date: txDate,
          kind,
          description: description.trim() || 'Sans libellé',
          amount_cents: totalCents,
          receipt_status: finalReceiptStatus,
          fiscal_year_id: fy?.id ?? null,
        })
        .eq('id', txId)

      if (txErr) throw txErr

      // IMPORTANT :
      // on supprime d'abord TOUTES les anciennes allocations,
      // puis on réinsère uniquement les nouvelles.
      const { error: delErr } = await supabase
        .from('transaction_allocations')
        .delete()
        .eq('transaction_id', txId)

      if (delErr) throw delErr

      const rows = []

      for (const a of allocations) {
        const mapping = await getMapping(a.category_id, a.subcategory_id)

        rows.push({
          transaction_id: txId,
          budget_id: a.budget_id,
          category_id: a.category_id,
          subcategory_id: a.subcategory_id || null,
          amount_cents: a.amount_cents,
          poste_cr: mapping.poste_cr,
          poste_bilan: mapping.poste_bilan,
        })
      }

      const { error: insErr } = await supabase
        .from('transaction_allocations')
        .insert(rows)

      if (insErr) throw insErr

      if (kind === 'expense' && newReceiptFile) {
        await uploadReceipt(txId, newReceiptFile)
      }

      alert('✅ Transaction modifiée')
      router.push('/transactions')
      router.refresh()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur modification : ${e?.message ?? 'inconnue'}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Chargement…</main>
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1000 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Modifier la transaction</h1>

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <label>
          Type
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as TxKind)}
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
          >
            <option value="expense">Dépense</option>
            <option value="income">Recette</option>
          </select>
        </label>

        <label>
          Date
          <input
            type="date"
            value={txDate}
            onChange={(e) => setTxDate(e.target.value)}
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
          />
        </label>

        <label>
          Montant total (€)
          <input
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
          />
        </label>

        <label>
          Libellé
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
          />
        </label>

        {kind === 'expense' && (
          <>
            <label>
              Statut PJ
              <select
                value={receiptStatus}
                onChange={(e) => setReceiptStatus(e.target.value as 'PJ fournie' | 'PJ manquante')}
                style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
              >
                <option value="PJ fournie">PJ fournie</option>
                <option value="PJ manquante">PJ manquante</option>
              </select>
            </label>

            <label>
              Remplacer / ajouter une PJ
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(e) => setNewReceiptFile(e.target.files?.[0] ?? null)}
                style={{ display: 'block', width: '100%', marginTop: 6 }}
              />
            </label>

            <div style={{ opacity: 0.75 }}>
              PJ actuelle : <b>{receiptPath ? 'présente' : 'aucune'}</b>
            </div>
          </>
        )}
      </div>

      <h2 style={{ marginTop: 24, fontSize: 18, fontWeight: 800 }}>Allocations</h2>

      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        {allocations.map((a, idx) => {
          const cats = a.budget_id ? filteredCategories(a.budget_id) : []
          const subs = a.category_id ? filteredSubcategories(a.category_id) : []

          return (
            <div
              key={idx}
              style={{
                border: '1px solid #ddd',
                borderRadius: 10,
                padding: 12,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gap: 10,
                  gridTemplateColumns: '1fr 1fr 1fr 160px auto',
                }}
              >
                <label>
                  Budget
                  <select
                    value={a.budget_id}
                    onChange={(e) =>
                      updateAlloc(idx, {
                        budget_id: e.target.value,
                        category_id: '',
                        subcategory_id: '',
                      })
                    }
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
                    value={a.category_id}
                    onChange={(e) =>
                      updateAlloc(idx, {
                        category_id: e.target.value,
                        subcategory_id: '',
                      })
                    }
                    disabled={!a.budget_id}
                    style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
                  >
                    <option value="">—</option>
                    {cats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Sous-catégorie
                  <select
                    value={a.subcategory_id}
                    onChange={(e) => updateAlloc(idx, { subcategory_id: e.target.value })}
                    disabled={!a.category_id}
                    style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
                  >
                    <option value="">—</option>
                    {subs.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Montant (€)
                  <input
                    value={a.amount_cents ? centsToEuros(a.amount_cents) : ''}
                    onChange={(e) => updateAlloc(idx, { amount_cents: eurosToCents(e.target.value) })}
                    style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
                  />
                </label>

                <div style={{ display: 'flex', alignItems: 'end' }}>
                  {allocations.length > 1 && (
                    <button onClick={() => removeAlloc(idx)} style={{ padding: '10px 12px' }}>
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        <button onClick={addAlloc} style={{ width: 220, padding: '10px 12px' }}>
          + Ajouter une ligne
        </button>
      </div>

      <div style={{ marginTop: 12, fontSize: 14 }}>
        Somme allocations : <b>{centsToEuros(allocationsSum)} €</b> — Montant transaction :{' '}
        <b>{centsToEuros(totalCents)} €</b>
        {allocationsSum !== totalCents && (
          <span style={{ color: 'crimson' }}> — ⚠️ les montants doivent être égaux</span>
        )}
      </div>

      <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
        <button
          onClick={save}
          disabled={!canSave || saving}
          style={{ padding: '12px 16px', opacity: !canSave || saving ? 0.6 : 1 }}
        >
          {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
        </button>

        <a
          href="/transactions"
          style={{
            padding: '12px 16px',
            border: '1px solid #ddd',
            borderRadius: 8,
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          Annuler
        </a>
      </div>
    </main>
  )
}
