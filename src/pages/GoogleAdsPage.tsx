import { useMemo, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { useClients } from '../hooks/useClients'
import { useAuth } from '../context/AuthContext'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { EmptyState } from '../components/ui/EmptyState'
import { updateClient } from '../services/clientService'
import { EMPTY_CAMPAIGN_PLANNING, EMPTY_CAMPAIGN_PLANNING_ACCESS } from '../types/campaignPlanning'
import type { Client } from '../types/client'

/** TAREFA 3 — a API do Google Ads ainda está pendente de aprovação (developer
 *  token em nível de teste). Esta página fica pronta para os dados reais:
 *  assim que GOOGLE_ADS_DEVELOPER_TOKEN estiver configurada e aprovada em
 *  produção, trocar os "--" abaixo por uma chamada a /api/google/insights
 *  (endpoint ainda não implementado — segue o mesmo padrão de
 *  /api/meta/agency-overview) e os cards/tabela passam a carregar sozinhos. */
const GOOGLE_ADS_API_READY = false

function AccountIdCell({ client }: { client: Client }) {
  const { profile } = useAuth()
  const currentId = client.campaignPlanning?.acessos?.googleAdsAccountId ?? ''
  const [value, setValue] = useState(currentId)
  const [editing, setEditing] = useState(currentId === '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!profile || value.trim() === currentId) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      const planning = client.campaignPlanning ?? EMPTY_CAMPAIGN_PLANNING
      const acessos = { ...(planning.acessos ?? EMPTY_CAMPAIGN_PLANNING_ACCESS), googleAdsAccountId: value.trim() || undefined }
      await updateClient(client.id, { campaignPlanning: { ...planning, acessos } }, profile.id, profile.name)
      toast.success('ID da conta Google Ads salvo')
      setEditing(false)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar o ID da conta')
    } finally {
      setSaving(false)
    }
  }

  if (!editing && currentId) {
    return (
      <div className="flex items-center gap-2">
        <a
          href="https://ads.google.com"
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir no Google Ads"
          className="text-brand-600 hover:underline"
        >
          {currentId}
        </a>
        <button onClick={() => setEditing(true)} className="text-xs text-slate-400 hover:text-slate-600">
          editar
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        placeholder="000-000-0000"
        disabled={saving}
        className="w-36 text-xs"
      />
    </div>
  )
}

export function GoogleAdsPage() {
  const { data: clients } = useClients()

  const googleAdsClients = useMemo(() => clients.filter((c) => !!c.modules?.googleAds), [clients])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold leading-tight text-slate-900">Google Ads</h1>
          <p className="text-[15px] text-slate-500">Visão consolidada de todas as contas</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">⏳ API em aprovação</span>
          <div title="Integração com API pendente de aprovação do Google">
            <Button variant="secondary" icon={<RefreshCw size={14} />} disabled>
              Atualizar dados
            </Button>
          </div>
        </div>
      </div>

      {/* Seção 1 — cards consolidados */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Investido (R$)', value: '--' },
          { label: 'Total de Conversões', value: '--' },
          { label: 'CPC Médio (R$)', value: '--' },
          { label: 'CTR Médio (%)', value: '--' },
        ].map((card) => (
          <div key={card.label} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <p className="text-[13px] font-medium text-slate-500">{card.label}</p>
            <p className="mt-1 text-[24px] font-extrabold leading-tight text-slate-400">{GOOGLE_ADS_API_READY ? card.value : '--'}</p>
          </div>
        ))}
      </div>

      {/* Seção 2 — tabela de clientes */}
      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2.5">Cliente</th>
                <th className="px-3 py-2.5">ID da conta Google Ads</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Investido</th>
                <th className="px-3 py-2.5 text-right">Conversões</th>
                <th className="px-3 py-2.5 text-right">CPC</th>
                <th className="px-3 py-2.5 text-right">CTR</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {googleAdsClients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                    Nenhum cliente com Google Ads contratado
                  </td>
                </tr>
              ) : (
                googleAdsClients.map((client) => (
                  <tr key={client.id} className="border-b border-slate-50 text-slate-700 last:border-0">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar name={client.companyName} photoURL={client.logoUrl} size="xs" />
                        <span className="truncate font-medium text-slate-900">{client.companyName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <AccountIdCell client={client} />
                    </td>
                    <td className="px-3 py-2.5 text-slate-400">--</td>
                    <td className="px-3 py-2.5 text-right text-slate-400">--</td>
                    <td className="px-3 py-2.5 text-right text-slate-400">--</td>
                    <td className="px-3 py-2.5 text-right text-slate-400">--</td>
                    <td className="px-3 py-2.5 text-right text-slate-400">--</td>
                    <td className="px-3 py-2.5 text-right">
                      <a
                        href="https://ads.google.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                      >
                        Abrir no Google Ads <ExternalLink size={12} />
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {googleAdsClients.length === 0 && (
        <EmptyState title="Nenhum cliente com Google Ads contratado" description='Marque "Google Ads" em Serviços contratados, na edição do cliente, para que ele apareça aqui.' />
      )}

      {/* Seção 3 — aviso de integração pendente */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-800">⏳ Integração com Google Ads API em andamento</p>
        <p className="mt-1 text-sm text-amber-700">
          O acesso à API foi solicitado ao Google e está em revisão. Assim que aprovado, todos os dados serão carregados
          automaticamente. Você será notificado quando a integração estiver ativa.
        </p>
      </div>
    </div>
  )
}
