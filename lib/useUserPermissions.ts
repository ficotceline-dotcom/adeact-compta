'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useUserPermissions() {
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [debugEmail, setDebugEmail] = useState<string>('')
  const [debugRow, setDebugRow] = useState<any>(null)
  const [debugError, setDebugError] = useState<string>('')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    setDebugError('')

    const { data: userData, error: userError } = await supabase.auth.getUser()

    if (userError) {
      setDebugError(`getUser error: ${userError.message}`)
      setPermissions([])
      setLoading(false)
      return
    }

    const email = userData?.user?.email?.trim().toLowerCase() ?? ''
    setDebugEmail(email)

    if (!email) {
      setPermissions([])
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('app_user_permissions')
      .select('email, permissions')
      .ilike('email', email)
      .maybeSingle()

    setDebugRow(data ?? null)
    setDebugError(error?.message ?? '')
    setPermissions((data?.permissions ?? []) as string[])
    setLoading(false)
  }

  return {
    permissions,
    loading,
    debugEmail,
    debugRow,
    debugError,
  }
}