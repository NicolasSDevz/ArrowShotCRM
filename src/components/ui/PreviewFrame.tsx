import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Mostra a prévia dentro de um iframe com os mesmos estilos do app, mas SEM o
 *  modo escuro do CRM (que recolore branco em escuro com !important). Assim a
 *  prévia do checkout e da área de membros fica igual ao link real. */
export function PreviewFrame({ children, title, className = '', height = '80vh' }: { children: ReactNode; title: string; className?: string; height?: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [body, setBody] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const frame = frameRef.current
    const doc = frame?.contentDocument
    if (!doc) return
    doc.open()
    doc.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0"></body></html>')
    doc.close()

    // Copia os estilos do app (Tailwind, fontes) e acompanha os que chegarem depois (Google Fonts do checkout).
    const copy = (node: Node) => {
      if (node instanceof HTMLStyleElement || (node instanceof HTMLLinkElement && node.rel === 'stylesheet')) {
        doc.head.appendChild(node.cloneNode(true))
      }
    }
    document.head.childNodes.forEach(copy)
    const observer = new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach(copy)))
    observer.observe(document.head, { childList: true })
    setBody(doc.body)
    return () => observer.disconnect()
  }, [])

  return (
    <iframe ref={frameRef} title={title} className={`block w-full border-0 bg-white ${className}`} style={{ height }}>
      {body && createPortal(children, body)}
    </iframe>
  )
}
