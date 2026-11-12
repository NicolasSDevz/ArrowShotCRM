/** Legenda pronta para colar no Instagram: texto + linha em branco + hashtags.
 *  Posts antigos guardavam as hashtags num campo à parte; aqui elas entram no
 *  fim da legenda (sem repetir as que já estiverem no texto). */
export function fullCaption(caption?: string | null, hashtags?: string[] | null): string {
  const text = (caption ?? '').trim()
  const missing = (hashtags ?? [])
    .map((h) => h.trim())
    .filter(Boolean)
    .filter((h) => !text.toLowerCase().includes(h.toLowerCase()))
  if (!missing.length) return text
  return text ? `${text}\n\n${missing.join(' ')}` : missing.join(' ')
}
