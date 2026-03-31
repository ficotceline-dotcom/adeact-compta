'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Transaction = {
  id: string
  tx_date: string
  kind: 'income' | 'expense'
  description: string
  amount_cents: number
  receipt_status: string
  receipt_path: string | null
  receipt_abandoned: boolean
  fiscal_year_id: string | null
}

type Budget = {
  id: string
  name: string
  ordre: number
}

type FiscalYear = {
  id: string
  year: number
}

type Allocation = {
  transaction_id: string
  budget_id: string
  category_id: string | null
  subcategory_id: string | null
  budget:
    | { name: string }
    | { name: string }[]
    | null
  category:
    | { name: string }
    | { name: string }[]
    | null
  subcategory:
    | { name: string }
    | { name: string }[]
    | null
}

type RequestRow = {
  transaction_id: string
  status: string
}

async function uploadReceipt(txId: string, file: File) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${txId}/${Date.now()}_${safeName}`

  const { error: upErr } = await supabase.storage.from('receipts').upload(path, file, {
    upsert: true,
  })
  if (upErr) throw upErr

  const { error: txErr } = await supabase
    .from('transactions')
    .update({
      receipt_status: 'PJ fournie',
      receipt_path: path,
      receipt_uploaded_at: new Date().toISOString(),
      receipt_abandoned: false,
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

function centsToEuros(cents: number) {
  return (cents / 100).toFixed(2)
}

function firstObj<T>(value: T | T[] | null): T | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function formatFrDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [years, setYears] = useState<FiscalYear[]>([])
  const [openRequestIds, setOpenRequestIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [filesByTx, setFilesByTx] = useState<Record<string, File | null>>({})
  const [messageByTx, setMessageByTx] = useState<Record<string, string>>({})
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const [selectedBudgetId, setSelectedBudgetId] = useState<string>('')
  const [selectedYearId, setSelectedYearId] = useState<string>('')
  const [selectedKind, setSelectedKind] = useState<string>('all')
  const [selectedReceiptFilter, setSelectedReceiptFilter] = useState<string>('all')
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>('')
  const [selectedSubcategoryName, setSelectedSubcategoryName] = useState<string>('')
  const [searchText, setSearchText] = useState<string>('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

    const [
      { data: txData, error: txErr },
      { data: allocData, error: allocErr },
      { data: budgetData, error: budgetErr },
      { data: yearData, error: yearErr },
      { data: reqData, error: reqErr },
    ] = await Promise.all([
      supabase
        .from('transactions')
        .select(
          'id,tx_date,kind,description,amount_cents,receipt_status,receipt_path,receipt_abandoned,fiscal_year_id'
        )
        .order('tx_date', { ascending: false })
        .order('id', { ascending: false }),

      supabase.from('transaction_allocations').select(`
          transaction_id,
          budget_id,
          category_id,
          subcategory_id,
          budget:budgets(name),
          category:categories(name),
          subcategory:subcategories(name)
        `),

      supabase
        .from('budgets')
        .select('id,name,ordre')
        .eq('is_archived', false)
        .order('ordre'),

      supabase
        .from('fiscal_years')
        .select('id,year')
        .order('year', { ascending: false }),

      supabase
        .from('receipt_requests')
        .select('transaction_id,status')
        .eq('status', 'open'),
    ])

    if (txErr || allocErr || budgetErr || yearErr || reqErr) {
      console.error(txErr || allocErr || budgetErr || yearErr || reqErr)
      alert('Erreur chargement transactions')
    } else {
      setTransactions((txData ?? []) as Transaction[])
      setAllocations((allocData ?? []) as Allocation[])
      setBudgets((budgetData ?? []) as Budget[])
      setYears((yearData ?? []) as FiscalYear[])
      setOpenRequestIds(
        Array.from(new Set(((reqData ?? []) as RequestRow[]).map((r) => r.transaction_id)))
      )

      if ((yearData ?? []).length > 0 && !selectedYearId) {
        setSelectedYearId((yearData ?? [])[0].id)
      }
    }

    setLoading(false)
  }

  async function deleteTransaction(txId: string) {
    const ok = confirm('Supprimer cette transaction ? Cette action est définitive.')
    if (!ok) return

    setDeletingId(txId)

    try {
      await supabase.from('receipt_requests').delete().eq('transaction_id', txId)
      await supabase.from('rescrit_requests').delete().eq('transaction_id', txId)

      const { error: allocErr } = await supabase
        .from('transaction_allocations')
        .delete()
        .eq('transaction_id', txId)

      if (allocErr) throw allocErr

      const { error: txErr } = await supabase.from('transactions').delete().eq('id', txId)

      if (txErr) throw txErr

      alert('✅ Transaction supprimée')
      await load()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur suppression : ${e?.message ?? 'inconnue'}`)
    } finally {
      setDeletingId(null)
    }
  }

  async function requestReceipt(transactionId: string) {
    if (openRequestIds.includes(transactionId)) {
      alert('Une demande PJ est déjà ouverte pour cette transaction.')
      return
    }

    const message = (messageByTx[transactionId] ?? '').trim()
    setProcessingId(transactionId)

    try {
      const { error } = await supabase.from('receipt_requests').insert({
        transaction_id: transactionId,
        status: 'open',
        message,
      })

      if (error) throw error

      alert('✅ Demande PJ créée')
      setMessageByTx((prev) => ({ ...prev, [transactionId]: '' }))
      await load()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur demande PJ : ${e?.message ?? 'inconnue'}`)
    } finally {
      setProcessingId(null)
    }
  }

  async function abandonReceipt(transactionId: string) {
    const ok = confirm(
      "Confirmer l'abandon de PJ ? Cette transaction ne sera plus comptée dans les PJ manquantes."
    )
    if (!ok) return

    setProcessingId(transactionId)

    try {
      const { error } = await supabase
        .from('transactions')
        .update({ receipt_abandoned: true })
        .eq('id', transactionId)

      if (error) throw error

      alert('✅ PJ abandonnée')
      await load()
    } catch (e: any) {
      console.error(e)
      alert(`Erreur abandon PJ : ${e?.message ?? 'inconnue'}`)
    } finally {
      setProcessingId(null)
    }
  }

  const txDetailsMap = useMemo(() => {
    const map: Record<
      string,
      {
        budgetIds: string[]
        budgetNames: string[]
        categoryNames: string[]
        subcategoryNames: string[]
        lines: {
          budgetName: string
          categoryName: string
          subcategoryName: string
        }[]
      }
    > = {}

    for (const a of allocations) {
      if (!map[a.transaction_id]) {
        map[a.transaction_id] = {
          budgetIds: [],
          budgetNames: [],
          categoryNames: [],
          subcategoryNames: [],
          lines: [],
        }
      }

      const budget = firstObj(a.budget)
      const category = firstObj(a.category)
      const subcategory = firstObj(a.subcategory)

      const budgetName = budget?.name ?? ''
      const categoryName = category?.name ?? ''
      const subcategoryName = subcategory?.name ?? ''

      if (a.budget_id && !map[a.transaction_id].budgetIds.includes(a.budget_id)) {
        map[a.transaction_id].budgetIds.push(a.budget_id)
      }

      if (budgetName && !map[a.transaction_id].budgetNames.includes(budgetName)) {
        map[a.transaction_id].budgetNames.push(budgetName)
      }

      if (categoryName && !map[a.transaction_id].categoryNames.includes(categoryName)) {
        map[a.transaction_id].categoryNames.push(categoryName)
      }

      if (subcategoryName && !map[a.transaction_id].subcategoryNames.includes(subcategoryName)) {
        map[a.transaction_id].subcategoryNames.push(subcategoryName)
      }

      const exists = map[a.transaction_id].lines.some(
        (l) =>
          l.budgetName === budgetName &&
          l.categoryName === categoryName &&
          l.subcategoryName === subcategoryName
      )

      if (!exists) {
        map[a.transaction_id].lines.push({
          budgetName,
          categoryName,
          subcategoryName,
        })
      }
    }

    return map
  }, [allocations])

  const categoryOptions = useMemo(() => {
    const set = new Set<string>()

    for (const a of allocations) {
      const category = firstObj(a.category)
      if (category?.name) set.add(category.name)
    }

    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [allocations])

  const subcategoryOptions = useMemo(() => {
    const set = new Set<string>()

    for (const a of allocations) {
      const category = firstObj(a.category)
      const subcategory = firstObj(a.subcategory)

      const categoryName = category?.name ?? ''
      const subcategoryName = subcategory?.name ?? ''

      if (!subcategoryName) continue
      if (selectedCategoryName && categoryName !== selectedCategoryName) continue

      set.add(subcategoryName)
    }

    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [allocations, selectedCategoryName])

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const details = txDetailsMap[tx.id]
      const linkedBudgetIds = details?.budgetIds ?? []
      const linkedCategoryNames = details?.categoryNames ?? []
      const linkedSubcategoryNames = details?.subcategoryNames ?? []

      if (selectedBudgetId && !linkedBudgetIds.includes(selectedBudgetId)) {
        return false
      }

      if (selectedYearId && tx.fiscal_year_id !== selectedYearId) {
        return false
      }

      if (selectedKind !== 'all' && tx.kind !== selectedKind) {
        return false
      }

      if (selectedReceiptFilter === 'missing') {
        if (tx.receipt_status !== 'PJ manquante' || tx.receipt_abandoned) return false
      }

      if (selectedReceiptFilter === 'provided' && tx.receipt_status !== 'PJ fournie') {
        return false
      }

      if (selectedReceiptFilter === 'abandoned' && !tx.receipt_abandoned) {
        return false
      }

      if (selectedCategoryName && !linkedCategoryNames.includes(selectedCategoryName)) {
        return false
      }

      if (selectedSubcategoryName && !linkedSubcategoryNames.includes(selectedSubcategoryName)) {
        return false
      }

      if (searchText.trim()) {
        const needle = searchText.trim().toLowerCase()
        const haystack = (tx.description ?? '').toLowerCase()
        if (!haystack.includes(needle)) {
          return false
        }
      }

      return true
    })
  }, [
    transactions,
    selectedBudgetId,
    selectedYearId,
    selectedKind,
    selectedReceiptFilter,
    selectedCategoryName,
    selectedSubcategoryName,
    searchText,
    txDetailsMap,
  ])

  if (loading) {
    return <main style={{ padding: 24 }}>Chargement…</main>
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1200 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Transactions</h1>

      <div
        style={{
          marginTop: 16,
          marginBottom: 20,
          display: 'grid',
          gap: 10,
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}
      >
        <div>
          <label style={{ display: 'block', marginBottom: 6 }}>Budget</label>
          <select
            value={selectedBudgetId}
            onChange={(e) => setSelectedBudgetId(e.target.value)}
            style={{ padding: 8, width: '100%' }}
          >
            <option value="">Tous les budgets</option>
            {budgets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 6 }}>Année</label>
          <select
            value={selectedYearId}
            onChange={(e) => setSelectedYearId(e.target.value)}
            style={{ padding: 8, width: '100%' }}
          >
            <option value="">Toutes les années</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.year}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 6 }}>Type</label>
          <select
            value={selectedKind}
            onChange={(e) => setSelectedKind(e.target.value)}
            style={{ padding: 8, width: '100%' }}
          >
            <option value="all">Tous</option>
            <option value="income">Recettes</option>
            <option value="expense">Dépenses</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 6 }}>Pièce jointe</label>
          <select
            value={selectedReceiptFilter}
            onChange={(e) => setSelectedReceiptFilter(e.target.value)}
            style={{ padding: 8, width: '100%' }}
          >
            <option value="all">Toutes</option>
            <option value="missing">PJ manquantes</option>
            <option value="provided">PJ fournies</option>
            <option value="abandoned">PJ abandonnées</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 6 }}>Catégorie</label>
          <select
            value={selectedCategoryName}
            onChange={(e) => {
              setSelectedCategoryName(e.target.value)
              setSelectedSubcategoryName('')
            }}
            style={{ padding: 8, width: '100%' }}
          >
            <option value="">Toutes les catégories</option>
            {categoryOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 6 }}>Sous-catégorie</label>
          <select
            value={selectedSubcategoryName}
            onChange={(e) => setSelectedSubcategoryName(e.target.value)}
            style={{ padding: 8, width: '100%' }}
          >
            <option value="">Toutes les sous-catégories</option>
            {subcategoryOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'block', marginBottom: 6 }}>Recherche description</label>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Ex : décors, subvention, costume..."
            style={{ padding: 8, width: '100%' }}
          />
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            background: 'white',
            border: '1px solid #ddd',
          }}
        >
          <thead>
            <tr style={{ background: '#f7f7f7' }}>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Description</th>
              <th style={thStyle}>Montant</th>
              <th style={thStyle}>Affectation</th>
              <th style={thStyle}>PJ</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.map((tx) => {
              const details = txDetailsMap[tx.id]
              const linkedLines = details?.lines ?? []
              const file = filesByTx[tx.id] ?? null
              const hasOpenRequest = openRequestIds.includes(tx.id)

              return (
                <tr key={tx.id}>
                  <td style={tdStyle}>{formatFrDate(tx.tx_date)}</td>
                  <td style={tdStyle}>{tx.kind === 'income' ? 'Recette' : 'Dépense'}</td>
                  <td style={tdStyle}>{tx.description || '—'}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    {centsToEuros(tx.amount_cents)} €
                  </td>
                  <td style={tdStyle}>
                    {linkedLines.length === 0 ? (
                      <span style={{ opacity: 0.6 }}>—</span>
                    ) : (
                      <div style={{ display: 'grid', gap: 4 }}>
                        {linkedLines.map((line, index) => (
                          <div key={`${tx.id}-${index}`} style={{ fontSize: 13 }}>
                            <b>{line.budgetName || 'Sans budget'}</b>
                            {line.categoryName ? ` • ${line.categoryName}` : ''}
                            {line.subcategoryName ? ` • ${line.subcategoryName}` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div>
                        {tx.receipt_abandoned
                          ? 'PJ abandonnée'
                          : tx.receipt_status || '—'}
                      </div>

                      <input
                        type="file"
                        onChange={(e) => {
                          const nextFile = e.target.files?.[0] ?? null
                          setFilesByTx((prev) => ({ ...prev, [tx.id]: nextFile }))
                        }}
                      />

                      <button
                        onClick={async () => {
                          const selectedFile = filesByTx[tx.id]
                          if (!selectedFile) {
                            alert('Choisis un fichier')
                            return
                          }

                          setProcessingId(tx.id)
                          try {
                            await uploadReceipt(tx.id, selectedFile)
                            setFilesByTx((prev) => ({ ...prev, [tx.id]: null }))
                            alert('✅ PJ uploadée')
                            await load()
                          } catch (e: any) {
                            console.error(e)
                            alert(`Erreur upload PJ : ${e?.message ?? 'inconnue'}`)
                          } finally {
                            setProcessingId(null)
                          }
                        }}
                        disabled={processingId === tx.id}
                        style={buttonSecondaryStyle}
                      >
                        {processingId === tx.id ? 'Upload…' : 'Uploader la PJ'}
                      </button>
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <textarea
                        placeholder="Message pour la demande de PJ"
                        value={messageByTx[tx.id] || ''}
                        onChange={(e) =>
                          setMessageByTx((prev) => ({
                            ...prev,
                            [tx.id]: e.target.value,
                          }))
                        }
                        rows={3}
                        style={{
                          width: '100%',
                          minWidth: 220,
                          padding: 8,
                          border: '1px solid #ddd',
                          borderRadius: 8,
                          fontFamily: 'inherit',
                          fontSize: 13,
                        }}
                      />

                      <button
                        onClick={() => requestReceipt(tx.id)}
                        disabled={processingId === tx.id || hasOpenRequest}
                        style={buttonStyle}
                      >
                        {hasOpenRequest
                          ? 'Demande PJ déjà ouverte'
                          : processingId === tx.id
                          ? 'Envoi…'
                          : 'Demander PJ'}
                      </button>

                      <button
                        onClick={() => abandonReceipt(tx.id)}
                        disabled={processingId === tx.id}
                        style={buttonSecondaryStyle}
                      >
                        Abandonner la PJ
                      </button>

                      <a
                        href={`/transactions/${tx.id}/edit`}
                        style={{
                          ...linkButtonStyle,
                          textDecoration: 'none',
                          textAlign: 'center',
                        }}
                      >
                        Modifier
                      </a>

                      <button
                        onClick={() => deleteTransaction(tx.id)}
                        disabled={deletingId === tx.id}
                        style={buttonDangerStyle}
                      >
                        {deletingId === tx.id ? 'Suppression…' : 'Supprimer'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}

            {filteredTransactions.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', opacity: 0.7 }}>
                  Aucune transaction trouvée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: 10,
  borderBottom: '1px solid #ddd',
  fontSize: 14,
}

const tdStyle: React.CSSProperties = {
  padding: 10,
  borderBottom: '1px solid #eee',
  verticalAlign: 'top',
  fontSize: 14,
}

const buttonStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #1d4ed8',
  background: '#1d4ed8',
  color: 'white',
  cursor: 'pointer',
  fontWeight: 600,
}

const buttonSecondaryStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #ddd',
  background: 'white',
  cursor: 'pointer',
  fontWeight: 600,
}

const buttonDangerStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #dc2626',
  background: '#dc2626',
  color: 'white',
  cursor: 'pointer',
  fontWeight: 600,
}

const linkButtonStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #ddd',
  background: '#f8f8f8',
  color: 'inherit',
  fontWeight: 600,
  display: 'inline-block',
}
