import { addDays } from 'date-fns'
import { Timestamp } from 'firebase/firestore'
import { createContent } from './contentService'
import { notifyAdminsOfAction } from './notificationService'
import { getClientName } from './clientLookup'
import type { ContentPillar, ContentType } from '../types/content'

interface TemplateEntry {
  /** days after the chosen start date (0 = start date itself) */
  dayOffset: number
  type: ContentType
  pillar: ContentPillar
  theme: string
  objective?: string
  caption?: string
  script?: string
}

/** Straight from the Social Media playbook, section 5 — "Roteiro Semanal".
 *  Fixed Monday-to-Friday structure for Pacote Semanal clients; only the real
 *  content (photos, data) changes week to week, the pillars/themes repeat. */
export const WEEKLY_TEMPLATE: TemplateEntry[] = [
  {
    dayOffset: 0,
    type: 'post',
    pillar: 'dor_solucao',
    theme: 'Resíduo invisível de obra — grout, cimento, poeira fina',
    objective: "Mostrar o 'antes': superfícies sujas que parecem limpas. Stories: pergunta → antes/depois → CTA WhatsApp.",
    caption:
      'A obra acabou mas a casa ainda não está pronta. O que fica depois da construção são resíduos que danificam revestimentos e prejudicam a saúde. Nossa equipe especializada remove o que o olho não enxerga. Solicite seu orçamento.',
  },
  {
    dayOffset: 1,
    type: 'reels',
    pillar: 'autoridade',
    theme: 'Bastidores do processo técnico',
    objective: 'Stories: compartilhar o reel + CTA direto.',
    caption: 'Cada detalhe importa. Nosso processo protege seus revestimentos e entrega resultado real. Fala com a gente.',
    script: "0–3s hook ('O que acontece quando uma equipe especializada chega?') → 3–15s equipe em ação com técnica → 15–25s resultado final → 25–30s logo + CTA",
  },
  {
    dayOffset: 2,
    type: 'post',
    pillar: 'prova_social',
    theme: 'Antes e depois de um cliente real',
    objective: 'Foto antes (suja) × depois (pronta). Stories: carrossel antes/depois → depoimento → CTA.',
    caption: 'Em [X horas] entregamos esse apartamento pronto para o cliente se mudar. Quer o mesmo resultado? Solicite seu orçamento agora.',
  },
  {
    dayOffset: 3,
    type: 'reels',
    pillar: 'bastidores',
    theme: 'Humanização — equipe, rotina, cuidado',
    objective: 'Stories: caixinha de perguntas sobre limpeza pós-obra → 1–2 respostas → CTA.',
    caption: 'Por trás de cada entrega tem uma equipe treinada e comprometida. Esse é o padrão que nos orgulha todo dia.',
    script: '0–3s equipe chegando ao local → 3–12s cenas naturais do trabalho → 12–22s fala de membro da equipe → 22–30s logo + CTA',
  },
  {
    dayOffset: 4,
    type: 'post',
    pillar: 'dor_solucao',
    theme: "Quebrar objeção 'posso limpar sozinho'",
    objective: 'Mostrar consequências de limpar sem especialista. Stories: "3 erros comuns" → CTA urgência.',
    caption:
      'Muita gente tenta fazer a limpeza pós-obra em casa — e acaba arranhando o piso novo ou manchando o vidro. A limpeza técnica existe para proteger seu investimento. Fala com a gente antes que seja tarde.',
  },
]

interface MonthlyEntry {
  week: number // 0-indexed
  dayOffset: number // within the week, 0 = Monday
  type: ContentType
  pillar: ContentPillar
  theme: string
}

/** Section 6 — "Roteiro Mensal". Progressive 4-week structure for Pacote
 *  Mensal clients: 3 posts/week (Mon/Wed/Fri). Themes only — no ready-made
 *  captions in the playbook for this tier, unlike the weekly one. */
export const MONTHLY_TEMPLATE: MonthlyEntry[] = [
  // Semana 1 — Apresentação e Dor Principal
  { week: 0, dayOffset: 0, type: 'post', pillar: 'dor_solucao', theme: 'O que a obra deixa pra trás — resíduos invisíveis' },
  { week: 0, dayOffset: 2, type: 'reels', pillar: 'autoridade', theme: 'Nossa equipe em ação — processo técnico' },
  { week: 0, dayOffset: 4, type: 'post', pillar: 'prova_social', theme: 'Antes e depois — cliente real' },
  // Semana 2 — Objeções e Educação
  { week: 1, dayOffset: 0, type: 'post', pillar: 'dor_solucao', theme: 'Por que não dá pra fazer sozinho' },
  { week: 1, dayOffset: 2, type: 'reels', pillar: 'educativo', theme: 'Limpeza técnica × limpeza comum' },
  { week: 1, dayOffset: 4, type: 'post', pillar: 'prova_social', theme: 'Depoimento em destaque' },
  // Semana 3 — Personas e Alto Padrão
  { week: 2, dayOffset: 0, type: 'post', pillar: 'dor_solucao', theme: 'Para construtoras e arquitetos — ângulo B2B' },
  { week: 2, dayOffset: 2, type: 'reels', pillar: 'bastidores', theme: 'Por dentro da equipe — humanização' },
  { week: 2, dayOffset: 4, type: 'post', pillar: 'autoridade', theme: 'Número que impressiona — escala e credibilidade' },
  // Semana 4 — Fechamento e Urgência
  { week: 3, dayOffset: 0, type: 'post', pillar: 'dor_solucao', theme: 'Quanto custa não contratar — consequências' },
  { week: 3, dayOffset: 2, type: 'reels', pillar: 'educativo', theme: 'Checklist pós-obra — conteúdo de valor' },
  { week: 3, dayOffset: 4, type: 'post', pillar: 'prova_social', theme: 'Compilado de resultados do mês' },
]

/** Bulk-creates a batch of Content cards (status "ideas") for a client from
 *  the agency's standard weekly or monthly editorial grade, so production
 *  starts from a pre-filled pauta instead of a blank Kanban every cycle. */
export async function generateWeeklyPauta(
  clientId: string,
  startDate: Date,
  userId: string,
  userName: string
) {
  let created = 0
  for (const entry of WEEKLY_TEMPLATE) {
    await createContent(
      {
        clientId,
        title: entry.theme,
        type: entry.type,
        platform: 'instagram',
        pillar: entry.pillar,
        objective: entry.objective,
        caption: entry.caption,
        script: entry.script,
        status: 'ideas',
        order: Date.now() + created,
        scheduledDate: Timestamp.fromDate(addDays(startDate, entry.dayOffset)),
        hashtags: [],
      },
      userId,
      userName,
      { skipAdminCc: true }
    )
    created += 1
  }
  await notifyPautaGenerated(clientId, created, 'semanal', userId, userName)
  return created
}

async function notifyPautaGenerated(clientId: string, count: number, kind: string, userId: string, userName: string) {
  const clientName = await getClientName(clientId)
  await notifyAdminsOfAction({
    type: 'content_created',
    message: `${userName} gerou a pauta ${kind} (${count} conteúdos)${clientName ? ` — ${clientName}` : ''}`,
    actorId: userId,
    actorName: userName,
    entityType: 'content',
  })
}

export async function generateMonthlyPauta(
  clientId: string,
  startDate: Date,
  userId: string,
  userName: string
) {
  let created = 0
  for (const entry of MONTHLY_TEMPLATE) {
    await createContent(
      {
        clientId,
        title: entry.theme,
        type: entry.type,
        platform: 'instagram',
        pillar: entry.pillar,
        status: 'ideas',
        order: Date.now() + created,
        scheduledDate: Timestamp.fromDate(addDays(startDate, entry.week * 7 + entry.dayOffset)),
        hashtags: [],
      },
      userId,
      userName,
      { skipAdminCc: true }
    )
    created += 1
  }
  await notifyPautaGenerated(clientId, created, 'mensal', userId, userName)
  return created
}
