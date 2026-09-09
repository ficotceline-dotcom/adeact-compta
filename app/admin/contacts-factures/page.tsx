'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Contact = {
  id: string
  name: string
  discord_handle: string | null
  ordre: number
}

export default function ContactsFacturesPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [newName, setNewName] = useState('')
  const [newDiscord, setNewDiscord] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('receipt_contacts')
      .select('id,name,discord_handle,ordre')
      .order('ordre')
    setContacts((data ?? []) as Contact[])
    setLoading(false)
  }

  async function add() {
    if (!newName.trim()) return alert('Nom requis.')
    setSaving(true)
    const ordre = contacts.length
    const { error } = await supabase.from('receipt_contacts').insert({
      name: newName.trim(),
      discord_handle: newDiscord.trim() || null,
      ordre,
    })
    if (error) { alert('Erreur : ' + error.message); setSaving(false); return }
    setNewName('')
    setNewDiscord('')
    await load()
    setSaving(false)
  }

  async function remove(id: string) {
    if (!confirm('Supprimer ce contact ?')) return
    await supabase.from('receipt_contacts').delete().eq('id', id)
    await load()
  }

  async function update(id: string, field: 'name' | 'discord_handle', value: string) {
    await supabase.from('receipt_contacts').update({ [field]: value || null }).eq('id', id)
    setContacts(contacts.map(c => c.id === id ? { ...c, [field]: value } : c))
  }

  const inputStyle = { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 }
  const btnStyle = (color = '#1a1a1a') => ({
    padding: '6px 14px', background: color, color: 'white',
    border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
  })

  if (loading) return <main style={{ padding: 24 }}>Chargement…</main>

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 700 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>Contacts factures</h1>
      <p style={{ color: '#64748b', marginBottom: 24, fontSize: 14 }}>
        Personnes susceptibles d'envoyer des factures. Cette liste apparaît lors de la saisie d'une dépense sans PJ.
      </p>

      {/* Liste existante */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
        {contacts.length === 0 && (
          <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>Aucun contact pour l'instant.</p>
        )}
        {contacts.map(c => (
          <div key={c.id} style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'center',
            padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fafafa',
          }}>
            <input
              value={c.name}
              onChange={e => setContacts(contacts.map(x => x.id === c.id ? { ...x, name: e.target.value } : x))}
              onBlur={e => update(c.id, 'name', e.target.value)}
              style={inputStyle}
              placeholder="Nom"
            />
            <input
              value={c.discord_handle ?? ''}
              onChange={e => setContacts(contacts.map(x => x.id === c.id ? { ...x, discord_handle: e.target.value } : x))}
              onBlur={e => update(c.id, 'discord_handle', e.target.value)}
              style={inputStyle}
              placeholder="@mention Discord (ex: <@123456789>)"
            />
            <button onClick={() => remove(c.id)} style={btnStyle('#dc2626')}>Supprimer</button>
          </div>
        ))}
      </div>

      {/* Ajouter un contact */}
      <div style={{ borderTop: '2px solid #e5e7eb', paddingTop: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Ajouter un contact</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'center' }}>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            style={inputStyle}
            placeholder="Nom (ex: Pauline H.)"
          />
          <input
            value={newDiscord}
            onChange={e => setNewDiscord(e.target.value)}
            style={inputStyle}
            placeholder="@mention Discord (optionnel)"
          />
          <button onClick={add} disabled={saving} style={btnStyle('#16a34a')}>
            {saving ? '…' : 'Ajouter'}
          </button>
        </div>
        <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
          La @mention Discord s'obtient en faisant clic droit sur le profil → "Copier l'identifiant" puis en écrivant &lt;@ID&gt;.
        </p>
      </div>
    </main>
  )
}
