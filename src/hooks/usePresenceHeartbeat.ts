import { useEffect } from 'react'
import { touchPresence } from '../services/userService'
import { PRESENCE_HEARTBEAT_MS } from '../utils/presence'

/** Avisa a cada minuto (enquanto a aba está visível) que o usuário está com o
 *  CRM aberto — grava `lastSeenAt` no próprio perfil. Aba escondida/minimizada
 *  para de avisar, então a pessoa some da lista de online depois de ~2 min.
 *  Voltar pra aba avisa na hora. `uid` nulo = ninguém logado, não faz nada. */
export function usePresenceHeartbeat(uid: string | null | undefined) {
  useEffect(() => {
    if (!uid) return
    const ping = () => {
      if (document.visibilityState === 'visible') void touchPresence(uid)
    }
    ping()
    const timer = setInterval(ping, PRESENCE_HEARTBEAT_MS)
    document.addEventListener('visibilitychange', ping)
    window.addEventListener('focus', ping)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', ping)
      window.removeEventListener('focus', ping)
    }
  }, [uid])
}
