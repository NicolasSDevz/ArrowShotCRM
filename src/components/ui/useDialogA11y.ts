import { useEffect, useRef, type KeyboardEvent } from 'react'

/** Comportamento de janela acessível compartilhado por Drawer e Modal —
 *  pensado pra quem usa leitor de tela (Jamilson):
 *  - ao abrir, o foco vai pro painel (o leitor anuncia o título da janela),
 *    a não ser que algo dentro dela já tenha pegado o foco (autoFocus);
 *  - ao fechar, o foco volta pro elemento que abriu a janela;
 *  - Esc fecha. */
export function useDialogA11y(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) panel.focus()
    return () => {
      if (previous && document.contains(previous)) previous.focus()
    }
  }, [open])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
    }
  }

  return { panelRef, onKeyDown }
}
