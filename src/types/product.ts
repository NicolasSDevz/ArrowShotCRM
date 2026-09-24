import type { BaseDoc } from './common'

/** Áreas do CRM que um serviço do catálogo liga no cliente (abas, tarefas de
 *  onboarding, planejamento). `paidTraffic` = tráfego pago com a plataforma
 *  (Meta/Google) escolhida em cada cliente. */
export type ProductModuleKey = 'socialMedia' | 'paidTraffic' | 'metaAds' | 'googleAds' | 'landingPage'

/** Catálogo de Produtos e Serviços — tabela de preços da agência, mostrada no
 *  Dashboard pra qualquer interno consultar. Só o Admin (Bruno) edita preço/
 *  descrição/bônus (ver firestore.rules — mesma convenção de `trails`/
 *  `modules`, onde "Admin" na prática é sempre o Bruno). */
/** Um nível do mesmo serviço (ex: Básico / Intermediário / Premium), cada um
 *  com seu preço. */
export interface ProductTier {
  id: string
  name: string
  price?: number
  description?: string
}

export type DiscountType = 'percent' | 'fixed'

/** Desconto que o admin deixa pronto pra um serviço (ex: "Pagamento à vista
 *  — 10%", "Indicação — R$ 100"). */
export interface ProductDiscount {
  id: string
  name: string
  type: DiscountType
  value: number
}

export interface Product extends BaseDoc {
  name: string
  price?: number
  /** Texto livre pra "sob consulta", "a partir de", etc — mostrado no lugar
   *  do preço quando não há um valor fixo. Se `price` também estiver
   *  preenchido, os dois aparecem juntos ("R$ 500 " + priceNote). */
  priceNote?: string
  description?: string
  /** Um bônus por item — ex: "Relatório mensal grátis", "Setup sem custo". */
  bonuses: string[]
  /** Permite tirar de circulação sem apagar o histórico/preço já combinado
   *  com clientes antigos. Itens inativos ficam ocultos por padrão. */
  active: boolean
  order: number
  /** O que contratar esse serviço liga no CRM. Sem valor = produto antigo:
   *  o CRM sugere pelo nome (ver utils/productModules) até o admin configurar. */
  activates?: ProductModuleKey[]
  /** Níveis do serviço, cada um com preço próprio (opcional). */
  tiers?: ProductTier[]
  /** Descontos disponíveis pra esse serviço. */
  discounts?: ProductDiscount[]
}

export const EMPTY_PRODUCT: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'> = {
  name: '',
  bonuses: [],
  active: true,
  order: 0,
}
