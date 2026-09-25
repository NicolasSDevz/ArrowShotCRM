import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { PrivacyModeBanner } from './PrivacyModeBanner'
import { ErrorBoundary } from '../ErrorBoundary'
import { CelebrationOverlay } from '../CelebrationOverlay'
import { TaskCelebrationOverlay } from '../TaskCelebrationOverlay'
import { AiAssistantWidget } from '../ai/AiAssistantWidget'
import { useTaskDueDateSweep } from '../../hooks/useTaskDueDateSweep'

export function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()
  useTaskDueDateSweep()

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-page">
      <Sidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <PrivacyModeBanner />
        {/* pb-28: o fim da página rola pra cima do botão do Archer (fixo no canto) em vez de ficar escondido embaixo dele. */}
        <main className="flex-1 overflow-y-auto p-8 pb-28">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <CelebrationOverlay />
      <TaskCelebrationOverlay />
      <AiAssistantWidget />
    </div>
  )
}
