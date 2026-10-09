/** Resizes and compresses an image client-side into a small JPEG data URI,
 *  so avatars/logos can live directly on the Firestore document (photoURL /
 *  logoUrl) instead of needing Firebase Storage — which isn't available yet
 *  on this project's Spark plan. Not meant for anything beyond small square
 *  images: general file attachments still go through fileService/Storage
 *  once that's enabled. */
export function compressImageToDataUrl(file: File, maxSize = 320, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Selecione um arquivo de imagem.'))
      return
    }

    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
      const width = Math.round(img.width * scale)
      const height = Math.round(img.height * scale)

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Não foi possível processar a imagem.'))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)

      // PNG/WebP/GIF/SVG podem ter fundo transparente: JPEG pintaria de preto (logo).
      // WebP mantém a transparência e fica leve; navegador sem WebP devolve PNG.
      const transparent = /image\/(png|webp|gif|svg\+xml)/.test(file.type)
      const dataUrl = canvas.toDataURL(transparent ? 'image/webp' : 'image/jpeg', quality)
      // ~700KB base64 cap, comfortably under Firestore's 1MB document limit.
      if (dataUrl.length > 700_000) {
        reject(new Error('Imagem muito grande mesmo após compressão. Tente uma foto menor.'))
        return
      }
      resolve(dataUrl)
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Não foi possível ler a imagem.'))
    }

    img.src = objectUrl
  })
}
