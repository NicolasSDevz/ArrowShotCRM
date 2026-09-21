import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/** "/" só decide pra onde mandar — Bruno (admin) cai em Dashboard (Visão
 *  Geral), o resto da equipe em Operacional. Mantém funcionando um eventual
 *  link antigo de notificação de tarefa (/?task=id), redirecionando pro novo
 *  lugar da aba Operacional. */
export function RootRedirect() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const task = searchParams.get('task')

  if (task) return <Navigate to={`/operacional?task=${task}`} replace />
  return <Navigate to={profile?.role === 'admin' ? '/dashboard' : '/operacional'} replace />
}
