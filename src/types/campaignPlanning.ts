import type { Timestamp } from 'firebase/firestore'

/** Seção 1 — Acessos das contas. Só o essencial: links, IDs e checklists de
 *  configuração — nunca login/senha, e sem status "confirmado?" avulsos. */
export interface CampaignPlanningAccess {
  siteUrl?: string

  instagramLink?: string

  gtmContainerCriado?: boolean
  gtmInstaladoNoSite?: boolean
  gtmRastreamentoCompleto?: boolean

  gmbConfigurado?: boolean

  /** Máscara (00) 00000-0000, ver utils/masks.ts. */
  whatsappNumero?: string

  linkDrive?: string

  /** Encontrado em Meta Business Suite → Gerenciador de Anúncios → ID da
   *  conta (aceita com ou sem o prefixo "act_" — o backend normaliza).
   *  Obrigatório para gerar relatórios automáticos do Meta Ads deste
   *  cliente (ver módulo de Relatórios). */
  metaAdsAccountId?: string
}

export const EMPTY_CAMPAIGN_PLANNING_ACCESS: CampaignPlanningAccess = {}

export type MetaFunnelStage = 'topo' | 'meio' | 'fundo'

export const META_FUNNEL_STAGE_LABEL: Record<MetaFunnelStage, string> = {
  topo: 'Topo (Frio)',
  meio: 'Meio (Morno)',
  fundo: 'Fundo (Quente)',
}

export type MetaObjective = 'alcance' | 'video_view' | 'envolvimento' | 'trafego' | 'mensagens' | 'vendas' | 'geracao_cadastro'

export const META_OBJECTIVE_LABEL: Record<MetaObjective, string> = {
  alcance: 'Alcance',
  video_view: 'Video View',
  envolvimento: 'Envolvimento',
  trafego: 'Tráfego',
  mensagens: 'Mensagens',
  vendas: 'Vendas',
  geracao_cadastro: 'Geração de Cadastro',
}

export interface MetaCampaignItem {
  id: string
  etapaFunil?: MetaFunnelStage
  nomeCampanha?: string
  descricao?: string
  objetivo?: MetaObjective
  publicos?: string
  /** Nome do conjunto de anúncios (ad set) desta campanha. */
  nomeConjunto?: string
  /** Quantos conjuntos de anúncios essa campanha terá. */
  qtdConjuntos?: number
  /** Quantos anúncios no total essa campanha terá. */
  qtdAnuncios?: number
  verbaDiaria?: number
  dataCriacao?: Timestamp | null
  observacoes?: string
}

/** Seção 2 — Planejamento Meta Ads, baseado na planilha de planejamento
 *  Facebook da agência. Verba diária e verba por etapa do funil são sempre
 *  calculadas a partir de verbaMensal/diasDoMes/percentuais — nunca
 *  persistidas, para nunca ficarem dessincronizadas. */
export interface MetaAdsPlanning {
  verbaMensal?: number
  diasDoMes?: number
  distribuicaoTopoPercent?: number
  distribuicaoMeioPercent?: number
  distribuicaoFundoPercent?: number
  campanhas: MetaCampaignItem[]
  maxConjuntosAnuncios?: number
  /** Cidades desejadas para segmentação — uma por linha, bairro entre parênteses se houver. */
  cidadesDesejadas?: string
  /** Cidades que o cliente pediu para excluir da segmentação — uma por linha. */
  cidadesExcluidas?: string
  /** Interesses/palavras-chave positivos usados na segmentação — um por linha. */
  palavrasChavePositivas?: string
  /** Interesses/palavras-chave negativos (a evitar) — um por linha. */
  palavrasChaveNegativas?: string
}

export const EMPTY_META_ADS_PLANNING: MetaAdsPlanning = { diasDoMes: 30, campanhas: [] }

export type GoogleAdsNetwork = 'search' | 'display' | 'performance_max' | 'youtube'

export const GOOGLE_ADS_NETWORK_LABEL: Record<GoogleAdsNetwork, string> = {
  search: 'Search',
  display: 'Display',
  performance_max: 'Performance Max',
  youtube: 'YouTube',
}

export type GoogleBidType = 'auto_cliques' | 'auto_conversoes' | 'auto_valor_conversao' | 'manual_cpc'

export const GOOGLE_BID_TYPE_LABEL: Record<GoogleBidType, string> = {
  auto_cliques: 'Automático — Cliques',
  auto_conversoes: 'Automático — Conversões',
  auto_valor_conversao: 'Automático — Valor da conversão',
  manual_cpc: 'Manual CPC',
}

export interface GoogleCampaignItem {
  id: string
  rede?: GoogleAdsNetwork
  nomeCampanha?: string
  gruposAnuncios?: string
  /** Quantos grupos de anúncios essa campanha terá. */
  qtdGrupos?: number
  /** Quantos anúncios no total essa campanha terá. */
  qtdAnuncios?: number
  tipoLance?: GoogleBidType
  verbaDiaria?: number
  observacoes?: string
}

/** Seção 3 — Planejamento Google Ads, baseado na planilha de planejamento
 *  Google da agência. */
export interface GoogleAdsPlanning {
  verbaMensal?: number
  diasDoMes?: number
  campanhas: GoogleCampaignItem[]
  /** Uma palavra-chave por linha. */
  palavrasChavePositivas?: string
  palavrasChaveNegativas?: string
  /** Cidades desejadas para segmentação — uma por linha, bairro entre parênteses se houver. */
  cidadesDesejadas?: string
  /** Cidades que o cliente pediu para excluir da segmentação — uma por linha. */
  cidadesExcluidas?: string
}

export const EMPTY_GOOGLE_ADS_PLANNING: GoogleAdsPlanning = { diasDoMes: 30, campanhas: [] }

/** Aba "Planejamento de Campanha" — preenchida pelos gestores (Ciane e
 *  Nicolas), separada do Briefing de Tráfego Pago (preenchido pelo CS). A
 *  Seção 4 (Público-alvo) não é preenchida aqui — é só leitura, puxada do
 *  Briefing de Tráfego Pago já salvo (ver ClientCampaignPlanningPanel). */
export interface CampaignPlanning {
  /** Who last saved it — set automatically from the logged-in user. */
  preenchidoPor?: string
  filledAt?: Timestamp | null

  // Seção 1 — Acessos das contas
  acessos: CampaignPlanningAccess

  // Seção 2 — Planejamento Meta Ads
  metaAds: MetaAdsPlanning

  // Seção 3 — Planejamento Google Ads
  googleAds: GoogleAdsPlanning

  // Seção 5 — Observações gerais
  observacoesGerais?: string
}

export const EMPTY_CAMPAIGN_PLANNING: CampaignPlanning = {
  acessos: EMPTY_CAMPAIGN_PLANNING_ACCESS,
  metaAds: EMPTY_META_ADS_PLANNING,
  googleAds: EMPTY_GOOGLE_ADS_PLANNING,
}
