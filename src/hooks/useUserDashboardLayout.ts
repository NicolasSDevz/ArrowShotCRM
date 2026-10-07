import { useEffect, useState } from 'react'
import type { AppUser } from '../types/user'
import type { DashboardWidgetConfig } from '../types/dashboardLayout'
import type { DashboardArea } from '../types/teamMember'
import { subscribeUserDashboard } from '../services/userDashboardService'
import { getDefaultLayout, withLateAddedWidgets } from '../utils/dashboardDefaults'

/** Layout salvo do usuário pro dashboard `dashboardKey` — cai pro padrão do
 *  cargo/pessoa (ver dashboardDefaults.ts) enquanto não existir doc salvo. */
export function useUserDashboardLayout(profile: AppUser | null, dashboardKey: string, area?: DashboardArea) {
  const [widgets, setWidgets] = useState<DashboardWidgetConfig[]>(() => getDefaultLayout(profile, area))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    setLoading(true)
    const unsubscribe = subscribeUserDashboard(profile.id, dashboardKey, (layout) => {
      setWidgets(layout?.widgets?.length ? withLateAddedWidgets(layout.widgets, profile, area) : getDefaultLayout(profile, area))
      setLoading(false)
    })
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, dashboardKey, area])

  return { widgets, loading }
}
