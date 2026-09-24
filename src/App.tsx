import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { ErrorDialogHost } from './components/ui/ErrorDialogHost'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
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
import { LeadCapturePage } from './pages/LeadCapturePage'
import { PrivacyPolicyPage, TermsOfServicePage } from './pages/LegalPages'
import { MetaTokensPage } from './pages/MetaTokensPage'
import { UniversityPage } from './pages/UniversityPage'
import { UniversityTrailPage } from './pages/UniversityTrailPage'
import { UniversityModulePage } from './pages/UniversityModulePage'
import { UniversityProgressPage } from './pages/UniversityProgressPage'
import { UniversityAdminPage } from './pages/UniversityAdminPage'
import { OptimizationCalendarPage } from './pages/OptimizationCalendarPage'

function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ className: 'app-toast', style: { fontSize: '13px' } }} />
        <ErrorDialogHost />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/aprovar/:contentId/:token" element={<PublicApprovalPage />} />
          <Route path="/captura/:formId" element={<LeadCapturePage />} />
          <Route path="/privacidade" element={<PrivacyPolicyPage />} />
          <Route path="/termos" element={<TermsOfServicePage />} />
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
                <ProtectedRoute allowedRoles={['admin']}>
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
    </AuthProvider>
    </ThemeProvider>
  )
}

export default App
