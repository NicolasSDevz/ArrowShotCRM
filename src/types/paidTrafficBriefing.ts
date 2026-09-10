import type { Timestamp } from 'firebase/firestore'

/** One person tied to a responsibility role (seção 1). A role can have more
 *  than one contact (ex: dois sócios) — the first one is always shown, extra
 *  ones only appear via "Adicionar outro". */
export interface BriefingContact {
  id: string
  name: string
  email: string
  /** Máscara (00) 00000-0000 — usado no lembrete de aniversário (wa.me). */
  whatsapp?: string
  birthday?: Timestamp | null
}

function emptyContact(): BriefingContact {
  return { id: crypto.randomUUID(), name: '', email: '', whatsapp: '', birthday: null }
}

export type CreditCardForAds = 'sim' | 'nao' | 'boleto'

export const CREDIT_CARD_FOR_ADS_LABEL: Record<CreditCardForAds, string> = {
  sim: 'Sim',
  nao: 'Não',
  boleto: 'Paga por boleto',
}

/** Briefing de Tráfego Pago — filled by CS during or right after the kickoff
 *  call. Empresa/CNPJ/site/redes já ficam no cadastro do cliente (Client) e
 *  Acessos vive dentro do Planejamento de Campanha (preenchido pelos
 *  gestores), então nenhum dos dois se repete aqui. */
export interface PaidTrafficBriefing {
  /** Who last saved it — set automatically from the logged-in user, not a
   *  field the person filling it out picks. */
  preenchidoPor?: string
  filledAt?: Timestamp | null

  // Seção 1 — Responsáveis
  socios: BriefingContact[]
  decisores: BriefingContact[]
  aprovadoresCampanhas: BriefingContact[]
  financeiro: BriefingContact[]
  marketing: BriefingContact[]
  comercial: BriefingContact[]

  // Seção 2 — Comercial
  estruturaTime?: string
  processoVendas?: string
  sistemaGestaoLeads?: string
  cicloVenda?: string
  canalQueMaisVende?: string
  tempoDeMercado?: string
  percepcaoMercado?: string
  desafiosAtuais?: string
  /** Puxado automaticamente pelo Planejamento de Campanha (Seção 4 —
   *  Público-alvo). */
  objecaoComum?: string

  // Seção 3 — Marketing
  resultadoEsperado?: string
  mesesMaisFortes?: string
  mesesMaisFracos?: string
  ticketMedio?: number
  faturamentoMensal?: number
  formasPagamento?: string
  cartaoCreditoAnuncios?: CreditCardForAds

  // Seção 4 — ICP B2C
  b2cGenero?: string
  b2cEstadoCivilFilhos?: string
  b2cFaixaEtaria?: string
  b2cEscolaridadeProfissao?: string
  b2cRegiao?: string
  b2cDorPrincipal?: string
  b2cSolucoesTentadas?: string

  // Seção 5 — ICP B2B
  b2bSetor?: string
  b2bFaturamentoMinimo?: number
  b2bQuantidadeFuncionarios?: string
  b2bCargoDecisor?: string
  b2bLocalizacao?: string

  // Seção 6 — Observações gerais
  observacoes?: string
}

export const EMPTY_PAID_TRAFFIC_BRIEFING: PaidTrafficBriefing = {
  socios: [emptyContact()],
  decisores: [emptyContact()],
  aprovadoresCampanhas: [emptyContact()],
  financeiro: [emptyContact()],
  marketing: [emptyContact()],
  comercial: [emptyContact()],
}
