import { orderBy, Timestamp, type FirestoreError } from 'firebase/firestore'
import type { AppUser, Lead, LeadContactEntry, LeadInput, LeadStatus } from '../types'
import { LEAD_STATUS_LABEL, LEAD_LOST_REASON_LABEL } from '../types/lead'
import { collectionService } from './firestore'
import { logActivity } from './activityService'
import { createClient } from './clientService'
import { createInitialWorkflowTasks } from './clientWorkflowTemplates'
import { notifyAdminsOfAction } from './notificationService'
import { emitCelebration } from './celebrationService'

const COLLECTION = 'leads'
const base = collectionService<Lead>(COLLECTION)

export async function createLead(
  data: LeadInput,
  userId: string,
  userName: string,
  opts?: { skipAdminNotify?: boolean }
) {
  const id = await base.create({ ...data, stageChangedAt: Timestamp.now() }, userId)
  await logActivity({
    entityType: 'lead',
    entityId: id,
    action: 'created',
    message: `criou o lead "${data.contactName}"`,
    userId,
    userName,
  })
  if (!opts?.skipAdminNotify) {
    const label = data.companyName?.trim() ? `${data.contactName} (${data.companyName.trim()})` : data.contactName
    await notifyAdminsOfAction({
      type: 'lead_created',
      message: `${userName} cadastrou o lead ${label}`,
      actorId: userId,
      actorName: userName,
      entityType: 'lead',
      entityId: id,
    })
  }
  return id
}

/** Importação em massa via CSV (ver utils/leadImport.ts). Cria cada lead na
 *  coluna "Novo Lead" com o responsável informado (Bruno, por padrão),
 *  suprime a notificação individual e, ao final, manda UMA notificação-resumo
 *  aos admins. Devolve o total criado e as linhas que falharam ao gravar. */
export async function importLeads(
  rows: {
    contactName: string
    companyName?: string
    whatsapp?: string
    email?: string
    cityRegion?: string
    services: Lead['services']
    source: Lead['source']
    estimatedValue?: number
    notes?: string
    line: number
  }[],
  assignedTo: string | undefined,
  userId: string,
  userName: string
): Promise<{ created: number; failedLines: number[] }> {
  const failedLines: number[] = []
  let created = 0
  const now = Date.now()

  for (const [i, row] of rows.entries()) {
    try {
      await createLead(
        {
          contactName: row.contactName,
          companyName: row.companyName,
          whatsapp: row.whatsapp ?? '',
          email: row.email,
          cityRegion: row.cityRegion,
          services: row.services,
          source: row.source,
          estimatedValue: row.estimatedValue,
          notes: row.notes,
          assignedTo,
          status: 'new',
          order: now + i,
          contactHistory: [],
        },
        userId,
        userName,
        { skipAdminNotify: true }
      )
      created++
    } catch (err) {
      console.error('importLeads: falha ao gravar linha', row.line, err)
      failedLines.push(row.line)
    }
  }

  if (created > 0) {
    await notifyAdminsOfAction({
      type: 'lead_created',
      message: `📥 ${created} ${created === 1 ? 'novo lead importado' : 'novos leads importados'}`,
      actorId: userId,
      actorName: userName,
      entityType: 'lead',
    })
  }

  return { created, failedLines }
}

export async function updateLead(id: string, data: Partial<LeadInput>, userId: string, userName: string) {
  await base.update(id, data, userId)
  await logActivity({
    entityType: 'lead',
    entityId: id,
    action: 'updated',
    message: 'atualizou o lead',
    userId,
    userName,
  })
}

export interface MoveLeadExtra {
  lostReason?: Lead['lostReason']
  lostReasonNote?: Lead['lostReasonNote']
}

export async function moveLeadStatus(
  lead: Lead,
  newStatus: LeadStatus,
  newOrder: number,
  userId: string,
  userName: string,
  extra?: MoveLeadExtra
) {
  const changed = newStatus !== lead.status
  const lossFields =
    newStatus === 'lost'
      ? { lostReason: extra?.lostReason ?? null, lostReasonNote: extra?.lostReasonNote?.trim() || null, lostAt: Timestamp.now() }
      : changed
        ? { lostReason: null, lostReasonNote: null, lostAt: null }
        : {}
  await base.update(
    lead.id,
    { status: newStatus, order: newOrder, ...(changed ? { stageChangedAt: Timestamp.now() } : {}), ...lossFields },
    userId
  )
  if (changed) {
    await logActivity({
      entityType: 'lead',
      entityId: lead.id,
      action: 'status_changed',
      message: `moveu de "${LEAD_STATUS_LABEL[lead.status]}" para "${LEAD_STATUS_LABEL[newStatus]}"`,
      userId,
      userName,
    })
    const name = lead.companyName?.trim() || lead.contactName
    const lost = newStatus === 'lost'
    const lostReasonLabel = extra?.lostReason ? LEAD_LOST_REASON_LABEL[extra.lostReason] : null
    if (newStatus === 'closed') await emitCelebration(name, userName)
    await notifyAdminsOfAction({
      type: 'lead_stage_changed',
      message: lost
        ? `${userName} marcou o lead ${name} como Perdido${lostReasonLabel ? ` (motivo: ${lostReasonLabel})` : ''}`
        : `${userName} moveu o lead ${name} de "${LEAD_STATUS_LABEL[lead.status]}" para "${LEAD_STATUS_LABEL[newStatus]}"`,
      actorId: userId,
      actorName: userName,
      entityType: 'lead',
      entityId: lead.id,
    })
  }
}

export async function deleteLead(lead: Lead, userId: string, userName: string) {
  await base.remove(lead.id)
  await logActivity({
    entityType: 'lead',
    entityId: lead.id,
    action: 'deleted',
    message: `excluiu o lead "${lead.contactName}"`,
    userId,
    userName,
  })
}

export async function addLeadContact(
  lead: Lead,
  entry: Omit<LeadContactEntry, 'id' | 'createdBy' | 'createdAt'>,
  userId: string,
  userName: string
) {
  const fullEntry: LeadContactEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdBy: userId,
    createdAt: Timestamp.now(),
  }
  const contactHistory = [...(lead.contactHistory ?? []), fullEntry].sort((a, b) => b.date.toMillis() - a.date.toMillis())
  await base.update(lead.id, { contactHistory }, userId)
  await logActivity({
    entityType: 'lead',
    entityId: lead.id,
    action: 'updated',
    message: 'registrou um contato',
    userId,
    userName,
  })
}

/** Cria um Client de verdade a partir do lead (mesmo fluxo de onboarding de
 *  um cadastro manual — createClient já notifica a equipe e
 *  createInitialWorkflowTasks já cria as tarefas de onboarding), e marca o
 *  lead como convertido. Chamado a partir da coluna FECHADO. */
export async function convertLeadToClient(lead: Lead, userId: string, userName: string, users: AppUser[]) {
  const companyName = lead.companyName?.trim() || lead.contactName
  const modules = {
    paidTraffic: !!(lead.services.paidTraffic || lead.services.metaAds || lead.services.googleAds),
    metaAds: !!lead.services.metaAds,
    googleAds: !!lead.services.googleAds,
    socialMedia: !!lead.services.socialMedia,
  }

  const clientId = await createClient(
    {
      companyName,
      contactName: lead.contactName,
      whatsapp: lead.whatsapp,
      email: lead.email,
      city: lead.cityRegion,
      status: 'prospect',
      package: lead.services.socialMediaPackage,
      monthlyValue: lead.estimatedValue,
      notes: lead.notes,
      modules,
    },
    userId,
    userName,
    users
  )

  await createInitialWorkflowTasks({ id: clientId, companyName, modules }, userId, userName, users)

  await base.update(lead.id, { convertedClientId: clientId, convertedAt: Timestamp.now() }, userId)
  await logActivity({
    entityType: 'lead',
    entityId: lead.id,
    clientId,
    action: 'updated',
    message: 'converteu o lead em cliente',
    userId,
    userName,
  })
  await notifyAdminsOfAction({
    type: 'lead_converted',
    message: `${userName} converteu o lead ${lead.contactName} em cliente: ${companyName}`,
    actorId: userId,
    actorName: userName,
    entityType: 'client',
    entityId: clientId,
  })
  await emitCelebration(companyName, userName)

  return clientId
}

export function getLead(id: string) {
  return base.getById(id)
}

export function subscribeLeads(onData: (items: Lead[]) => void, onError?: (err: FirestoreError) => void) {
  return base.subscribe([orderBy('order', 'asc')], onData, onError)
}
