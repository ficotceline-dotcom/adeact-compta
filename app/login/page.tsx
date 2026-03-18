'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 420 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900 }}>Connexion admin</h1>

      <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
        <label>
          Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: 10, marginTop: 6 }}
          />
        </label>

        <label>
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: 10, marginTop: 6 }}
          />
        </label>

        <button
          disabled={loading}
          onClick={async () => {
            setLoading(true)
            const { error } = await supabase.auth.signInWithPassword({ email, password })
            setLoading(false)
            if (error) return alert('Erreur login: ' + error.message)

            router.push('/')
            router.refresh()
          }}
          style={{ padding: '10px 12px', fontWeight: 800 }}
        >
          Se connecter
        </button>
      </div>
    </main>
  )
}
