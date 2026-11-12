/** Baixa um arquivo direto pro computador, sem abrir aba nova.
 *  O atributo `download` do <a> é ignorado em links de outro domínio (caso do
 *  Firebase Storage), então busca o arquivo como blob e baixa a cópia local.
 *  Se a busca falhar (rede/CORS), cai no comportamento antigo: abre o link. */
export async function downloadFile(url: string, fileName?: string): Promise<void> {
  const name = fileName?.trim() || guessName(url)
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = name
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
  } catch (err) {
    console.error('downloadFile', err)
    window.open(url, '_blank', 'noopener')
  }
}

function guessName(url: string): string {
  try {
    const path = decodeURIComponent(new URL(url).pathname)
    const last = path.split('/').pop() || 'arquivo'
    // Storage salva como {timestamp}_{nome}; tira o prefixo numérico.
    return last.replace(/^\d{10,}_/, '')
  } catch {
    return 'arquivo'
  }
}
