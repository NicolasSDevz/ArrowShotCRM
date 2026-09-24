const ID_RE = /^[\w-]{11}$/

/** Extrai o id de um vídeo do YouTube de qualquer formato de link comum
 *  (watch?v=, youtu.be/, /embed/, /shorts/, /live/). Devolve null se não
 *  for um link reconhecível. */
export function parseYouTubeId(input?: string | null): string | null {
  const raw = input?.trim()
  if (!raw) return null
  if (ID_RE.test(raw)) return raw
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    const host = url.hostname.replace(/^(www|m)\./, '')
    let id: string | null = null
    if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0]
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (url.pathname === '/watch') id = url.searchParams.get('v')
      else {
        const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/)
        id = m?.[1] ?? null
      }
    }
    return id && ID_RE.test(id) ? id : null
  } catch {
    return null
  }
}

export function youTubeEmbedUrl(input?: string | null): string | null {
  const id = parseYouTubeId(input)
  return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1` : null
}
