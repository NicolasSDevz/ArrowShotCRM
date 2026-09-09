import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useAuth } from '../context/AuthContext'
import { OperationalDashboard } from './OperationalDashboard'
import { OverviewDashboard } from '../components/dashboard/OverviewDashboard'

type DashboardView = 'overview' | 'operational'

const VIEW_LABEL: Record<DashboardView, string> = {
  overview: 'Visão Geral',
  operational: 'Operacional',
}

export function DashboardPage() {
  const { profile } = useAuth()
  // Bruno (admin) abre em "Visão Geral"; o resto da equipe em "Operacional".
  const [view, setView] = useState<DashboardView>(profile?.role === 'admin' ? 'overview' : 'operational')

  const todayLabel = useMemo(() => {
    const s = format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight text-slate-900">Dashboard</h1>
          <p className="text-[15px] text-[#64748B]">
            {view === 'overview'
              ? 'Métricas da empresa — receita, carteira e crescimento.'
              : 'Visão geral do que precisa da sua atenção hoje.'}
          </p>
        </div>
        <p className="text-[14px] text-slate-400">{todayLabel}</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {(['overview', 'operational'] as DashboardView[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors duration-150 ease-in-out ${
              view === v
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {VIEW_LABEL[v]}
          </button>
        ))}
      </div>

      {view === 'overview' ? <OverviewDashboard /> : <OperationalDashboard />}
    </div>
  )
}
