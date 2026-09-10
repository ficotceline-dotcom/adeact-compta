/**
 * Compresse un fichier image (JPG/PNG/WEBP) via canvas avant upload.
 * Les PDF et autres formats sont retournés tels quels.
 * Cible : max 1400px de large, qualité 0.82 → ~150-400 KB pour un ticket photo.
 */
export async function compressFile(file: File): Promise<File> {
  const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  if (!imageTypes.includes(file.type)) return file

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      const MAX_WIDTH = 1400
      const MAX_HEIGHT = 1400
      let { width, height } = img

      if (width > MAX_WIDTH || height > MAX_HEIGHT) {
        const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return }
          // Ne garder la version compressée que si elle est plus petite
          if (blob.size >= file.size) { resolve(file); return }
          const compressed = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() })
          resolve(compressed)
        },
        'image/jpeg',
        0.82,
      )
    }

    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}
