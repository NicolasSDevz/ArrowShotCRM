import { useEffect } from 'react'
import { touchPresence } from '../services/userService'
import { PRESENCE_HEARTBEAT_MS, PRESENCE_IDLE_MS } from '../utils/presence'

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'] as const

/** Presença estilo WhatsApp. A aba conta como "ativa" quando está visível E a
 *  pessoa mexeu no mouse/teclado nos últimos 5 min. Aba ativa avisa "online"
 *  a cada 30s; ao ficar escondida, ociosa ou ser fechada, avisa "ausente" na
 *  hora (em vez de esperar o aviso vencer). Com várias abas abertas, quando
 *  uma sai as outras que ainda estão ativas reafirmam "online" logo em
 *  seguida, via BroadcastChannel, pra ninguém sumir por engano. */
export function usePresenceHeartbeat(uid: string | null | undefined) {
  useEffect(() => {
    if (!uid) return
    let lastActivity = Date.now()
    let announced: 'online' | 'away' | null = null
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`crm-presence-${uid}`) : null

    const isActive = () => document.visibilityState === 'visible' && Date.now() - lastActivity < PRESENCE_IDLE_MS

    const goOnline = () => {
      announced = 'online'
      void touchPresence(uid, 'online')
    }
    const goAway = () => {
      if (announced === 'away') return
      announced = 'away'
      void touchPresence(uid, 'away')
      channel?.postMessage('left')
    }
    const tick = () => (isActive() ? goOnline() : goAway())

    const onActivity = () => {
      lastActivity = Date.now()
      // Voltou (da aba escondida ou de ociosidade): avisa online na hora.
      if (announced !== 'online' && document.visibilityState === 'visible') goOnline()
    }
    const onVisibility = () => (document.visibilityState === 'visible' ? onActivity() : goAway())
    // Outra aba do mesmo usuário saiu: se esta ainda está ativa, reafirma online
    // depois que o "ausente" dela já foi gravado.
    const onMessage = () => {
      if (isActive()) setTimeout(goOnline, 800)
    }

    tick()
    const timer = setInterval(tick, PRESENCE_HEARTBEAT_MS)
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onActivity)
    window.addEventListener('pagehide', goAway)
    channel?.addEventListener('message', onMessage)
    return () => {
      clearInterval(timer)
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onActivity)
      window.removeEventListener('pagehide', goAway)
      channel?.close()
    }
  }, [uid])
}
