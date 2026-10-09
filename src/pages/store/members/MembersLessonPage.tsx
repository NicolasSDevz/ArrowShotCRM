import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Award, CheckCircle2, ChevronLeft, ChevronRight, Circle, Download, Lock, Paperclip, Star } from 'lucide-react'
import { useCourse, videoSource } from '../../../components/store/members/useCourse'
import { releaseDate, useAccent, useMembers } from '../../../components/store/members/MembersContext'
import { LessonComments } from '../../../components/store/members/LessonComments'
import { downloadCertificate } from '../../../components/store/members/certificate'
import { Spinner } from '../../../components/ui/FullPageSpinner'

/** /membros/curso/:productId/aula/:lessonId — player, lista de aulas, concluir,
 *  avaliar, anexos, comentários e certificado no fim. */
export function MembersLessonPage() {
  const { productId, lessonId } = useParams()
  const navigate = useNavigate()
  const { member, loading: membersLoading } = useMembers()
  const { product, enrollment, modules, lessons, completed, percent, progress, loading, setCompleted, setLastLesson, rate } = useCourse(productId)
  const [announce, setAnnounce] = useState('')
  const [openModule, setOpenModule] = useState<string | null>(null)
  const accent = useAccent(product)

  const lesson = lessons.find((l) => l.id === lessonId)
  const module = modules.find((m) => m.id === lesson?.moduleId)
  // Ordem real do curso: módulo a módulo, aula a aula.
  const ordered = useMemo(
    () => modules.flatMap((m) => lessons.filter((l) => l.moduleId === m.id)),
    [modules, lessons]
  )
  const idx = ordered.findIndex((l) => l.id === lessonId)
  const prev = idx > 0 ? ordered[idx - 1] : null
  const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null
  const lockOf = (l: { releaseDays: number; moduleId: string }) =>
    releaseDate(enrollment, Math.max(l.releaseDays || 0, modules.find((m) => m.id === l.moduleId)?.releaseDays || 0))

  useEffect(() => {
    if (lesson) {
      setLastLesson(lesson.id)
      setOpenModule(lesson.moduleId)
      document.title = lesson.title
    }
  }, [lesson, setLastLesson])

  if (membersLoading) return null
  if (!product) return <Navigate to="/membros" replace />
  if (loading) return <div className="p-10"><Spinner className="h-6 w-6" /></div>
  if (!lesson) return <Navigate to={`/membros/curso/${product.id}`} replace />

  const color = accent
  const locked = lockOf(lesson)
  const done = completed.has(lesson.id)
  const video = videoSource(lesson.videoUrl)
  const myRating = progress?.ratings?.[lesson.id] ?? 0
  const finished = percent === 100 && lessons.length > 0

  const toggleDone = async () => {
    await setCompleted(lesson.id, !done)
    setAnnounce(done ? 'Aula marcada como não concluída' : 'Aula concluída')
    if (!done && next && !lockOf(next)) navigate(`/membros/curso/${product.id}/aula/${next.id}`)
  }

  return (
    <main className="mx-auto grid max-w-[1400px] gap-6 px-4 py-6 lg:grid-cols-[1fr_360px]">
      <p className="sr-only" aria-live="polite">{announce}</p>
      <div className="min-w-0">
        <nav aria-label="Caminho" className="mb-3 flex items-center gap-1 text-sm text-[var(--m-muted)]">
          <Link to={`/membros/curso/${product.id}`} className="hover:text-[var(--m-text)]">{product.name}</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span>{module?.title}</span>
        </nav>

        <div className="overflow-hidden rounded-xl bg-black">
          {locked ? (
            <div className="flex aspect-video flex-col items-center justify-center gap-2 text-[var(--m-text2)]">
              <Lock size={32} aria-hidden="true" />
              <p>Essa aula será liberada em {locked.toLocaleDateString('pt-BR')}.</p>
            </div>
          ) : video?.kind === 'video' ? (
            <video src={video.src} controls className="aspect-video w-full" controlsList="nodownload" />
          ) : video ? (
            <iframe
              src={video.src}
              title={lesson.title}
              className="aspect-video w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
            />
          ) : (
            <div className="flex aspect-video items-center justify-center text-[var(--m-faint)]">Esta aula não tem vídeo.</div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold">{lesson.title}</h1>
          {!locked && (
            <button
              onClick={toggleDone}
              aria-pressed={done}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold ${done ? 'bg-emerald-500/15 text-emerald-400' : 'text-white'}`}
              style={done ? undefined : { background: color }}
            >
              {done ? <CheckCircle2 size={18} aria-hidden="true" /> : <Circle size={18} aria-hidden="true" />}
              {done ? 'Aula concluída' : 'Concluir aula'}
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Avalie esta aula">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} role="radio" aria-checked={myRating === n} aria-label={`${n} ${n === 1 ? 'estrela' : 'estrelas'}`} onClick={() => rate(lesson.id, n)} className={n <= myRating ? 'text-amber-400' : 'text-[var(--m-faint)] hover:text-amber-300'}>
                <Star size={20} fill={n <= myRating ? 'currentColor' : 'none'} />
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            {prev && (
              <Link to={`/membros/curso/${product.id}/aula/${prev.id}`} className="flex items-center gap-1 rounded-lg border border-[var(--m-border)] px-3 py-2 text-sm hover:bg-[var(--m-soft)]">
                <ChevronLeft size={16} aria-hidden="true" /> Anterior
              </Link>
            )}
            {next && (
              <Link to={`/membros/curso/${product.id}/aula/${next.id}`} className="flex items-center gap-1 rounded-lg border border-[var(--m-border)] px-3 py-2 text-sm hover:bg-[var(--m-soft)]">
                Próxima <ChevronRight size={16} aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>

        {lesson.description && !locked && (
          <div className="members-prose prose mt-6 max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{lesson.description}</ReactMarkdown>
          </div>
        )}

        {lesson.attachments?.length > 0 && !locked && (
          <section className="mt-6" aria-labelledby="att-title">
            <h2 id="att-title" className="mb-2 flex items-center gap-2 font-semibold"><Paperclip size={16} aria-hidden="true" /> Anexos</h2>
            <ul className="space-y-2">
              {lesson.attachments.map((a, i) => (
                <li key={i}>
                  <a href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-[var(--m-border)] px-3 py-2 text-sm hover:bg-[var(--m-soft)]">
                    <Download size={16} aria-hidden="true" /> {a.name || 'Baixar arquivo'}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {product.members?.commentsEnabled !== false && !locked && (
          <LessonComments productId={product.id} lessonId={lesson.id} lessonTitle={lesson.title} needApproval={product.members?.commentsNeedApproval === true} color={color} />
        )}
      </div>

      <aside aria-label="Conteúdo do curso" className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
        <div className="rounded-xl border border-[var(--m-border)] bg-[var(--m-card)] p-4">
          <p className="text-sm font-semibold">Seu progresso: {percent}%</p>
          <div className="mt-2 h-2 rounded-full bg-[var(--m-soft2)]" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso do curso">
            <div className="h-2 rounded-full" style={{ width: `${percent}%`, background: color }} />
          </div>
          {finished && product.members?.certificateEnabled !== false && (
            <button
              onClick={() =>
                downloadCertificate({
                  studentName: member?.name || '',
                  courseName: product.name,
                  producerName: product.members?.producerName || 'Arrow Shot',
                  hours: product.members?.certificateHours,
                  color,
                })
              }
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white"
              style={{ background: color }}
            >
              <Award size={18} aria-hidden="true" /> Parabéns! Baixe o seu certificado
            </button>
          )}
        </div>

        <ul className="mt-3 space-y-2">
          {modules.map((m, mi) => {
            const modLessons = lessons.filter((l) => l.moduleId === m.id)
            const open = openModule === m.id
            return (
              <li key={m.id} className="overflow-hidden rounded-xl border border-[var(--m-border)] bg-[var(--m-card)]">
                <button onClick={() => setOpenModule(open ? null : m.id)} aria-expanded={open} className="flex w-full items-center justify-between px-4 py-3 text-left">
                  <span>
                    <span className="block text-xs text-[var(--m-faint)]">Módulo {mi + 1}</span>
                    <span className="text-sm font-semibold">{m.title}</span>
                  </span>
                  <span className="text-xs text-[var(--m-faint)]">{modLessons.filter((l) => completed.has(l.id)).length}/{modLessons.length}</span>
                </button>
                {open && (
                  <ul className="border-t border-[var(--m-border2)]">
                    {modLessons.map((l) => {
                      const lLocked = lockOf(l)
                      const current = l.id === lesson.id
                      const isDone = completed.has(l.id)
                      return (
                        <li key={l.id}>
                          <Link
                            to={`/membros/curso/${product.id}/aula/${l.id}`}
                            aria-current={current ? 'page' : undefined}
                            className={`flex items-center gap-2.5 px-4 py-2.5 text-sm ${current ? 'bg-[var(--m-soft2)] text-[var(--m-text)]' : 'text-[var(--m-text2)] hover:bg-[var(--m-soft)]'}`}
                          >
                            {lLocked ? <Lock size={15} className="shrink-0 text-[var(--m-faint)]" aria-hidden="true" /> : isDone ? <CheckCircle2 size={15} className="shrink-0 text-emerald-400" aria-hidden="true" /> : <Circle size={15} className="shrink-0 text-[var(--m-faint)]" aria-hidden="true" />}
                            <span className="min-w-0 flex-1 truncate">{l.title}</span>
                            <span className="sr-only">{lLocked ? ', bloqueada' : isDone ? ', concluída' : ''}</span>
                            {l.durationMin ? <span className="text-xs text-[var(--m-faint)]">{l.durationMin} min</span> : null}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </aside>
    </main>
  )
}
