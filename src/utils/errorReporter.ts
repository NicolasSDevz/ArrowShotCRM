/** Manda pro servidor os erros que quebram uma tela (api/_lib/errorReport.js),
 *  que avisa o dono do CRM no sino e no celular. Vale para o CRM, o checkout
 *  e a área de membros. */

const ENDPOINT = '/api/meta/erro'
const MAX_PER_PAGE_LOAD = 5

let userName: string | null = null
let sentCount = 0
const sent = new Set<string>()

/** Quem está usando (o AuthContext chama ao entrar/sair). */
export function setErrorReportUser(name: string | null) {
  userName = name
}

/** Ruídos que não são erro do nosso código. */
function isNoise(message: string, stack: string, name = ''): boolean {
  if (!message) return true
  // Requisição cancelada (saiu da tela, conexão caiu, Firebase reconectando): não é erro.
  if (name === 'AbortError' || /signal is aborted|operation was aborted|user aborted|aborted without reason|AbortError/i.test(message)) return true
  if (/ResizeObserver loop/i.test(message)) return true
  if (message === 'Script error.' || message === 'Script error') return true
  if (/chrome-extension:|moz-extension:|safari-extension:/i.test(stack)) return true
  // Arquivo de tela de uma versão antiga (depois de deploy): lazyPage já recarrega.
  if (/dynamically imported module|Importing a module script failed|error loading dynamically/i.test(message)) return true
  if (/Failed to fetch|NetworkError|Load failed|network error/i.test(message)) return true
  return false
}

export function reportError(error: unknown, kind: 'tela' | 'erro' | 'promessa' = 'erro') {
  try {
    const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error ?? 'erro'))
    const message = String(err.message || err.name || 'Erro sem mensagem')
    const stack = String(err.stack || '')
    if (isNoise(message, stack, String(err.name || ''))) return
    const key = `${message}|${window.location.pathname}`
    if (sent.has(key) || sentCount >= MAX_PER_PAGE_LOAD) return
    sent.add(key)
    sentCount++

    const payload = JSON.stringify({
      message,
      stack: stack.slice(0, 4000),
      kind,
      path: window.location.pathname,
      userName,
      userAgent: navigator.userAgent,
      release: import.meta.env.VITE_RELEASE ?? '',
    })
    const blob = new Blob([payload], { type: 'application/json' })
    if (!navigator.sendBeacon?.(ENDPOINT, blob)) {
      void fetch(ENDPOINT, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {})
    }
  } catch {
    /* o aviso de erro nunca pode quebrar a tela */
  }
}

let installed = false

/** Liga os ouvintes globais (main.tsx). Só em produção: no `npm run dev` não avisa. */
export function installErrorReporter() {
  if (installed || !import.meta.env.PROD) return
  installed = true
  window.addEventListener('error', (e) => reportError(e.error ?? e.message, 'erro'))
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, 'promessa'))
}
