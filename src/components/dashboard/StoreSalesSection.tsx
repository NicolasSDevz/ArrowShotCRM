import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { useStoreAbandoned, useStoreOrders, useStoreProducts } from '../../hooks/useStore'
import { StoreOverview } from '../store/admin/StoreOverview'
import { STORE_BRAND } from '../../config/storeBrand'

/** Vendas da Loja (produtos digitais) dentro do Dashboard: os mesmos números
 *  da Visão geral da Loja. Só renderizar para admin/gerente (as regras do
 *  Firestore negam a leitura para os outros). */
export function StoreSalesSection() {
  const { data: products } = useStoreProducts()
  const { data: orders } = useStoreOrders()
  const { data: abandoned } = useStoreAbandoned()

  return (
    <section className="flex flex-col gap-3" aria-labelledby="dash-loja">
      <StoreOverview
        orders={orders}
        products={products}
        abandoned={abandoned}
        title={
          <span id="dash-loja" className="flex items-center gap-3">
            Vendas da {STORE_BRAND}
            <Link to="/loja" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
              Abrir a {STORE_BRAND} <ExternalLink size={12} aria-hidden="true" />
            </Link>
          </span>
        }
      />
    </section>
  )
}
