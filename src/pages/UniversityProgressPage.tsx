import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Circle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTrails } from '../hooks/useTrails'
import { useAllModules } from '../hooks/useModules'
import { useMyProgress } from '../hooks/useProgress'
import { ProgressBar } from '../components/university/ProgressBar'
import { Spinner } from '../components/ui/FullPageSpinner'
import { EmptyState } from '../components/ui/EmptyState'

export function UniversityProgressPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: trails, loading: loadingTrails } = useTrails()
  const { data: modules } = useAllModules()
  const { data: progress, loading: loadingProgress } = useMyProgress(profile?.id)

  const progressByModule = new Map(progress.map((p) => [p.moduleId, p]))

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={() => navigate('/universidade')}
        className="flex w-fit items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft size={14} /> Trilhas
      </button>

      <div>
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-slate-900">Meu Progresso</h1>
        <p className="mt-0.5 text-sm text-slate-500">Módulos concluídos, pendentes e notas por trilha.</p>
      </div>

      {loadingTrails || loadingProgress ? (
        <Spinner />
      ) : trails.length === 0 ? (
        <EmptyState title="Nenhuma trilha cadastrada ainda" />
      ) : (
        <div className="flex flex-col gap-4">
          {trails.map((trail) => {
            const trailModules = modules.filter((m) => m.trailId === trail.id)
            const completed = trailModules.filter((m) => progressByModule.get(m.id)?.completed).length
            const percent = trailModules.length > 0 ? (completed / trailModules.length) * 100 : 0

            return (
              <div key={trail.id} className="rounded-xl border border-slate-100 bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-medium text-slate-800">{trail.title}</p>
                  <span className="text-xs text-slate-400">
                    {completed}/{trailModules.length} · {Math.round(percent)}%
                  </span>
                </div>
                <ProgressBar percent={percent} />
                <div className="mt-3 flex flex-col gap-1">
                  {trailModules.map((m) => {
                    const p = progressByModule.get(m.id)
                    return (
                      <div key={m.id} className="flex items-center justify-between gap-2 py-1 text-sm">
                        <span className="flex items-center gap-2 truncate text-slate-600">
                          {p?.completed ? (
                            <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />
                          ) : (
                            <Circle size={14} className="shrink-0 text-slate-300" />
                          )}
                          {m.title}
                        </span>
                        {p?.completed && (
                          <span className="shrink-0 text-xs text-slate-400">Nota: {p.quizScore}%</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
