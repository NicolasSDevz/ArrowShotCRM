import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { usePrivacy } from '../../context/PrivacyContext'
import { shouldReceive } from '../../config/notificationRouting'
import { fetchMetaAgencyOverview } from '../../services/metaAgencyService'
import { balanceAlerts, balanceDaysLabel, type BalanceAlert } from '../../utils/adBalance'

/** De quanto em quanto tempo confere de novo (o servidor guarda 1 h de cache). */
const REFRESH_MS = 30 * 60 * 1000
const DISMISS_KEY = 'adBalanceBannerDismissed'

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Faixa vermelha fixa no topo de todas as telas quando alguma conta do Meta
 *  de cliente está sem saldo ou acabando (antes só existia o aviso do sino,
 *  1x por dia, e passava batido). Aparece só pra quem cuida das contas
 *  (mesma regra do aviso "Saldo de anúncio acabando"). Só lê; nunca mexe em saldo. */
export function AdBalanceBanner() {
  const { firebaseUser } = useAuth()
  const { isPrivacyMode } = usePrivacy()
  const enabled = shouldReceive('ad_balance_low', firebaseUser?.email)
  const [alerts, setAlerts] = useState<BalanceAlert[]>([])
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY)
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (!enabled) return
    let alive = true
    const load = () =>
      fetchMetaAgencyOverview({ preset: 'last_7d' })
        .then((res) => alive && setAlerts(balanceAlerts(res.rows)))
        .catch(() => {}) // sem rede/Meta fora do ar: só não mostra
    void load()
    const t = setInterval(load, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [enabled])

  // "Fechar" vale pro dia e pra essa lista; se outra conta entrar, volta a aparecer.
  const signature = useMemo(() => {
    const day = new Date().toLocaleDateString('en-CA')
    return `${day}|${alerts.map((a) => `${a.clientId}:${a.empty ? 0 : 1}`).join(',')}`
  }, [alerts])

  if (!enabled || alerts.length === 0 || dismissed === signature) return null

  const empty = alerts.filter((a) => a.empty)
  const ending = alerts.filter((a) => !a.empty)
  const item = (a: BalanceAlert) =>
    a.empty || isPrivacyMode ? `${a.companyName} (${balanceDaysLabel(a)})` : `${a.companyName} com ${BRL(a.available)} (${balanceDaysLabel(a)})`

  const dismiss = () => {
    setDismissed(signature)
    try {
      localStorage.setItem(DISMISS_KEY, signature)
    } catch {
      /* navegador sem armazenamento: fecha só nesta tela */
    }
  }

  return (
    <div
      role="alert"
      className="flex shrink-0 items-start justify-between gap-3 border-b border-red-700 bg-red-600 px-4 py-2 text-sm text-white sm:px-5"
    >
      <span className="flex min-w-0 items-start gap-2">
        <Wallet size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0">
          {empty.length > 0 && (
            <span className="block">
              <strong className="font-semibold">Sem saldo no Meta Ads:</strong> {empty.map(item).join('; ')}.
            </span>
          )}
          {ending.length > 0 && (
            <span className="block">
              <strong className="font-semibold">Saldo acabando:</strong> {ending.map(item).join('; ')}.
            </span>
          )}
          <span className="block text-red-100">Avise o cliente pra recarregar.</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <Link
          to="/metricas?aba=meta&alerta=saldo"
          className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50"
        >
          Ver contas
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Esconder o aviso de saldo até amanhã"
          title="Esconder até amanhã (volta se outra conta ficar sem saldo)"
          className="rounded-md p-1 text-red-100 transition-colors hover:bg-red-700 hover:text-white"
        >
          <X size={16} />
        </button>
      </span>
    </div>
  )
}
