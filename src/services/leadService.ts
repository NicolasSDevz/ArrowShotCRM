import { orderBy, where, Timestamp, type FirestoreError } from 'firebase/firestore'
import type { AppUser, Client, Lead, LeadContactEntry, LeadInput, LeadStatus, ResolvedPipeline } from '../types'
import { contactKeys } from '../utils/leadDuplicates'
import { waPhoneKey } from '../utils/phoneKey'
import { LEAD_STATUS_LABEL, LEAD_LOST_REASON_LABEL, LEAD_FORM_STAGE_LABEL, isQuestionnaireLead, type LeadFormStage } from '../types/lead'
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
  // phoneKey: o WhatsApp acha o lead por ele quando a pessoa chama (ver api/_lib/whatsapp.js).
  const id = await base.create({ ...data, phoneKey: waPhoneKey(data.whatsapp), stageChangedAt: Timestamp.now() }, userId)
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
 *  aos admins. Pula quem já existe (mesmo WhatsApp ou e-mail de um lead já
 *  cadastrado ou de uma linha anterior da própria planilha) — importar a
 *  mesma planilha duas vezes não duplica nada. Devolve o total criado, as
 *  linhas puladas por duplicado e as que falharam ao gravar. */
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
  userName: string,
  /** Pipeline de destino (padrão: "Vendas", primeira etapa). */
  target: { pipelineId?: string | null; status: string } | undefined,
  /** Leads já cadastrados (todos os pipelines) — base da checagem de duplicado. */
  existingLeads: Lead[]
): Promise<{ created: number; failedLines: number[]; duplicateLines: number[] }> {
  const failedLines: number[] = []
  const duplicateLines: number[] = []
  let created = 0
  const now = Date.now()
  const seen = new Set(existingLeads.flatMap(contactKeys))

  for (const [i, row] of rows.entries()) {
    const keys = contactKeys(row)
    if (keys.some((k) => seen.has(k))) {
      duplicateLines.push(row.line)
      continue
    }
    keys.forEach((k) => seen.add(k))
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
          status: target?.status ?? 'new',
          pipelineId: target?.pipelineId ?? undefined,
          // Negativo: os importados entram no topo da coluna, na ordem da planilha.
          order: -now + i,
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

  return { created, failedLines, duplicateLines }
}

export async function updateLead(id: string, data: Partial<LeadInput>, userId: string, userName: string) {
  await base.update(id, data.whatsapp !== undefined ? { ...data, phoneKey: waPhoneKey(data.whatsapp) } : data, userId)
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

/** Rótulo e tipo (aberta/ganha/perdida) de uma etapa — do pipeline do lead
 *  ou, sem pipeline, do padrão. */
function stageMeta(id: string, pipeline?: ResolvedPipeline): { label: string; kind: 'open' | 'won' | 'lost' } {
  const stage = pipeline?.stages.find((st) => st.id === id)
  if (stage) return { label: stage.label, kind: stage.kind }
  return { label: LEAD_STATUS_LABEL[id as LeadStatus] ?? id, kind: id === 'closed' ? 'won' : id === 'lost' ? 'lost' : 'open' }
}

/** Lead de questionário movido no pipeline (pela ficha) sai da aba Questionários. */
function sentToSales(lead: Lead): { formStage?: LeadFormStage } {
  return isQuestionnaireLead(lead) ? { formStage: 'sent' } : {}
}

/** Triagem na aba Questionários: em análise, descartada ou de volta para nova. */
export async function setLeadFormStage(lead: Lead, stage: Exclude<LeadFormStage, 'sent'>, userId: string, userName: string) {
  await base.update(lead.id, { formStage: stage }, userId)
  await logActivity({
    entityType: 'lead',
    entityId: lead.id,
    action: 'status_changed',
    message: `marcou a resposta do questionário como "${LEAD_FORM_STAGE_LABEL[stage]}"`,
    userId,
    userName,
  })
}

/** Tira o lead da aba Questionários e coloca na primeira etapa do pipeline
 *  escolhido, no topo da coluna. */
export async function sendLeadToSales(lead: Lead, target: ResolvedPipeline, userId: string, userName: string) {
  const stage = target.stages[0]
  await base.update(
    lead.id,
    {
      formStage: 'sent',
      pipelineId: target.isDefault ? null : target.id,
      status: stage.id,
      order: -Date.now(),
      stageChangedAt: Timestamp.now(),
    },
    userId
  )
  await logActivity({
    entityType: 'lead',
    entityId: lead.id,
    action: 'status_changed',
    message: `enviou o lead do questionário para o pipeline "${target.name}" (${stage.label})`,
    userId,
    userName,
  })
}

export async function moveLeadStatus(
  lead: Lead,
  newStatus: string,
  newOrder: number,
  userId: string,
  userName: string,
  extra?: MoveLeadExtra,
  pipeline?: ResolvedPipeline
) {
  const changed = newStatus !== lead.status
  const from = stageMeta(lead.status, pipeline)
  const to = stageMeta(newStatus, pipeline)
  const lossFields =
    to.kind === 'lost'
      ? { lostReason: extra?.lostReason ?? null, lostReasonNote: extra?.lostReasonNote?.trim() || null, lostAt: Timestamp.now() }
      : changed
        ? { lostReason: null, lostReasonNote: null, lostAt: null }
        : {}
  await base.update(
    lead.id,
    { status: newStatus, order: newOrder, ...(changed ? { stageChangedAt: Timestamp.now() } : {}), ...lossFields, ...sentToSales(lead) },
    userId
  )
  if (changed) {
    await logActivity({
      entityType: 'lead',
      entityId: lead.id,
      action: 'status_changed',
      message: `moveu de "${from.label}" para "${to.label}"`,
      userId,
      userName,
    })
    const name = lead.companyName?.trim() || lead.contactName
    const lost = to.kind === 'lost'
    const lostReasonLabel = extra?.lostReason ? LEAD_LOST_REASON_LABEL[extra.lostReason] : null
    if (to.kind === 'won') await emitCelebration(name, userName)
    await notifyAdminsOfAction({
      type: 'lead_stage_changed',
      message: lost
        ? `${userName} marcou o lead ${name} como Perdido${lostReasonLabel ? ` (motivo: ${lostReasonLabel})` : ''}`
        : `${userName} moveu o lead ${name} de "${from.label}" para "${to.label}"`,
      actorId: userId,
      actorName: userName,
      entityType: 'lead',
      entityId: lead.id,
    })
  }
}

/** Muda o lead de pipeline. Cai na etapa `stageId` do destino (escolhida no
 *  "Mover para" do lead) ou, sem ela, na primeira etapa — as etapas de cada
 *  pipeline são diferentes. Os campos extras do pipeline antigo ficam
 *  guardados no lead, caso ele volte. */
export async function moveLeadToPipeline(
  lead: Lead,
  target: ResolvedPipeline,
  userId: string,
  userName: string,
  stageId?: string,
  extra?: MoveLeadExtra
) {
  const stage = target.stages.find((s) => s.id === stageId) ?? target.stages[0]
  const lost = stage.kind === 'lost'
  await base.update(
    lead.id,
    {
      pipelineId: target.isDefault ? null : target.id,
      status: stage.id,
      order: Date.now(),
      stageChangedAt: Timestamp.now(),
      lostReason: lost ? (extra?.lostReason ?? null) : null,
      lostReasonNote: lost ? extra?.lostReasonNote?.trim() || null : null,
      lostAt: lost ? Timestamp.now() : null,
      ...sentToSales(lead),
    },
    userId
  )
  await logActivity({
    entityType: 'lead',
    entityId: lead.id,
    action: 'status_changed',
    message: `moveu para o pipeline "${target.name}" (${stage.label})`,
    userId,
    userName,
  })
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
export async function convertLeadToClient(staleLead: Lead, userId: string, userName: string, users: AppUser[]) {
  // Relê do banco: se outra pessoa (ou outra tela) já converteu esse lead,
  // devolve o cliente que já existe em vez de criar outro.
  const lead = (await base.getById(staleLead.id)) ?? staleLead
  if (lead.convertedClientId) return lead.convertedClientId

  const companyName = lead.companyName?.trim() || lead.contactName
  const modules = {
    paidTraffic: !!(lead.services.paidTraffic || lead.services.metaAds || lead.services.googleAds),
    metaAds: !!lead.services.metaAds,
    googleAds: !!lead.services.googleAds,
    socialMedia: !!lead.services.socialMedia,
    landingPage: !!lead.services.landingPage,
  }

  // Leva o responsável do lead pro cliente convertido — sem isso, as tarefas
  // automáticas de "gestor" (ver clientWorkflowTemplates) nasceriam sem
  // ninguém atribuído.
  const ownerIds = lead.assignedTo ? [lead.assignedTo] : undefined

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
      // Serviços do catálogo do Dashboard que o lead escolheu vão junto pro cliente.
      contractedProductIds: lead.contractedProductIds,
      modules,
      ownerIds,
    },
    userId,
    userName,
    users
  )

  await createInitialWorkflowTasks({ id: clientId, companyName, modules, ownerIds }, userId, userName, users)

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

/** Lead que já é cliente (ex: veio de outro CRM, ou a mesma pessoa voltou
 *  por outro canal): liga o lead ao cadastro existente em vez de criar um
 *  cliente novo — sem onboarding, notificação de cliente novo nem comemoração. */
export async function linkLeadToClient(lead: Lead, client: Client, userId: string, userName: string) {
  await base.update(lead.id, { convertedClientId: client.id, convertedAt: Timestamp.now() }, userId)
  await logActivity({
    entityType: 'lead',
    entityId: lead.id,
    clientId: client.id,
    action: 'updated',
    message: `vinculou o lead ao cliente já existente "${client.companyName}"`,
    userId,
    userName,
  })
}

export function getLead(id: string) {
  return base.getById(id)
}

export function subscribeLeads(onData: (items: Lead[]) => void, onError?: (err: FirestoreError) => void) {
  return base.subscribe([orderBy('order', 'asc')], onData, onError)
}

/** Leads "vivos" sem reler o histórico inteiro: todos os que estão em etapa
 *  aberta (qualquer idade) + todos os que mudaram de etapa desde `sinceMs`
 *  (inclui ganhos e perdidos recentes). Ganhos e perdidos antigos ficam de
 *  fora — use subscribeLeads quando precisar deles. */
export function subscribeActiveLeads(
  openStatusIds: string[],
  sinceMs: number,
  onData: (items: Lead[]) => void,
  onError?: (err: FirestoreError) => void
) {
  // O "in" do Firestore aceita até 30 valores por consulta.
  const chunks: string[][] = []
  for (let i = 0; i < openStatusIds.length; i += 30) chunks.push(openStatusIds.slice(i, i + 30))
  const parts: (Lead[] | null)[] = Array(chunks.length + 1).fill(null)
  const emit = () => {
    if (parts.some((p) => p === null)) return
    const byId = new Map<string, Lead>()
    for (const p of parts) for (const l of p!) byId.set(l.id, l)
    onData([...byId.values()].sort((a, b) => a.order - b.order))
  }
  const listen = (i: number) => (items: Lead[]) => {
    parts[i] = items
    emit()
  }
  const unsubs = [
    base.subscribe([where('stageChangedAt', '>=', Timestamp.fromMillis(sinceMs))], listen(0), onError),
    ...chunks.map((ids, i) => base.subscribe([where('status', 'in', ids)], listen(i + 1), onError)),
  ]
  return () => unsubs.forEach((u) => u())
}
