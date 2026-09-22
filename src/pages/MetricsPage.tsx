import { useState } from 'react'
import { GoogleAdsPage } from './GoogleAdsPage'
import { MetaAdsPage } from './MetaAdsPage'

type MetricsTab = 'google' | 'meta'

const TAB_LABEL: Record<MetricsTab, string> = {
  google: 'Google Ads',
  meta: 'Meta Ads',
}

/** "Métricas" — une Google Ads e Meta Ads numa página só, com abas internas.
 *  Cada aba continua sendo o mesmo componente/lógica de antes (GoogleAdsPage/
 *  MetaAdsPage), só sem o próprio <h1> — o cabeçalho agora é compartilhado
 *  aqui. As rotas antigas (/google-ads, /meta-ads) foram substituídas por
 *  /metricas no menu; ver App.tsx e Sidebar.tsx. */
export function MetricsPage() {
  const [tab, setTab] = useState<MetricsTab>('google')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[28px] font-extrabold leading-tight text-slate-900">Métricas</h1>
        <p className="text-[15px] text-[#64748B]">Google Ads e Meta Ads — visão consolidada de todas as contas</p>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {(['google', 'meta'] as MetricsTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors duration-150 ease-in-out ${
              tab === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === 'google' ? <GoogleAdsPage /> : <MetaAdsPage />}
    </div>
  )
}
