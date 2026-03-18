'use client'
import { Header } from '@/components/Header'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      const hasSession = !!data.session

      // autoriser /login même sans session
      if (!hasSession && pathname !== '/login') {
        router.replace('/login')
        return
      }

      // si déjà connecté et sur /login → retour accueil
      if (hasSession && pathname === '/login') {
        router.replace('/')
        return
      }

      setReady(true)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      // re-check session à chaque changement
      router.refresh()
    })

    return () => {
      sub.subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  if (!ready && pathname !== '/login') {
    return <main style={{ padding: 24 }}>Chargement…</main>
  }

  return <>{children}</>
}
