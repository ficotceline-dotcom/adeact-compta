/**
 * Script batch : compresse les images existantes dans le bucket Supabase "receipts"
 * et les remplace par la version compressée (si plus légère).
 *
 * Prérequis :
 *   npm install @supabase/supabase-js sharp dotenv
 *
 * Usage depuis web/ :
 *   node scripts/compress-existing-receipts.mjs
 *
 * Variables nécessaires dans web/.env.local :
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   ← clé service role (pas la clé anon !)
 */

import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env.local') })
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis dans .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
const MAX_WIDTH  = 1400
const MAX_HEIGHT = 1400
const QUALITY    = 82   // 0-100

function isImage(path) {
  const lower = path.toLowerCase()
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

async function listAllFiles(bucket, prefix = '') {
  const all = []
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 })
  if (error) { console.error('Erreur list:', error.message); return all }

  for (const item of data ?? []) {
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name
    if (item.metadata) {
      // C'est un fichier
      all.push(fullPath)
    } else {
      // C'est un dossier → récursion
      const sub = await listAllFiles(bucket, fullPath)
      all.push(...sub)
    }
  }
  return all
}

async function compressAndReplace(bucket, path) {
  // 1. Télécharger
  const { data, error: dlErr } = await supabase.storage.from(bucket).download(path)
  if (dlErr) { console.warn(`  ⚠️  Téléchargement échoué : ${path} — ${dlErr.message}`); return }

  const originalBuffer = Buffer.from(await data.arrayBuffer())
  const originalSize = originalBuffer.length

  // 2. Compresser avec sharp
  let compressedBuffer
  try {
    compressedBuffer = await sharp(originalBuffer)
      .resize({ width: MAX_WIDTH, height: MAX_HEIGHT, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: QUALITY })
      .toBuffer()
  } catch (e) {
    console.warn(`  ⚠️  Compression échouée : ${path} — ${e.message}`)
    return
  }

  // 3. Ne remplacer que si gain significatif (> 10 %)
  const gain = ((originalSize - compressedBuffer.length) / originalSize * 100).toFixed(1)
  if (compressedBuffer.length >= originalSize * 0.9) {
    console.log(`  ⏭️  Pas de gain suffisant (${gain}%) : ${path}`)
    return
  }

  // 4. Re-uploader à la même path (upsert)
  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(path, compressedBuffer, {
      upsert: true,
      contentType: 'image/jpeg',
    })

  if (upErr) {
    console.warn(`  ⚠️  Re-upload échoué : ${path} — ${upErr.message}`)
    return
  }

  const before = (originalSize / 1024).toFixed(0)
  const after  = (compressedBuffer.length / 1024).toFixed(0)
  console.log(`  ✅  ${path}  ${before} KB → ${after} KB  (−${gain}%)`)
}

async function main() {
  console.log('🔍 Listage de tous les fichiers dans le bucket "receipts"…')
  const files = await listAllFiles('receipts')
  const images = files.filter(isImage)

  console.log(`📂 ${files.length} fichier(s) au total, dont ${images.length} image(s) à traiter.\n`)

  if (images.length === 0) {
    console.log('Rien à faire.')
    return
  }

  let processed = 0
  for (const path of images) {
    process.stdout.write(`[${++processed}/${images.length}] `)
    await compressAndReplace('receipts', path)
    // Petite pause pour ne pas saturer l'API
    await new Promise((r) => setTimeout(r, 200))
  }

  console.log('\n🎉 Batch terminé !')
}

main().catch((e) => { console.error(e); process.exit(1) })
