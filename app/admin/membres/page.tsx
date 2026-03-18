'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Member = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  notes: string | null
  is_active: boolean
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

type Registration = {
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

type Payment = {
  id: string
  registration_id: string
  transaction_id: string | null
  paid_on: string
  amount_cents: number
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

function eurosToCents(value: string) {
  const normalized = value.replace(',', '.').trim()
  if (!normalized) return 0
  const num = Number(normalized)
  return Number.isFinite(num) ? Math.round(num * 100) : 0
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export default function AdminMembresPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingMemberId, setDeletingMemberId] = useState<string | null>(null)

  const [members, setMembers] = useState<Member[]>([])
  const [schoolYears, setSchoolYears] = useState<SchoolYear[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [payments, setPayments] = useState<Payment[]>([])

  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState('')

  const [newSchoolYearName, setNewSchoolYearName] = useState('')
  const [newSchoolYearStart, setNewSchoolYearStart] = useState('')
  const [newSchoolYearEnd, setNewSchoolYearEnd] = useState('')

  const [newMemberName, setNewMemberName] = useState('')
  const [newMemberEmail, setNewMemberEmail] = useState('')
  const [newMemberPhone, setNewMemberPhone] = useState('')
  const [newMemberNotes, setNewMemberNotes] = useState('')

  const [newMemberRegistered, setNewMemberRegistered] = useState(false)
  const [newMemberFormCompleted, setNewMemberFormCompleted] = useState(false)
  const [newMemberPaymentTerms, setNewMemberPaymentTerms] = useState('')
  const [newMemberBudgetId, setNewMemberBudgetId] = useState('')
  const [newMemberCategoryId, setNewMemberCategoryId] = useState('')
  const [newMemberSubcategoryId, setNewMemberSubcategoryId] = useState('')
  const [newMemberContributionDue, setNewMemberContributionDue] = useState('')
  const [newMemberAnnualNotes, setNewMemberAnnualNotes] = useState('')

  const [newPaymentAmountByMember, setNewPaymentAmountByMember] = useState<Record<string, string>>({})
  const [newPaymentDateByMember, setNewPaymentDateByMember] = useState<Record<string, string>>({})

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

    const [
      { data: m, error: e1 },
      { data: sy, error: e2 },
      { data: b, error: e3 },
      { data: c, error: e4 },
      { data: s, error: e5 },
      { data: r, error: e6 },
      { data: p, error: e7 },
    ] = await Promise.all([
      supabase.from('members').select('*').order('ordre').order('full_name'),
      supabase.from('school_years').select('*').order('ordre').order('start_date', { ascending: false }),
      supabase.from('budgets').select('id,name,ordre').eq('is_archived', false).order('ordre'),
      supabase.from('categories').select('id,budget_id,kind,name,ordre').order('ordre'),
      supabase.from('subcategories').select('id,category_id,name,ordre').order('ordre'),
      supabase.from('member_school_registrations').select('*'),
      supabase.from('member_school_payments').select('*').order('paid_on'),
    ])

    if (e1 || e2 || e3 || e4 || e5 || e6 || e7) {
      console.error(e1 || e2 || e3 || e4 || e5 || e6 || e7)
      alert('Erreur chargement membres')
      setLoading(false)
      return
    }

    const syData = (sy ?? []) as SchoolYear[]

    setMembers((m ?? []) as Member[])
    setSchoolYears(syData)
    setBudgets((b ?? []) as Budget[])
    setCategories((c ?? []) as Category[])
    setSubcategories((s ?? []) as Subcategory[])
    setRegistrations((r ?? []) as Registration[])
    setPayments((p ?? []) as Payment[])

    if (!selectedSchoolYearId && syData.length > 0) {
      setSelectedSchoolYearId(syData[0].id)
    }

    setLoading(false)
  }

  const membersSorted = useMemo(
    () => [...members].sort((a, b) => a.ordre - b.ordre || a.full_name.localeCompare(b.full_name)),
    [members]
  )

  function categoriesForBudget(budgetId: string, kind: 'income' | 'expense' = 'income') {
    return categories
      .filter((c) => c.budget_id === budgetId && c.kind === kind)
      .sort((a, b) => (a.ordre ?? 999) - (b.ordre ?? 999) || a.name.localeCompare(b.name))
  }

  function subcategoriesForCategory(categoryId: string) {
    return subcategories
      .filter((s) => s.category_id === categoryId)
      .sort((a, b) => (a.ordre ?? 999) - (b.ordre ?? 999) || a.name.localeCompare(b.name))
  }

  function registrationFor(memberId: string) {
    return registrations.find((r) => r.member_id === memberId && r.school_year_id === selectedSchoolYearId) ?? null
  }

  function paymentsForRegistration(registrationId: string) {
    return payments
      .filter((p) => p.registration_id === registrationId)
      .sort((a, b) => a.paid_on.localeCompare(b.paid_on))
  }

  async function ensureRegistration(memberId: string) {
    if (!selectedSchoolYearId) {
      throw new Error('Aucune année scolaire sélectionnée')
    }

    const existing = registrationFor(memberId)
    if (existing) return existing

    const { data, error } = await supabase
      .from('member_school_registrations')
      .insert({
        member_id: memberId,
        school_year_id: selectedSchoolYearId,
        is_registered: false,
        form_completed: false,
        payment_terms: null,
        budget_id: null,
        category_id: null,
        subcategory_id: null,
        contribution_due_cents: 0,
        notes: null,
      })
      .select('*')
      .single()

    if (error || !data) {
      throw error ?? new Error('Erreur création inscription annuelle')
    }

    const reg = data as Registration
    setRegistrations((prev) => [...prev, reg])
    return reg
  }

  async function createSchoolYear() {
    if (!newSchoolYearName.trim() || !newSchoolYearStart || !newSchoolYearEnd) {
      alert('Renseigne le nom + date de début + date de fin.')
      return
    }

    setSaving(true)

    try {
      const nextOrdre =
        schoolYears.length > 0 ? Math.max(...schoolYears.map((s) => s.ordre ?? 999)) + 1 : 1

      const { error } = await supabase.from('school_years').insert({
        name: newSchoolYearName.trim(),
        start_date: newSchoolYearStart,
        end_date: newSchoolYearEnd,
        ordre: nextOrdre,
        is_active: true,
      })

      if (error) throw error

      setNewSchoolYearName('')
      setNewSchoolYearStart('')
      setNewSchoolYearEnd('')
      await load()
    } catch (e) {
      console.error(e)
      alert('Erreur création année scolaire')
    } finally {
      setSaving(false)
    }
  }

  async function updateSchoolYear(schoolYearId: string, patch: Partial<SchoolYear>) {
    const { error } = await supabase.from('school_years').update(patch).eq('id', schoolYearId)
    if (error) {
      console.error(error)
      alert('Erreur modification année scolaire')
      return
    }
    await load()
  }

  async function createMember() {
    if (!newMemberName.trim()) {
      alert('Renseigne au moins le nom du membre.')
      return
    }

    if (!selectedSchoolYearId) {
      alert('Crée ou sélectionne d’abord une année scolaire.')
      return
    }

    setSaving(true)

    try {
      const nextOrdre = members.length > 0 ? Math.max(...members.map((m) => m.ordre ?? 999)) + 1 : 1

      const { data: member, error: memberErr } = await supabase
        .from('members')
        .insert({
          full_name: newMemberName.trim(),
          email: newMemberEmail.trim() || null,
          phone: newMemberPhone.trim() || null,
          notes: newMemberNotes.trim() || null,
          is_active: true,
          ordre: nextOrdre,
        })
        .select('*')
        .single()

      if (memberErr || !member) throw memberErr ?? new Error('Erreur création membre')

      const { error: regErr } = await supabase
        .from('member_school_registrations')
        .insert({
          member_id: member.id,
          school_year_id: selectedSchoolYearId,
          is_registered: newMemberRegistered,
          form_completed: newMemberFormCompleted,
          payment_terms: newMemberPaymentTerms.trim() || null,
          budget_id: newMemberBudgetId || null,
          category_id: newMemberCategoryId || null,
          subcategory_id: newMemberSubcategoryId || null,
          contribution_due_cents: eurosToCents(newMemberContributionDue),
          notes: newMemberAnnualNotes.trim() || null,
        })

      if (regErr) throw regErr

      setNewMemberName('')
      setNewMemberEmail('')
      setNewMemberPhone('')
      setNewMemberNotes('')
      setNewMemberRegistered(false)
      setNewMemberFormCompleted(false)
      setNewMemberPaymentTerms('')
      setNewMemberBudgetId('')
      setNewMemberCategoryId('')
      setNewMemberSubcategoryId('')
      setNewMemberContributionDue('')
      setNewMemberAnnualNotes('')

      await load()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur création membre : ${e?.message ?? 'inconnue'}`)
    } finally {
      setSaving(false)
    }
  }

  async function updateMember(memberId: string, patch: Partial<Member>) {
    const { error } = await supabase.from('members').update(patch).eq('id', memberId)
    if (error) {
      console.error(error)
      alert('Erreur modification membre')
      return
    }
    await load()
  }

  async function updateRegistration(memberId: string, patch: Partial<Registration>) {
    try {
      const reg = await ensureRegistration(memberId)

      const { error } = await supabase
        .from('member_school_registrations')
        .update(patch)
        .eq('id', reg.id)

      if (error) throw error

      setRegistrations((prev) =>
        prev.map((r) => (r.id === reg.id ? { ...r, ...patch } : r))
      )
    } catch (e: any) {
      console.error(e)
      alert(`Erreur mise à jour inscription : ${e?.message ?? 'inconnue'}`)
    }
  }

  async function addPayment(memberId: string) {
    const amountStr = newPaymentAmountByMember[memberId] ?? ''
    const paidOn = newPaymentDateByMember[memberId] ?? todayIso()
    const amount_cents = eurosToCents(amountStr)

    if (amount_cents <= 0) {
      alert('Entre un montant valide.')
      return
    }

    try {
      const reg = await ensureRegistration(memberId)

      const { error } = await supabase.from('member_school_payments').insert({
        registration_id: reg.id,
        transaction_id: null,
        paid_on: paidOn,
        amount_cents,
      })

      if (error) throw error

      setNewPaymentAmountByMember((prev) => ({ ...prev, [memberId]: '' }))
      setNewPaymentDateByMember((prev) => ({ ...prev, [memberId]: todayIso() }))

      await load()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur ajout paiement : ${e?.message ?? 'inconnue'}`)
    }
  }

  async function deletePayment(paymentId: string) {
    const ok = confirm('Supprimer ce paiement ?')
    if (!ok) return

    const { error } = await supabase.from('member_school_payments').delete().eq('id', paymentId)
    if (error) {
      console.error(error)
      alert('Erreur suppression paiement')
      return
    }

    await load()
  }

  async function deleteMember(memberId: string) {
    const ok = confirm(
      'Supprimer ce membre ? Cela supprimera aussi ses inscriptions annuelles et ses paiements manuels.'
    )
    if (!ok) return

    setDeletingMemberId(memberId)

    try {
      const regIds = registrations.filter((r) => r.member_id === memberId).map((r) => r.id)

      if (regIds.length > 0) {
        const { error: payErr } = await supabase
          .from('member_school_payments')
          .delete()
          .in('registration_id', regIds)
        if (payErr) throw payErr

        const { error: regErr } = await supabase
          .from('member_school_registrations')
          .delete()
          .eq('member_id', memberId)
        if (regErr) throw regErr
      }

      const { error: memberErr } = await supabase
        .from('members')
        .delete()
        .eq('id', memberId)

      if (memberErr) throw memberErr

      await load()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur suppression membre : ${e?.message ?? 'inconnue'}`)
    } finally {
      setDeletingMemberId(null)
    }
  }

  function budgetName(id: string | null) {
    if (!id) return '—'
    return budgets.find((b) => b.id === id)?.name ?? '—'
  }

  function categoryName(id: string | null) {
    if (!id) return '—'
    return categories.find((c) => c.id === id)?.name ?? '—'
  }

  function subcategoryName(id: string | null) {
    if (!id) return '—'
    return subcategories.find((s) => s.id === id)?.name ?? '—'
  }

  const newMemberCategories = newMemberBudgetId ? categoriesForBudget(newMemberBudgetId, 'income') : []
  const newMemberSubcategories = newMemberCategoryId ? subcategoriesForCategory(newMemberCategoryId) : []

  if (loading) {
    return <main style={{ padding: 24, fontFamily: 'system-ui' }}>Chargement…</main>
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1300 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900 }}>Admin — Membres</h1>

      <section style={{ marginTop: 20, border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Années scolaires</h2>

        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          {schoolYears.map((sy) => (
            <div
              key={sy.id}
              style={{
                border: '1px solid #eee',
                borderRadius: 10,
                padding: 12,
                display: 'grid',
                gridTemplateColumns: '1fr 160px 160px 100px auto auto',
                gap: 10,
                alignItems: 'center',
              }}
            >
              <input
                value={sy.name}
                onChange={(e) =>
                  setSchoolYears((prev) =>
                    prev.map((x) => (x.id === sy.id ? { ...x, name: e.target.value } : x))
                  )
                }
                style={{ padding: 8 }}
              />

              <input
                type="date"
                value={sy.start_date}
                onChange={(e) =>
                  setSchoolYears((prev) =>
                    prev.map((x) => (x.id === sy.id ? { ...x, start_date: e.target.value } : x))
                  )
                }
                style={{ padding: 8 }}
              />

              <input
                type="date"
                value={sy.end_date}
                onChange={(e) =>
                  setSchoolYears((prev) =>
                    prev.map((x) => (x.id === sy.id ? { ...x, end_date: e.target.value } : x))
                  )
                }
                style={{ padding: 8 }}
              />

              <input
                type="number"
                value={sy.ordre}
                onChange={(e) =>
                  setSchoolYears((prev) =>
                    prev.map((x) => (x.id === sy.id ? { ...x, ordre: Number(e.target.value || 999) } : x))
                  )
                }
                style={{ padding: 8 }}
              />

              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={sy.is_active}
                  onChange={(e) =>
                    setSchoolYears((prev) =>
                      prev.map((x) => (x.id === sy.id ? { ...x, is_active: e.target.checked } : x))
                    )
                  }
                />
                Active
              </label>

              <button
                onClick={() =>
                  updateSchoolYear(sy.id, {
                    name: sy.name,
                    start_date: sy.start_date,
                    end_date: sy.end_date,
                    ordre: sy.ordre,
                    is_active: sy.is_active,
                  })
                }
              >
                Sauver
              </button>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 16,
            borderTop: '1px solid #eee',
            paddingTop: 16,
            display: 'grid',
            gridTemplateColumns: '1fr 180px 180px auto',
            gap: 10,
            alignItems: 'end',
          }}
        >
          <input
            placeholder="Ex: 2025-2026"
            value={newSchoolYearName}
            onChange={(e) => setNewSchoolYearName(e.target.value)}
            style={{ padding: 8 }}
          />
          <input
            type="date"
            value={newSchoolYearStart}
            onChange={(e) => setNewSchoolYearStart(e.target.value)}
            style={{ padding: 8 }}
          />
          <input
            type="date"
            value={newSchoolYearEnd}
            onChange={(e) => setNewSchoolYearEnd(e.target.value)}
            style={{ padding: 8 }}
          />
          <button onClick={createSchoolYear} disabled={saving}>
            Créer année scolaire
          </button>
        </div>
      </section>

      <div style={{ marginTop: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
        <label>Année scolaire :</label>
        <select
          value={selectedSchoolYearId}
          onChange={(e) => setSelectedSchoolYearId(e.target.value)}
          style={{ padding: 8, minWidth: 180 }}
        >
          {schoolYears
            .filter((s) => s.is_active)
            .sort((a, b) => a.ordre - b.ordre || a.name.localeCompare(b.name))
            .map((sy) => (
              <option key={sy.id} value={sy.id}>
                {sy.name}
              </option>
            ))}
        </select>
      </div>

      <section style={{ marginTop: 24, border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Ajouter un membre</h2>

        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <input
            placeholder="Nom complet"
            value={newMemberName}
            onChange={(e) => setNewMemberName(e.target.value)}
            style={{ padding: 8 }}
          />

          <input
            placeholder="Email"
            value={newMemberEmail}
            onChange={(e) => setNewMemberEmail(e.target.value)}
            style={{ padding: 8 }}
          />

          <input
            placeholder="Téléphone"
            value={newMemberPhone}
            onChange={(e) => setNewMemberPhone(e.target.value)}
            style={{ padding: 8 }}
          />

          <input
            placeholder="Notes membre"
            value={newMemberNotes}
            onChange={(e) => setNewMemberNotes(e.target.value)}
            style={{ padding: 8 }}
          />
        </div>

        <div style={{ marginTop: 18, borderTop: '1px solid #eee', paddingTop: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>
            Infos pour l’année scolaire sélectionnée
          </div>

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={newMemberRegistered}
                onChange={(e) => setNewMemberRegistered(e.target.checked)}
              />
              Inscrit
            </label>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={newMemberFormCompleted}
                onChange={(e) => setNewMemberFormCompleted(e.target.checked)}
              />
              Formulaire rempli
            </label>
          </div>

          <div
            style={{
              marginTop: 12,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr 1fr',
              gap: 10,
            }}
          >
            <input
              placeholder="Mode de paiement"
              value={newMemberPaymentTerms}
              onChange={(e) => setNewMemberPaymentTerms(e.target.value)}
              style={{ padding: 8 }}
            />

            <select
              value={newMemberBudgetId}
              onChange={(e) => {
                setNewMemberBudgetId(e.target.value)
                setNewMemberCategoryId('')
                setNewMemberSubcategoryId('')
              }}
              style={{ padding: 8 }}
            >
              <option value="">Projet / Budget</option>
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            <select
              value={newMemberCategoryId}
              onChange={(e) => {
                setNewMemberCategoryId(e.target.value)
                setNewMemberSubcategoryId('')
              }}
              style={{ padding: 8 }}
            >
              <option value="">Catégorie cible</option>
              {newMemberCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={newMemberSubcategoryId}
              onChange={(e) => setNewMemberSubcategoryId(e.target.value)}
              style={{ padding: 8 }}
            >
              <option value="">Sous-catégorie cible</option>
              {newMemberSubcategories.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              marginTop: 10,
              display: 'grid',
              gridTemplateColumns: '180px 1fr',
              gap: 10,
            }}
          >
            <input
              placeholder="Cotisation attendue (€)"
              value={newMemberContributionDue}
              onChange={(e) => setNewMemberContributionDue(e.target.value)}
              style={{ padding: 8 }}
            />

            <input
              placeholder="Notes adhésion annuelle"
              value={newMemberAnnualNotes}
              onChange={(e) => setNewMemberAnnualNotes(e.target.value)}
              style={{ padding: 8 }}
            />
          </div>
        </div>

        <button
          onClick={createMember}
          disabled={saving}
          style={{ marginTop: 16, width: 220 }}
        >
          Créer le membre
        </button>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Suivi des membres</h2>

        <div style={{ marginTop: 16, display: 'grid', gap: 16 }}>
          {membersSorted.map((member) => {
            const reg = registrationFor(member.id)
            const regPayments = reg ? paymentsForRegistration(reg.id) : []
            const totalPaid = regPayments.reduce((sum, p) => sum + p.amount_cents, 0)
            const due = reg?.contribution_due_cents ?? 0
            const remaining = Math.max(due - totalPaid, 0)
            const isSolded = due > 0 && totalPaid >= due

            const cats = reg?.budget_id ? categoriesForBudget(reg.budget_id, 'income') : []
            const subs = reg?.category_id ? subcategoriesForCategory(reg.category_id) : []

            return (
              <div key={member.id} style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.2fr 110px auto auto auto',
                    gap: 10,
                    alignItems: 'center',
                  }}
                >
                  <input
                    value={member.full_name}
                    onChange={(e) =>
                      setMembers((prev) =>
                        prev.map((m) => (m.id === member.id ? { ...m, full_name: e.target.value } : m))
                      )
                    }
                    style={{ padding: 8, fontWeight: 700 }}
                  />

                  <input
                    type="number"
                    value={member.ordre}
                    onChange={(e) =>
                      setMembers((prev) =>
                        prev.map((m) => (m.id === member.id ? { ...m, ordre: Number(e.target.value || 999) } : m))
                      )
                    }
                    style={{ padding: 8 }}
                  />

                  <button
                    onClick={() =>
                      updateMember(member.id, {
                        full_name: member.full_name,
                        ordre: member.ordre,
                        email: member.email,
                        phone: member.phone,
                        notes: member.notes,
                        is_active: member.is_active,
                      })
                    }
                  >
                    Sauver membre
                  </button>

                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={member.is_active}
                      onChange={(e) => updateMember(member.id, { is_active: e.target.checked })}
                    />
                    Actif
                  </label>

                  <button
                    onClick={() => deleteMember(member.id)}
                    disabled={deletingMemberId === member.id}
                    style={{
                      border: '1px solid #d9b3b3',
                      background: '#fff7f7',
                      borderRadius: 8,
                      padding: '8px 10px',
                    }}
                  >
                    {deletingMemberId === member.id ? 'Suppression…' : 'Supprimer'}
                  </button>
                </div>

                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  <input
                    placeholder="Email"
                    value={member.email ?? ''}
                    onChange={(e) =>
                      setMembers((prev) =>
                        prev.map((m) => (m.id === member.id ? { ...m, email: e.target.value } : m))
                      )
                    }
                    style={{ padding: 8 }}
                  />
                  <input
                    placeholder="Téléphone"
                    value={member.phone ?? ''}
                    onChange={(e) =>
                      setMembers((prev) =>
                        prev.map((m) => (m.id === member.id ? { ...m, phone: e.target.value } : m))
                      )
                    }
                    style={{ padding: 8 }}
                  />
                  <input
                    placeholder="Notes membre"
                    value={member.notes ?? ''}
                    onChange={(e) =>
                      setMembers((prev) =>
                        prev.map((m) => (m.id === member.id ? { ...m, notes: e.target.value } : m))
                      )
                    }
                    style={{ padding: 8 }}
                  />
                </div>

                <div
                  style={{
                    marginTop: 16,
                    borderTop: '1px solid #eee',
                    paddingTop: 16,
                    display: 'grid',
                    gap: 10,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>Adhésion annuelle</div>

                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={reg?.is_registered ?? false}
                        onChange={(e) => updateRegistration(member.id, { is_registered: e.target.checked })}
                      />
                      Inscrit
                    </label>

                    <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={reg?.form_completed ?? false}
                        onChange={(e) => updateRegistration(member.id, { form_completed: e.target.checked })}
                      />
                      Formulaire rempli
                    </label>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr 1fr',
                      gap: 10,
                      alignItems: 'end',
                    }}
                  >
                    <label>
                      Mode de paiement
                      <input
                        value={reg?.payment_terms ?? ''}
                        onChange={(e) => updateRegistration(member.id, { payment_terms: e.target.value })}
                        placeholder="Ex: 3 fois / chèque / virement"
                        style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
                      />
                    </label>

                    <label>
                      Projet / Budget
                      <select
                        value={reg?.budget_id ?? ''}
                        onChange={(e) =>
                          updateRegistration(member.id, {
                            budget_id: e.target.value || null,
                            category_id: null,
                            subcategory_id: null,
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
                      Catégorie cible
                      <select
                        value={reg?.category_id ?? ''}
                        onChange={(e) =>
                          updateRegistration(member.id, {
                            category_id: e.target.value || null,
                            subcategory_id: null,
                          })
                        }
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
                      Sous-catégorie cible
                      <select
                        value={reg?.subcategory_id ?? ''}
                        onChange={(e) =>
                          updateRegistration(member.id, { subcategory_id: e.target.value || null })
                        }
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
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '180px 1fr',
                      gap: 10,
                      alignItems: 'end',
                    }}
                  >
                    <label>
                      Cotisation attendue (€)
                      <input
                        value={reg ? centsToEuros(reg.contribution_due_cents) : ''}
                        onChange={(e) =>
                          updateRegistration(member.id, {
                            contribution_due_cents: eurosToCents(e.target.value),
                          })
                        }
                        placeholder="0,00"
                        style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
                      />
                    </label>

                    <label>
                      Notes adhésion annuelle
                      <input
                        value={reg?.notes ?? ''}
                        onChange={(e) => updateRegistration(member.id, { notes: e.target.value })}
                        style={{ display: 'block', width: '100%', padding: 8, marginTop: 6 }}
                      />
                    </label>
                  </div>

                  <div style={{ fontSize: 14, opacity: 0.8 }}>
                    Affectation comptable actuelle : <b>{budgetName(reg?.budget_id ?? null)}</b> —{' '}
                    <b>{categoryName(reg?.category_id ?? null)}</b>
                    {reg?.subcategory_id ? ` • ${subcategoryName(reg.subcategory_id)}` : ''}
                  </div>

                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    <div>Total payé : <b>{centsToEuros(totalPaid)} €</b></div>
                    <div>Reste : <b>{centsToEuros(remaining)} €</b></div>
                    <div>
                      Statut :{' '}
                      <b style={{ color: isSolded ? 'green' : '#b26a00' }}>
                        {isSolded ? 'Soldé' : due === 0 ? 'Non défini' : 'En attente'}
                      </b>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Paiements</div>

                  <div style={{ display: 'grid', gap: 8 }}>
                    {regPayments.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '140px 140px 1fr auto',
                          gap: 10,
                          alignItems: 'center',
                          border: '1px solid #eee',
                          borderRadius: 8,
                          padding: 10,
                        }}
                      >
                        <div>{p.paid_on}</div>
                        <div>{centsToEuros(p.amount_cents)} €</div>
                        <div>
                          {p.transaction_id ? (
                            <a
                              href={`/transactions/${p.transaction_id}/edit`}
                              style={{ textDecoration: 'none' }}
                            >
                              Voir transaction liée
                            </a>
                          ) : (
                            <span style={{ opacity: 0.7 }}>Paiement manuel</span>
                          )}
                        </div>
                        <button onClick={() => deletePayment(p.id)}>Supprimer</button>
                      </div>
                    ))}

                    {regPayments.length === 0 && (
                      <div style={{ opacity: 0.7 }}>Aucun paiement enregistré.</div>
                    )}
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      display: 'flex',
                      gap: 10,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    <input
                      type="date"
                      value={newPaymentDateByMember[member.id] ?? todayIso()}
                      onChange={(e) =>
                        setNewPaymentDateByMember((prev) => ({
                          ...prev,
                          [member.id]: e.target.value,
                        }))
                      }
                      style={{ padding: 8 }}
                    />

                    <input
                      placeholder="Montant payé"
                      value={newPaymentAmountByMember[member.id] ?? ''}
                      onChange={(e) =>
                        setNewPaymentAmountByMember((prev) => ({
                          ...prev,
                          [member.id]: e.target.value,
                        }))
                      }
                      style={{ padding: 8, width: 140 }}
                    />

                    <button onClick={() => addPayment(member.id)}>
                      Ajouter un paiement manuel
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          {membersSorted.length === 0 && (
            <div style={{ opacity: 0.7 }}>Aucun membre pour le moment.</div>
          )}
        </div>
      </section>
    </main>
  )
}
