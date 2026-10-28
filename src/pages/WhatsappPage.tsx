import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { HelpCircle } from 'lucide-react'
import { Tabs } from '../components/ui/Tabs'
import { PageHeader } from '../components/ui/PageHeader'
import { WhatsappInbox } from '../components/whatsapp/WhatsappInbox'
import { WhatsappSettings } from '../components/whatsapp/WhatsappSettings'
import { WhatsappGuide, buildChecklist } from '../components/whatsapp/WhatsappGuide'
import { useAuth } from '../context/AuthContext'
import { getWaStatus, listWaTemplates, listenWaSettings } from '../services/whatsappService'
import type { WaSettings, WaStatus, WaTemplate } from '../types/whatsapp'

const GUIDE_KEY = 'wa-guide-closed'
const readClosed = () => {
  try {
    return localStorage.getItem(GUIDE_KEY) === '1'
  } catch {
    return false
  }
}

/** WhatsApp da Arrow Shot (API oficial do Meta): conversas, IA, follow-up e carrinho abandonado. */
export function WhatsappPage() {
  const { profile } = useAuth()
  const canConfigure = profile?.role === 'admin' || profile?.role === 'manager'
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState<WaStatus | null>(null)
  const [templates, setTemplates] = useState<WaTemplate[]>([])
  const [settings, setSettings] = useState<WaSettings | null>(null)
  const [convCount, setConvCount] = useState<number | null>(null)
  const [guideClosed, setGuideClosed] = useState(readClosed)

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
  useEffect(() => listenWaSettings(setSettings), [])

  // Chegou a primeira conversa: o status passa a mostrar o teste como feito.
  useEffect(() => {
    if (convCount && status && !status.lastWebhookAt) loadStatus()
  }, [convCount, status, loadStatus])

  const setClosed = (v: boolean) => {
    setGuideClosed(v)
    try {
      localStorage.setItem(GUIDE_KEY, v ? '1' : '0')
    } catch {
      /* sem armazenamento: só vale nesta visita */
    }
  }

  const missing = buildChecklist(status, templates, settings, canConfigure).filter((i) => !i.done && !i.optional).length
  const empty = convCount === 0
  // Sem conversa nenhuma, o guia fica sempre aberto (é o que tem pra ver).
  const showGuide = convCount !== null && (empty || !guideClosed)

  const tab = params.get('aba') === 'config' && canConfigure ? 1 : 0
  const setTab = (i: number) => {
    const next = new URLSearchParams(params)
    if (i === 1) next.set('aba', 'config')
    else next.delete('aba')
    setParams(next, { replace: true })
  }

  const statusPill = status && (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${status.connected ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-amber-500/40 bg-amber-500/10 text-amber-400'}`}
      role="status"
    >
      <span className={`h-2 w-2 rounded-full ${status.connected ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
      {status.connected
        ? `Conectado: ${status.verifiedName ? `${status.verifiedName}, ` : ''}${status.displayPhone}`
        : canConfigure
          ? 'Não conectado. Conecte em Configurações.'
          : 'Não conectado. Um admin ou gerente precisa conectar.'}
    </span>
  )

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="WhatsApp"
        subtitle="A IA atende quem chama no número da Arrow Shot; a equipe assume quando precisa."
        actions={
          <>
            {statusPill}
            {!empty && guideClosed && tab === 0 && (
              <button
                type="button"
                onClick={() => setClosed(false)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                <HelpCircle size={14} aria-hidden="true" />
                Como funciona{missing ? ` (falta ${missing})` : ''}
              </button>
            )}
          </>
        }
      />
      <Tabs
        label="Seções do WhatsApp"
        variant="page"
        active={tab}
        onChange={setTab}
        tabs={[
          {
            label: 'Conversas',
            content: (
              <div className="flex flex-col gap-4">
                {showGuide && (
                  <WhatsappGuide
                    status={status}
                    templates={templates}
                    settings={settings}
                    canConfigure={canConfigure}
                    hasConversations={!empty}
                    onClose={empty ? undefined : () => setClosed(true)}
                  />
                )}
                <WhatsappInbox templates={templates} onCount={setConvCount} />
              </div>
            ),
          },
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
