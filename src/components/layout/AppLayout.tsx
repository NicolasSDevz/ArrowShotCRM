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
import { useMonthlyConsultingSync } from '../../hooks/useMonthlyConsultingSync'
import { useOnboardingAutoActivate } from '../../hooks/useOnboardingAutoActivate'

export function AppLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()
  useTaskDueDateSweep()
  useMonthlyConsultingSync()
  useOnboardingAutoActivate()

  // print:*: "Baixar PDF" do relatório imprime só o conteúdo da página (sem menu, topo nem Archer).
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-page print:block print:h-auto print:w-auto print:overflow-visible">
      <div className="contents print:hidden">
        <Sidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col print:block">
        <div className="contents print:hidden">
          <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
          <PrivacyModeBanner />
        </div>
        {/* pb-28: o fim da página rola pra cima do botão do Archer (fixo no canto) em vez de ficar escondido embaixo dele. */}
        {/* relative: textos sr-only (absolute) da página ficam presos aqui dentro;
            sem isso eles se posicionavam pela janela e criavam barras de rolagem
            com espaço vazio na ficha do cliente. */}
        <main className="relative flex-1 overflow-y-auto p-8 pb-28 print:static print:overflow-visible print:p-0">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <div className="contents print:hidden">
        <CelebrationOverlay />
        <TaskCelebrationOverlay />
        <AiAssistantWidget />
      </div>
    </div>
  )
}
