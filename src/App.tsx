import { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazyPage } from './utils/lazyPage'
import { Spinner } from './components/ui/FullPageSpinner'
import { Toaster } from 'react-hot-toast'
import { ErrorDialogHost } from './components/ui/ErrorDialogHost'
import { ConfirmDialogHost } from './components/ui/ConfirmDialogHost'
import { SessionIssueHost } from './components/auth/SessionIssueHost'
import { ThemeApplier, ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import { PrivacyProvider } from './context/PrivacyContext'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { RootRedirect } from './pages/RootRedirect'
import { COPILOTO_ALLOWED_EMAILS } from './config/copilotoAccess'

// Cada tela vira um arquivo separado, baixado só quando abre.
const AppLayout = lazyPage(() => import('./components/layout/AppLayout'), 'AppLayout')
const DashboardPage = lazyPage(() => import('./pages/DashboardPage'), 'DashboardPage')
const OperationalDashboard = lazyPage(() => import('./pages/OperationalDashboard'), 'OperationalDashboard')
const ClientsPage = lazyPage(() => import('./pages/ClientsPage'), 'ClientsPage')
const ClientDetailPage = lazyPage(() => import('./pages/ClientDetailPage'), 'ClientDetailPage')
const CalendarMeetingsPage = lazyPage(() => import('./pages/CalendarMeetingsPage'), 'CalendarMeetingsPage')
const NotificationsPage = lazyPage(() => import('./pages/NotificationsPage'), 'NotificationsPage')
const LeadsPage = lazyPage(() => import('./pages/LeadsPage'), 'LeadsPage')
const MetricsPage = lazyPage(() => import('./pages/MetricsPage'), 'MetricsPage')
const ReportsPage = lazyPage(() => import('./pages/ReportsPage'), 'ReportsPage')
const MonthlyReportPage = lazyPage(() => import('./pages/MonthlyReportPage'), 'MonthlyReportPage')
const TeamPage = lazyPage(() => import('./pages/TeamPage'), 'TeamPage')
const PublicApprovalPage = lazyPage(() => import('./pages/PublicApprovalPage'), 'PublicApprovalPage')
const PublicReportPage = lazyPage(() => import('./pages/PublicReportPage'), 'PublicReportPage')
const PublicAccessPage = lazyPage(() => import('./pages/PublicAccessPage'), 'PublicAccessPage')
const LeadCapturePage = lazyPage(() => import('./pages/LeadCapturePage'), 'LeadCapturePage')
const PrivacyPolicyPage = lazyPage(() => import('./pages/LegalPages'), 'PrivacyPolicyPage')
const TermsOfServicePage = lazyPage(() => import('./pages/LegalPages'), 'TermsOfServicePage')
const MetaTokensPage = lazyPage(() => import('./pages/MetaTokensPage'), 'MetaTokensPage')
const UniversityPage = lazyPage(() => import('./pages/UniversityPage'), 'UniversityPage')
const UniversityTrailPage = lazyPage(() => import('./pages/UniversityTrailPage'), 'UniversityTrailPage')
const UniversityModulePage = lazyPage(() => import('./pages/UniversityModulePage'), 'UniversityModulePage')
const UniversityProgressPage = lazyPage(() => import('./pages/UniversityProgressPage'), 'UniversityProgressPage')
const UniversityAdminPage = lazyPage(() => import('./pages/UniversityAdminPage'), 'UniversityAdminPage')
const OptimizationCalendarPage = lazyPage(() => import('./pages/OptimizationCalendarPage'), 'OptimizationCalendarPage')
const CopilotoPage = lazyPage(() => import('./pages/CopilotoPage'), 'CopilotoPage')
const BaseVendasPage = lazyPage(() => import('./pages/BaseVendasPage'), 'BaseVendasPage')
const StorePage = lazyPage(() => import('./pages/store/StorePage'), 'StorePage')
const StoreProductPage = lazyPage(() => import('./pages/store/StoreProductPage'), 'StoreProductPage')
const StoreAppPage = lazyPage(() => import('./pages/store/StoreAppPage'), 'StoreAppPage')
const CheckoutPage = lazyPage(() => import('./pages/store/CheckoutPage'), 'CheckoutPage')
const CheckoutThanksPage = lazyPage(() => import('./pages/store/CheckoutThanksPage'), 'CheckoutThanksPage')
const MembersLayout = lazyPage(() => import('./components/store/members/MembersLayout'), 'MembersLayout')
const MembersEnterPage = lazyPage(() => import('./pages/store/members/MembersAuthPages'), 'MembersEnterPage')
const MembersLoginPage = lazyPage(() => import('./pages/store/members/MembersAuthPages'), 'MembersLoginPage')
const MembersProfilePage = lazyPage(() => import('./pages/store/members/MembersAuthPages'), 'MembersProfilePage')
const MembersHomePage = lazyPage(() => import('./pages/store/members/MembersHomePage'), 'MembersHomePage')
const MembersCoursePage = lazyPage(() => import('./pages/store/members/MembersCoursePage'), 'MembersCoursePage')
const MembersLessonPage = lazyPage(() => import('./pages/store/members/MembersLessonPage'), 'MembersLessonPage')

/** Domínio curto do checkout (pay., checkout., compra. ou loja.): o link fica
 *  pay.seudominio.com.br/nome-do-produto, sem o /pay. Mesmo app, mesma API. */
/** Telas do aluno, iguais em todas as áreas de membros. Função (e não componente)
 *  porque o <Routes> só aceita <Route> direto. */
function membersRoutes() {
  return [
    <Route key="home" index element={<MembersHomePage />} />,
    <Route key="login" path="login" element={<MembersLoginPage />} />,
    <Route key="entrar" path="entrar" element={<MembersEnterPage />} />,
    <Route key="perfil" path="perfil" element={<MembersProfilePage />} />,
    <Route key="curso" path="curso/:productId" element={<MembersCoursePage />} />,
    <Route key="aula" path="curso/:productId/aula/:lessonId" element={<MembersLessonPage />} />,
  ]
}

/** Enquanto o arquivo da tela baixa (fundo transparente: serve no CRM escuro e no checkout claro). */
function ScreenLoading() {
  return (
    <div className="flex h-screen w-full items-center justify-center" role="status" aria-label="Carregando">
      <Spinner className="h-7 w-7" />
    </div>
  )
}

const CHECKOUT_HOST = typeof window !== 'undefined' && /^(pay|checkout|compra|loja)\./i.test(window.location.hostname)

function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
    <PrivacyProvider>
      <BrowserRouter>
        <ThemeApplier />
        <Toaster position="bottom-center" toastOptions={{ className: 'app-toast', style: { fontSize: '13px' } }} />
        <ErrorDialogHost />
        <ConfirmDialogHost />
        <SessionIssueHost />
        <Suspense fallback={<ScreenLoading />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/aprovar/:contentId/:token" element={<PublicApprovalPage />} />
          <Route path="/captura/:formId" element={<LeadCapturePage />} />
          <Route path="/relatorio/:token" element={<PublicReportPage />} />
          <Route path="/acessos/:token" element={<PublicAccessPage />} />
          <Route path="/privacidade" element={<PrivacyPolicyPage />} />
          <Route path="/termos" element={<TermsOfServicePage />} />
          {/* Loja: checkout e área de membros são públicos (o aluno tem login próprio) */}
          <Route path="/pay/:slug" element={<CheckoutPage />} />
          <Route path="/pay/:slug/obrigado" element={<CheckoutThanksPage />} />
          {CHECKOUT_HOST && <Route path="/:slug" element={<CheckoutPage />} />}
          {CHECKOUT_HOST && <Route path="/:slug/obrigado" element={<CheckoutThanksPage />} />}
          {/* Área de membros principal em /membros; as extras (ex.: outro negócio) em /m/{slug} */}
          <Route path="/membros" element={<MembersLayout />}>{membersRoutes()}</Route>
          <Route path="/m/:area" element={<MembersLayout />}>{membersRoutes()}</Route>
          {/* App do celular: só a Loja, sem o menu do CRM */}
          <Route
            path="/app"
            element={
              <ProtectedRoute allowedRoles={['admin', 'manager']} showDeniedScreen>
                <StoreAppPage />
              </ProtectedRoute>
            }
          />
          <Route
            element={
              <ProtectedRoute allowedRoles={['admin', 'manager', 'employee']} showDeniedScreen>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<RootRedirect />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/operacional" element={<OperationalDashboard />} />
            <Route path="/clientes" element={<ClientsPage />} />
            <Route path="/clientes/:id" element={<ClientDetailPage />} />
            {/* Social Mídia saiu do menu (não era usado): links antigos caem em Clientes */}
            <Route path="/social-media/*" element={<Navigate to="/clientes" replace />} />
            <Route path="/calendario" element={<CalendarMeetingsPage initialTab="calendario" />} />
            <Route path="/reunioes" element={<CalendarMeetingsPage initialTab="reunioes" />} />
            <Route path="/leads" element={<LeadsPage />} />
              <Route path="/copiloto/:leadId" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><CopilotoPage /></ProtectedRoute>} />
            <Route path="/metricas" element={<MetricsPage />} />
            <Route path="/relatorios" element={<ReportsPage />} />
            <Route path="/relatorios/:id" element={<MonthlyReportPage />} />
            <Route path="/notificacoes" element={<NotificationsPage />} />
            <Route
              path="/otimizacoes/calendario"
              element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
                  <OptimizationCalendarPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/equipe"
              element={
                <ProtectedRoute allowedRoles={['admin', 'manager', 'employee']}>
                  <TeamPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/configuracoes/tokens"
              element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
                  <MetaTokensPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/configuracoes/base-vendas"
              element={
                <ProtectedRoute allowedEmails={COPILOTO_ALLOWED_EMAILS}>
                  <BaseVendasPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/loja"
              element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
                  <StorePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/loja/produtos/:id"
              element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
                  <StoreProductPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/universidade"
              element={
                <ProtectedRoute allowedRoles={['admin', 'manager', 'employee']}>
                  <UniversityPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/universidade/progresso"
              element={
                <ProtectedRoute allowedRoles={['admin', 'manager', 'employee']}>
                  <UniversityProgressPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/universidade/admin"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <UniversityAdminPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/universidade/:trailId"
              element={
                <ProtectedRoute allowedRoles={['admin', 'manager', 'employee']}>
                  <UniversityTrailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/universidade/:trailId/:moduleId"
              element={
                <ProtectedRoute allowedRoles={['admin', 'manager', 'employee']}>
                  <UniversityModulePage />
                </ProtectedRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </PrivacyProvider>
    </AuthProvider>
    </ThemeProvider>
  )
}

export default App
