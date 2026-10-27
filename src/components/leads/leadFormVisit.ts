import { useCallback, useEffect, useRef } from 'react'
import { auth } from '../../firebase/config'
import { readTracking, readUtms } from '../store/checkoutUtils'

const ENDPOINT = '/api/meta/form-visit'

/** Etapas da visita (mesma régua do servidor, api/_lib/leadFormVisits.js). */
export const VISIT_STEP = { open: 1, started: 2, contact: 3, sent: 4 } as const

function visitId(formId: string) {
  const key = `fv-${formId}`
  try {
    const saved = sessionStorage.getItem(key)
    if (saved && /^f_[A-Za-z0-9]{10,40}$/.test(saved)) return saved
  } catch {}
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[b % 62]).join('')
  const sid = `f_${Date.now().toString(36)}${rand}`
  try {
    sessionStorage.setItem(key, sid)
  } catch {}
  return sid
}

function post(body: Record<string, unknown>, beacon = false) {
  const json = JSON.stringify(body)
  if (beacon) {
    try {
      if (navigator.sendBeacon(ENDPOINT, new Blob([json], { type: 'application/json' }))) return Promise.resolve(null)
    } catch {}
  }
  return fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json, keepalive: true })
    .then((r) => r.json().catch(() => null))
    .catch(() => null)
}

export type VisitContact = { name?: string; whatsapp?: string; email?: string }

/** Registra a visita ao formulário público: origem, aparelho, até onde chegou,
 *  o contato digitado e o tempo na tela. Uma visita por aba (recarregar não
 *  conta de novo). Desligado no preview do construtor. */
export function useLeadFormVisit(formId: string | undefined, enabled: boolean, totalQuestions: number) {
  const sid = useRef('')
  // Tudo espera a abertura chegar no servidor (ela que cria a visita com a origem).
  const opened = useRef<Promise<unknown>>(Promise.resolve())
  const step = useRef(0)
  const contactKey = useRef('')
  const shownMs = useRef(0)
  const shownAt = useRef<number | null>(null)

  const seconds = () => Math.round((shownMs.current + (shownAt.current ? Date.now() - shownAt.current : 0)) / 1000)

  const send = useCallback(
    (body: Record<string, unknown>, beacon = false) => {
      if (!enabled || !formId || !sid.current) return Promise.resolve(null)
      const payload = { sid: sid.current, formId, seconds: seconds(), ...body }
      if (beacon) return post(payload, true)
      return opened.current.then(() => post(payload))
    },
    [enabled, formId]
  )

  useEffect(() => {
    if (!enabled || !formId) return
    sid.current = visitId(formId)
    step.current = VISIT_STEP.open
    const mobile = window.matchMedia?.('(max-width: 1023px)').matches || /Mobi|Android|iPhone/i.test(navigator.userAgent)
    shownAt.current = document.visibilityState === 'visible' ? Date.now() : null
    opened.current = post({
      sid: sid.current,
      formId,
      step: VISIT_STEP.open,
      device: mobile ? 'mobile' : 'desktop',
      utm: readUtms(),
      tracking: readTracking(),
      referrer: document.referrer || null,
      totalQuestions,
      // Alguém da equipe logado no CRM testando o link: aparece marcado como teste.
      team: !!auth.currentUser,
    })

    const flush = () => {
      if (shownAt.current) shownMs.current += Date.now() - shownAt.current
      shownAt.current = null
      send({}, true)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') shownAt.current = Date.now()
      else flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, formId])

  /** Clicou em começar. */
  const started = useCallback(() => {
    if (step.current >= VISIT_STEP.started) return
    step.current = VISIT_STEP.started
    send({ step: VISIT_STEP.started })
  }, [send])

  /** Chegou numa pergunta (manda o que já respondeu até aqui). */
  const question = useCallback(
    (index: number, q: { id: string; label: string }, contact: VisitContact, answers: { label: string; value: string }[]) => {
      step.current = Math.max(step.current, VISIT_STEP.started)
      const clean = Object.fromEntries(Object.entries(contact).filter(([, v]) => v)) as VisitContact
      const key = JSON.stringify(clean)
      const body: Record<string, unknown> = { step: step.current, question: { index, id: q.id, label: q.label }, answers }
      if (key !== contactKey.current && key !== '{}') {
        contactKey.current = key
        body.contact = clean
      }
      send(body)
    },
    [send]
  )

  /** Enviou: o servidor marca a etapa 4 e manda o Lead pra API de Conversões. */
  const submitted = useCallback(
    (contact: VisitContact, answers: { label: string; value: string }[]) => {
      step.current = VISIT_STEP.sent
      const clean = Object.fromEntries(Object.entries(contact).filter(([, v]) => v))
      return send({ submitted: true, step: VISIT_STEP.sent, contact: clean, answers, leadOrigin: true })
    },
    [send]
  )

  return { sid, started, question, submitted }
}
