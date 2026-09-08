import type { Timestamp } from 'firebase/firestore'
import type { BaseDoc } from './common'
import type { PaidTrafficBriefing } from './paidTrafficBriefing'
import type { CampaignPlanning } from './campaignPlanning'
import type { SalesFunnel } from './salesFunnel'

export type ClientStatus = 'active' | 'paused' | 'churned' | 'prospect'

/** Classificação interna do cliente (herdada do ClickUp: "Clientes A" /
 *  "Clientes B"). Só visual/organizacional — não muda regra de negócio. */
export type ClientCategory = 'A' | 'B'

/** Social Media service tier — drives which content cadence template applies. */
export type ClientPackage = 'weekly' | 'monthly'

/** Fixed visual style catalogs clients pick at contract time (Arrow Shot's
 *  standardized Social Media offering). Chosen once, applies to all production. */
export type StyleCatalog = 1 | 2 | 3

export type ClientAudience = 'residencial' | 'comercial' | 'ambos'

export type ApprovalChannel = 'whatsapp' | 'email' | 'drive' | 'outro'

/** Onboarding briefing — filled once in the kickoff meeting (playbook section
 *  7). Deliberately kept off the quick client-create form and off the base
 *  Client fields it would otherwise duplicate (empresa/responsável/whatsapp/
 *  cidade/pacote/catálogo already exist on Client). */
/** Tom de voz do briefing de Social Mídia (dropdown). */
export type BriefingToneOfVoice = 'profissional_sobrio' | 'moderno_descontraido' | 'premium_aspiracional'

export const BRIEFING_TONE_OF_VOICE_LABEL: Record<BriefingToneOfVoice, string> = {
  profissional_sobrio: 'Profissional e sóbrio',
  moderno_descontraido: 'Moderno e descontraído',
  premium_aspiracional: 'Premium e aspiracional',
}

export interface ClientBriefing {
  // Seção 1 — Informações da empresa
  tempoMercado?: string
  numeroObras?: string
  servicos?: string
  atendeTipo?: ClientAudience
  ticketMedio?: string
  diferencial?: string
  naoAssociar?: string

  // Seção 2 — Público-alvo
  clienteIdeal?: string
  atendeB2B?: boolean
  /** Setor B2B — só faz sentido quando atendeB2B === true. */
  setorB2B?: string
  dorPrincipal?: string
  objecaoComum?: string

  // Seção 3 — Identidade e tom de voz
  /** Guarda a chave de BriefingToneOfVoice (dropdown). */
  tomVoz?: string
  coresMarca?: string
  referenciaPerfil?: string
  naoQuerVer?: string
  observacoesIdentidade?: string

  // Seção 4 — Materiais disponíveis
  logoEnviada?: boolean
  fotosAntesDepois?: boolean
  fotosAntesDepoisQtd?: string
  videosDisponiveis?: boolean
  depoimentosClientes?: boolean
  fotoEquipe?: boolean
  linkDriveMateriais?: string

  // Seção 5 — Processo de aprovação
  canalAprovacao?: ApprovalChannel
  prazoAprovacao?: string
  responsavelAprovacao?: string

  // Seção 6 — Observações gerais
  observacoesGerais?: string

  /** @deprecated não é mais exibido no formulário reformulado; mantido para
   *  não perder o valor de briefings antigos. */
  dataInicio?: Timestamp | null
  preenchidoPor?: string
  filledAt?: Timestamp | null
}

export interface Client extends BaseDoc {
  companyName: string
  /** @deprecated the client form no longer collects this — kept only so
   *  older docs still display it until they're re-saved. */
  contactName?: string
  whatsapp?: string
  email?: string
  instagram?: string
  facebook?: string
  website?: string
  city?: string
  segment?: string
  /** CNPJ ou CPF, digits or formatted — free text, no mask enforced. */
  document?: string
  status: ClientStatus
  /** Classificação A/B (ver ClientCategory). */
  categoria?: ClientCategory
  package?: ClientPackage
  styleCatalog?: StyleCatalog
  /** @deprecated superseded by `ownerIds` (multi-owner). Kept so older docs
   *  still resolve an owner until they're re-saved through the form. */
  ownerId?: string
  /** uids of the internal team members who own this account (e.g. co-owned by
   *  a Social Media and a Tráfego Pago manager). */
  ownerIds?: string[]
  /** Monthly contract value in BRL. */
  monthlyValue?: number
  contractStartDate?: Timestamp | null
  notes?: string
  /** URL pública da logo no Firebase Storage (clients/{id}/logo/logo).
   *  `null` = removida explicitamente. */
  logoUrl?: string | null
  /** Briefing de Social Media. */
  briefing?: ClientBriefing
  /** Briefing de Tráfego Pago — separate schema, shown as a sub-tab of
   *  "Briefing" alongside the Social Media one (see paidTrafficBriefing.ts). */
  paidTrafficBriefing?: PaidTrafficBriefing
  /** Planejamento de Campanha — preenchido pelos gestores. Inclui os acessos
   *  das contas (site, Meta, Google...) como sua primeira seção (ver
   *  campaignPlanning.ts). */
  campaignPlanning?: CampaignPlanning
  /** Funil Comercial — captação até fechamento, com métricas financeiras e
   *  benchmarks de mercado (ver salesFunnel.ts). */
  salesFunnel?: SalesFunnel
  /** Which services this client has contracted — also drives which onboarding
   *  task templates get created (see clientWorkflowTemplates.ts). */
  modules?: {
    socialMedia?: boolean
    paidTraffic?: boolean
    googleAds?: boolean
    metaAds?: boolean
    leads?: boolean
    reports?: boolean
    finance?: boolean
  }
}

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  active: 'Ativo',
  paused: 'Pausado',
  churned: 'Encerrado',
  prospect: 'Onboarding',
}

export const CLIENT_CATEGORY_LABEL: Record<ClientCategory, string> = {
  A: 'Cliente A',
  B: 'Cliente B',
}

/** Classes de badge por categoria — A dourado, B cinza. */
export const CLIENT_CATEGORY_BADGE: Record<ClientCategory, string> = {
  A: 'bg-amber-100 text-amber-700',
  B: 'bg-slate-100 text-slate-600',
}

export const CLIENT_PACKAGE_LABEL: Record<ClientPackage, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal (30 dias)',
}

export const STYLE_CATALOG_LABEL: Record<StyleCatalog, string> = {
  1: 'Catálogo 1 — Profissional / Sóbrio',
  2: 'Catálogo 2 — Moderno / Vibrante',
  3: 'Catálogo 3 — Premium / Alto Padrão',
}

export const STYLE_CATALOG_DESCRIPTION: Record<StyleCatalog, string> = {
  1: 'Cores neutras, tipografia limpa, tom corporativo. Ideal para B2B, facilities, condomínios.',
  2: 'Cores vivas, dinâmico, forte uso de vídeo. Ideal para limpeza residencial, pós-obra, público jovem.',
  3: 'Visual minimalista, fotografia de qualidade, tom aspiracional. Ideal para alto padrão e tickets elevados.',
}

export const CLIENT_AUDIENCE_LABEL: Record<ClientAudience, string> = {
  residencial: 'Residencial',
  comercial: 'Comercial',
  ambos: 'Ambos',
}

/** Resolves owner uids for a client, falling back to the legacy single
 *  `ownerId` for docs saved before multi-owner support existed. */
export function getClientOwnerIds(client: Pick<Client, 'ownerIds' | 'ownerId'>): string[] {
  if (client.ownerIds && client.ownerIds.length > 0) return client.ownerIds
  return client.ownerId ? [client.ownerId] : []
}

export const APPROVAL_CHANNEL_LABEL: Record<ApprovalChannel, string> = {
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  drive: 'Google Drive',
  outro: 'Outro',
}
