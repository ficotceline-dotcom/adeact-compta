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

export default function EvolutionsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [requests, setRequests] = useState<FeatureRequest[]>([])

  const [fullName, setFullName] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

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

    setRequests((data ?? []) as FeatureRequest[])
    setLoading(false)
  }

  async function submit() {
    if (!fullName.trim() || !title.trim() || !description.trim()) {
      alert('Merci de remplir prénom + nom, titre et description.')
      return
    }

    setSaving(true)

    const { error } = await supabase.from('feature_requests').insert({
      full_name: fullName.trim(),
      title: title.trim(),
      description: description.trim(),
      status: 'open',
    })

    setSaving(false)

    if (error) {
      console.error(error)
      alert("Erreur lors de l'envoi de la proposition")
      return
    }

    alert('✅ Proposition envoyée')
    setFullName('')
    setTitle('')
    setDescription('')
    await load()
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1100 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900 }}>Propositions d’évolutions</h1>

      <div style={{ marginTop: 8, opacity: 0.8 }}>
        Tu peux proposer ici une amélioration du site. Merci d’indiquer ton prénom et ton nom
        pour qu’on puisse revenir vers toi si on a besoin de précisions.
      </div>

      <section style={{ marginTop: 24, border: '1px solid #ddd', borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Nouvelle proposition</h2>

        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <input
            placeholder="Prénom et nom"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={{ padding: 8 }}
          />

          <input
            placeholder="Titre court de la proposition"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ padding: 8 }}
          />

          <textarea
            placeholder="Décris ton besoin, le contexte, ce que tu aimerais voir dans le site…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            style={{ padding: 8, resize: 'vertical' }}
          />

          <button onClick={submit} disabled={saving} style={{ width: 220 }}>
            {saving ? 'Envoi…' : 'Envoyer la proposition'}
          </button>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800 }}>Propositions déjà envoyées</h2>

        {loading ? (
          <div style={{ marginTop: 12 }}>Chargement…</div>
        ) : (
          <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
            {requests.map((req) => (
              <div
                key={req.id}
                style={{
                  border: '1px solid #ddd',
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{req.title}</div>
                    <div style={{ marginTop: 4, fontSize: 14, opacity: 0.75 }}>
                      Proposé par <b>{req.full_name}</b> — {formatFrDateTime(req.created_at)}
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
                    {labelStatus(req.status)}
                  </div>
                </div>

                <div style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{req.description}</div>
              </div>
            ))}

            {requests.length === 0 && (
              <div style={{ opacity: 0.7 }}>Aucune proposition pour le moment.</div>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
