'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type FeatureRequest = {
  id: string
  full_name: string
  title: string
  description: string
  status: 'open' | 'in_discussion' | 'taken_into_account'
  created_at: string
}

function formatFrDateTime(value: string) {
  const d = new Date(value)
  return d.toLocaleString('fr-FR')
}

function labelStatus(status: FeatureRequest['status']) {
  if (status === 'open') return 'À traiter'
  if (status === 'in_discussion') return 'En discussion'
  return 'Prise en compte'
}

export default function AdminEvolutionsPage() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<FeatureRequest[]>([])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)

    const { data, error } = await supabase
      .from('feature_requests')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      alert('Erreur chargement des propositions')
      setLoading(false)
      return
    }

    setRows((data ?? []) as FeatureRequest[])
    setLoading(false)
  }

  async function updateStatus(id: string, status: FeatureRequest['status']) {
    const { error } = await supabase
      .from('feature_requests')
      .update({ status })
      .eq('id', id)

    if (error) {
      console.error(error)
      alert('Erreur mise à jour du statut')
      return
    }

    await load()
  }

  async function remove(id: string, status: FeatureRequest['status']) {
    if (status !== 'taken_into_account') {
      alert('La suppression est autorisée uniquement quand la proposition est "Prise en compte".')
      return
    }

    const ok = confirm('Supprimer cette proposition ?')
    if (!ok) return

    const { error } = await supabase
      .from('feature_requests')
      .delete()
      .eq('id', id)

    if (error) {
      console.error(error)
      alert('Erreur suppression proposition')
      return
    }

    await load()
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1200 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900 }}>Admin — Propositions d’évolutions</h1>

      <div style={{ marginTop: 8, opacity: 0.8 }}>
        L’admin peut ici suivre les idées proposées, changer leur statut, puis supprimer une
        proposition une fois qu’elle est prise en compte.
      </div>

      {loading ? (
        <div style={{ marginTop: 20 }}>Chargement…</div>
      ) : (
        <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
          {rows.map((row) => (
            <div
              key={row.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{row.title}</div>
                  <div style={{ marginTop: 4, fontSize: 14, opacity: 0.75 }}>
                    Proposé par <b>{row.full_name}</b> — {formatFrDateTime(row.created_at)}
                  </div>
                </div>

                <div
                  style={{
                    border: '1px solid #ddd',
                    borderRadius: 999,
                    padding: '6px 10px',
                    fontSize: 14,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {labelStatus(row.status)}
                </div>
              </div>

              <div style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{row.description}</div>

              <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <select
                  value={row.status}
                  onChange={(e) => updateStatus(row.id, e.target.value as FeatureRequest['status'])}
                  style={{ padding: 8 }}
                >
                  <option value="open">À traiter</option>
                  <option value="in_discussion">En discussion</option>
                  <option value="taken_into_account">Prise en compte</option>
                </select>

                <button
                  onClick={() => remove(row.id, row.status)}
                  disabled={row.status !== 'taken_into_account'}
                  style={{ opacity: row.status === 'taken_into_account' ? 1 : 0.5 }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}

          {rows.length === 0 && (
            <div style={{ opacity: 0.7 }}>Aucune proposition pour le moment.</div>
          )}
        </div>
      )}
    </main>
  )
}
