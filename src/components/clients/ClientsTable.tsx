import { useState } from 'react'
import { MoreVertical, Trash2, MessageCircle, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Badge } from '../ui/Badge'
import { Avatar } from '../ui/Avatar'
import { PrivateData } from '../ui/PrivateData'
import { ClientServiceBadges } from './ServiceBadges'
import { usePrivacy } from '../../context/PrivacyContext'
import { formatBRL } from '../../utils/pricing'
import { missingFieldsOfClient } from '../../utils/clientCompleteness'
import { clientStatusLabel, CLIENT_CATEGORY_LABEL, CLIENT_CATEGORY_BADGE, CLIENT_STATUS_BADGE, type Client } from '../../types/client'
import type { AppUser } from '../../types'

function jornadaAtrasada(client: Client): boolean {
  if (client.participaJornada !== true) return false
  const feitas = new Set(client.jornadaFeitas ?? [])
  const base = client.dataInicioJornada ?? client.contractStartDate ?? client.createdAt
  if (!base) return false
  const dataInicio = base.toDate()
  const today = new Date()
  for (let n = 1; n <= 12; n++) {
    const mes = String(n).padStart(2, '0')
    if (feitas.has(mes)) continue
    const endOfExpected = new Date(dataInicio.getFullYear(), dataInicio.getMonth() + n, 0)
    if (endOfExpected < today) return true
  }
  return false
}

export function ClientsTable({
  clients,
  ownersByClientId,
  onRowClick,
  onDelete,
  showStatus = false,
}: {
  clients: Client[]
  ownersByClientId: Record<string, AppUser[]>
  onRowClick: (client: Client) => void
  onDelete: (client: Client) => void
  /** Coluna de status só quando a lista mistura status (filtro "Todos"). */
  showStatus?: boolean
}) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const { isPrivacyMode } = usePrivacy()

  return (
    <div className="clients-table overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <table className="w-full min-w-[760px] text-left text-[15px]">
        <thead className="border-b border-slate-100 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
          <tr>
            <th className="py-3 pl-4 pr-3 font-semibold">Cliente</th>
            <th className="py-3 pr-3 font-semibold">Serviços</th>
            {showStatus && <th className="py-3 pr-3 font-semibold">Status</th>}
            <th className="py-3 pr-3 font-semibold">Valor mensal</th>
            <th className="py-3 pr-3 font-semibold">Responsável</th>
            <th className="py-3 pr-3 font-semibold">Cliente desde</th>
            <th className="w-10 py-3 pr-4">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client, i) => {
            const owners = ownersByClientId[client.id] ?? []
            const displayName = isPrivacyMode ? `Cliente ${i + 1}` : client.companyName
            const missing = client.status === 'churned' ? [] : missingFieldsOfClient(client)
            return (
              <tr
                key={client.id}
                onClick={() => onRowClick(client)}
                className="cursor-pointer border-t border-slate-50 text-slate-700 transition-colors duration-150 ease-in-out hover:bg-slate-50"
              >
                <td className="max-w-[340px] py-2.5 pl-4 pr-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={displayName} photoURL={isPrivacyMode ? null : client.logoUrl} size="lg" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onRowClick(client)
                          }}
                          className="truncate text-left font-semibold text-slate-800 hover:underline focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-brand-400"
                        >
                          {displayName}
                        </button>
                        {client.categoria && (
                          <Badge className={`shrink-0 ${CLIENT_CATEGORY_BADGE[client.categoria]}`}>{CLIENT_CATEGORY_LABEL[client.categoria]}</Badge>
                        )}
                        {isPrivacyMode ? null : client.whatsappGroupLink ? (
                          <a
                            href={client.whatsappGroupLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Abrir grupo do WhatsApp"
                            aria-label={`Abrir grupo do WhatsApp de ${displayName}`}
                            className="shrink-0 text-emerald-500 hover:text-emerald-600"
                          >
                            <MessageCircle size={14} aria-hidden="true" />
                          </a>
                        ) : null}
                      </div>
                      <p className="flex items-center gap-2 truncate text-xs text-slate-400">
                        <span className="truncate">{client.segment || 'Sem segmento'}</span>
                        {client.participaJornada === true && (
                          <span className="inline-flex shrink-0 items-center gap-1">
                            {jornadaAtrasada(client) && <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />}
                            Jornada {Math.min((client.jornadaFeitas?.length ?? 0) + 1, 12)} de 12
                            {jornadaAtrasada(client) && <span className="sr-only">, atrasada</span>}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="py-2.5 pr-3">
                  <ClientServiceBadges client={client} />
                </td>
                {showStatus && (
                  <td className="py-2.5 pr-3">
                    <Badge className={client.status === 'churned' && client.churnType === 'completed' ? 'bg-emerald-50 text-emerald-700' : CLIENT_STATUS_BADGE[client.status]}>
                      {clientStatusLabel(client)}
                    </Badge>
                  </td>
                )}
                <td className="py-2.5 pr-3 font-medium text-slate-700">
                  {client.monthlyValue ? <PrivateData value={formatBRL(client.monthlyValue)} mask="R$ ••••" /> : <span className="text-slate-400">—</span>}
                </td>
                <td className="py-2.5 pr-3">
                  {owners.length > 0 ? (
                    <div className="flex -space-x-1.5" aria-label={owners.map((o) => o.name).join(', ')}>
                      {owners.slice(0, 3).map((o) => (
                        <div key={o.id} title={o.name} className="rounded-full ring-2 ring-white">
                          <Avatar name={o.name} photoURL={o.photoURL} size="xs" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-slate-500">
                  {client.contractStartDate ? format(client.contractStartDate.toDate(), 'MMM yyyy', { locale: ptBR }) : '—'}
                </td>
                <td className="py-2.5 pr-4" onClick={(e) => e.stopPropagation()}>
                  <div className="relative flex items-center justify-end gap-1">
                    {missing.length > 0 && (
                      <span
                        title={`Cadastro incompleto. Falta: ${missing.join(', ')}`}
                        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
                      >
                        <AlertTriangle size={11} aria-hidden="true" /> Incompleto
                      </span>
                    )}
                    <button
                      onClick={() => setOpenMenuId((v) => (v === client.id ? null : client.id))}
                      aria-label={`Opções de ${displayName}`}
                      aria-expanded={openMenuId === client.id}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 ease-in-out hover:bg-slate-100 hover:text-slate-600"
                    >
                      <MoreVertical size={16} aria-hidden="true" />
                    </button>
                    {openMenuId === client.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                        <div className="absolute right-0 top-8 z-20 w-44 rounded-lg border border-slate-100 bg-white p-1 shadow-lg">
                          <button
                            onClick={() => {
                              setOpenMenuId(null)
                              onDelete(client)
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                          >
                            <Trash2 size={14} aria-hidden="true" /> Excluir cliente
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
