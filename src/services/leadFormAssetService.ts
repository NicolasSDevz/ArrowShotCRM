import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from '../firebase/config'
import { compressImageToDataUrl } from '../utils/imageToDataUrl'

export const LEAD_FORM_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const LEAD_FORM_IMAGE_ACCEPT_ATTR = 'image/jpeg,image/png,image/webp'

function assetRef(formId: string, kind: 'banner' | 'logo') {
  return ref(storage, `leadForms/${formId}/${kind}`)
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Tempo de envio esgotado')), ms)),
  ])
}

/** Sobe a imagem de Design (banner/logo) do formulário pro Storage
 *  (leadForms/{formId}/{kind} — leitura pública, ver storage.rules) e
 *  devolve a URL. Se o Storage falhar/demorar, cai pra um data URI
 *  comprimido direto no campo do Firestore (mesmo padrão do
 *  clientLogoService) — funciona igual na página pública, só ocupa mais
 *  espaço no documento. */
export async function uploadLeadFormImage(formId: string, kind: 'banner' | 'logo', file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem.')
  if (file.size > LEAD_FORM_IMAGE_MAX_BYTES) throw new Error('A imagem precisa ter no máximo 5MB.')
  try {
    const r = assetRef(formId, kind)
    await withTimeout(uploadBytes(r, file, { contentType: file.type }), 6000)
    return await withTimeout(getDownloadURL(r), 6000)
  } catch (storageErr) {
    console.warn('Storage indisponível ou lento — salvando imagem do formulário como data URI.', storageErr)
    return compressImageToDataUrl(file, kind === 'banner' ? 1200 : 320, 0.82)
  }
}

export async function removeLeadFormImage(formId: string, kind: 'banner' | 'logo') {
  try {
    await deleteObject(assetRef(formId, kind))
  } catch {
    // pode já não existir no Storage (ex: era um data URI) — segue normal
  }
}
