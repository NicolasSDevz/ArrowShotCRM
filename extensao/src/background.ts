/** Service worker (Manifest V3) — só infraestrutura, nenhuma lógica de
 *  negócio mora aqui:
 *  1. Liga o painel lateral só em abas do meet.google.com (nas outras,
 *     clicar no ícone da extensão não abre nada — ver manifest.json).
 *  2. Garante que o offscreen document (onde a captura/transcrição/IA do
 *     Copiloto roda — ver offscreen.ts) existe quando o side panel pedir. */

const MEET_PATTERN = /^https:\/\/meet\.google\.com\//

async function atualizarSidePanel(tabId: number, url: string | undefined) {
  const habilitado = !!url && MEET_PATTERN.test(url)
  try {
    await chrome.sidePanel.setOptions({ tabId, path: 'sidepanel.html', enabled: habilitado })
  } catch (err) {
    console.warn('[copiloto-ext] falha ao atualizar o side panel da aba', tabId, err)
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') void atualizarSidePanel(tabId, tab.url)
})

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => void atualizarSidePanel(tabId, tab?.url))
})

async function ensureOffscreenDocument() {
  const existing = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] })
  if (existing.length > 0) return
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Captura o microfone do Bruno e o áudio da aba do Meet para transcrever a chamada ao vivo.',
  })
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'ensureOffscreen') {
    ensureOffscreenDocument()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }))
    return true
  }
  return undefined
})
