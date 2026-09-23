import { useNavigate } from 'react-router-dom'
import { Settings, TrendingUp } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTrails } from '../hooks/useTrails'
import { useAllModules } from '../hooks/useModules'
import { useMyProgress } from '../hooks/useProgress'
import { TrailCard } from '../components/university/TrailCard'
import { EmptyState } from '../components/ui/EmptyState'
import { Spinner } from '../components/ui/FullPageSpinner'
import { Button } from '../components/ui/Button'

export function UniversityPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: trails, loading: loadingTrails } = useTrails()
  const { data: modules } = useAllModules()
  const { data: progress } = useMyProgress(profile?.id)

  const loading = loadingTrails
  const completedModuleIds = new Set(progress.filter((p) => p.completed).map((p) => p.moduleId))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold text-slate-900">Universidade Quiver</h1>
          <p className="text-[15px] text-[#64748B]">Trilhas de treinamento para novos e atuais funcionários.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<TrendingUp size={14} />} onClick={() => navigate('/universidade/progresso')}>
            Meu progresso
          </Button>
          {profile?.role === 'admin' && (
            <Button variant="secondary" icon={<Settings size={14} />} onClick={() => navigate('/universidade/admin')}>
              Gerenciar
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : trails.length === 0 ? (
        <EmptyState
          title="Nenhuma trilha cadastrada"
          description={
            profile?.role === 'admin'
              ? 'Vá em "Gerenciar" para importar as trilhas iniciais ou criar a primeira.'
              : 'Peça a um admin para cadastrar as trilhas de treinamento.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {trails.map((trail) => {
            const trailModules = modules.filter((m) => m.trailId === trail.id)
            const completed = trailModules.filter((m) => completedModuleIds.has(m.id)).length
            return (
              <TrailCard
                key={trail.id}
                trail={trail}
                totalModules={trailModules.length}
                completedModules={completed}
                onClick={() => navigate(`/universidade/${trail.id}`)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
