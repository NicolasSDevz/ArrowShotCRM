import { useState } from 'react'
import { MapPin, MoreVertical, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Badge } from '../ui/Badge'
import { Avatar } from '../ui/Avatar'
import { CLIENT_STATUS_LABEL, CLIENT_CATEGORY_LABEL, CLIENT_CATEGORY_BADGE, type Client } from '../../types/client'
import type { AppUser } from '../../types'

const STATUS_COLOR: Record<Client['status'], string> = {
  active: 'bg-emerald-100 text-emerald-700',
  prospect: 'bg-blue-100 text-blue-700',
  paused: 'bg-amber-100 text-amber-700',
  churned: 'bg-red-100 text-red-700',
}

function ServiceBadge({ client }: { client: Client }) {
  const paidTraffic = !!client.modules?.paidTraffic
  const socialMedia = !!client.modules?.socialMedia
  if (paidTraffic && socialMedia) {
    return <Badge className="bg-indigo-100 text-indigo-700">Ambos</Badge>
  }
  if (paidTraffic) return <Badge className="bg-blue-100 text-blue-700">Tráfego</Badge>
  if (socialMedia) return <Badge className="bg-violet-100 text-violet-700">Social Mídia</Badge>
  return <span className="text-xs text-slate-400">—</span>
}

export function ClientsTable({
  clients,
  ownersByClientId,
  onRowClick,
  onDelete,
}: {
  clients: Client[]
  ownersByClientId: Record<string, AppUser[]>
  onRowClick: (client: Client) => void
  onDelete: (client: Client) => void
}) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
      <table className="w-full min-w-[820px] text-left text-[15px]">
        <thead className="border-b border-slate-100 text-[13px] font-semibold uppercase tracking-wide text-slate-400">
          <tr>
            <th className="w-10 py-3 pl-4"></th>
            <th className="py-3 pr-3 font-semibold">Nome</th>
            <th className="py-3 pr-3 font-semibold">Segmento</th>
            <th className="py-3 pr-3 font-semibold">Serviço</th>
            <th className="py-3 pr-3 font-semibold">Status</th>
            <th className="py-3 pr-3 font-semibold">Responsável</th>
            <th className="py-3 pr-3 font-semibold">Cidade</th>
            <th className="py-3 pr-3 font-semibold">Início</th>
            <th className="w-10 py-3 pr-4"></th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => {
            const owners = ownersByClientId[client.id] ?? []
            return (
              <tr
                key={client.id}
                onClick={() => onRowClick(client)}
                className="cursor-pointer border-t border-slate-50 text-slate-700 transition-colors duration-150 ease-in-out hover:bg-slate-50"
              >
                <td className="py-2.5 pl-4">
                  <Avatar name={client.companyName} photoURL={client.logoUrl} size="lg" />
                </td>
                <td className="max-w-[240px] py-2.5 pr-3">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate font-medium text-slate-800">{client.companyName}</p>
                    {client.categoria && (
                      <Badge className={`shrink-0 ${CLIENT_CATEGORY_BADGE[client.categoria]}`}>
                        {CLIENT_CATEGORY_LABEL[client.categoria]}
                      </Badge>
                    )}
                  </div>
                  {client.contactName && <p className="truncate text-xs text-slate-400">{client.contactName}</p>}
                </td>
                <td className="max-w-[140px] truncate py-2.5 pr-3 text-slate-500">{client.segment || '—'}</td>
                <td className="py-2.5 pr-3">
                  <ServiceBadge client={client} />
                </td>
                <td className="py-2.5 pr-3">
                  <Badge className={STATUS_COLOR[client.status]}>{CLIENT_STATUS_LABEL[client.status]}</Badge>
                </td>
                <td className="py-2.5 pr-3">
                  {owners.length > 0 ? (
                    <div className="flex -space-x-1.5">
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
                <td className="max-w-[120px] truncate py-2.5 pr-3 text-slate-500">
                  {client.city ? (
                    <span className="flex items-center gap-1">
                      <MapPin size={12} className="shrink-0 text-slate-400" /> {client.city}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-2.5 pr-3 text-slate-500">
                  {client.contractStartDate ? format(client.contractStartDate.toDate(), 'dd MMM yyyy', { locale: ptBR }) : '—'}
                </td>
                <td className="py-2.5 pr-4" onClick={(e) => e.stopPropagation()}>
                  <div className="relative flex justify-end">
                    <button
                      onClick={() => setOpenMenuId((v) => (v === client.id ? null : client.id))}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 ease-in-out hover:bg-slate-100 hover:text-slate-600"
                    >
                      <MoreVertical size={16} />
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
                            <Trash2 size={14} /> Excluir cliente
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
