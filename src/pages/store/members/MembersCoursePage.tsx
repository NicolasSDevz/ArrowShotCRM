import { Link, Navigate, useParams } from 'react-router-dom'
import { Lock, Play, CheckCircle2 } from 'lucide-react'
import { useCourse } from '../../../components/store/members/useCourse'
import { releaseDate, useMembers } from '../../../components/store/members/MembersContext'
import { Spinner } from '../../../components/ui/FullPageSpinner'

/** /membros/curso/:productId — banner do curso, progresso e módulos em cartões. */
export function MembersCoursePage() {
  const { productId } = useParams()
  const { loading: membersLoading } = useMembers()
  const { product, enrollment, modules, lessons, completed, percent, progress, loading } = useCourse(productId)

  if (membersLoading) return null
  if (!product) return <Navigate to="/membros" replace />
  const color = product.members?.primaryColor || '#2563eb'
  const firstLesson = lessons.find((l) => !releaseDate(enrollment, Math.max(l.releaseDays || 0, modules.find((m) => m.id === l.moduleId)?.releaseDays || 0)))
  const resumeId = progress?.lastLessonId && lessons.some((l) => l.id === progress.lastLessonId) ? progress.lastLessonId : firstLesson?.id

  return (
    <main className="pb-16">
      <section
        className="relative flex min-h-[300px] items-end bg-neutral-900 bg-cover bg-center"
        style={product.members?.bannerUrl ? { backgroundImage: `url(${product.members.bannerUrl})` } : undefined}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/60 to-transparent" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-7xl px-4 pb-8">
          <h1 className="text-3xl font-extrabold sm:text-4xl">{product.name}</h1>
          {product.description && <p className="mt-2 max-w-2xl text-neutral-300">{product.description}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {resumeId && (
              <Link to={`/membros/curso/${product.id}/aula/${resumeId}`} className="inline-flex items-center gap-2 rounded-lg px-6 py-3 font-semibold text-white" style={{ background: color }}>
                <Play size={18} fill="currentColor" aria-hidden="true" /> {progress?.lastLessonId ? 'Continuar de onde parei' : 'Começar o curso'}
              </Link>
            )}
            <div className="min-w-[200px]">
              <p className="text-sm text-neutral-300">Seu progresso: {percent}%</p>
              <div className="mt-1 h-2 rounded-full bg-white/10" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso do curso">
                <div className="h-2 rounded-full" style={{ width: `${percent}%`, background: color }} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pt-8">
        {loading ? (
          <Spinner className="h-6 w-6" />
        ) : modules.length === 0 ? (
          <p className="text-neutral-400">Esse curso ainda não tem conteúdo.</p>
        ) : (
          <>
            <h2 className="mb-4 text-xl font-bold">Módulos</h2>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {modules.map((m, idx) => {
                const modLessons = lessons.filter((l) => l.moduleId === m.id)
                const locked = releaseDate(enrollment, m.releaseDays)
                const done = modLessons.filter((l) => completed.has(l.id)).length
                const target = modLessons.find((l) => !completed.has(l.id)) ?? modLessons[0]
                const card = (
                  <>
                    <div
                      className="relative aspect-[2/3] overflow-hidden rounded-xl bg-neutral-800 bg-cover bg-center ring-white/40 transition group-hover:scale-[1.03] group-hover:ring-2"
                      style={m.coverUrl ? { backgroundImage: `url(${m.coverUrl})` } : undefined}
                    >
                      {!m.coverUrl && (
                        <span className="flex h-full flex-col items-center justify-center p-3 text-center">
                          <span className="text-xs uppercase tracking-wider text-neutral-400">Módulo {idx + 1}</span>
                          <span className="mt-1 font-semibold">{m.title}</span>
                        </span>
                      )}
                      {locked && (
                        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 p-2 text-center text-xs">
                          <Lock size={20} aria-hidden="true" /> Libera em {locked.toLocaleDateString('pt-BR')}
                        </span>
                      )}
                      {!locked && modLessons.length > 0 && done === modLessons.length && (
                        <CheckCircle2 className="absolute right-2 top-2 text-emerald-400" size={22} aria-hidden="true" />
                      )}
                    </div>
                    <p className="mt-2 truncate text-sm font-medium">{m.title}</p>
                    <p className="text-xs text-neutral-500">
                      {locked ? `Bloqueado até ${locked.toLocaleDateString('pt-BR')}` : `${done} de ${modLessons.length} aulas concluídas`}
                    </p>
                  </>
                )
                return (
                  <li key={m.id}>
                    {locked || !target ? (
                      <div className="group block opacity-80" aria-disabled="true">{card}</div>
                    ) : (
                      <Link to={`/membros/curso/${product.id}/aula/${target.id}`} className="group block">{card}</Link>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </main>
  )
}
