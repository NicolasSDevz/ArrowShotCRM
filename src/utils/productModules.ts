import type { Product, ProductModuleKey } from '../types/product'

export const PRODUCT_MODULE_LABEL: Record<ProductModuleKey, string> = {
  socialMedia: 'Social Mídia',
  paidTraffic: 'Tráfego Pago (plataforma escolhida em cada cliente)',
  metaAds: 'Tráfego Pago — Meta Ads',
  googleAds: 'Tráfego Pago — Google Ads',
  landingPage: 'Landing Page',
}

/** Rótulo curto pra badges/resumos. */
export const PRODUCT_MODULE_SHORT: Record<ProductModuleKey, string> = {
  socialMedia: 'Social Mídia',
  paidTraffic: 'Tráfego Pago',
  metaAds: 'Meta Ads',
  googleAds: 'Google Ads',
  landingPage: 'Landing Page',
}

export const PRODUCT_MODULE_KEYS: ProductModuleKey[] = ['socialMedia', 'paidTraffic', 'metaAds', 'googleAds', 'landingPage']

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Sugestão a partir do NOME do serviço — só serve pra produtos antigos, que
 *  ainda não foram ligados a uma área do CRM pelo admin (ver
 *  ProductFormModal). Ex: "Gestão de Tráfego Pago" → tráfego pago;
 *  "Google Meu Negócio" NÃO vira Google Ads. */
export function inferProductModules(name: string): ProductModuleKey[] {
  const n = strip(name)
  const out: ProductModuleKey[] = []
  if (/social|redes sociais|instagram|conteudo/.test(n)) out.push('socialMedia')
  if (/landing|pagina de vendas|pagina de venda|\bsite\b/.test(n)) out.push('landingPage')
  const meta = /\bmeta\b|facebook/.test(n)
  const google = /google/.test(n) && /ads|anuncio|adwords|pesquisa/.test(n)
  if (meta) out.push('metaAds')
  if (google) out.push('googleAds')
  if (!meta && !google && /trafego|anuncio|\bads\b/.test(n)) out.push('paidTraffic')
  return out
}

export interface ProductModules {
  keys: ProductModuleKey[]
  /** true = veio do nome (sugestão), não de uma configuração do admin. */
  inferred: boolean
}

export function productModules(p: Pick<Product, 'name' | 'activates'>): ProductModules {
  if (p.activates) return { keys: p.activates, inferred: false }
  return { keys: inferProductModules(p.name), inferred: true }
}

/** Flags de `client.modules` que um conjunto de produtos liga. Tráfego pago
 *  fica ligado por qualquer uma das três chaves de tráfego. */
export interface DerivedModules {
  socialMedia: boolean
  paidTraffic: boolean
  metaAds: boolean
  googleAds: boolean
  landingPage: boolean
}

export function modulesFromProducts(products: Pick<Product, 'name' | 'activates'>[]): DerivedModules {
  const keys = new Set(products.flatMap((p) => productModules(p).keys))
  const metaAds = keys.has('metaAds')
  const googleAds = keys.has('googleAds')
  return {
    socialMedia: keys.has('socialMedia'),
    paidTraffic: keys.has('paidTraffic') || metaAds || googleAds,
    metaAds,
    googleAds,
    landingPage: keys.has('landingPage'),
  }
}

/** Tráfego pago ligado mas sem plataforma definida pelos produtos — o
 *  cadastro do cliente precisa perguntar Meta / Google. */
export function needsPlatformChoice(m: DerivedModules): boolean {
  return m.paidTraffic && !m.metaAds && !m.googleAds
}

export interface ManualServiceFlags {
  socialMedia: boolean
  paidTraffic: boolean
  metaAds: boolean
  googleAds: boolean
  landingPage: boolean
}

export interface ResolvedServices extends DerivedModules {
  /** Módulos ligados pelos produtos escolhidos (sem as flags manuais). */
  derived: DerivedModules
  /** Os produtos já definem Meta e/ou Google. */
  platformFromProducts: boolean
  /** Tráfego pago ligado sem plataforma definida pelos produtos: precisa
   *  perguntar (Meta / Google) no cadastro. */
  showPlatformPicker: boolean
  /** Tráfego pago ligado e nenhuma plataforma escolhida ainda. */
  platformMissing: boolean
}

/** Junta o que os produtos do catálogo ligam com as flags manuais do
 *  cadastro. As flags manuais só valem pra serviços que o registro já tinha
 *  SEM um produto do catálogo (cadastro antigo) ou pro modo manual com o
 *  catálogo vazio — `origCovered` são os módulos que os produtos JÁ salvos
 *  no registro cobriam (desmarcar o produto deve desligar o módulo, não
 *  deixar a flag antiga segurando). */
export function resolveServices(
  catalog: Pick<Product, 'id' | 'name' | 'activates'>[],
  selectedIds: string[],
  manual: ManualServiceFlags,
  origCovered: DerivedModules
): ResolvedServices {
  const derived = modulesFromProducts(catalog.filter((p) => selectedIds.includes(p.id)))
  const own = (k: 'socialMedia' | 'landingPage' | 'paidTraffic') => manual[k] && !origCovered[k]
  const socialMedia = derived.socialMedia || own('socialMedia')
  const landingPage = derived.landingPage || own('landingPage')
  const paidTraffic = derived.paidTraffic || own('paidTraffic')
  const platformFromProducts = derived.metaAds || derived.googleAds
  const metaAds = paidTraffic && (derived.metaAds || (!platformFromProducts && manual.metaAds))
  const googleAds = paidTraffic && (derived.googleAds || (!platformFromProducts && manual.googleAds))
  return {
    derived,
    socialMedia,
    landingPage,
    paidTraffic,
    metaAds,
    googleAds,
    platformFromProducts,
    showPlatformPicker: paidTraffic && !platformFromProducts,
    platformMissing: paidTraffic && !metaAds && !googleAds,
  }
}
