import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react'
import { MessageCircle, Send, Sparkles, X } from 'lucide-react'
import { checkoutChat } from '../../services/storeApi'

type Msg = { role: 'user' | 'assistant'; content: string }

const QUICK = ['É seguro comprar aqui?', 'Como recebo o acesso?', 'Tem garantia?', 'Posso parcelar?']

/** Lembra por sessão o que já apareceu (o convite e a saída não ficam repetindo). */
function once(key: string) {
  try {
    if (sessionStorage.getItem(key)) return false
    sessionStorage.setItem(key, '1')
  } catch {
    /* sem storage: deixa aparecer */
  }
  return true
}

/** **negrito** simples nas respostas. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>
      )}
    </>
  )
}

/** Archer na página de pagamento: tira dúvidas e ajuda a terminar a compra.
 *  Aparece sozinho quando a pessoa vai sair da página ou o cartão é recusado. */
export function CheckoutArcher({
  slug,
  productName,
  color,
  onColor,
  bottom,
  firstName,
  method,
  total,
  refusal,
  pixHint,
  onUsed,
}: {
  slug: string
  productName: string
  color: string
  onColor: string
  /** Distância do fundo da tela (sobe acima da barra fixa do celular). */
  bottom: number
  firstName: string
  method: string
  total: number
  /** Motivo do cartão recusado; `at` muda a cada recusa. */
  refusal: { reason: string; at: number } | null
  /** "No Pix sai com 5% de desconto e aprova na hora." (vazio se não tiver Pix). */
  pixHint: string
  onUsed: () => void
}) {
  const [open, setOpen] = useState(false)
  const [teaser, setTeaser] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [refusedNow, setRefusedNow] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // Caixa de texto cresce com a mensagem (até ~5 linhas) e volta ao enviar.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
  }, [input])
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const openRef = useRef(false)
  openRef.current = open

  const hello = `Oi${firstName ? `, ${firstName}` : ''}! Sou o Archer. Ficou alguma dúvida sobre ${productName}? Posso te ajudar por aqui.`

  const openWith = (greeting: string) => {
    setTeaser('')
    setMsgs((m) => (m.length ? [...m, { role: 'assistant', content: greeting }] : [{ role: 'assistant', content: greeting }]))
    setOpen(true)
  }

  // Convite discreto depois de um tempo na página.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!openRef.current && once(`archer-teaser-${slug}`)) setTeaser(hello)
    }, 25_000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  // Intenção de sair: no computador, o mouse vai para a barra de abas; no celular, voltou depois de sair do app.
  useEffect(() => {
    let hiddenAt = 0
    const onOut = (e: MouseEvent) => {
      if (e.clientY > 0 || e.relatedTarget || openRef.current) return
      if (once(`archer-exit-${slug}`)) openWith(`Antes de você ir${firstName ? `, ${firstName}` : ''}: ficou alguma dúvida sobre ${productName}? Me conta que eu te ajudo a decidir.`)
    }
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else if (hiddenAt && Date.now() - hiddenAt > 10_000 && !openRef.current && once(`archer-back-${slug}`)) setTeaser(`Que bom que voltou${firstName ? `, ${firstName}` : ''}! Ficou alguma dúvida? Estou aqui.`)
    }
    document.addEventListener('mouseout', onOut)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('mouseout', onOut)
      document.removeEventListener('visibilitychange', onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, firstName, productName])

  // Cartão recusado: abre explicando o que fazer.
  useEffect(() => {
    if (!refusal) return
    setRefusedNow(refusal.reason)
    openWith(`Seu cartão não passou. ${refusal.reason} Isso acontece bastante e tem jeito.${pixHint ? ` ${pixHint}` : ''} Quer que eu te ajude?`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refusal?.at])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, busy])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const close = () => {
    setOpen(false)
    setTimeout(() => buttonRef.current?.focus(), 0)
  }

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || busy) return
    onUsed()
    const next: Msg[] = [...(msgs.length ? msgs : [{ role: 'assistant' as const, content: hello }]), { role: 'user', content }]
    setMsgs(next)
    setInput('')
    setBusy(true)
    setError('')
    try {
      const { reply } = await checkoutChat({ slug, messages: next, context: { firstName, method, total, refused: refusedNow || null } })
      setMsgs((m) => [...m, { role: 'assistant', content: reply }])
    } catch (err) {
      setError((err as Error).message || 'Não consegui responder agora.')
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    send(input)
  }

  const shown = msgs.length ? msgs : [{ role: 'assistant' as const, content: hello }]
  const userAsked = msgs.some((m) => m.role === 'user')

  return (
    <div className="fixed right-4 z-30 flex flex-col items-end gap-2 font-sans" style={{ bottom }}>
      {open && (
        <div role="dialog" aria-label="Archer, assistente da compra" className="flex h-[min(520px,70vh)] w-[min(360px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white text-slate-800 shadow-2xl">
          <header className="flex items-center gap-2.5 px-4 py-3" style={{ background: color, color: onColor }}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20" aria-hidden="true"><Sparkles size={16} /></span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-sm font-bold">Archer</p>
              <p className="text-[11px] opacity-80">Tira suas dúvidas antes de comprar</p>
            </div>
            <button type="button" onClick={close} className="rounded-lg p-1.5 hover:bg-white/15" aria-label="Fechar o chat"><X size={18} /></button>
          </header>
          <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto bg-slate-50 p-3" aria-live="polite">
            {shown.map((m, i) => (
              <p
                key={i}
                className={`max-w-[85%] whitespace-pre-line break-words rounded-2xl px-3 py-2 text-sm leading-relaxed ${m.role === 'user' ? 'ml-auto rounded-br-md' : 'rounded-bl-md border border-slate-200 bg-white'}`}
                style={m.role === 'user' ? { background: color, color: onColor } : undefined}
              >
                <span className="sr-only">{m.role === 'user' ? 'Você: ' : 'Archer: '}</span>
                <Rich text={m.content} />
              </p>
            ))}
            {busy && <p className="w-fit rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-400">Digitando...</p>}
            {error && <p role="alert" className="text-center text-xs text-red-600">{error}</p>}
            {!userAsked && !busy && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {QUICK.map((q) => (
                  <button key={q} type="button" onClick={() => send(q)} className="rounded-full border bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-100" style={{ borderColor: color, color }}>
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
          <form onSubmit={submit} className="flex items-end gap-2 border-t border-slate-200 bg-white p-2.5">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  e.currentTarget.form?.requestSubmit()
                }
              }}
              maxLength={800}
              placeholder="Escreva sua dúvida"
              aria-label="Sua dúvida para o Archer"
              className="max-h-32 min-h-10 min-w-0 flex-1 resize-none overflow-y-auto break-words rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-5 outline-none focus:border-slate-400"
            />
            <button type="submit" disabled={busy || !input.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl disabled:opacity-50" style={{ background: color, color: onColor }} aria-label="Enviar">
              <Send size={16} />
            </button>
          </form>
        </div>
      )}

      {!open && teaser && (
        <div className="relative max-w-[260px] rounded-2xl rounded-br-md border border-black/10 bg-white p-3 pr-8 text-sm text-slate-700 shadow-lg" role="status">
          <button type="button" onClick={() => openWith(teaser)} className="text-left">{teaser}</button>
          <button type="button" onClick={() => setTeaser('')} className="absolute right-1.5 top-1.5 rounded p-1 text-slate-400 hover:text-slate-600" aria-label="Fechar o convite"><X size={14} /></button>
        </div>
      )}

      {!open && (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => (teaser ? openWith(teaser) : setOpen(true))}
          className="flex h-14 items-center gap-2 rounded-full px-4 shadow-xl transition hover:scale-105"
          style={{ background: color, color: onColor }}
          aria-label="Abrir o chat com o Archer para tirar dúvidas"
        >
          <MessageCircle size={22} aria-hidden="true" />
          <span className="hidden text-sm font-semibold sm:inline">Dúvidas?</span>
        </button>
      )}
    </div>
  )
}
