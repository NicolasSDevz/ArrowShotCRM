import { collection, addDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import type { LeadFormEvent, LeadFormEventType } from '../types/leadForm'

const COLLECTION = 'leadFormEvents'

/** Registra um evento de analytics da página pública (ver LeadFormEvent).
 *  Fire-and-forget de propósito — nunca deve travar nem quebrar a
 *  experiência de quem está respondendo o formulário por causa de uma
 *  falha de rede ou de regra. */
export function trackLeadFormEvent(
  formId: string,
  sessionId: string,
  type: LeadFormEventType,
  extra?: { questionId?: string; stepIndex?: number; durationMs?: number }
) {
  addDoc(collection(db, COLLECTION), {
    formId,
    sessionId,
    type,
    ...extra,
    createdAt: serverTimestamp(),
  }).catch((err) => console.warn('trackLeadFormEvent falhou (não afeta o envio do formulário)', err))
}

export interface LeadFormFunnelStep {
  questionId: string
  label: string
  views: number
  /** Diferença em relação ao passo anterior (ou às visualizações da tela de
   *  boas-vindas, no primeiro passo) — quantas sessões pararam por ali. */
  dropOff: number
  dropOffPct: number
}

export interface LeadFormAnalytics {
  views: number
  starts: number
  submissions: number
  completionRate: number
  avgDurationMs: number | null
  funnel: LeadFormFunnelStep[]
}

/** Busca (one-shot, não é live) todos os eventos de um formulário e agrega
 *  em métricas prontas pra tela — visualizações, inícios, respostas, taxa de
 *  conclusão, tempo médio e o funil de desistência por pergunta, na ordem
 *  em que as perguntas aparecem no formulário. Admin-only (ver
 *  firestore.rules). */
export async function getLeadFormAnalytics(
  formId: string,
  questions: { id: string; label: string }[]
): Promise<LeadFormAnalytics> {
  const snap = await getDocs(query(collection(db, COLLECTION), where('formId', '==', formId)))
  const events = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as LeadFormEvent)

  const views = events.filter((e) => e.type === 'view').length
  const starts = events.filter((e) => e.type === 'start').length
  const submitEvents = events.filter((e) => e.type === 'submit')
  const submissions = submitEvents.length
  const completionRate = starts > 0 ? submissions / starts : 0

  const durations = submitEvents.map((e) => e.durationMs).filter((d): d is number => typeof d === 'number' && d > 0)
  const avgDurationMs = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null

  // Sessões distintas que chegaram a ver cada pergunta — usa Set porque uma
  // mesma sessão pode "ver" a mesma pergunta mais de uma vez (voltou e
  // avançou de novo), o que não pode contar em dobro no funil.
  const sessionsByQuestion = new Map<string, Set<string>>()
  for (const e of events) {
    if (e.type !== 'question_view' || !e.questionId) continue
    if (!sessionsByQuestion.has(e.questionId)) sessionsByQuestion.set(e.questionId, new Set())
    sessionsByQuestion.get(e.questionId)!.add(e.sessionId)
  }

  const funnel: LeadFormFunnelStep[] = []
  let previousViews = starts
  for (const q of questions) {
    const stepViews = sessionsByQuestion.get(q.id)?.size ?? 0
    const dropOff = Math.max(0, previousViews - stepViews)
    funnel.push({
      questionId: q.id,
      label: q.label,
      views: stepViews,
      dropOff,
      dropOffPct: previousViews > 0 ? (dropOff / previousViews) * 100 : 0,
    })
    previousViews = stepViews
  }

  return { views, starts, submissions, completionRate, avgDurationMs, funnel }
}
