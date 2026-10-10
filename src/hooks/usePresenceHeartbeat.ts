import { useEffect } from 'react'
import { touchPresence } from '../services/userService'
import { PRESENCE_CHECK_MS, PRESENCE_HEARTBEAT_MS, PRESENCE_HIDDEN_GRACE_MS, PRESENCE_IDLE_MS } from '../utils/presence'

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'] as const

/** Presença estilo WhatsApp. A aba conta como "ativa" quando está visível E a
 *  pessoa mexeu no mouse/teclado nos últimos 5 min.
 *
 *  Cada gravação no perfil vira uma leitura para CADA pessoa com o CRM aberto
 *  (todo mundo escuta a coleção `users`), então só grava quando o estado muda
 *  (online ↔ ausente) e, parada em "online", um "ainda estou aqui" a cada
 *  4 min — e uma vez só entre as abas do mesmo navegador. Esconder a aba só
 *  vira "ausente" depois de 1 min (trocar de aba rapidinho não grava nada);
 *  fechar a aba avisa na hora. Com várias abas abertas, quando uma sai as
 *  outras que ainda estão ativas reafirmam "online" logo em seguida, via
 *  BroadcastChannel, pra ninguém sumir por engano. */
export function usePresenceHeartbeat(uid: string | null | undefined) {
  useEffect(() => {
    if (!uid) return
    let lastActivity = Date.now()
    let announced: 'online' | 'away' | null = null
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`crm-presence-${uid}`) : null
    const sharedKey = `crm-presence-online-at-${uid}`

    const readShared = () => {
      try {
        return Number(localStorage.getItem(sharedKey)) || 0
      } catch {
        return 0
      }
    }
    const writeShared = (at: number) => {
      try {
        localStorage.setItem(sharedKey, String(at))
      } catch {
        /* sem localStorage: cada aba grava a sua */
      }
    }

    const isActive = () => document.visibilityState === 'visible' && Date.now() - lastActivity < PRESENCE_IDLE_MS

    const goOnline = (force = false) => {
      // Já está online e esta ou outra aba deste navegador avisou há pouco: não grava de novo.
      if (!force && announced === 'online' && Date.now() - readShared() < PRESENCE_HEARTBEAT_MS) return
      announced = 'online'
      writeShared(Date.now())
      void touchPresence(uid, 'online')
    }
    const goAway = () => {
      if (announced === 'away') return
      announced = 'away'
      writeShared(0)
      void touchPresence(uid, 'away')
      channel?.postMessage('left')
    }
    const cancelHidden = () => {
      if (hiddenTimer) clearTimeout(hiddenTimer)
      hiddenTimer = null
    }
    // Checagem local frequente; só grava se o estado mudou ou o último aviso venceu.
    const tick = () => {
      if (isActive()) goOnline()
      else if (document.visibilityState === 'visible') goAway() // aberta, mas ociosa
    }

    const onActivity = () => {
      lastActivity = Date.now()
      cancelHidden()
      // Voltou (da aba escondida ou de ociosidade): avisa online na hora.
      if (announced !== 'online' && document.visibilityState === 'visible') goOnline(true)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') return onActivity()
      cancelHidden()
      hiddenTimer = setTimeout(goAway, PRESENCE_HIDDEN_GRACE_MS)
    }
    // Outra aba do mesmo usuário saiu: se esta ainda está ativa, reafirma online
    // depois que o "ausente" dela já foi gravado.
    const onMessage = () => {
      if (isActive()) setTimeout(() => goOnline(true), 800)
    }
    const onPageHide = () => {
      cancelHidden()
      goAway()
    }

    if (isActive()) goOnline()
    const timer = setInterval(tick, PRESENCE_CHECK_MS)
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onActivity)
    window.addEventListener('pagehide', onPageHide)
    channel?.addEventListener('message', onMessage)
    return () => {
      clearInterval(timer)
      cancelHidden()
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onActivity)
      window.removeEventListener('pagehide', onPageHide)
      channel?.close()
    }
  }, [uid])
}
