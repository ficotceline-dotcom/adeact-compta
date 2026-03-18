import { supabase } from '@/lib/supabase'

export default async function SupabaseTestPage() {
  const { data, error } = await supabase.from('fiscal_years').select('*').limit(1)

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>Supabase test</h1>
      {error ? (
        <>
          <p style={{ color: 'crimson' }}>Erreur: {error.message}</p>
          <pre>{JSON.stringify(error, null, 2)}</pre>
        </>
      ) : (
        <>
          <p style={{ color: 'green' }}>Connexion OK ✅</p>
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </>
      )}
    </main>
  )
}
