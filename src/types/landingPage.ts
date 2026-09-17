import type { Timestamp } from 'firebase/firestore'
import type { ChecklistItem } from './task'

export type LandingPageType = 'complete' | 'optimization' | 'form_integration' | 'pixel_tracking'

export const LANDING_PAGE_TYPE_LABEL: Record<LandingPageType, string> = {
  complete: 'Landing Page completa (do zero)',
  optimization: 'Otimização de LP existente',
  form_integration: 'LP + Integração com formulário',
  pixel_tracking: 'LP + Pixel de rastreamento',
}

export type LandingPagePlatform = 'wordpress' | 'elementor' | 'webflow' | 'rd_station' | 'leadlovers' | 'html' | 'outra'

export const LANDING_PAGE_PLATFORM_LABEL: Record<LandingPagePlatform, string> = {
  wordpress: 'WordPress',
  elementor: 'Elementor',
  webflow: 'Webflow',
  rd_station: 'RD Station',
  leadlovers: 'Leadlovers',
  html: 'HTML puro',
  outra: 'Outra',
}

export type LandingPageStatus = 'em_desenvolvimento' | 'em_revisao' | 'aguardando_aprovacao' | 'publicada' | 'em_otimizacao'

export const LANDING_PAGE_STATUS_LABEL: Record<LandingPageStatus, string> = {
  em_desenvolvimento: 'Em desenvolvimento',
  em_revisao: 'Em revisão',
  aguardando_aprovacao: 'Aguardando aprovação',
  publicada: 'Publicada',
  em_otimizacao: 'Em otimização',
}

/** Os 9 itens fixos do checklist de entrega — não são adicionáveis/removíveis
 *  pelo usuário (diferente do ChecklistEditor de tarefas). */
export const LANDING_PAGE_CHECKLIST_ITEMS: string[] = [
  'Briefing de LP realizado',
  'Layout aprovado pelo cliente',
  'Desenvolvimento concluído',
  'Pixel instalado e testado',
  'Formulário integrado e testado',
  'Versão mobile revisada',
  'Velocidade de carregamento verificada',
  'LP publicada e link enviado ao cliente',
  'LP vinculada às campanhas de tráfego',
]

function toChecklist(items: string[]): ChecklistItem[] {
  return items.map((text) => ({ id: crypto.randomUUID(), text, done: false }))
}

/** Aba "Landing Page" da ficha do cliente — mesmo padrão de CampaignPlanning
 *  (preenchidoPor/filledAt stampado a cada Salvar). */
export interface LandingPage {
  preenchidoPor?: string
  filledAt?: Timestamp | null

  // Seção 1 — Informações da LP
  url?: string
  platform?: LandingPagePlatform
  expectedDeliveryDate?: Timestamp | null
  actualDeliveryDate?: Timestamp | null
  status: LandingPageStatus

  // Seção 2 — Acesso à hospedagem
  hostingPlatform?: string
  panelUrl?: string
  login?: string
  accessNotes?: string

  // Seção 3 — Checklist de entrega
  checklist: ChecklistItem[]

  // Seção 4 — Observações
  observations?: string
}

export const EMPTY_LANDING_PAGE: LandingPage = {
  status: 'em_desenvolvimento',
  checklist: toChecklist(LANDING_PAGE_CHECKLIST_ITEMS),
}
