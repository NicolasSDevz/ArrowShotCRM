import type { ClientServiceContract } from '../types/client'
import type { DiscountType, Product, ProductDiscount } from '../types/product'

export function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function discountLabel(d: { type: DiscountType; value: number }): string {
  return d.type === 'percent' ? `${d.value.toLocaleString('pt-BR')}%` : formatBRL(d.value)
}

/** Preço de tabela: o do nível escolhido (se ele tem preço) ou o do produto. */
export function basePrice(product: Pick<Product, 'price' | 'tiers'>, tierId?: string | null): number | undefined {
  const tier = tierId ? product.tiers?.find((t) => t.id === tierId) : undefined
  return tier?.price ?? product.price
}

/** Menor preço entre o do produto e o dos níveis — pro "a partir de". */
export function lowestPrice(product: Pick<Product, 'price' | 'tiers'>): number | undefined {
  const prices = [product.price, ...(product.tiers ?? []).map((t) => t.price)].filter((p): p is number => typeof p === 'number')
  return prices.length > 0 ? Math.min(...prices) : undefined
}

/** Aplica um desconto (% ou R$) sem nunca passar de 100% nem deixar negativo. */
export function applyDiscount(price: number, d?: { type: DiscountType; value: number } | null): number {
  if (!d || !(d.value > 0)) return price
  const off = d.type === 'percent' ? price * (Math.min(d.value, 100) / 100) : Math.min(d.value, price)
  return Math.round((price - off) * 100) / 100
}

/** Desconto que vale pra um contrato: o personalizado tem prioridade sobre o do catálogo. */
export function contractDiscount(
  product: Pick<Product, 'discounts'>,
  c: Pick<ClientServiceContract, 'discountId' | 'customDiscount'>
): { type: DiscountType; value: number; name?: string } | undefined {
  if (c.customDiscount && c.customDiscount.value > 0) return c.customDiscount
  const found: ProductDiscount | undefined = c.discountId ? product.discounts?.find((d) => d.id === c.discountId) : undefined
  return found
}

/** Valor calculado (tabela − desconto), sem considerar preço manual. */
export function computedPrice(product: Pick<Product, 'price' | 'tiers' | 'discounts'>, c: Pick<ClientServiceContract, 'tierId' | 'discountId' | 'customDiscount'>): number | undefined {
  const base = basePrice(product, c.tierId)
  if (base == null) return undefined
  return applyDiscount(base, contractDiscount(product, c))
}

/** Valor mensal que esse cliente paga por esse serviço: o preço combinado
 *  na mão (`finalPrice`) ou, sem ele, o calculado. */
export function contractFinalPrice(product: Pick<Product, 'price' | 'tiers' | 'discounts'>, c: ClientServiceContract): number | undefined {
  return c.finalPrice ?? computedPrice(product, c)
}
