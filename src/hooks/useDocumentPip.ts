import { useCallback, useEffect, useRef, useState } from 'react'

interface DocumentPictureInPicture {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture
  }
}

/** Copia as folhas de estilo da página atual para dentro da janela flutuante —
 *  ela nasce com um document vazio, não herda nada do documento principal.
 *  Mesma origem: inlina as regras. Cross-origin (ex: fonte do Google):
 *  cssRules lança SecurityError, cai no <link> apontando pro mesmo href. */
function copyStylesToWindow(target: Window) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n')
      const style = target.document.createElement('style')
      style.textContent = css
      target.document.head.appendChild(style)
    } catch {
      if (sheet.href) {
        const link = target.document.createElement('link')
        link.rel = 'stylesheet'
        link.href = sheet.href
        target.document.head.appendChild(link)
      }
    }
  }
}

/** Janela flutuante (Document Picture-in-Picture) para o Copiloto de Vendas —
 *  mostra sugestões por cima do Meet sem precisar trocar de aba. O conteúdo é
 *  renderizado via React Portal direto no document dessa janela (ver
 *  CopilotoPage), então compartilha o mesmo estado da aba principal: nenhuma
 *  captura de áudio ou requisição é duplicada. */
export function useDocumentPip() {
  const isSupported = typeof window !== 'undefined' && 'documentPictureInPicture' in window
  const [pipWindow, setPipWindow] = useState<Window | null>(null)
  const pipWindowRef = useRef<Window | null>(null)

  const open = useCallback(async (): Promise<Window | null> => {
    if (!isSupported) return null
    if (pipWindowRef.current) return pipWindowRef.current
    try {
      const win = await window.documentPictureInPicture!.requestWindow({ width: 360, height: 480 })
      copyStylesToWindow(win)
      win.document.title = 'Copiloto — sugestões'
      win.document.body.style.margin = '0'
      win.document.body.style.overflow = 'hidden'
      const theme = document.documentElement.getAttribute('data-theme')
      if (theme) win.document.documentElement.setAttribute('data-theme', theme)

      pipWindowRef.current = win
      setPipWindow(win)

      win.addEventListener('pagehide', () => {
        pipWindowRef.current = null
        setPipWindow(null)
      })

      return win
    } catch (err) {
      console.warn('[copiloto] não foi possível abrir a janela flutuante:', err)
      return null
    }
  }, [isSupported])

  const close = useCallback(() => {
    pipWindowRef.current?.close()
  }, [])

  // Fecha a janela flutuante se a página do Copiloto for desmontada.
  useEffect(() => {
    return () => pipWindowRef.current?.close()
  }, [])

  return { isSupported, pipWindow, open, close }
}
