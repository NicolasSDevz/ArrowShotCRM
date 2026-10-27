import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTrails } from '../hooks/useTrails'
import { useModules } from '../hooks/useModules'
import { useMyProgress } from '../hooks/useProgress'
import { ModuleListItem } from '../components/university/ModuleListItem'
import { ProgressBar } from '../components/university/ProgressBar'
import { Spinner } from '../components/ui/FullPageSpinner'
import { EmptyState } from '../components/ui/EmptyState'

export function UniversityTrailPage() {
  const { trailId } = useParams<{ trailId: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: trails } = useTrails()
  const { data: modules, loading } = useModules(trailId)
  const { data: progress } = useMyProgress(profile?.id)

  const trail = trails.find((t) => t.id === trailId)
  const completedModuleIds = new Set(progress.filter((p) => p.completed).map((p) => p.moduleId))
  const completedCount = modules.filter((m) => completedModuleIds.has(m.id)).length

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={() => navigate('/universidade')}
        className="flex w-fit items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft size={14} /> Trilhas
      </button>

      <div>
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-slate-900">{trail?.title ?? 'Trilha'}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{trail?.description}</p>
      </div>

      {modules.length > 0 && (
        <div className="max-w-sm">
          <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
            <span>Progresso</span>
            <span>
              {completedCount}/{modules.length}
            </span>
          </div>
          <ProgressBar percent={modules.length > 0 ? (completedCount / modules.length) * 100 : 0} />
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : modules.length === 0 ? (
        <EmptyState title="Nenhum módulo nesta trilha ainda" />
      ) : (
        <div className="flex flex-col gap-2">
          {modules.map((module, index) => {
            const completed = completedModuleIds.has(module.id)
            const previous = modules[index - 1]
            const unlocked = index === 0 || (previous ? completedModuleIds.has(previous.id) : true)
            const state = completed ? 'completed' : unlocked ? 'unlocked' : 'locked'
            return (
              <ModuleListItem
                key={module.id}
                module={module}
                state={state}
                onClick={() => navigate(`/universidade/${trailId}/${module.id}`)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
