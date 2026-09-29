/** Links do Google Drive/Docs → endereço que abre DENTRO da página (iframe).
 *  Os arquivos continuam no Drive; o CRM só guarda o link. Pra funcionar, o
 *  arquivo/pasta precisa estar compartilhado com quem vai ver (ex: "Qualquer
 *  pessoa com o link" ou o e-mail da equipe). */

function toUrl(raw?: string | null): URL | null {
  const v = raw?.trim()
  if (!v) return null
  try {
    return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`)
  } catch {
    return null
  }
}

const isDriveHost = (u: URL) => u.hostname === 'drive.google.com' || u.hostname === 'docs.google.com'

export function isGoogleDriveLink(raw?: string | null): boolean {
  const u = toUrl(raw)
  return !!u && isDriveHost(u)
}

/** Arquivo do Drive (vídeo, PDF, imagem) ou documento do Google (Docs,
 *  Apresentações, Planilhas) → link de visualização embutida. null se não for. */
export function driveFileEmbedUrl(raw?: string | null): string | null {
  const u = toUrl(raw)
  if (!u || !isDriveHost(u)) return null
  const docs = u.pathname.match(/^\/(document|presentation|spreadsheets|forms)\/d\/([\w-]{10,})/)
  if (u.hostname === 'docs.google.com' && docs) {
    const [, kind, id] = docs
    if (kind === 'presentation') return `https://docs.google.com/presentation/d/${id}/embed`
    if (kind === 'forms') return `https://docs.google.com/forms/d/${id}/viewform?embedded=true`
    return `https://docs.google.com/${kind}/d/${id}/preview`
  }
  const file = u.pathname.match(/\/file\/d\/([\w-]{10,})/)
  const id = file?.[1] ?? (/^\/(open|uc)$/.test(u.pathname) ? u.searchParams.get('id') : null)
  return id ? `https://drive.google.com/file/d/${id}/preview` : null
}

/** Pasta do Drive → lista de arquivos embutida. null se não for uma pasta. */
export function driveFolderEmbedUrl(raw?: string | null, view: 'list' | 'grid' = 'list'): string | null {
  const u = toUrl(raw)
  if (!u || u.hostname !== 'drive.google.com') return null
  const m = u.pathname.match(/\/folders\/([\w-]{10,})/)
  const id = m?.[1] ?? (u.pathname === '/embeddedfolderview' ? u.searchParams.get('id') : null)
  return id ? `https://drive.google.com/embeddedfolderview?id=${id}#${view}` : null
}
