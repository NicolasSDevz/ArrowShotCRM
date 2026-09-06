import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ThumbsUp, RotateCcw, CalendarClock } from 'lucide-react'
import { getShareableContent, submitPublicApproval, submitPublicChangeRequest } from '../services/publicApprovalService'
import { CONTENT_PLATFORM_LABEL, CONTENT_TYPE_LABEL, type Content } from '../types/content'
import { Spinner } from '../components/ui/FullPageSpinner'

type Phase = 'loading' | 'invalid' | 'ready' | 'requesting' | 'done_approved' | 'done_changes' | 'already_handled'

export function PublicApprovalPage() {
  const { contentId, token } = useParams<{ contentId: string; token: string }>()
  const [phase, setPhase] = useState<Phase>('loading')
  const [content, setContent] = useState<Content | null>(null)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!contentId || !token) {
      setPhase('invalid')
      return
    }
    getShareableContent(contentId, token)
      .then((c) => {
        if (!c) {
          setPhase('invalid')
          return
        }
        setContent(c)
        // Only actionable while the piece is actually awaiting the client.
        // Anything past that (approved / production / scheduled / published…)
        // means an older link — show a read-only state, never the buttons.
        if (c.status === 'approved') setPhase('done_approved')
        else if (c.status === 'waiting_client') setPhase('ready')
        else setPhase('already_handled')
      })
      .catch(() => setPhase('invalid'))
  }, [contentId, token])

  const handleApprove = async () => {
    if (!content) return
    setSubmitting(true)
    try {
      await submitPublicApproval(content)
      setPhase('done_approved')
    } catch {
      setPhase('invalid')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRequestChange = async () => {
    if (!content || !comment.trim()) return
    setSubmitting(true)
    try {
      await submitPublicChangeRequest(content, comment.trim())
      setPhase('done_changes')
    } catch {
      setPhase('invalid')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-950 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-navy-900 p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-2">
          <img src="/favicon.png" alt="Arrow Shot" className="h-12 w-12 rounded-lg" />
          <h1 className="font-display text-xl font-semibold text-white">Aprovação de conteúdo</h1>
          {content?.clientNameSnapshot && <p className="text-xs text-slate-400">{content.clientNameSnapshot}</p>}
        </div>

        {phase === 'loading' && (
          <div className="flex justify-center py-10">
            <Spinner className="h-6 w-6" />
          </div>
        )}

        {phase === 'invalid' && (
          <p className="rounded-lg bg-red-500/10 px-4 py-6 text-center text-sm text-red-300">
            Este link não é válido ou já expirou. Fale com a equipe da Arrow Shot para receber um novo.
          </p>
        )}

        {phase === 'done_approved' && (
          <p className="rounded-lg bg-emerald-500/10 px-4 py-6 text-center text-sm text-emerald-300">
            Conteúdo aprovado! Obrigado — nossa equipe já vai agendar a publicação.
          </p>
        )}

        {phase === 'already_handled' && (
          <p className="rounded-lg bg-slate-500/10 px-4 py-6 text-center text-sm text-slate-300">
            Este conteúdo já foi processado e não está mais aguardando aprovação. Se precisar de
            ajustes, fale com a equipe da Arrow Shot.
          </p>
        )}

        {phase === 'done_changes' && (
          <p className="rounded-lg bg-amber-500/10 px-4 py-6 text-center text-sm text-amber-300">
            Solicitação enviada! Nossa equipe vai ajustar e te enviar um novo conteúdo para aprovação.
          </p>
        )}

        {(phase === 'ready' || phase === 'requesting') && content && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-white/10 bg-navy-800 p-4">
              <p className="text-base font-medium text-white">{content.title}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                <span>{CONTENT_TYPE_LABEL[content.type]}</span>
                <span>{CONTENT_PLATFORM_LABEL[content.platform]}</span>
                {content.scheduledDate && (
                  <span className="flex items-center gap-1">
                    <CalendarClock size={12} />
                    {format(content.scheduledDate.toDate(), 'dd MMM yyyy', { locale: ptBR })}
                    {content.scheduledTime ? ` às ${content.scheduledTime}` : ''}
                  </span>
                )}
              </div>
              {content.caption && (
                <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{content.caption}</p>
              )}
              {content.cta && <p className="mt-2 text-xs font-medium text-brand-400">CTA: {content.cta}</p>}
              {content.hashtags && content.hashtags.length > 0 && (
                <p className="mt-2 text-xs text-slate-500">{content.hashtags.join(' ')}</p>
              )}
            </div>

            <p className="text-xs text-slate-500">
              A prévia visual (arte/vídeo) ainda não está disponível neste link — em breve.
            </p>

            {phase === 'requesting' ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="O que precisa ser alterado?"
                  rows={3}
                  autoFocus
                  className="w-full rounded-lg border border-white/10 bg-navy-800 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-brand-400"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setPhase('ready')}
                    className="flex-1 rounded-lg bg-white/5 py-2 text-sm text-slate-300 hover:bg-white/10"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleRequestChange}
                    disabled={submitting || !comment.trim()}
                    className="flex-1 rounded-lg bg-amber-600 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    Enviar solicitação
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setPhase('requesting')}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/5 py-2.5 text-sm text-slate-300 hover:bg-white/10"
                >
                  <RotateCcw size={14} /> Solicitar alteração
                </button>
                <button
                  onClick={handleApprove}
                  disabled={submitting}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <ThumbsUp size={14} /> Aprovar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
