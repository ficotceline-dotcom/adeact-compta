'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Row = {
  full_name: string
  email: string | null
  phone: string | null
  budget: string | null
  paid_cents: number
  due_cents: number
}

function euros(cents:number){
  return (cents/100).toFixed(2)+' €'
}

export default function MembersPage(){

  const [rows,setRows] = useState<Row[]>([])
  const [loading,setLoading] = useState(true)

  useEffect(()=>{load()},[])

  async function load(){

    const { data, error } = await supabase
      .rpc('members_public_view')

    if(error){
      console.error(error)
      alert('Erreur chargement membres')
      return
    }

    setRows(data ?? [])
    setLoading(false)
  }

  if(loading){
    return <main style={{padding:30}}>Chargement…</main>
  }

  return (
    <main style={{padding:30,fontFamily:'system-ui'}}>

      <h1 style={{fontSize:28,fontWeight:900}}>
        Membres – Suivi cotisations
      </h1>

      <table style={{
        marginTop:20,
        borderCollapse:'collapse',
        width:'100%'
      }}>

        <thead>
          <tr>
            <th style={th}>Nom</th>
            <th style={th}>Email</th>
            <th style={th}>Téléphone</th>
            <th style={th}>Projet</th>
            <th style={th}>Montant payé</th>
          </tr>
        </thead>

        <tbody>

          {rows.map((r,i)=>{

            const ok = r.paid_cents >= r.due_cents

            return (
              <tr key={i}>
                <td style={td}>{r.full_name}</td>
                <td style={td}>{r.email}</td>
                <td style={td}>{r.phone}</td>
                <td style={td}>{r.budget ?? '-'}</td>

                <td style={{
                  ...td,
                  fontWeight:700,
                  color: ok ? '#0a7a2f' : '#c62828'
                }}>
                  {euros(r.paid_cents)}
                </td>

              </tr>
            )
          })}

        </tbody>

      </table>

    </main>
  )
}

const th = {
  textAlign:'left' as const,
  padding:'10px',
  borderBottom:'2px solid #ddd'
}

const td = {
  padding:'10px',
  borderBottom:'1px solid #eee'
}
