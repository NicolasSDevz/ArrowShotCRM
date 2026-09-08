import { Timestamp } from 'firebase/firestore'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { createTask, getClientTasks } from './taskService'
import { createCalendarEvent } from './calendarService'
import { createNotification, notifyAdminsOfAction } from './notificationService'
import { findUserIdByName } from '../utils/userLookup'
import { trafficServices } from '../utils/clientServices'
import type { Client } from '../types/client'
import type { AppUser } from '../types/user'
import type { ChecklistItem, TaskPriority, TaskRecurrence, WorkflowStepKey } from '../types/task'

function toChecklist(items: string[]): ChecklistItem[] {
  return items.map((text) => ({ id: crypto.randomUUID(), text, done: false }))
}

/** Contrato, Drive e grupo de WhatsApp — responsabilidade de Bruno. */
function onboardingBrunoItems({ companyName }: Pick<Client, 'companyName' | 'modules'>): string[] {
  return [
    'Coletar dados para contrato (nome completo, CNPJ, endereço)',
    'Elaborar contrato usando modelo padrão',
    'Enviar contrato para assinatura (Autentique)',
    'Criar pasta no Google Drive para o cliente',
    'Criar grupo de WhatsApp com o cliente',
    'Adicionar todos os responsáveis no grupo (gestor + CS + cliente)',
    'Colocar o cliente como ADM do grupo',
    `Renomear o grupo para "Arrow Shot & ${companyName}"`,
    'Compartilhar link da pasta Drive no grupo',
  ]
}

/** Boas-vindas e agendamento do briefing — responsabilidade de Jamilson (CS). */
const ONBOARDING_JANILSON_ITEMS = ['Enviar mensagem de boas-vindas no grupo', 'Agendar reunião de briefing e acessos']

const BRIEFING_ACESSOS_ITEMS = [
  'Enviar formulário de briefing ao cliente antes da call',
  'Realizar call de briefing (gravar a reunião)',
  'Salvar gravação na pasta Drive do cliente',
  'Preencher briefing na plataforma durante ou após a call',
  'Obter acesso ao Meta Ads via Business Manager',
  'Obter acesso ao Google Ads',
  'Obter acesso ao Tag Manager (ou criar novo se não existir)',
  'Instalar código GTM na LP/site do cliente',
  'Instalar tag de remarketing no GTM',
  'Instalar tags de conversão no GTM',
  'Obter acesso ao Google Meu Negócio',
  'Conferir forma de pagamento no Meta Ads',
  'Conferir forma de pagamento no Google Ads',
  'Registrar todos os acessos na aba "Acessos" da ficha do cliente',
]

const PLANEJAMENTO_CAMPANHAS_ITEMS = [
  'Realizar benchmarking (biblioteca de anúncios + concorrentes + outros canais)',
  'Salvar pesquisa de benchmarking na pasta Drive do cliente',
  'Criar estratégia (apresentação no Canva ou mapa mental no Whimsical)',
  'Configurar contas de anúncios com nomenclaturas padrão da agência',
  'Criar pixel no gerenciador de negócios',
  'Verificar domínio no Meta',
  'Criar públicos (visitantes, engajamento, lista de clientes, lookalike)',
  'Realizar reunião de debriefing com o cliente (apresentar estratégia)',
  'Subir campanhas',
  'Confirmar que campanhas estão no ar',
]

/** Checklist do Gestor Semanal — só as linhas das plataformas que o cliente
 *  contratou (Serviços contratados no cadastro). */
function trafegoSemanalItems(client: Pick<Client, 'modules'>): string[] {
  const svc = trafficServices(client)
  const items: string[] = []
  if (svc.meta) {
    items.push('Registrar otimização Meta Ads (ver aba Otimizações)', 'Verificar saldo Meta Ads')
  }
  if (svc.google) {
    items.push('Registrar otimização Google Ads (ver aba Otimizações)', 'Verificar saldo Google Ads')
  }
  items.push('Enviar relatório semanal (toda segunda)', 'Solicitar novos criativos se necessário')
  return items
}

function trafegoMensalItems(client: Pick<Client, 'modules'>): string[] {
  const svc = trafficServices(client)
  const plat = svc.both ? 'Meta + Google' : svc.onlyGoogle ? 'Google Ads' : 'Meta Ads'
  return [
    `Análise completa de resultados do mês (${plat})`,
    'Identificar melhores e piores anúncios do mês',
    'Definir estratégia e ajustes para o próximo mês',
    'Atualizar planejamento de campanhas na plataforma',
    'Renovar ou criar novos criativos se necessário',
    'Registrar conclusões do mês na ficha do cliente',
  ]
}

const CS_SEMANAL_ITEMS = [
  'Verificar se há mensagens sem resposta no grupo do WhatsApp do cliente',
  'Enviar atualização semanal de progresso ao cliente',
  'Verificar se há tarefas atrasadas vinculadas ao cliente',
  'Registrar qualquer feedback ou solicitação do cliente',
]

const CS_MENSAL_ITEMS = [
  'Preparar relatório mensal do cliente',
  'Enviar relatório ao cliente',
  'Agendar reunião mensal de resultado se necessário',
  'Verificar satisfação do cliente (NPS)',
  'Registrar status do cliente (ativo, risco de churn, expansão)',
  'Confirmar pagamento do mês',
]

/** Straight from the Social Media playbook, section 10 ("Checklist de
 *  Ativação") plus section 8 ("Lista de Materiais Necessários", só os
 *  obrigatórios) — juntas na única tarefa de ativação da nova sequência. */
const ATIVACAO_SOCIAL_MEDIA_ITEMS = [
  'Reunião de onboarding realizada',
  'Briefing preenchido e salvo no Drive',
  'Pasta do cliente criada no Drive',
  'Catálogo de estilo escolhido pelo cliente',
  'Acesso ao Instagram liberado (Editor)',
  'Drive compartilhado com o cliente',
  'Bio e destaques configurados',
  'Logo fundo transparente e fundo branco (alta resolução)',
  'Cores da marca (código hex ou referência)',
  'Fotos de obras antes/depois (mín. 10, mín. 1080px)',
  'Dados da empresa (nº de obras, anos de atuação, cidades, certificações)',
  'WhatsApp comercial com link',
  'Foto de perfil e fotos para capas dos destaques',
]

const PRODUCAO_CONTEUDO_ITEMS = [
  'Revisar calendário/pauta de conteúdo da semana',
  'Produzir os criativos (posts, reels, stories) planejados',
  'Escrever legendas e CTAs de cada peça',
  'Selecionar hashtags e marcações',
  'Organizar os arquivos finais na pasta do cliente',
]

const APROVACAO_CONTEUDO_ITEMS = [
  'Enviar lote de conteúdo da semana para aprovação do cliente',
  'Acompanhar retorno e prazo de aprovação',
  'Aplicar ajustes solicitados pelo cliente',
  'Confirmar aprovação final de cada peça',
  'Agendar publicação dos conteúdos aprovados',
]

interface StepDef {
  title: (companyName: string) => string
  description: string
  checklist: string[] | ((client: Pick<Client, 'companyName' | 'modules'>) => string[])
  priority: TaskPriority
  /** 'creator' assigns to whoever triggered the step; a name assigns via
   *  findUserIdByName (falls back to unassigned if nobody matches yet). */
  assignee: 'creator' | 'Bruno' | 'Jamilson' | 'Ciane'
  recurrence?: TaskRecurrence
  /** This step's completion only advances the workflow once every one of
   *  these sibling steps (same client) is also done — used to split one
   *  logical step into parallel sub-tasks for different people (e.g.
   *  Onboarding: Bruno's part + Jamilson's part) without either one alone
   *  triggering the next step prematurely. */
  waitForSiblings?: WorkflowStepKey[]
}

const STEP_DEFS: Record<WorkflowStepKey, StepDef> = {
  pt_onboarding_bruno: {
    title: (name) => `Onboarding (Contrato e Acessos) — ${name}`,
    description: 'Checklist padrão de onboarding de cliente novo — contrato, Drive e grupo de WhatsApp.',
    checklist: onboardingBrunoItems,
    priority: 'high',
    assignee: 'Bruno',
    waitForSiblings: ['pt_onboarding_janilson'],
  },
  pt_onboarding_janilson: {
    title: (name) => `Onboarding (Boas-vindas e Briefing) — ${name}`,
    description: 'Checklist padrão de onboarding de cliente novo — boas-vindas e agendamento do briefing.',
    checklist: ONBOARDING_JANILSON_ITEMS,
    priority: 'high',
    assignee: 'Jamilson',
    waitForSiblings: ['pt_onboarding_bruno'],
  },
  pt_briefing: {
    title: (name) => `Briefing e Acessos — ${name}`,
    description: 'Checklist padrão de briefing e coleta de acessos de Tráfego Pago.',
    checklist: BRIEFING_ACESSOS_ITEMS,
    priority: 'high',
    assignee: 'Jamilson',
  },
  pt_planning: {
    title: (name) => `Planejamento de Campanhas — ${name}`,
    description: 'Checklist padrão de planejamento e subida de campanhas.',
    checklist: PLANEJAMENTO_CAMPANHAS_ITEMS,
    priority: 'high',
    assignee: 'Ciane',
  },
  pt_trafego_semanal: {
    title: (name) => `Gestor de Tráfego — Semanal — ${name}`,
    description: 'Tarefa recorrente. Ao concluir, use "Duplicar próxima ocorrência" no card para recriá-la.',
    checklist: trafegoSemanalItems,
    priority: 'normal',
    assignee: 'Ciane',
    recurrence: { frequency: 'weekly', weekday: 1 },
  },
  pt_trafego_mensal: {
    title: (name) => `Gestor de Tráfego — Mensal — ${name}`,
    description: 'Tarefa recorrente. Ao concluir, use "Duplicar próxima ocorrência" no card para recriá-la.',
    checklist: trafegoMensalItems,
    priority: 'normal',
    assignee: 'Ciane',
    recurrence: { frequency: 'monthly', dayOfMonth: 1 },
  },
  pt_cs_semanal: {
    title: (name) => `CS — Semanal — ${name}`,
    description: 'Tarefa recorrente. Ao concluir, use "Duplicar próxima ocorrência" no card para recriá-la.',
    checklist: CS_SEMANAL_ITEMS,
    priority: 'normal',
    assignee: 'Jamilson',
    recurrence: { frequency: 'weekly', weekday: 5 },
  },
  pt_cs_mensal: {
    title: (name) => `CS — Mensal — ${name}`,
    description: 'Tarefa recorrente. Ao concluir, use "Duplicar próxima ocorrência" no card para recriá-la.',
    checklist: CS_MENSAL_ITEMS,
    priority: 'normal',
    assignee: 'Jamilson',
    recurrence: { frequency: 'monthly', dayOfMonth: 1 },
  },
  sm_ativacao: {
    title: (name) => `Ativação de Social Mídia — ${name}`,
    description: 'Checklist padrão de ativação de cliente novo (playbook de Social Mídia).',
    checklist: ATIVACAO_SOCIAL_MEDIA_ITEMS,
    priority: 'high',
    assignee: 'creator',
  },
  sm_producao: {
    title: (name) => `Produção de Conteúdo — ${name}`,
    description: 'Tarefa recorrente. Ao concluir, use "Duplicar próxima ocorrência" no card para recriá-la.',
    checklist: PRODUCAO_CONTEUDO_ITEMS,
    priority: 'normal',
    assignee: 'creator',
    recurrence: { frequency: 'weekly', weekday: 1 },
  },
  sm_aprovacao: {
    title: (name) => `Aprovação de Conteúdo — ${name}`,
    description: 'Tarefa recorrente. Ao concluir, use "Duplicar próxima ocorrência" no card para recriá-la.',
    checklist: APROVACAO_CONTEUDO_ITEMS,
    priority: 'normal',
    assignee: 'creator',
    recurrence: { frequency: 'weekly', weekday: 3 },
  },
  sm_cs_semanal: {
    title: (name) => `CS — Semanal — ${name}`,
    description: 'Tarefa recorrente. Ao concluir, use "Duplicar próxima ocorrência" no card para recriá-la.',
    checklist: CS_SEMANAL_ITEMS,
    priority: 'normal',
    assignee: 'Jamilson',
    recurrence: { frequency: 'weekly', weekday: 5 },
  },
  sm_cs_mensal: {
    title: (name) => `CS — Mensal — ${name}`,
    description: 'Tarefa recorrente. Ao concluir, use "Duplicar próxima ocorrência" no card para recriá-la.',
    checklist: CS_MENSAL_ITEMS,
    priority: 'normal',
    assignee: 'Jamilson',
    recurrence: { frequency: 'monthly', dayOfMonth: 1 },
  },
}

/** Which step(s) get created automatically once `key` is marked done.
 *  Terminal/recurring steps return []. When a client has both services, the
 *  Social Media activation step skips CS Semanal/Mensal — the Tráfego Pago
 *  sequence already creates that same pair, and duplicating it would leave
 *  the client with two of each. */
function getNextSteps(key: WorkflowStepKey, client: Pick<Client, 'modules'>): WorkflowStepKey[] {
  switch (key) {
    case 'pt_onboarding_bruno':
    case 'pt_onboarding_janilson':
      return ['pt_briefing']
    case 'pt_briefing':
      return ['pt_planning']
    case 'pt_planning':
      return ['pt_trafego_semanal', 'pt_trafego_mensal', 'pt_cs_semanal', 'pt_cs_mensal']
    case 'sm_ativacao':
      return client.modules?.paidTraffic ? ['sm_producao', 'sm_aprovacao'] : ['sm_producao', 'sm_aprovacao', 'sm_cs_semanal', 'sm_cs_mensal']
    default:
      return []
  }
}

async function createWorkflowStepTask(
  key: WorkflowStepKey,
  client: Pick<Client, 'id' | 'companyName' | 'modules'>,
  userId: string,
  userName: string,
  users: AppUser[],
  order: number
) {
  const def = STEP_DEFS[key]
  const assignedTo = def.assignee === 'creator' ? userId : findUserIdByName(users, def.assignee)
  const items = typeof def.checklist === 'function' ? def.checklist(client) : def.checklist

  await createTask(
    {
      title: def.title(client.companyName),
      description: def.description,
      clientId: client.id,
      assignedTo,
      dueDate: null,
      priority: def.priority,
      status: 'todo',
      checklist: toChecklist(items),
      order,
      recurrence: def.recurrence ?? null,
      workflowStep: key,
    },
    userId,
    userName,
    { skipAdminCc: true } // onboarding tasks are auto-generated; the owner already gets "novo cliente"
  )
}

/** Creates only the first step(s) of the applicable sequence(s) for a
 *  freshly registered client — the rest of each sequence is created
 *  automatically as each step is marked done (see advanceClientWorkflow). */
export async function createInitialWorkflowTasks(
  client: Pick<Client, 'id' | 'companyName' | 'modules'>,
  userId: string,
  userName: string,
  users: AppUser[]
) {
  const base = Date.now()
  const firstSteps: WorkflowStepKey[] = []
  if (client.modules?.paidTraffic) firstSteps.push('pt_onboarding_bruno', 'pt_onboarding_janilson')
  if (client.modules?.socialMedia) firstSteps.push('sm_ativacao')

  for (let i = 0; i < firstSteps.length; i++) {
    await createWorkflowStepTask(firstSteps[i], client, userId, userName, users, base + i)
  }
}

/** Called right after a task is marked "done" — creates the next step(s) of
 *  its workflow sequence, if it belongs to one and has any (see
 *  getNextSteps). Terminal/recurring tasks are a no-op. */
export async function advanceClientWorkflow(
  task: { workflowStep?: WorkflowStepKey | null; clientId?: string },
  client: Pick<Client, 'id' | 'companyName' | 'modules'>,
  userId: string,
  userName: string,
  users: AppUser[]
) {
  if (!task.workflowStep || !task.clientId) return
  const def = STEP_DEFS[task.workflowStep]
  if (def.waitForSiblings?.length) {
    const clientTasks = await getClientTasks(task.clientId)
    const siblingsDone = def.waitForSiblings.every((key) =>
      clientTasks.some((t) => t.workflowStep === key && t.status === 'done')
    )
    if (!siblingsDone) return
  }

  const nextKeys = getNextSteps(task.workflowStep, client)
  const base = Date.now()
  for (let i = 0; i < nextKeys.length; i++) {
    await createWorkflowStepTask(nextKeys[i], client, userId, userName, users, base + i)
  }
}

/** Called when the CS (Jamilson) fills in and saves the briefing meeting
 *  date on the 'pt_onboarding_janilson' step: creates the Calendário event
 *  and notifies the whole team, per the platform's onboarding workflow. */
export async function scheduleBriefingMeeting(
  client: Pick<Client, 'id' | 'companyName'>,
  meetingDate: Date,
  meetingTime: string,
  userId: string,
  userName: string,
  users: AppUser[]
) {
  await createCalendarEvent(
    {
      title: `Reunião de Briefing — ${client.companyName}`,
      type: 'custom',
      date: Timestamp.fromDate(meetingDate),
      time: meetingTime || undefined,
      clientId: client.id,
    },
    userId
  )

  const dateLabel = format(meetingDate, "dd/MM/yyyy", { locale: ptBR })
  const message = `📅 Reunião de Briefing agendada — ${client.companyName}\nData: ${dateLabel} às ${meetingTime || '—'}\nAgendado por: ${userName}`

  const recipientNames = ['Bruno', 'Ciane', 'Nicolas', 'Jamilson']
  const recipientIds = new Set(recipientNames.map((name) => findUserIdByName(users, name)).filter((id): id is string => !!id))

  await Promise.all(
    Array.from(recipientIds).map((recipientId) =>
      createNotification({
        userId: recipientId,
        type: 'briefing_scheduled',
        message,
        entityType: 'client',
        entityId: client.id,
      })
    )
  )
}

/** Called when the CS (Jamilson) saves the Briefing de Tráfego Pago — notifies
 *  the gestores (Ciane e Nicolas) so they know the planning stage can start. */
export async function notifyBriefingFilled(
  client: Pick<Client, 'id' | 'companyName'>,
  userId: string,
  userName: string,
  users: AppUser[]
) {
  const message = `📋 Briefing preenchido — ${client.companyName}\nSalvo por ${userName} — acesse o planejamento`

  const recipientNames = ['Ciane', 'Nicolas']
  const recipientIds = new Set(recipientNames.map((name) => findUserIdByName(users, name)).filter((id): id is string => !!id))
  recipientIds.delete(userId)

  await Promise.all(
    Array.from(recipientIds).map((recipientId) =>
      createNotification({
        userId: recipientId,
        type: 'briefing_filled',
        message,
        entityType: 'client',
        entityId: client.id,
      })
    )
  )
  await notifyAdminsOfAction({
    type: 'briefing_filled',
    message: `${userName} preencheu o Briefing de Tráfego Pago — ${client.companyName}`,
    actorId: userId,
    actorName: userName,
    entityType: 'client',
    entityId: client.id,
    alreadyNotified: Array.from(recipientIds),
  })
}
