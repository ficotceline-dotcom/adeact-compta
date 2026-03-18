'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type TxKind = 'income' | 'expense'

type Budget = { id: string; name: string }
type Category = { id: string; name: string; kind: TxKind; budget_id: string }
type Subcategory = { id: string; name: string; category_id: string }
type FiscalYear = { id: string; year: number; start_date: string; end_date: string }

type Allocation = {
  budget_id: string
  category_id: string
  subcategory_id: string
  amount_cents: number
}

type CommunicationRule = {
  id: string
  budget_id: string
  category_id: string
  subcategory_id: string | null
  percentage: number
  ordre: number
}

type SchoolYear = {
  id: string
  name: string
  start_date: string
  end_date: string
  ordre: number
  is_active: boolean
}

type Member = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
}

type MemberRegistration = {
  id: string
  member_id: string
  school_year_id: string
  is_registered: boolean
  form_completed: boolean
  payment_terms: string | null
  budget_id: string | null
  category_id: string | null
  subcategory_id: string | null
  contribution_due_cents: number
  notes: string | null
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

async function findPotentialDuplicates(tx_date: string, amount_cents: number) {
  const { data, error } = await supabase
    .from('transactions')
    .select('id,tx_date,description,kind')
    .eq('tx_date', tx_date)
    .eq('amount_cents', amount_cents)
    .limit(10)

  if (error) throw error
  return data ?? []
}

function computeCommunicationAllocations(totalCents: number, rules: CommunicationRule[]): Allocation[] {
  if (totalCents <= 0 || rules.length === 0) return []

  const sortedRules = [...rules].sort((a, b) => a.ordre - b.ordre)

  const raw = sortedRules.map((r) => {
    const exact = (totalCents * Number(r.percentage)) / 100
    const floored = Math.floor(exact)
    const fractional = exact - floored
    return {
      rule: r,
      floored,
      fractional,
    }
  })

  let allocated = raw.reduce((sum, x) => sum + x.floored, 0)
  let remaining = totalCents - allocated

  const order = [...raw]
    .map((x, index) => ({ ...x, index }))
    .sort((a, b) => b.fractional - a.fractional)

  const bonus = new Array(raw.length).fill(0)

  for (let i = 0; i < remaining; i++) {
    bonus[order[i % order.length].index] += 1
  }

  return raw.map((x, index) => ({
    budget_id: x.rule.budget_id,
    category_id: x.rule.category_id,
    subcategory_id: x.rule.subcategory_id ?? '',
    amount_cents: x.floored + bonus[index],
  }))
}

export default function NewTransactionPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([])
  const [communicationRules, setCommunicationRules] = useState<CommunicationRule[]>([])

  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [memberRegistrations, setMemberRegistrations] = useState<MemberRegistration[]>([])

  const [kind, setKind] = useState<TxKind>('expense')
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [amountInput, setAmountInput] = useState('')

  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [isCommunicationExpense, setIsCommunicationExpense] = useState(false)

  const [isCotisationAssociative, setIsCotisationAssociative] = useState(false)
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState('')
  const [selectedRegistrationId, setSelectedRegistrationId] = useState('')

  const [allocations, setAllocations] = useState<Allocation[]>([
    { budget_id: '', category_id: '', subcategory_id: '', amount_cents: 0 },
  ])

  useEffect(() => {
    ;(async () => {
      setLoading(true)

      const [
        { data: b, error: e1 },
        { data: c, error: e2 },
        { data: s, error: e3 },
        { data: fy, error: e4 },
        { data: rules, error: e5 },
        { data: sy, error: e6 },
        { data: m, error: e7 },
        { data: regs, error: e8 },
      ] = await Promise.all([
        supabase.from('budgets').select('id,name').eq('is_archived', false).order('name'),
        supabase.from('categories').select('id,name,kind,budget_id'),
        supabase.from('subcategories').select('id,name,category_id'),
        supabase.from('fiscal_years').select('id,year,start_date,end_date').order('year', { ascending: false }),
        supabase.from('communication_split_rules').select('*').order('ordre'),
        supabase.from('school_years').select('*').eq('is_active', true).order('ordre'),
        supabase.from('members').select('id,full_name,email,phone').eq('is_active', true).order('ordre').order('full_name'),
        supabase.from('member_school_registrations').select('*'),
      ])

      if (e1 || e2 || e3 || e4 || e5 || e6 || e7 || e8) {
        console.error(e1 || e2 || e3 || e4 || e5 || e6 || e7 || e8)
        alert('Erreur chargement référentiels')
        setLoading(false)
        return
      }

      const schoolYearRows = (sy ?? []) as SchoolYear[]

      setBudgets((b ?? []) as Budget[])
      setCategories((c ?? []) as Category[])
      setSubcategories((s ?? []) as Subcategory[])
      setFiscalYears((fy ?? []) as FiscalYear[])
      setCommunicationRules((rules ?? []) as CommunicationRule[])
      setSchoolYears(schoolYearRows)
      setMembers((m ?? []) as Member[])
      setMemberRegistrations((regs ?? []) as MemberRegistration[])

      if (schoolYearRows.length > 0) {
        setSelectedSchoolYearId(schoolYearRows[0].id)
      }

      setLoading(false)
    })()
  }, [])

  const totalCents = useMemo(() => eurosToCents(amountInput), [amountInput])

  const availableRegistrations = useMemo(() => {
    return memberRegistrations
      .filter((r) => r.school_year_id === selectedSchoolYearId)
      .sort((a, b) => {
        const ma = members.find((m) => m.id === a.member_id)?.full_name ?? ''
        const mb = members.find((m) => m.id === b.member_id)?.full_name ?? ''
        return ma.localeCompare(mb)
      })
  }, [memberRegistrations, selectedSchoolYearId, members])

  const selectedRegistration = useMemo(
    () => availableRegistrations.find((r) => r.id === selectedRegistrationId) ?? null,
    [availableRegistrations, selectedRegistrationId]
  )

  const selectedMember = useMemo(
    () => members.find((m) => m.id === selectedRegistration?.member_id) ?? null,
    [members, selectedRegistration]
  )

  useEffect(() => {
    if (isCommunicationExpense) {
      setAllocations(computeCommunicationAllocations(totalCents, communicationRules))
      return
    }

    if (isCotisationAssociative && selectedRegistration) {
      if (selectedRegistration.budget_id && selectedRegistration.category_id) {
        setAllocations([
          {
            budget_id: selectedRegistration.budget_id,
            category_id: selectedRegistration.category_id,
            subcategory_id: selectedRegistration.subcategory_id ?? '',
            amount_cents: totalCents,
          },
        ])
      } else {
        setAllocations([])
      }
      return
    }

    setAllocations((prev) => {
      if (prev.length === 1) {
        return [{ ...prev[0], amount_cents: totalCents }]
      }
      return prev
    })
  }, [totalCents, isCommunicationExpense, communicationRules, isCotisationAssociative, selectedRegistration])

  useEffect(() => {
    if (isCotisationAssociative && selectedMember && !description.trim()) {
      setDescription(`Cotisation associative - ${selectedMember.full_name}`)
    }
  }, [isCotisationAssociative, selectedMember, description])

  const allocSumCents = useMemo(
    () => allocations.reduce((sum, a) => sum + (a.amount_cents || 0), 0),
    [allocations]
  )

  const canSubmit = useMemo(() => {
    if (!txDate) return false
    if (totalCents <= 0) return false
    if (allocations.length < 1) return false

    if (isCotisationAssociative) {
      if (!selectedSchoolYearId || !selectedRegistrationId) return false
      if (!selectedRegistration?.budget_id || !selectedRegistration?.category_id) return false
    }

    for (const a of allocations) {
      if (!a.budget_id || !a.category_id) return false
      if (!a.amount_cents || a.amount_cents <= 0) return false
    }

    if (allocSumCents !== totalCents) return false
    return true
  }, [
    txDate,
    totalCents,
    allocations,
    allocSumCents,
    isCotisationAssociative,
    selectedSchoolYearId,
    selectedRegistrationId,
    selectedRegistration,
  ])

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

  function budgetName(id: string) {
    return budgets.find((b) => b.id === id)?.name ?? '—'
  }

  function categoryName(id: string) {
    return categories.find((c) => c.id === id)?.name ?? '—'
  }

  function subcategoryName(id: string) {
    return subcategories.find((s) => s.id === id)?.name ?? '—'
  }

  async function save() {
    if (!canSubmit) return

    setSaving(true)

    try {
      const duplicates = await findPotentialDuplicates(txDate, totalCents)
      if (duplicates.length > 0) {
        const details = duplicates
          .map((d: any) => `- ${d.tx_date} | ${d.kind === 'expense' ? 'Dépense' : 'Recette'} | ${d.description ?? 'Sans libellé'}`)
          .join('\n')

        const shouldContinue = window.confirm(
          `⚠️ Une ou plusieurs transactions existent déjà avec la même date et le même montant.\n\n${details}\n\nCliquer sur OK pour continuer quand même, ou Annuler pour arrêter.`
        )

        if (!shouldContinue) {
          setSaving(false)
          return
        }
      }

      const fy = findFiscalYear(txDate, fiscalYears)

      const receipt_status =
        kind === 'expense'
          ? receiptFile
            ? 'PJ fournie'
            : 'PJ manquante'
          : 'PJ fournie'

      const finalDescription =
        description.trim() ||
        (isCotisationAssociative && selectedMember
          ? `Cotisation associative - ${selectedMember.full_name}`
          : 'Sans libellé')

      const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .insert({
          tx_date: txDate,
          kind,
          description: finalDescription,
          amount_cents: totalCents,
          receipt_status,
          fiscal_year_id: fy?.id ?? null,
        })
        .select('id')
        .single()

      if (txErr || !tx) throw txErr ?? new Error('Erreur création transaction')

      const rows = []

      for (const a of allocations) {
        const mapping = await getMapping(a.category_id, a.subcategory_id)

        rows.push({
          transaction_id: tx.id,
          budget_id: a.budget_id,
          category_id: a.category_id,
          subcategory_id: a.subcategory_id || null,
          amount_cents: a.amount_cents,
          poste_cr: mapping.poste_cr,
          poste_bilan: mapping.poste_bilan,
        })
      }

      const { error: allocErr } = await supabase
        .from('transaction_allocations')
        .insert(rows)

      if (allocErr) throw allocErr

      if (isCotisationAssociative && selectedRegistration) {
        const { error: payErr } = await supabase
          .from('member_school_payments')
          .insert({
            registration_id: selectedRegistration.id,
            transaction_id: tx.id,
            paid_on: txDate,
            amount_cents: totalCents,
          })

        if (payErr) throw payErr
      }

      if (kind === 'expense' && receiptFile) {
        await uploadReceipt(tx.id, receiptFile)
      }

      alert('✅ Transaction enregistrée !')

      setKind('expense')
      setTxDate(new Date().toISOString().slice(0, 10))
      setDescription('')
      setAmountInput('')
      setReceiptFile(null)
      setIsCommunicationExpense(false)
      setIsCotisationAssociative(false)
      setSelectedRegistrationId('')
      setAllocations([{ budget_id: '', category_id: '', subcategory_id: '', amount_cents: 0 }])
    } catch (e: any) {
      console.error(e)
      alert('Erreur enregistrement : ' + (e?.message ?? 'inconnue'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Chargement…</main>
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1000 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Nouvelle transaction</h1>

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        <label>
          Type
          <select
            value={kind}
            onChange={(e) => {
              const v = e.target.value as TxKind
              setKind(v)
              setReceiptFile(null)

              if (v !== 'expense') {
                setIsCommunicationExpense(false)
              }
              if (v !== 'income') {
                setIsCotisationAssociative(false)
                setSelectedRegistrationId('')
              }

              setAllocations([{ budget_id: '', category_id: '', subcategory_id: '', amount_cents: totalCents }])
            }}
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
            placeholder="Facultatif"
            style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
          />
        </label>

        {kind === 'expense' && (
          <>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={isCommunicationExpense}
                onChange={(e) => {
                  const checked = e.target.checked
                  setIsCommunicationExpense(checked)

                  if (checked) {
                    setIsCotisationAssociative(false)
                    setSelectedRegistrationId('')
                    setAllocations(computeCommunicationAllocations(totalCents, communicationRules))
                  } else {
                    setAllocations([{ budget_id: '', category_id: '', subcategory_id: '', amount_cents: totalCents }])
                  }
                }}
              />
              Dépense de communication
            </label>

            <label>
              Pièce jointe (optionnelle)
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null
                  setReceiptFile(file)
                }}
                style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
              />
              <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>
                Si tu n’ajoutes pas de fichier maintenant, la dépense sera automatiquement marquée “PJ manquante”.
              </div>
            </label>
          </>
        )}

        {kind === 'income' && (
          <>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={isCotisationAssociative}
                onChange={(e) => {
                  const checked = e.target.checked
                  setIsCotisationAssociative(checked)

                  if (checked) {
                    setIsCommunicationExpense(false)
                    setAllocations([])
                  } else {
                    setSelectedRegistrationId('')
                    setAllocations([{ budget_id: '', category_id: '', subcategory_id: '', amount_cents: totalCents }])
                  }
                }}
              />
              Cotisation associative
            </label>

            {isCotisationAssociative && (
              <div style={{ display: 'grid', gap: 12, border: '1px solid #ddd', borderRadius: 10, padding: 12 }}>
                <label>
                  Année scolaire
                  <select
                    value={selectedSchoolYearId}
                    onChange={(e) => {
                      setSelectedSchoolYearId(e.target.value)
                      setSelectedRegistrationId('')
                    }}
                    style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
                  >
                    <option value="">—</option>
                    {schoolYears.map((sy) => (
                      <option key={sy.id} value={sy.id}>
                        {sy.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Membre
                  <select
                    value={selectedRegistrationId}
                    onChange={(e) => setSelectedRegistrationId(e.target.value)}
                    style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
                  >
                    <option value="">—</option>
                    {availableRegistrations.map((reg) => {
                      const member = members.find((m) => m.id === reg.member_id)
                      return (
                        <option key={reg.id} value={reg.id}>
                          {member?.full_name ?? '—'}
                        </option>
                      )
                    })}
                  </select>
                </label>

                {selectedRegistration && (
                  <div style={{ fontSize: 14, opacity: 0.85 }}>
                    Affectation automatique :
                    <br />
                    <b>{budgetName(selectedRegistration.budget_id ?? '')}</b> —{' '}
                    <b>{categoryName(selectedRegistration.category_id ?? '')}</b>
                    {selectedRegistration.subcategory_id
                      ? ` • ${subcategoryName(selectedRegistration.subcategory_id)}`
                      : ''}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <h2 style={{ marginTop: 24, fontSize: 18, fontWeight: 700 }}>
        {(isCommunicationExpense || isCotisationAssociative) ? 'Répartition automatique' : 'Allocations'}
      </h2>

      {!isCommunicationExpense && !isCotisationAssociative ? (
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          {allocations.map((a, idx) => {
            const cats = a.budget_id ? filteredCategories(a.budget_id) : []
            const subs = a.category_id ? filteredSubcategories(a.category_id) : []

            return (
              <div
                key={idx}
                style={{ border: '1px solid #ddd', borderRadius: 10, padding: 12 }}
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
                      onChange={(e) =>
                        updateAlloc(idx, { subcategory_id: e.target.value })
                      }
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
                      onChange={(e) =>
                        updateAlloc(idx, { amount_cents: eurosToCents(e.target.value) })
                      }
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

          <button onClick={addAlloc} style={{ padding: '10px 12px', width: 220 }}>
            + Ajouter une ligne
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 12, border: '1px solid #ddd', borderRadius: 10, padding: 12 }}>
          {allocations.length === 0 ? (
            <div style={{ color: 'crimson' }}>
              Impossible de répartir automatiquement tant que la configuration n’est pas complète.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {allocations.map((a, i) => (
                <div key={i}>
                  <b>{budgetName(a.budget_id)}</b> — {categoryName(a.category_id)}
                  {a.subcategory_id ? ` • ${subcategoryName(a.subcategory_id)}` : ''} :
                  {' '}<b>{centsToEuros(a.amount_cents)} €</b>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 14 }}>
        Somme allocations : <b>{centsToEuros(allocSumCents)} €</b> — Montant transaction :{' '}
        <b>{centsToEuros(totalCents)} €</b>
        {allocSumCents !== totalCents && (
          <span style={{ color: 'crimson' }}> — ⚠️ La somme doit être égale au montant</span>
        )}
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
        <button
          disabled={!canSubmit || saving}
          onClick={save}
          style={{ padding: '12px 16px', fontSize: 16, opacity: canSubmit ? 1 : 0.5 }}
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
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
