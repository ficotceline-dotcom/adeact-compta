'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Budget = {
  id: string
  name: string
  is_archived: boolean | null
  ordre: number
  discord_webhook_url?: string | null
}

type CategoryWithWebhook = {
  id: string
  name: string
  budget_id: string
  discord_webhook_url: string
}

type FiscalYear = {
  id: string
  year: number
}

type TxDateRow = {
  tx_date: string | null
}

type AllocationRow = {
  id: string
  budget_id: string
  amount_cents: number
  budget:
    | { id: string; name: string; ordre: number }
    | { id: string; name: string; ordre: number }[]
    | null
  category:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null
  subcategory:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null
  transaction:
    | {
        id: string
        kind: 'income' | 'expense'
        receipt_status: string
        tx_date: string
        fiscal_year_id: string | null
        description: string | null
      }
    | {
        id: string
        kind: 'income' | 'expense'
        receipt_status: string
        tx_date: string
        fiscal_year_id: string | null
        description: string | null
      }[]
    | null
}

type GroupedSubcategory = {
  name: string
  amount_cents: number
}

type GroupedCategory = {
  name: string
  amount_cents: number
  subcategories: GroupedSubcategory[]
}

function firstObj<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

function formatFrDate(dateStr: string | null) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

function getMaxTxDate(rows: TxDateRow[]): string | null {
  const dates = rows.map((r) => r.tx_date).filter((d): d is string => Boolean(d))
  if (dates.length === 0) return null
  return dates.reduce((max, current) => (current > max ? current : max))
}

function groupBudgetSide(
  rows: AllocationRow[],
  kind: 'income' | 'expense'
): GroupedCategory[] {
  const categoryMap = new Map<string, { amount_cents: number; subMap: Map<string, number> }>()

  for (const row of rows) {
    const tx = firstObj(row.transaction)
    if (!tx || tx.kind !== kind) continue

    const categoryName = firstObj(row.category)?.name ?? 'Sans catégorie'
    const subcategoryName = firstObj(row.subcategory)?.name ?? 'Sans sous-catégorie'

    if (!categoryMap.has(categoryName)) {
      categoryMap.set(categoryName, {
        amount_cents: 0,
        subMap: new Map<string, number>(),
      })
    }

    const categoryEntry = categoryMap.get(categoryName)!
    categoryEntry.amount_cents += row.amount_cents
    categoryEntry.subMap.set(
      subcategoryName,
      (categoryEntry.subMap.get(subcategoryName) ?? 0) + row.amount_cents
    )
  }

  return Array.from(categoryMap.entries())
    .map(([name, value]) => ({
      name,
      amount_cents: value.amount_cents,
      subcategories: Array.from(value.subMap.entries())
        .map(([subName, amount]) => ({
          name: subName,
          amount_cents: amount,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export default function HomePage() {
  const [loading, setLoading] = useState(true)

  const [budgets, setBudgets] = useState<Budget[]>([])
  const [allocations, setAllocations] = useState<AllocationRow[]>([])
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([])

  const [selectedYear, setSelectedYear] = useState<string>('')
  const [lastTxDate, setLastTxDate] = useState<string | null>(null)
  const [openBudgetId, setOpenBudgetId] = useState<string | null>(null)
  const [sendingDiscord, setSendingDiscord] = useState(false)
  const [categoriesWithWebhook, setCategoriesWithWebhook] = useState<CategoryWithWebhook[]>([])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

    const [
      { data: budgetsData, error: e1 },
      { data: allocData, error: e2 },
      { data: fyData, error: e3 },
      { data: txDates, error: e4 },
      { data: catWebhookData },
    ] = await Promise.all([
      supabase
        .from('budgets')
        .select('id,name,is_archived,ordre,discord_webhook_url')
        .eq('is_archived', false)
        .order('ordre'),

      supabase
        .from('transaction_allocations')
        .select(`
          id,
          budget_id,
          amount_cents,
          budget:budgets(id,name,ordre),
          category:categories(id,name),
          subcategory:subcategories(id,name),
          transaction:transactions(id,kind,receipt_status,tx_date,fiscal_year_id,description)
        `),

      supabase
        .from('fiscal_years')
        .select('id,year')
        .order('year', { ascending: false }),

      supabase
        .from('transactions')
        .select('tx_date'),

      supabase
        .from('categories')
        .select('id,name,budget_id,discord_webhook_url')
        .eq('kind', 'expense')
        .not('discord_webhook_url', 'is', null),
    ])

    if (e1 || e2 || e3 || e4) {
      console.error(e1 || e2 || e3 || e4)
      alert('Erreur chargement accueil')
      setLoading(false)
      return
    }

    const years = (fyData ?? []) as FiscalYear[]
    const allocs = (allocData ?? []) as AllocationRow[]
    const txDateRows = (txDates ?? []) as TxDateRow[]

    setBudgets((budgetsData ?? []) as Budget[])
    setAllocations(allocs)
    setFiscalYears(years)

    if (years.length > 0) {
      setSelectedYear(years[0].id)
    }

    setLastTxDate(getMaxTxDate(txDateRows))
    setCategoriesWithWebhook((catWebhookData ?? []) as CategoryWithWebhook[])
    setLoading(false)
  }

  const globalStats = useMemo(() => {
    let totalIncome = 0
    let totalExpense = 0
    let missingReceipts = 0

    for (const row of allocations) {
      const tx = firstObj(row.transaction)
      if (!tx) continue

      if (selectedYear && tx.fiscal_year_id !== selectedYear) continue

      if (tx.kind === 'income') {
        totalIncome += row.amount_cents
      } else {
        totalExpense += row.amount_cents
        if (tx.receipt_status === 'PJ manquante') {
          missingReceipts++
        }
      }
    }

    return {
      totalIncome,
      totalExpense,
      missingReceipts,
      result: totalIncome - totalExpense,
    }
  }, [allocations, selectedYear])

  async function sendDiscordUpdates() {
    const budgetsWithWebhook = budgets.filter((b) => b.discord_webhook_url)
    if (budgetsWithWebhook.length === 0 && categoriesWithWebhook.length === 0) {
      alert("Aucun webhook Discord configure. Rendez-vous dans Admin > Referentiel pour en ajouter.")
      return
    }

    setSendingDiscord(true)
    let sent = 0
    let failed = 0
    const fyLabel = 'Total budget'

    // Charger le previsionnel une seule fois
    const { data: forecastData } = await supabase
      .from('budget_forecasts')
      .select('budget_id,category_id,subcategory_id,amount_cents')
      .eq('kind', 'expense')
    const forecasts = (forecastData ?? []) as {
      budget_id: string
      category_id: string
      subcategory_id: string | null
      amount_cents: number
    }[]

    async function sendEmbed(webhookUrl: string, embed: object) {
      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ embeds: [embed] }),
        })
        if (res.ok) { sent++ } else {
          failed++
          console.error('Discord error', res.status, await res.text())
        }
      } catch (e) {
        failed++
        console.error('Discord fetch error', e)
      }
    }

    // ── Webhook budget général : résumé par catégorie ──────────────────
    for (const budget of budgetsWithWebhook) {
      const budgetRows = allocations.filter((a) => {
        if (a.budget_id !== budget.id) return false
        const tx = firstObj(a.transaction)
        if (!tx) return false
        return tx.kind === 'expense'
      })

      // Réalisé par catégorie
      const realByCat = new Map<string, { name: string; amount: number }>()
      for (const row of budgetRows) {
        const cat = firstObj(row.category)
        if (!cat) continue
        const prev = realByCat.get(cat.id) ?? { name: cat.name, amount: 0 }
        realByCat.set(cat.id, { name: cat.name, amount: prev.amount + row.amount_cents })
      }

      // Prévisionnel par catégorie
      const prevByCat = new Map<string, number>()
      for (const f of forecasts.filter((f) => f.budget_id === budget.id)) {
        prevByCat.set(f.category_id, (prevByCat.get(f.category_id) ?? 0) + f.amount_cents)
      }

      const allCatIds = new Set([...realByCat.keys(), ...prevByCat.keys()])
      const totalReal = Array.from(realByCat.values()).reduce((s, v) => s + v.amount, 0)
      const totalPrev = Array.from(prevByCat.values()).reduce((s, v) => s + v, 0)

      const fields = Array.from(allCatIds)
        .map((catId) => {
          const real = realByCat.get(catId)?.amount ?? 0
          const prev = prevByCat.get(catId) ?? 0
          const name = realByCat.get(catId)?.name ?? '?'
          const ecart = real - prev
          const sign = ecart >= 0 ? '+' : ''
          return {
            name,
            value: `Prévu : ${centsToEuros(prev)} €\nRéalisé : ${centsToEuros(real)} €\nÉcart : **${sign}${centsToEuros(ecart)} €**`,
            inline: true,
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))

      if (fields.length === 0) {
        fields.push({ name: 'Aucune dépense', value: 'Rien pour cette période.', inline: false })
      }

      const ecartTotal = totalReal - totalPrev
      const signTotal = ecartTotal >= 0 ? '+' : ''
      await sendEmbed(budget.discord_webhook_url!, {
        title: `Budget ${budget.name} — Dépenses (${fyLabel})`,
        color: 0xe11d48,
        fields,
        footer: { text: `Prévu : ${centsToEuros(totalPrev)} € | Réalisé : ${centsToEuros(totalReal)} € | Écart : ${signTotal}${centsToEuros(ecartTotal)} €` },
        timestamp: new Date().toISOString(),
      })
    }

    // ── Webhook par catégorie : détail par sous-catégorie ──────────────
    for (const cat of categoriesWithWebhook) {
      const catRows = allocations.filter((a) => {
        if (a.budget_id !== cat.budget_id) return false
        const tx = firstObj(a.transaction)
        if (!tx) return false
        return tx.kind === 'expense' && firstObj(a.category)?.id === cat.id
      })

      // Réalisé par sous-catégorie (id → { name, amount })
      const realBySub = new Map<string, { name: string; amount: number }>()
      for (const row of catRows) {
        const sub = firstObj(row.subcategory)
        const key = sub?.id ?? '__none__'
        const name = sub?.name ?? 'Sans sous-categorie'
        const prev = realBySub.get(key) ?? { name, amount: 0 }
        realBySub.set(key, { name, amount: prev.amount + row.amount_cents })
      }

      // Prévisionnel par sous-catégorie
      const prevBySub = new Map<string, number>()
      for (const f of forecasts.filter((f) => f.category_id === cat.id && f.budget_id === cat.budget_id)) {
        const key = f.subcategory_id ?? '__none__'
        prevBySub.set(key, (prevBySub.get(key) ?? 0) + f.amount_cents)
      }

      const allSubIds = new Set([...realBySub.keys(), ...prevBySub.keys()])
      const totalReal = Array.from(realBySub.values()).reduce((s, v) => s + v.amount, 0)
      const totalPrev = Array.from(prevBySub.values()).reduce((s, v) => s + v, 0)

      const fields = Array.from(allSubIds)
        .map((subId) => {
          const real = realBySub.get(subId)?.amount ?? 0
          const prev = prevBySub.get(subId) ?? 0
          const name = realBySub.get(subId)?.name ?? 'Sans sous-categorie'
          const ecart = real - prev
          const sign = ecart >= 0 ? '+' : ''
          return {
            name,
            value: `Prévu : ${centsToEuros(prev)} €\nRéalisé : ${centsToEuros(real)} €\nÉcart : **${sign}${centsToEuros(ecart)} €**`,
            inline: true,
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))

      if (fields.length === 0) {
        fields.push({ name: 'Aucune dépense', value: 'Rien pour cette période.', inline: false })
      }

      const ecartTotal = totalReal - totalPrev
      const signTotal = ecartTotal >= 0 ? '+' : ''
      await sendEmbed(cat.discord_webhook_url, {
        title: `${cat.name} — Prévisionnel vs Réalisé (${fyLabel})`,
        color: ecartTotal > 0 ? 0xe11d48 : 0x16a34a,
        fields,
        footer: { text: `Prévu : ${centsToEuros(totalPrev)} € | Réalisé : ${centsToEuros(totalReal)} € | Écart : ${signTotal}${centsToEuros(ecartTotal)} €` },
        timestamp: new Date().toISOString(),
      })
    }

    setSendingDiscord(false)
    if (failed === 0) {
      alert(`Mise a jour Discord envoyee (${sent} message(s)) !`)
    } else {
      alert(`Envoye : ${sent}, Echecs : ${failed}. Verifiez les webhooks dans le referentiel.`)
    }
  }

  function getBudgetRows(budgetId: string) {
    return allocations.filter((a) => a.budget_id === budgetId)
  }

  function getBudgetSummary(budgetId: string) {
    const rows = getBudgetRows(budgetId)

    let income = 0
    let expense = 0
    let budgetMissingReceipts = 0

    for (const row of rows) {
      const tx = firstObj(row.transaction)
      if (!tx) continue

      if (tx.kind === 'income') {
        income += row.amount_cents
      } else {
        expense += row.amount_cents
        if (tx.receipt_status === 'PJ manquante') {
          budgetMissingReceipts++
        }
      }
    }

    return {
      income,
      expense,
      budgetMissingReceipts,
      result: income - expense,
    }
  }

  if (loading) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui' }}>
        Chargement…
      </main>
    )
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1250 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900 }}>
        ADEACT — Tableau de bord
      </h1>

      <div
        style={{
          marginTop: 6,
          padding: '8px 12px',
          borderRadius: 8,
          background: '#f5f5f5',
          display: 'inline-block',
          fontSize: 14,
        }}
      >
        Dernière date de transaction : <b>{formatFrDate(lastTxDate)}</b>
      </div>

      <div style={{ marginTop: 14 }}>
        <button
          onClick={sendDiscordUpdates}
          disabled={sendingDiscord}
          style={{
            padding: '10px 18px',
            borderRadius: 10,
            border: '1px solid #7c3aed',
            background: sendingDiscord ? '#ede9fe' : '#7c3aed',
            color: sendingDiscord ? '#7c3aed' : 'white',
            fontWeight: 700,
            cursor: sendingDiscord ? 'default' : 'pointer',
            fontSize: 15,
          }}
        >
          {sendingDiscord ? 'Envoi en cours...' : '📢 Envoyer mise a jour Discord'}
        </button>
      </div>

      <div style={{ marginTop: 18 }}>
        <label>Annee civile :</label>{' '}
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          style={{ padding: 8, borderRadius: 8, border: '1px solid #ccc' }}
        >
          {fiscalYears.map((fy) => (
            <option key={fy.id} value={fy.id}>
              {fy.year}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          marginTop: 20,
          display: 'flex',
          gap: 30,
          flexWrap: 'wrap',
          padding: 16,
          border: '1px solid #e6e6e6',
          borderRadius: 12,
          background: 'white',
        }}
      >
        <div>
          Recettes : <b>{centsToEuros(globalStats.totalIncome)} €</b>
        </div>

        <div>
          Dépenses : <b>{centsToEuros(globalStats.totalExpense)} €</b>
        </div>

        <div>
          Résultat :{' '}
          <b style={{ color: globalStats.result >= 0 ? 'green' : 'red' }}>
            {centsToEuros(globalStats.result)} €
          </b>
        </div>

        <div>
          PJ manquantes : <b>{globalStats.missingReceipts}</b>
        </div>
      </div>

      <div
        style={{
          marginTop: 30,
          display: 'grid',
          gap: 16,
        }}
      >
        {budgets.map((budget) => {
          const rows = getBudgetRows(budget.id)
          const summary = getBudgetSummary(budget.id)
          const isOpen = openBudgetId === budget.id

          const incomeGroups = groupBudgetSide(rows, 'income')
          const expenseGroups = groupBudgetSide(rows, 'expense')

          return (
            <div
              key={budget.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: 14,
                padding: 18,
                background: 'white',
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 800 }}>
                {budget.name}
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: 'flex',
                  gap: 24,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  Recettes : <b>{centsToEuros(summary.income)} €</b>
                </div>

                <div>
                  Dépenses : <b>{centsToEuros(summary.expense)} €</b>
                </div>

                <div>
                  Résultat :{' '}
                  <b style={{ color: summary.result >= 0 ? 'green' : 'red' }}>
                    {centsToEuros(summary.result)} €
                  </b>
                </div>

                <div>
                  PJ manquantes : <b>{summary.budgetMissingReceipts}</b>
                </div>
              </div>

              <button
                onClick={() =>
                  setOpenBudgetId((prev) => (prev === budget.id ? null : budget.id))
                }
                style={{
                  marginTop: 14,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #ddd',
                  background: isOpen ? '#f3f3f3' : 'white',
                  cursor: 'pointer',
                }}
              >
                {isOpen ? 'Masquer le détail' : 'Voir le détail'}
              </button>

              {isOpen && (
                <div
                  style={{
                    marginTop: 18,
                    borderTop: '1px solid #eee',
                    paddingTop: 18,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 18,
                  }}
                >
                  <div
                    style={{
                      border: '1px solid #d7ead7',
                      borderRadius: 12,
                      padding: 14,
                      background: '#f8fff8',
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 12 }}>
                      Recettes
                    </div>

                    {incomeGroups.length === 0 ? (
                      <div style={{ opacity: 0.7 }}>Aucune recette.</div>
                    ) : (
                      <div style={{ display: 'grid', gap: 12 }}>
                        {incomeGroups.map((cat) => (
                          <div
                            key={cat.name}
                            style={{
                              border: '1px solid #e6f2e6',
                              borderRadius: 10,
                              background: 'white',
                              padding: 12,
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 12,
                                fontWeight: 800,
                              }}
                            >
                              <span>{cat.name}</span>
                              <span>{centsToEuros(cat.amount_cents)} €</span>
                            </div>

                            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                              {cat.subcategories.map((sub) => (
                                <div
                                  key={`${cat.name}-${sub.name}`}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    fontSize: 14,
                                    paddingLeft: 10,
                                  }}
                                >
                                  <span>{sub.name}</span>
                                  <span>{centsToEuros(sub.amount_cents)} €</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      border: '1px solid #f0d6d6',
                      borderRadius: 12,
                      padding: 14,
                      background: '#fff9f9',
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 12 }}>
                      Dépenses
                    </div>

                    {expenseGroups.length === 0 ? (
                      <div style={{ opacity: 0.7 }}>Aucune dépense.</div>
                    ) : (
                      <div style={{ display: 'grid', gap: 12 }}>
                        {expenseGroups.map((cat) => (
                          <div
                            key={cat.name}
                            style={{
                              border: '1px solid #f5e6e6',
                              borderRadius: 10,
                              background: 'white',
                              padding: 12,
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 12,
                                fontWeight: 800,
                              }}
                            >
                              <span>{cat.name}</span>
                              <span>{centsToEuros(cat.amount_cents)} €</span>
                            </div>

                            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                              {cat.subcategories.map((sub) => (
                                <div
                                  key={`${cat.name}-${sub.name}`}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    fontSize: 14,
                                    paddingLeft: 10,
                                  }}
                                >
                                  <span>{sub.name}</span>
                                  <span>{centsToEuros(sub.amount_cents)} €</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}