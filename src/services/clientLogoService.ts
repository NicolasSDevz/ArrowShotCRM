import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from '../firebase/config'
import { updateClient } from './clientService'
import { compressImageToDataUrl } from '../utils/imageToDataUrl'

export const CLIENT_LOGO_MAX_BYTES = 2 * 1024 * 1024
export const CLIENT_LOGO_ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']
export const CLIENT_LOGO_ACCEPT_ATTR = 'image/jpeg,image/png,image/webp'

/** Caminho fixo — cada upload sobrescreve o anterior, sem arquivos órfãos. */
function logoRef(clientId: string) {
  return ref(storage, `clients/${clientId}/logo/logo`)
}

/** Valida o arquivo (tipo/tamanho). Lança com mensagem amigável. */
export function assertValidLogo(file: File) {
  if (!CLIENT_LOGO_ACCEPTED.includes(file.type)) {
    throw new Error('Formato não suportado. Use JPG, PNG ou WebP.')
  }
  if (file.size > CLIENT_LOGO_MAX_BYTES) {
    throw new Error('A imagem precisa ter no máximo 2MB.')
  }
}

/** Sobe a logo pro Firebase Storage (clients/{id}/logo/logo) e grava a URL
 *  pública em client.logoUrl. Se o Storage não estiver ativo no projeto,
 *  cai para um data URI comprimido (320px) direto no Firestore — funciona
 *  igual, só ocupa espaço no doc; ativar o Storage no Console melhora isso. */
export async function uploadClientLogo(clientId: string, file: File, userId: string, userName: string): Promise<string> {
  assertValidLogo(file)
  let url: string
  try {
    const r = logoRef(clientId)
    await uploadBytes(r, file, { contentType: file.type })
    url = await getDownloadURL(r)
  } catch (storageErr) {
    console.warn('Storage indisponível — salvando logo como data URI.', storageErr)
    url = await compressImageToDataUrl(file, 320, 0.85)
  }
  await updateClient(clientId, { logoUrl: url }, userId, userName)
  return url
}

/** Remove a logo do Storage e limpa client.logoUrl (volta pras iniciais). */
export async function removeClientLogo(clientId: string, userId: string, userName: string) {
  try {
    await deleteObject(logoRef(clientId))
  } catch {
    // objeto pode já não existir — segue e limpa a URL mesmo assim
  }
  await updateClient(clientId, { logoUrl: null }, userId, userName)
}
