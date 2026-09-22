import { useMemo } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { OverviewDashboard } from '../components/dashboard/OverviewDashboard'
import { ProductsCatalogSection } from '../components/dashboard/ProductsCatalogSection'

export function DashboardPage() {
  const todayLabel = useMemo(() => {
    const s = format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight text-slate-900">Dashboard</h1>
          <p className="text-[15px] text-[#64748B]">Métricas da empresa — receita, carteira e crescimento.</p>
        </div>
        <p className="text-[14px] text-slate-400">{todayLabel}</p>
      </div>

      <OverviewDashboard />
      <ProductsCatalogSection />
    </div>
  )
}
