import { useAuth } from '../context/AuthContext'
import { resolveRoutinePersonKey } from '../services/dailyRoutineTemplates'

/** true quando quem está logado é o Jamilson (CS), que usa leitor de tela —
 *  algumas telas mantêm pra ele o layout em lista, mais simples de navegar. */
export function useIsJamilson(): boolean {
  const { profile } = useAuth()
  return !!profile && resolveRoutinePersonKey(profile.name) === 'jamilson'
}
