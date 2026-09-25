import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Avatar } from '../ui/Avatar'
import { Badge } from '../ui/Badge'
import { PrivateMoney } from '../ui/PrivateData'
import { usePrivacy } from '../../context/PrivacyContext'
import { LEAD_SOURCE_LABEL, locateLead, type AppUser, type Lead, type ResolvedPipeline } from '../../types'
import type { LeadFormTag } from './leadFormColors'

function leadServiceLabel(lead: Lead): string {
  const parts: string[] = []
  if (lead.services.paidTraffic) parts.push('Tráfego Pago')
  if (lead.services.socialMedia) parts.push('Social Mídia')
  if (lead.services.landingPage) parts.push('Landing Page')
  return parts.length > 0 ? parts.join(' + ') : '—'
}

/** Alternativa em lista ao Kanban de Leads — mesmas informações do
 *  LeadCard, só que numa tabela: mais acessível e responsiva que arrastar
 *  cards entre colunas (que em telas estreitas vira scroll horizontal com
 *  alvos de toque pequenos). Ordenada por data de mudança de etapa (mais
 *  recente primeiro), já que não há colunas aqui pra separar por status. */
export function LeadsListView({
  leads,
  userMap,
  onOpenLead,
  pipelines,
  formTagOf,
}: {
  pipelines: ResolvedPipeline[]
  /** Formulário de origem (nome + cor) de cada lead, quando veio de um. */
  formTagOf?: (lead: Lead) => LeadFormTag | undefined
  leads: Lead[]
  userMap: Record<string, AppUser>
  onOpenLead: (id: string) => void
}) {
  const { isPrivacyMode } = usePrivacy()
  const sorted = [...leads].sort((a, b) => b.stageChangedAt.toMillis() - a.stageChangedAt.toMillis())

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Contato</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Serviço</th>
              <th className="px-4 py-3">Responsável</th>
              <th className="px-4 py-3 text-right">Valor estimado</th>
              <th className="px-4 py-3">Próxima ação</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Nenhum lead encontrado.
                </td>
              </tr>
            ) : (
              sorted.map((lead) => {
                const assignee = lead.assignedTo ? userMap[lead.assignedTo] : undefined
                return (
                  <tr
                    key={lead.id}
                    onClick={() => onOpenLead(lead.id)}
                    className="cursor-pointer border-t border-slate-50 text-slate-700 transition-colors duration-150 ease-in-out hover:bg-slate-50"
                  >
                    <td className="max-w-[220px] px-4 py-3">
                      <p className="truncate font-medium text-slate-900">{isPrivacyMode ? 'Lead ••••••' : lead.contactName}</p>
                      {lead.companyName && (
                        <p className="truncate text-xs text-slate-400">{isPrivacyMode ? 'Empresa ••••••' : lead.companyName}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-slate-600">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: locateLead(pipelines, lead).stage.color }} />
                        {locateLead(pipelines, lead).stage.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge className="bg-blue-50 text-blue-600">{leadServiceLabel(lead)}</Badge>
                        {formTagOf?.(lead) ? (
                          <span
                            className="inline-flex max-w-[180px] items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                            style={{ background: `${formTagOf(lead)!.color}1F`, color: formTagOf(lead)!.color }}
                          >
                            <span className="truncate">{formTagOf(lead)!.name}</span>
                          </span>
                        ) : (
                          <Badge className="bg-slate-100 text-[11px] text-slate-500">{LEAD_SOURCE_LABEL[lead.source]}</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {assignee ? (
                        <div className="flex items-center gap-1.5">
                          <Avatar name={assignee.name} photoURL={assignee.photoURL} size="xs" />
                          <span className="truncate text-xs text-slate-600">{assignee.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {lead.estimatedValue != null && lead.estimatedValue > 0 ? <PrivateMoney value={lead.estimatedValue} /> : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {lead.nextActionDate ? format(lead.nextActionDate.toDate(), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
