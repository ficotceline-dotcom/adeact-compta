'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useUserPermissions() {
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data: userData } = await supabase.auth.getUser()
    const email = userData?.user?.email

    if (!email) {
      setPermissions([])
      setLoading(false)
      return
    }

    const { data } = await supabase
      .from('app_user_permissions')
      .select('permissions')
      .eq('email', email)
      .maybeSingle()

    setPermissions(data?.permissions ?? [])
    setLoading(false)
  }

  return { permissions, loading }
}