import { useSearchParams } from 'react-router-dom'
import { BarChart3, KeyRound } from 'lucide-react'
import { GoogleAdsPage } from './GoogleAdsPage'
import { MetaAdsPage } from './MetaAdsPage'
import { AdAccountsPanel } from '../components/metrics/AdAccountsPanel'
import { PageHeader } from '../components/ui/PageHeader'
import { Tabs } from '../components/ui/Tabs'

const TABS = ['google', 'meta', 'contas'] as const

/** "Métricas" — Google Ads, Meta Ads e, na aba Contas e tokens, o ID da conta
 *  e o token de cada cliente (antes ficavam no Planejamento de Campanha).
 *  A aba aberta fica na URL (?aba=meta / ?aba=contas). */
export function MetricsPage() {
  const [params, setParams] = useSearchParams()
  const current = TABS.indexOf((params.get('aba') ?? 'google') as (typeof TABS)[number])
  const active = current < 0 ? 0 : current

  const setTab = (i: number) => {
    const next = new URLSearchParams(params)
    if (i === 0) next.delete('aba')
    else next.set('aba', TABS[i])
    setParams(next, { replace: true })
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Métricas" subtitle="Google Ads e Meta Ads de todas as contas, e as conexões de cada cliente." />
      <Tabs
        label="Seções de Métricas"
        variant="page"
        active={active}
        onChange={setTab}
        tabs={[
          { label: 'Google Ads', icon: <BarChart3 size={15} />, content: <GoogleAdsPage /> },
          { label: 'Meta Ads', icon: <BarChart3 size={15} />, content: <MetaAdsPage /> },
          { label: 'Contas e tokens', icon: <KeyRound size={15} />, content: <AdAccountsPanel /> },
        ]}
      />
    </div>
  )
}
