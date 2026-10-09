import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { ErrorDialogHost } from './components/ui/ErrorDialogHost'
import { ConfirmDialogHost } from './components/ui/ConfirmDialogHost'
import { SessionIssueHost } from './components/auth/SessionIssueHost'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import { PrivacyProvider } from './context/PrivacyContext'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { OperationalDashboard } from './pages/OperationalDashboard'
import { RootRedirect } from './pages/RootRedirect'
import { ClientsPage } from './pages/ClientsPage'
import { ClientDetailPage } from './pages/ClientDetailPage'
import { SocialMediaPage } from './pages/SocialMediaPage'
import { SocialMediaClientPage } from './pages/SocialMediaClientPage'
import { CalendarMeetingsPage } from './pages/CalendarMeetingsPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { LeadsPage } from './pages/LeadsPage'
import { MetricsPage } from './pages/MetricsPage'
import { ReportsPage } from './pages/ReportsPage'
import { MonthlyReportPage } from './pages/MonthlyReportPage'
import { TeamPage } from './pages/TeamPage'
import { PublicApprovalPage } from './pages/PublicApprovalPage'
import { PublicReportPage } from './pages/PublicReportPage'
import { PublicAccessPage } from './pages/PublicAccessPage'
import { LeadCapturePage } from './pages/LeadCapturePage'
import { PrivacyPolicyPage, TermsOfServicePage } from './pages/LegalPages'
import { MetaTokensPage } from './pages/MetaTokensPage'
import { UniversityPage } from './pages/UniversityPage'
import { UniversityTrailPage } from './pages/UniversityTrailPage'
import { UniversityModulePage } from './pages/UniversityModulePage'
import { UniversityProgressPage } from './pages/UniversityProgressPage'
import { UniversityAdminPage } from './pages/UniversityAdminPage'
import { OptimizationCalendarPage } from './pages/OptimizationCalendarPage'
import { StorePage } from './pages/store/StorePage'
import { StoreProductPage } from './pages/store/StoreProductPage'
import { CheckoutPage } from './pages/store/CheckoutPage'
import { CheckoutThanksPage } from './pages/store/CheckoutThanksPage'
import { MembersLayout } from './components/store/members/MembersLayout'
import { MembersEnterPage, MembersLoginPage, MembersProfilePage } from './pages/store/members/MembersAuthPages'
import { MembersHomePage } from './pages/store/members/MembersHomePage'
import { MembersCoursePage } from './pages/store/members/MembersCoursePage'
import { MembersLessonPage } from './pages/store/members/MembersLessonPage'

function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
    <PrivacyProvider>
      <BrowserRouter>
        <Toaster position="bottom-center" toastOptions={{ className: 'app-toast', style: { fontSize: '13px' } }} />
        <ErrorDialogHost />
        <ConfirmDialogHost />
        <SessionIssueHost />
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
          <Route path="/membros" element={<MembersLayout />}>
            <Route index element={<MembersHomePage />} />
            <Route path="login" element={<MembersLoginPage />} />
            <Route path="entrar" element={<MembersEnterPage />} />
            <Route path="perfil" element={<MembersProfilePage />} />
            <Route path="curso/:productId" element={<MembersCoursePage />} />
            <Route path="curso/:productId/aula/:lessonId" element={<MembersLessonPage />} />
          </Route>
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
            <Route path="/social-media" element={<SocialMediaPage />} />
            <Route path="/social-media/:clientId" element={<SocialMediaClientPage />} />
            <Route path="/calendario" element={<CalendarMeetingsPage initialTab="calendario" />} />
            <Route path="/reunioes" element={<CalendarMeetingsPage initialTab="reunioes" />} />
            <Route path="/leads" element={<LeadsPage />} />
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
      </BrowserRouter>
    </PrivacyProvider>
    </AuthProvider>
    </ThemeProvider>
  )
}

export default App
