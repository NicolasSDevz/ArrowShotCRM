import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AlertTriangle, Clock, CreditCard, Filter, MousePointerClick, RefreshCw, Smartphone, TrendingDown } from 'lucide-react'
import { Select } from '../../ui/Field'
import { fetchStoreFunnel } from '../../../services/storeApi'
import type { StoreCheckoutVisit, StoreOrder, StoreProduct } from '../../../types/store'

/** Nomes que aparecem pra equipe (data-funnel do CheckoutView). */
const FIELD_LABEL: Record<string, string> = {
  nome: 'Nome',
  email: 'E-mail',
  email2: 'Confirmar e-mail',
  cpf: 'CPF/CNPJ',
  telefone: 'Celular',
  cupom: 'Cupom',
  bump: 'Order bump',
  pagamento: 'Escolha do pagamento',
  cartao: 'Dados do cartão',
}

const STEPS = [
  { key: 1, label: 'Abriram o checkout', lost: 'Saíram sem tocar em nada' },
  { key: 2, label: 'Começaram a preencher', lost: 'Começaram e não terminaram os dados' },
  { key: 3, label: 'Preencheram os dados', lost: 'Preencheram tudo e não clicaram em pagar' },
  { key: 4, label: 'Clicaram em pagar', lost: 'Clicaram em pagar e não saiu o pedido (erro na tela)' },
  { key: 5, label: 'Geraram o pedido', lost: 'Geraram Pix ou tentaram cartão e não pagaram' },
  { key: 6, label: 'Pagaram', lost: '' },
]

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function minutes(sec: number) {
  if (!sec) return '–'
  if (sec < 60) return `${sec} s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s ? `${m} min ${s} s` : `${m} min`
}

function median(list: number[]) {
  const xs = list.filter((x) => x > 0).sort((a, b) => a - b)
  if (!xs.length) return 0
  return xs[Math.floor(xs.length / 2)]
}

function Card({ icon, title, children, hint }: { icon: ReactNode; title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold text-slate-800">
        <span className="text-brand-600" aria-hidden="true">{icon}</span> {title}
      </h3>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Bars({ rows, empty }: { rows: { label: string; value: number; note?: string }[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-slate-400">{empty}</p>
  const top = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium text-slate-700">{r.label}</span>
            <span className="shrink-0 text-slate-500">
              <b className="font-semibold text-slate-800">{r.value}</b>
              {r.note ? ` · ${r.note}` : ''}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.max(4, Math.round((r.value / top) * 100))}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Funil do checkout: em que etapa a galera desiste (Loja > Funil). */
export function StoreFunnelPanel({ orders, products }: { orders: StoreOrder[]; products: StoreProduct[] }) {
  const [days, setDays] = useState(30)
  const [productId, setProductId] = useState('')
  const [device, setDevice] = useState<'' | 'mobile' | 'desktop'>('')
  const [visits, setVisits] = useState<StoreCheckoutVisit[] | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    setError('')
    fetchStoreFunnel(days)
      .then((r) => alive && setVisits(r.visits))
      .catch((err: Error) => alive && setError(err.message))
    return () => {
      alive = false
    }
  }, [days, reload])

  const orderById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders])

  const stats = useMemo(() => {
    const list = (visits ?? []).filter((v) => (!productId || v.productId === productId) && (!device || v.device === device))
    // Etapa final de cada visita (6 = pagou, pelo status do pedido).
    const rows = list.map((v) => {
      const order = v.orderId ? orderById.get(v.orderId) : undefined
      const paid = order?.status === 'approved' || order?.status === 'refunded'
      return { v, order, final: paid ? 6 : Math.max(1, Math.min(5, v.step || 1)) }
    })
    const reached = STEPS.map((s) => rows.filter((r) => r.final >= s.key).length)
    const stoppedAt = STEPS.map((s) => rows.filter((r) => r.final === s.key).length)

    // Maior perda entre uma etapa e a próxima.
    let worst = -1
    for (let i = 0; i < STEPS.length - 1; i++) if (worst < 0 || stoppedAt[i] > stoppedAt[worst]) worst = i

    // Começou a preencher e parou: em qual campo estava.
    const fieldCount = new Map<string, number>()
    for (const r of rows.filter((x) => x.final === 2)) {
      const f = r.v.lastField || 'nome'
      fieldCount.set(f, (fieldCount.get(f) || 0) + 1)
    }
    const fieldsStop = [...fieldCount.entries()]
      .map(([k, value]) => ({ label: FIELD_LABEL[k] || k, value, note: `${pct(value, stoppedAt[1])}%` }))
      .sort((a, b) => b.value - a.value)

    // Clicou em pagar e travou numa mensagem de erro.
    const errCount = new Map<string, number>()
    for (const r of rows.filter((x) => x.final === 4)) {
      const e = r.v.error || 'Sem erro na tela (saiu antes de terminar)'
      errCount.set(e, (errCount.get(e) || 0) + 1)
    }
    const errors = [...errCount.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)

    // Pedido gerado e não pago.
    const unpaid = rows.filter((x) => x.final === 5)
    const pixOpen = unpaid.filter((x) => x.order && x.order.method !== 'card' && x.order.status === 'pending').length
    const cardRefused = unpaid.filter((x) => x.order?.status === 'refused').length
    const otherUnpaid = unpaid.length - pixOpen - cardRefused

    // Celular x computador e origem.
    const conv = (subset: typeof rows) => ({ total: subset.length, paid: subset.filter((x) => x.final === 6).length })
    const byDevice = (['mobile', 'desktop'] as const).map((d) => ({ d, ...conv(rows.filter((x) => x.v.device === d)) }))
    const sourceMap = new Map<string, typeof rows>()
    for (const r of rows) {
      const k = r.v.source || 'direto'
      sourceMap.set(k, [...(sourceMap.get(k) || []), r])
    }
    const bySource = [...sourceMap.entries()]
      .map(([label, s]) => ({ label, ...conv(s) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)

    const timeQuit = median(rows.filter((x) => x.final < 6).map((x) => x.v.seconds || 0))
    const timeBuy = median(rows.filter((x) => x.final === 6).map((x) => x.v.seconds || 0))

    return { total: rows.length, reached, stoppedAt, worst, fieldsStop, errors, pixOpen, cardRefused, otherUnpaid, byDevice, bySource, timeQuit, timeBuy }
  }, [visits, productId, device, orderById])

  const visibleProducts = products.filter((p) => p.status !== 'archived')

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-800">Funil do checkout</h2>
          <p className="text-sm text-slate-500">Até onde cada pessoa chegou na página de pagamento antes de desistir.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Período" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={1}>Últimas 24 horas</option>
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </Select>
          <Select aria-label="Produto" value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Todos os produtos</option>
            {visibleProducts.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
          <Select aria-label="Aparelho" value={device} onChange={(e) => setDevice(e.target.value as typeof device)}>
            <option value="">Celular e computador</option>
            <option value="mobile">Só celular</option>
            <option value="desktop">Só computador</option>
          </Select>
          <button
            type="button"
            onClick={() => setReload((n) => n + 1)}
            className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={15} aria-hidden="true" /> Atualizar
          </button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {visits === null && !error ? (
        <p className="text-sm text-slate-400" aria-live="polite">Carregando o funil...</p>
      ) : stats.total === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <Filter size={24} className="mx-auto text-slate-300" aria-hidden="true" />
          <p className="mt-2 font-medium text-slate-700">Nenhuma visita ao checkout no período.</p>
          <p className="mt-1 text-sm text-slate-500">O registro começou em 23/10/2026. A partir de agora, cada pessoa que abrir o link de pagamento aparece aqui.</p>
        </div>
      ) : (
        <>
          {stats.worst >= 0 && stats.stoppedAt[stats.worst] > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4" role="status">
              <TrendingDown size={20} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
              <p className="text-sm text-amber-900">
                <b>Onde mais gente desiste:</b> {STEPS[stats.worst].lost.toLowerCase()}. Foram {plural(stats.stoppedAt[stats.worst], 'pessoa', 'pessoas')} ({pct(stats.stoppedAt[stats.worst], stats.total)}% de quem abriu).
              </p>
            </div>
          )}

          {/* Funil */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby="funil-titulo">
            <h3 id="funil-titulo" className="flex items-center gap-2 text-[15px] font-semibold text-slate-800">
              <Filter size={16} className="text-brand-600" aria-hidden="true" /> Etapas
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">{plural(stats.total, 'visita', 'visitas')} ao checkout. A porcentagem é sobre quem abriu.</p>
            <ol className="mt-4 space-y-3">
              {STEPS.map((s, i) => {
                const n = stats.reached[i]
                const lost = stats.stoppedAt[i]
                const isWorst = i === stats.worst && lost > 0
                return (
                  <li key={s.key}>
                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                      <span className="font-medium text-slate-700">{i + 1}. {s.label}</span>
                      <span className="text-slate-500">
                        <b className="font-semibold text-slate-800">{n}</b> · {pct(n, stats.total)}%
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                      <div className={`h-full rounded-full ${s.key === 6 ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${Math.max(n ? 2 : 0, pct(n, stats.total))}%` }} />
                    </div>
                    {s.lost && lost > 0 && (
                      <p className={`mt-1 text-xs ${isWorst ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>
                        {isWorst ? 'Maior perda: ' : ''}
                        {plural(lost, 'parou', 'pararam')} aqui ({s.lost.toLowerCase()})
                      </p>
                    )}
                  </li>
                )
              })}
            </ol>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card icon={<MousePointerClick size={16} />} title="Em qual campo pararam" hint="Quem começou a preencher e foi embora: o último campo em que mexeu.">
              <Bars rows={stats.fieldsStop} empty="Ninguém parou no meio do formulário." />
            </Card>

            <Card icon={<AlertTriangle size={16} />} title="Erro ao clicar em pagar" hint="Mensagem que apareceu na tela de quem clicou em pagar e não gerou o pedido.">
              <Bars rows={stats.errors} empty="Nenhum travou com erro." />
            </Card>

            <Card icon={<CreditCard size={16} />} title="Gerou o pedido e não pagou">
              <Bars
                rows={[
                  { label: 'Pix gerado e não pago', value: stats.pixOpen },
                  { label: 'Cartão recusado', value: stats.cardRefused },
                  { label: 'Outros (cancelado, expirado)', value: stats.otherUnpaid },
                ].filter((r) => r.value > 0)}
                empty="Todo pedido gerado foi pago."
              />
            </Card>

            <Card icon={<Smartphone size={16} />} title="Celular x computador" hint="Visitas e quantas viraram venda.">
              <ul className="space-y-2 text-sm">
                {stats.byDevice.map((d) => (
                  <li key={d.d} className="flex justify-between gap-3">
                    <span className="font-medium text-slate-700">{d.d === 'mobile' ? 'Celular' : 'Computador'}</span>
                    <span className="text-slate-500">
                      {plural(d.total, 'visita', 'visitas')} · <b className="font-semibold text-slate-800">{d.paid} pagas</b> ({pct(d.paid, d.total)}%)
                    </span>
                  </li>
                ))}
              </ul>
              <h4 className="mt-5 text-sm font-semibold text-slate-700">Por origem</h4>
              <ul className="mt-2 space-y-2 text-sm">
                {stats.bySource.map((s) => (
                  <li key={s.label} className="flex justify-between gap-3">
                    <span className="truncate font-medium text-slate-700">{s.label}</span>
                    <span className="shrink-0 text-slate-500">
                      {plural(s.total, 'visita', 'visitas')} · <b className="font-semibold text-slate-800">{s.paid} pagas</b> ({pct(s.paid, s.total)}%)
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card icon={<Clock size={16} />} title="Tempo na página" hint="Mediana do tempo com a página aberta na tela.">
              <ul className="space-y-2 text-sm">
                <li className="flex justify-between gap-3"><span className="text-slate-700">Quem desistiu</span><b className="font-semibold text-slate-800">{minutes(stats.timeQuit)}</b></li>
                <li className="flex justify-between gap-3"><span className="text-slate-700">Quem comprou</span><b className="font-semibold text-slate-800">{minutes(stats.timeBuy)}</b></li>
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
