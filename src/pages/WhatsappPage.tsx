import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tabs } from '../components/ui/Tabs'
import { WhatsappInbox } from '../components/whatsapp/WhatsappInbox'
import { WhatsappSettings } from '../components/whatsapp/WhatsappSettings'
import { useAuth } from '../context/AuthContext'
import { getWaStatus, listWaTemplates } from '../services/whatsappService'
import type { WaStatus, WaTemplate } from '../types/whatsapp'

/** WhatsApp da Arrow Shot (API oficial do Meta): conversas, IA, follow-up e carrinho abandonado. */
export function WhatsappPage() {
  const { profile } = useAuth()
  const canConfigure = profile?.role === 'admin' || profile?.role === 'manager'
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState<WaStatus | null>(null)
  const [templates, setTemplates] = useState<WaTemplate[]>([])

  const loadStatus = useCallback(() => {
    getWaStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
  }, [])
  const loadTemplates = useCallback((fresh = false) => {
    listWaTemplates(fresh)
      .then(setTemplates)
      .catch(() => setTemplates([]))
  }, [])

  useEffect(() => {
    loadStatus()
    loadTemplates()
  }, [loadStatus, loadTemplates])

  const tab = params.get('aba') === 'config' && canConfigure ? 1 : 0
  const setTab = (i: number) => {
    const next = new URLSearchParams(params)
    if (i === 1) next.set('aba', 'config')
    else next.delete('aba')
    setParams(next, { replace: true })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight text-slate-900">WhatsApp</h1>
          <p className="text-[15px] text-[#64748B]">Atendimento, IA e follow-up do número da Arrow Shot.</p>
        </div>
        {status && (
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${status.connected ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}
            role="status"
          >
            <span className={`h-2 w-2 rounded-full ${status.connected ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
            {status.connected
              ? `Conectado: ${status.verifiedName ? `${status.verifiedName}, ` : ''}${status.displayPhone}`
              : canConfigure
                ? 'Não conectado. Conecte na aba Configurações.'
                : 'Não conectado. Um admin ou gerente precisa conectar.'}
          </span>
        )}
      </div>
      <Tabs
        label="Seções do WhatsApp"
        variant="page"
        active={tab}
        onChange={setTab}
        tabs={[
          { label: 'Conversas', content: <WhatsappInbox templates={templates} /> },
          ...(canConfigure
            ? [
                {
                  label: 'Configurações',
                  content: <WhatsappSettings status={status} templates={templates} onReloadStatus={loadStatus} onReloadTemplates={() => loadTemplates(true)} />,
                },
              ]
            : []),
        ]}
      />
    </div>
  )
}
