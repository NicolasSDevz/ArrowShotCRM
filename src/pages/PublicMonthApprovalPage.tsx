import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ThumbsUp, RotateCcw, CheckCircle2, Clock } from 'lucide-react'
import { getPublicApprovalMonth, type ApprovalLink } from '../services/socialMonthService'
import { submitPublicApproval, submitPublicChangeRequest } from '../services/publicApprovalService'
import { CONTENT_FORMAT_LABEL, CONTENT_TYPE_LABEL, type Content } from '../types/content'
import { Spinner } from '../components/ui/FullPageSpinner'

type PostState = 'pending' | 'approved' | 'changes' | 'closed'

function initialState(c: Content): PostState {
  if (c.status === 'waiting_client') return 'pending'
  if (c.status === 'approved' || c.status === 'scheduled' || c.status === 'published') return 'approved'
  if (c.status === 'production') return 'changes'
  return 'closed'
}

function monthTitle(key: string) {
  const s = format(new Date(`${key}-15T12:00:00`), 'MMMM', { locale: ptBR })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Página pública do link do mês (/aprovacao/:token): o cliente vê todos os
 *  posts com a arte e aprova ou pede ajuste em cada um. */
export function PublicMonthApprovalPage() {
  const { token } = useParams<{ token: string }>()
  const [phase, setPhase] = useState<'loading' | 'invalid' | 'ready'>(token ? 'loading' : 'invalid')
  const [link, setLink] = useState<ApprovalLink | null>(null)
  const [posts, setPosts] = useState<Content[]>([])
  const [states, setStates] = useState<Record<string, PostState>>({})
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    // Só no `npm run dev`: /aprovacao/demo mostra posts de exemplo, sem banco.
    const load = import.meta.env.DEV && token === 'demo' ? import('./publicMonthApprovalDemo').then((m) => m.demoMonth()) : getPublicApprovalMonth(token)
    load
      .then((res) => {
        if (!res || res.contents.length === 0) return setPhase('invalid')
        setLink(res.link)
        setPosts(res.contents)
        setStates(Object.fromEntries(res.contents.map((c) => [c.id, initialState(c)])))
        setPhase('ready')
      })
      .catch(() => setPhase('invalid'))
  }, [token])

  const isDemo = import.meta.env.DEV && token === 'demo'

  const approve = async (c: Content) => {
    setBusy(c.id)
    try {
      if (!isDemo) await submitPublicApproval(c)
      setStates((s) => ({ ...s, [c.id]: 'approved' }))
    } catch (err) {
      console.error(err)
      alertInline(c.id)
    } finally {
      setBusy(null)
    }
  }

  const requestChange = async (c: Content, comment: string) => {
    setBusy(c.id)
    try {
      if (!isDemo) await submitPublicChangeRequest(c, comment)
      setStates((s) => ({ ...s, [c.id]: 'changes' }))
    } catch (err) {
      console.error(err)
      alertInline(c.id)
    } finally {
      setBusy(null)
    }
  }

  const [errorId, setErrorId] = useState<string | null>(null)
  const alertInline = (id: string) => setErrorId(id)

  const pending = posts.filter((c) => states[c.id] === 'pending')
  const answered = posts.length - pending.length

  const approveAll = async () => {
    for (const c of pending) await approve(c)
  }

  return (
    <div className="min-h-screen bg-navy-950 px-4 py-8">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        {phase === 'loading' && (
          <div className="flex justify-center py-20">
            <Spinner className="h-6 w-6" />
          </div>
        )}

        {phase === 'invalid' && (
          <p className="mt-20 rounded-lg bg-red-500/10 px-4 py-6 text-center text-sm text-red-300">
            Este link não é válido ou já foi substituído. Fale com a nossa equipe para receber o link atualizado.
          </p>
        )}

        {phase === 'ready' && link && (
          <>
            <header className="flex flex-col items-center gap-2 text-center">
              {link.logoUrl ? (
                <img src={link.logoUrl} alt={link.clientNameSnapshot} className="h-14 w-14 rounded-xl object-cover" />
              ) : (
                <img src="/favicon.png" alt="" className="h-12 w-12 rounded-lg" />
              )}
              <p className="text-xs uppercase tracking-wide text-slate-400">{link.clientNameSnapshot}</p>
              <h1 className="font-display text-2xl font-semibold text-white">Posts de {monthTitle(link.month)}</h1>
              <p className="text-sm text-slate-400">
                Veja cada post e toque em <strong className="text-slate-200">Aprovar</strong> ou{' '}
                <strong className="text-slate-200">Pedir ajuste</strong>.
                {link.deadline && (
                  <>
                    {' '}
                    Responda até{' '}
                    <strong className="text-slate-200">
                      {format(new Date(`${link.deadline}T12:00:00`), "dd/MM (EEEE)", { locale: ptBR })}
                    </strong>
                    .
                  </>
                )}
              </p>
            </header>

            <div className="sticky top-2 z-10 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-navy-900/95 px-4 py-3 backdrop-blur">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">
                  {answered} de {posts.length} respondidos
                </p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(answered / posts.length) * 100}%` }} />
                </div>
              </div>
              {pending.length > 1 && (
                <button
                  onClick={approveAll}
                  disabled={!!busy}
                  className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Aprovar os {pending.length}
                </button>
              )}
            </div>

            {pending.length === 0 && (
              <p className="rounded-lg bg-emerald-500/10 px-4 py-4 text-center text-sm text-emerald-300">
                Tudo respondido, obrigado! Agora a gente ajusta o que você pediu e agenda os posts.
              </p>
            )}

            {posts.map((c) => (
              <PostCard
                key={c.id}
                content={c}
                state={states[c.id]}
                busy={busy === c.id}
                failed={errorId === c.id}
                onApprove={() => approve(c)}
                onRequestChange={(comment) => requestChange(c, comment)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function PostCard({
  content,
  state,
  busy,
  failed,
  onApprove,
  onRequestChange,
}: {
  content: Content
  state: PostState
  busy: boolean
  failed: boolean
  onApprove: () => void
  onRequestChange: (comment: string) => void
}) {
  const [asking, setAsking] = useState(false)
  const [comment, setComment] = useState('')
  const media = content.media ?? []
  const date = content.scheduledDate?.toDate()

  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-navy-900">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            {date ? format(date, "EEEE, dd/MM", { locale: ptBR }) : 'Sem data'} · {CONTENT_FORMAT_LABEL[content.type] ?? CONTENT_TYPE_LABEL[content.type]}
          </p>
        </div>
        {state === 'approved' && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
            <CheckCircle2 size={13} /> Aprovado
          </span>
        )}
        {state === 'changes' && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-300">
            <Clock size={13} /> Ajuste pedido
          </span>
        )}
      </div>

      {media.length > 0 ? (
        <div className="relative">
          <div className="flex snap-x snap-mandatory overflow-x-auto bg-black">
            {media.map((m, i) =>
              m.kind === 'video' ? (
                <video key={i} src={m.url} controls playsInline preload="metadata" className="aspect-[4/5] w-full shrink-0 snap-center object-contain" />
              ) : (
                <img key={i} src={m.url} alt={`Tela ${i + 1}`} loading="lazy" className="aspect-[4/5] w-full shrink-0 snap-center object-contain" />
              )
            )}
          </div>
          {media.length > 1 && (
            <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">
              {media.length} telas · arraste →
            </span>
          )}
        </div>
      ) : (
        <p className="mx-4 rounded-lg bg-white/5 px-3 py-6 text-center text-xs text-slate-400">A arte deste post ainda vai ser enviada.</p>
      )}

      <div className="flex flex-col gap-3 px-4 py-4">
        {content.caption ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{content.caption}</p>
        ) : (
          <p className="text-sm text-slate-400">{content.title}</p>
        )}
        {content.hashtags && content.hashtags.length > 0 && <p className="text-xs text-slate-500">{content.hashtags.join(' ')}</p>}

        {failed && <p className="text-xs text-red-300">Não deu certo agora. Tente de novo em instantes.</p>}

        {state === 'pending' &&
          (asking ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="O que você quer mudar neste post?"
                rows={3}
                autoFocus
                className="w-full rounded-lg border border-white/10 bg-navy-800 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-brand-400"
              />
              <div className="flex gap-2">
                <button onClick={() => setAsking(false)} className="flex-1 rounded-lg bg-white/5 py-2.5 text-sm text-slate-300 hover:bg-white/10">
                  Cancelar
                </button>
                <button
                  onClick={() => onRequestChange(comment.trim())}
                  disabled={busy || !comment.trim()}
                  className="flex-1 rounded-lg bg-amber-600 py-2.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  Enviar pedido
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setAsking(true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/5 py-3 text-sm text-slate-200 hover:bg-white/10"
              >
                <RotateCcw size={14} /> Pedir ajuste
              </button>
              <button
                onClick={onApprove}
                disabled={busy}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <ThumbsUp size={14} /> Aprovar
              </button>
            </div>
          ))}
      </div>
    </article>
  )
}
