import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { ClientsPage } from './pages/ClientsPage'
import { ClientDetailPage } from './pages/ClientDetailPage'
import { TasksPage } from './pages/TasksPage'
import { SocialMediaPage } from './pages/SocialMediaPage'
import { CalendarPage } from './pages/CalendarPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { MeetingsPage } from './pages/MeetingsPage'
import { LeadsPage } from './pages/LeadsPage'
import { ReportsPage } from './pages/ReportsPage'
import { MonthlyReportPage } from './pages/MonthlyReportPage'
import { TeamPage } from './pages/TeamPage'
import { PublicApprovalPage } from './pages/PublicApprovalPage'
import { UniversityPage } from './pages/UniversityPage'
import { UniversityTrailPage } from './pages/UniversityTrailPage'
import { UniversityModulePage } from './pages/UniversityModulePage'
import { UniversityProgressPage } from './pages/UniversityProgressPage'
import { UniversityAdminPage } from './pages/UniversityAdminPage'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ style: { fontSize: '13px' } }} />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/aprovar/:contentId/:token" element={<PublicApprovalPage />} />
          <Route
            element={
              <ProtectedRoute allowedRoles={['admin', 'manager', 'employee']} showDeniedScreen>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/clientes" element={<ClientsPage />} />
            <Route path="/clientes/:id" element={<ClientDetailPage />} />
            <Route path="/tarefas" element={<TasksPage />} />
            <Route path="/social-media" element={<SocialMediaPage />} />
            <Route path="/calendario" element={<CalendarPage />} />
            <Route path="/reunioes" element={<MeetingsPage />} />
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/relatorios" element={<ReportsPage />} />
            <Route path="/relatorios/:id" element={<MonthlyReportPage />} />
            <Route path="/notificacoes" element={<NotificationsPage />} />
            <Route
              path="/equipe"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <TeamPage />
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
  )
}

export default App
