import { useEffect, useState } from 'react'
import type { AppUser } from '../types/user'
import type { DashboardWidgetConfig } from '../types/dashboardLayout'
import { subscribeUserDashboard } from '../services/userDashboardService'
import { getDefaultLayout } from '../utils/dashboardDefaults'

/** Layout salvo do usuário pro dashboard `dashboardKey` — cai pro padrão do
 *  cargo/pessoa (ver dashboardDefaults.ts) enquanto não existir doc salvo. */
export function useUserDashboardLayout(profile: AppUser | null, dashboardKey: string) {
  const [widgets, setWidgets] = useState<DashboardWidgetConfig[]>(() => getDefaultLayout(profile))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    setLoading(true)
    const unsubscribe = subscribeUserDashboard(profile.id, dashboardKey, (layout) => {
      setWidgets(layout?.widgets?.length ? layout.widgets : getDefaultLayout(profile))
      setLoading(false)
    })
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, dashboardKey])

  return { widgets, loading }
}
