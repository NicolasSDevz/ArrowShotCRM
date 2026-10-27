import { OverviewDashboard } from '../components/dashboard/OverviewDashboard'
import { DashboardHero } from '../components/dashboard/DashboardHero'
import { ProductsCatalogSection } from '../components/dashboard/ProductsCatalogSection'
import { StoreSalesSection } from '../components/dashboard/StoreSalesSection'
import { useAuth } from '../context/AuthContext'
import { useDashboardArea } from '../hooks/useDashboardArea'
import { canSeeOverviewSection } from '../utils/dashboardAreas'

export function DashboardPage() {
  const area = useDashboardArea()
  const { profile } = useAuth()
  const canSeeStore = profile?.role === 'admin' || profile?.role === 'manager'

  return (
    <div className="flex flex-col gap-4">
      <DashboardHero />

      <OverviewDashboard />
      {canSeeStore && <StoreSalesSection />}
      {canSeeOverviewSection(area, 'produtos') && <ProductsCatalogSection />}
    </div>
  )
}
