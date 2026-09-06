import { useEffect, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../../context/AuthContext'
import type { UserRole } from '../../types'
import { FullPageSpinner } from '../ui/FullPageSpinner'

export function ProtectedRoute({
  children,
  allowedRoles,
  showDeniedScreen,
}: {
  children: ReactNode
  allowedRoles?: UserRole[]
  /** When the role isn't allowed, render a "sem acesso" screen instead of
   *  redirecting to "/". Use on the top-level guard, where redirecting to "/"
   *  would just loop. */
  showDeniedScreen?: boolean
}) {
  const { firebaseUser, profile, loading, signOut } = useAuth()

  const isDeactivated = !!profile && !profile.active

  useEffect(() => {
    if (isDeactivated) {
      toast.error('Sua conta foi desativada. Fale com um admin do CRM.')
      signOut()
    }
  }, [isDeactivated, signOut])

  if (loading) return <FullPageSpinner />
  if (!firebaseUser) return <Navigate to="/login" replace />
  if (!profile || isDeactivated) return <FullPageSpinner label="Preparando seu acesso..." />
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    if (!showDeniedScreen) return <Navigate to="/" replace />
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-lg font-semibold text-slate-800">Acesso restrito</p>
        <p className="max-w-sm text-sm text-slate-500">
          Sua conta não tem acesso ao CRM da Arrow Shot. Fale com um administrador se acha que isso é um engano.
        </p>
        <button
          onClick={() => signOut()}
          className="mt-1 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Sair
        </button>
      </div>
    )
  }

  return <>{children}</>
}
