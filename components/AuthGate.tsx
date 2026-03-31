'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    checkSession()

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      checkSession()
    })

    return () => {
      sub.subscription.unsubscribe()
    }
  }, [pathname])

  async function checkSession() {
    const { data } = await supabase.auth.getSession()
    const hasSession = !!data.session

    if (!hasSession && pathname !== '/login') {
      router.replace('/login')
      return
    }

    if (hasSession && pathname === '/login') {
      router.replace('/')
      return
    }

    setReady(true)
  }

  // 👇 IMPORTANT : toujours retourner quelque chose
  if (!ready) {
    return <main style={{ padding: 24 }}>Chargement…</main>
  }

  return <>{children}</>
}
