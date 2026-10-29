import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { HelpCircle, MessageCircle, Settings } from 'lucide-react'
import { Drawer } from '../ui/Drawer'
import { WhatsappInbox } from './WhatsappInbox'
import { WhatsappSettings } from './WhatsappSettings'
import { WhatsappGuide, buildChecklist } from './WhatsappGuide'
import { useAuth } from '../../context/AuthContext'
import { useWaConversations } from '../../hooks/useWaConversations'
import { getWaStatus, listWaTemplates, listenWaSettings } from '../../services/whatsappService'
import type { WaSettings, WaStatus, WaTemplate } from '../../types/whatsapp'

/** Tudo do WhatsApp dentro de Leads > Conversas: a caixa de conversas na frente,
 *  e o guia e as configurações escondidos em painéis laterais (?wa=guia / ?wa=config). */
export function WhatsappHub({ onOpenLead }: { onOpenLead: (leadId: string) => void }) {
  const { profile } = useAuth()
  const canConfigure = profile?.role === 'admin' || profile?.role === 'manager'
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState<WaStatus | null>(null)
  const [templates, setTemplates] = useState<WaTemplate[]>([])
  const [settings, setSettings] = useState<WaSettings | null>(null)
  const { data: convs, loading } = useWaConversations()

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

  // Chegou a primeira conversa: o teste do "oi" passa a aparecer como feito.
  const empty = !loading && convs.length === 0
  useEffect(() => {
    if (!empty && !loading && status && !status.lastWebhookAt) loadStatus()
  }, [empty, loading, status, loadStatus])

  const panel = params.get('wa')
  const setPanel = (v: 'guia' | 'config' | null) => {
    const next = new URLSearchParams(params)
    if (v) next.set('wa', v)
    else next.delete('wa')
    setParams(next, { replace: true })
  }
  const configOpen = panel === 'config' && canConfigure
  const guideOpen = panel === 'guia'

  const missing = buildChecklist(status, templates, settings, canConfigure).filter((i) => !i.done && !i.optional).length
  const connected = Boolean(status?.connected)
  const aiOn = settings?.aiEnabled !== false

  const statusText = !status
    ? 'Verificando a conexão…'
    : connected
      ? `${status.displayPhone} conectado. ${aiOn ? `IA atendendo${settings?.sdr?.name ? ` como ${settings.sdr.name}` : ''}.` : 'IA desligada.'}`
      : canConfigure
        ? 'Número não conectado. Abra Configurar para conectar.'
        : 'Número não conectado. Um admin ou gerente precisa conectar.'

  const chip = 'inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50'

  const tools = (
    <>
      <button type="button" onClick={() => setPanel('guia')} className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700" aria-label={`Como funciona${missing > 0 ? `, falta ${missing} passo${missing === 1 ? '' : 's'}` : ''}`} title="Como funciona">
        <HelpCircle size={16} aria-hidden="true" />
        {missing > 0 && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden="true" />}
      </button>
      {canConfigure && (
        <button type="button" onClick={() => setPanel('config')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700" aria-label="Configurar WhatsApp" title="Configurar">
          <Settings size={16} aria-hidden="true" />
        </button>
      )}
    </>
  )

  return (
    <div className="flex flex-col gap-3">
      {/* Faixa de status só quando falta algo (não conectado). Com tudo certo, a conversa ganha a tela. */}
      {status && !connected && (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2">
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-500" aria-hidden="true">
          <MessageCircle size={16} />
          <span className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        </span>
        <div className="min-w-0 flex-1" role="status">
          <p className="text-sm font-semibold text-slate-800">
            WhatsApp da Arrow Shot <span className="sr-only">{connected ? ', conectado' : ', não conectado'}</span>
          </p>
          <p className={`truncate text-xs ${connected || !status ? 'text-slate-500' : 'text-amber-500'}`}>{statusText}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPanel('guia')} className={chip}>
            <HelpCircle size={15} aria-hidden="true" />
            <span className="hidden sm:inline">Como funciona</span>
            <span className="sr-only sm:hidden">Como funciona</span>
            {missing > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white" aria-label={`falta ${missing} passo${missing === 1 ? '' : 's'}`}>
                {missing}
              </span>
            )}
          </button>
          {canConfigure && (
            <button type="button" onClick={() => setPanel('config')} className={chip}>
              <Settings size={15} aria-hidden="true" />
              <span className="hidden sm:inline">Configurar</span>
              <span className="sr-only sm:hidden">Configurar WhatsApp</span>
            </button>
          )}
        </div>
      </div>
      )}

      {/* Sem conversa nenhuma, o guia é o que tem pra ver: fica aberto na tela. */}
      {empty && <WhatsappGuide status={status} templates={templates} settings={settings} canConfigure={canConfigure} hasConversations={false} />}

      <WhatsappInbox templates={templates} onOpenLead={onOpenLead} tools={tools} heightClass="h-[calc(100dvh-180px)] md:h-[calc(100dvh-190px)] lg:h-[calc(100dvh-150px)]" />

      <Drawer open={guideOpen} onClose={() => setPanel(null)} title="Como o WhatsApp funciona" width="w-full max-w-3xl">
        <div className="p-4 sm:p-5">
          <WhatsappGuide status={status} templates={templates} settings={settings} canConfigure={canConfigure} hasConversations={!empty} />
        </div>
      </Drawer>
      <Drawer open={configOpen} onClose={() => setPanel(null)} title="Configurar WhatsApp" width="w-full max-w-3xl">
        <div className="bg-slate-50 p-4 sm:p-5">
          <WhatsappSettings status={status} templates={templates} onReloadStatus={loadStatus} onReloadTemplates={() => loadTemplates(true)} />
        </div>
      </Drawer>
    </div>
  )
}
