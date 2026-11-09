import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { eachDayOfInterval, endOfMonth, format, isSameDay, startOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { auth, db } from '../firebase/config'
import { createContent } from './contentService'
import { notifyAdminsOfAction } from './notificationService'
import { logActivity } from './activityService'
import type { Client } from '../types/client'
import { CONTENT_FORMAT_LABEL, CONTENT_PILLAR_LABEL, CONTENT_TYPE_LABEL, type Content } from '../types/content'
import { PILLAR_ROTATION, type SocialPlan } from '../types/socialPlan'

/* ------------------------------------------------------------------ */
/* Gerar o mês a partir da grade do plano                              */
/* ------------------------------------------------------------------ */

export interface PlannedPost {
  date: Date
  type: Content['type']
  pillar: NonNullable<Content['pillar']>
  title: string
  /** Já existe um post desse formato nesse dia — não será criado de novo. */
  exists: boolean
  /** Preenchido pela IA (fillMonthWithAI). */
  caption?: string
  cta?: string
  hashtags?: string[]
  script?: string
  notes?: string
}

/** Pede à IA do CRM (api/ai?acao=calendario) o tema, a legenda e o roteiro de
 *  cada post da grade, a partir da ficha e dos briefings do cliente. */
export async function fillMonthWithAI(clientId: string, posts: PlannedPost[]): Promise<PlannedPost[]> {
  const user = auth.currentUser
  if (!user) throw new Error('Sessão expirada — entre de novo')
  const res = await fetch('/api/ai/calendario', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify({
      clientId,
      posts: posts.map((p) => ({
        data: format(p.date, 'yyyy-MM-dd'),
        diaSemana: format(p.date, 'EEEE', { locale: ptBR }),
        formato: p.type,
        pilar: p.pillar,
      })),
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `A IA não respondeu (${res.status})`)
  const filled: Array<{ pilar: Content['pillar']; titulo: string; legenda: string; cta: string; hashtags: string[]; roteiro: string; observacoes: string }> = body.posts
  return posts.map((p, i) => {
    const f = filled[i]
    if (!f) return p
    return {
      ...p,
      pillar: f.pilar ?? p.pillar,
      title: f.titulo || p.title,
      caption: f.legenda,
      cta: f.cta,
      hashtags: f.hashtags,
      script: f.roteiro,
      notes: f.observacoes,
    }
  })
}

export function monthKey(d: Date): string {
  return format(d, 'yyyy-MM')
}

export function monthLabel(d: Date): string {
  const s = format(d, "MMMM 'de' yyyy", { locale: ptBR })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatLabel(type: Content['type']) {
  return CONTENT_FORMAT_LABEL[type] ?? CONTENT_TYPE_LABEL[type]
}

/** Prévia do que o "Gerar mês" vai criar: um post por dia da grade, com o
 *  pilar em rodízio. O rodízio começa num ponto diferente a cada mês para
 *  o mesmo formato não cair sempre no mesmo pilar. */
export function planMonth(plan: SocialPlan, month: Date, existing: Content[]): PlannedPost[] {
  // Dias que já passaram ficam de fora (cliente que entra no meio do mês).
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = startOfMonth(month) < today ? today : startOfMonth(month)
  const end = endOfMonth(month)
  const days = start > end ? [] : eachDayOfInterval({ start, end })
  let i = (month.getFullYear() * 12 + month.getMonth()) % PILLAR_ROTATION.length
  const out: PlannedPost[] = []
  for (const date of days) {
    for (const slot of plan.slots.filter((s) => s.weekday === date.getDay())) {
      const pillar = PILLAR_ROTATION[i % PILLAR_ROTATION.length]
      i++
      const exists = existing.some(
        (c) => c.status !== 'cancelled' && c.type === slot.type && c.scheduledDate && isSameDay(c.scheduledDate.toDate(), date)
      )
      out.push({
        date,
        type: slot.type,
        pillar,
        title: `${formatLabel(slot.type)} · ${CONTENT_PILLAR_LABEL[pillar]}`,
        exists,
      })
    }
  }
  return out
}

export async function generateMonth(
  client: Client,
  plan: SocialPlan,
  posts: PlannedPost[],
  user: { id: string; name: string },
  startOrder: number
): Promise<number> {
  const toCreate = posts.filter((p) => !p.exists)
  let order = startOrder
  for (const p of toCreate) {
    await createContent(
      {
        clientId: client.id,
        title: p.title,
        type: p.type,
        platform: 'instagram',
        pillar: p.pillar,
        ...(p.caption ? { caption: p.caption } : {}),
        ...(p.cta ? { cta: p.cta } : {}),
        ...(p.hashtags?.length ? { hashtags: p.hashtags } : {}),
        ...(p.script ? { script: p.script } : {}),
        ...(p.notes ? { notes: p.notes } : {}),
        scheduledDate: Timestamp.fromDate(p.date),
        scheduledTime: plan.time,
        status: 'ideas',
        order: order++,
      },
      user.id,
      user.name,
      { skipAdminCc: true }
    )
  }
  if (toCreate.length > 0) {
    await notifyAdminsOfAction({
      type: 'content_created',
      message: `${user.name} gerou o calendário de ${monthLabel(toCreate[0].date)} — ${client.companyName} (${toCreate.length} posts)`,
      actorId: user.id,
      actorName: user.name,
      entityType: 'client',
      entityId: client.id,
    })
  }
  return toCreate.length
}

/* ------------------------------------------------------------------ */
/* Link de aprovação do mês                                            */
/* ------------------------------------------------------------------ */

export interface ApprovalLink {
  id: string
  clientId: string
  clientNameSnapshot: string
  logoUrl?: string | null
  /** "yyyy-MM" */
  month: string
  contentIds: string[]
  active: boolean
  /** Prazo combinado com o cliente (ISO yyyy-MM-dd). */
  deadline?: string
  createdAt?: Timestamp
  createdBy?: string
}

const LINKS = 'approvalLinks'

/** 18 bytes aleatórios em base64url — é o que protege o link. */
function newToken(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function approvalLinkUrl(token: string) {
  return `${window.location.origin}/aprovacao/${token}`
}

/** Manda os posts escolhidos para o cliente num link só. Cada post recebe o
 *  mesmo token (é isso que deixa a página pública ler o post e mudar o status,
 *  ver firestore.rules) e passa para "Aguardando Cliente". */
export async function sendMonthForApproval(params: {
  client: Client
  month: Date
  contents: Content[]
  notifyUserIds: string[]
  deadline: string
  user: { id: string; name: string }
}): Promise<string> {
  const { client, month, contents, user, deadline } = params
  const token = newToken()
  const notifyIds = Array.from(
    new Set([...params.notifyUserIds, ...contents.map((c) => c.assignedTo).filter((x): x is string => !!x)])
  )

  await setDoc(doc(db, LINKS, token), {
    clientId: client.id,
    clientNameSnapshot: client.companyName,
    logoUrl: client.logoUrl ?? null,
    month: monthKey(month),
    contentIds: contents.map((c) => c.id),
    active: true,
    deadline,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: user.id,
    updatedBy: user.id,
  })

  // Lote de até 500 escritas — um mês tem no máximo ~15 posts.
  const batch = writeBatch(db)
  for (const c of contents) {
    batch.update(doc(db, 'contents', c.id), {
      approvalToken: token,
      approvalLinkId: token,
      clientNameSnapshot: client.companyName,
      approvalNotifyUserIds: notifyIds,
      status: c.status === 'approved' || c.status === 'scheduled' || c.status === 'published' ? c.status : 'waiting_client',
      updatedAt: serverTimestamp(),
      updatedBy: user.id,
    })
  }
  await batch.commit()

  await logActivity({
    entityType: 'client',
    entityId: client.id,
    clientId: client.id,
    action: 'updated',
    message: `enviou ${contents.length} posts de ${monthLabel(month)} para aprovação`,
    userId: user.id,
    userName: user.name,
  })

  return approvalLinkUrl(token)
}

export async function deactivateApprovalLink(token: string, userId: string) {
  await updateDoc(doc(db, LINKS, token), { active: false, updatedAt: serverTimestamp(), updatedBy: userId })
}

/** Página pública: o link e os posts dele. Um post que foi reenviado em
 *  outro link depois (token diferente) fica de fora deste. */
export async function getPublicApprovalMonth(
  token: string
): Promise<{ link: ApprovalLink; contents: Content[] } | null> {
  const snap = await getDoc(doc(db, LINKS, token))
  if (!snap.exists()) return null
  const link = { id: snap.id, ...snap.data() } as ApprovalLink
  if (!link.active) return null
  const results = await Promise.all(
    link.contentIds.map(async (id) => {
      try {
        const s = await getDoc(doc(db, 'contents', id))
        if (!s.exists()) return null
        const c = { id: s.id, ...s.data() } as Content
        return c.approvalToken === token ? c : null
      } catch {
        return null
      }
    })
  )
  const contents = results
    .filter((c): c is Content => !!c && c.status !== 'cancelled')
    .sort((a, b) => (a.scheduledDate?.toMillis() ?? 0) - (b.scheduledDate?.toMillis() ?? 0))
  return { link, contents }
}
