'use client'

export default function AdminFacturationHomePage() {
  const cardStyle: React.CSSProperties = {
    border: '1px solid #ddd',
    borderRadius: 12,
    padding: 20,
    textDecoration: 'none',
    color: 'inherit',
    display: 'block',
    background: 'white',
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 1100 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900 }}>Admin — Facturation</h1>

      <div style={{ marginTop: 8, opacity: 0.8 }}>
        Zone de gestion des paramètres, devis, factures et rescrits.
      </div>

      <div
        style={{
          marginTop: 24,
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        }}
      >
        <a href="/admin/facturation/settings" style={cardStyle}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Paramètres facturation</div>
          <div style={{ marginTop: 8, opacity: 0.75 }}>
            Logo, coordonnées ADEACT, président, signature, mentions.
          </div>
        </a>

        <a href="/admin/facturation/devis" style={cardStyle}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Devis</div>
          <div style={{ marginTop: 8, opacity: 0.75 }}>
            Création, tableau de suivi, transformation en facture.
          </div>
        </a>

        <a href="/admin/facturation/factures" style={cardStyle}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Factures</div>
          <div style={{ marginTop: 8, opacity: 0.75 }}>
            Création directe, suivi, paiement, rapprochement transaction.
          </div>
        </a>

        <a href="/admin/facturation/rescrits" style={cardStyle}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Rescrits</div>
          <div style={{ marginTop: 8, opacity: 0.75 }}>
            Reçus fiscaux pour don, numérotation, document imprimable, rapprochement.
          </div>
        </a>
      </div>
    </main>
  )
}
