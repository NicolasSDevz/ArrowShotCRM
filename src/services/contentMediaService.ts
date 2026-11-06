import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from '../firebase/config'
import type { ContentMedia } from '../types/content'

/** Arte do post no Storage: /clients/{clientId}/social-media/{timestamp}_{nome}
 *  (mesma pasta e regra do resto dos arquivos de Social Mídia). O link de
 *  download leva o token do Firebase, então abre também na página pública de
 *  aprovação, sem login. */
export function uploadContentMedia(
  clientId: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<ContentMedia> {
  const safeName = file.name.replace(/[^\w.-]+/g, '_')
  const path = `clients/${clientId}/social-media/${Date.now()}_${safeName}`
  const task = uploadBytesResumable(ref(storage, path), file, { contentType: file.type })
  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref)
          resolve({ url, storagePath: path, kind: file.type.startsWith('video/') ? 'video' : 'image', name: file.name })
        } catch (err) {
          reject(err)
        }
      }
    )
  })
}

export async function deleteContentMedia(item: ContentMedia) {
  try {
    await deleteObject(ref(storage, item.storagePath))
  } catch {
    // já pode ter saído do Storage — o importante é tirar do post
  }
}

/** Ordena os arquivos pelo número no nome (tela-1, tela-2… / 01.png, 02.png),
 *  que é como os carrosséis saem da skill. */
export function sortFilesByName(files: File[]): File[] {
  return [...files].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }))
}
