import { MapPin, MessageCircle } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Badge } from '../ui/Badge'
import { Avatar } from '../ui/Avatar'
import { ClientServiceBadges } from './ServiceBadges'
import { CLIENT_STATUS_LABEL, CLIENT_CATEGORY_LABEL, CLIENT_CATEGORY_BADGE, CLIENT_STATUS_BADGE, type Client } from '../../types/client'
import type { AppUser } from '../../types'

/** Visão alternativa em cartões — mesmas informações da ClientsTable, só
 *  que em grade, pra quem prefere escanear visualmente (logo maior) em vez
 *  de uma tabela densa. Numerada igual à tabela. */
export function ClientsGrid({
  clients,
  ownersByClientId,
  onRowClick,
}: {
  clients: Client[]
  ownersByClientId: Record<string, AppUser[]>
  onRowClick: (client: Client) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {clients.map((client, i) => {
        const owners = ownersByClientId[client.id] ?? []
        return (
          <button
            key={client.id}
            onClick={() => onRowClick(client)}
            className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <span className="mt-1 shrink-0 text-xs font-medium text-slate-300">{i + 1}</span>
              <Avatar name={client.companyName} photoURL={client.logoUrl} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate font-semibold text-slate-800">{client.companyName}</p>
                  {client.categoria && (
                    <Badge className={`shrink-0 ${CLIENT_CATEGORY_BADGE[client.categoria]}`}>
                      {CLIENT_CATEGORY_LABEL[client.categoria]}
                    </Badge>
                  )}
                </div>
                <p className="truncate text-xs text-slate-400">{client.segment || 'Sem segmento'}</p>
              </div>
              {client.whatsappGroupLink && (
                <a
                  href={client.whatsappGroupLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title="Abrir grupo do WhatsApp"
                  className="shrink-0 text-emerald-500 hover:text-emerald-600"
                >
                  <MessageCircle size={14} />
                </a>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Badge className={CLIENT_STATUS_BADGE[client.status]}>{CLIENT_STATUS_LABEL[client.status]}</Badge>
              <ClientServiceBadges client={client} />
            </div>

            <div className="flex items-center justify-between border-t border-slate-50 pt-2.5 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                {client.city ? (
                  <>
                    <MapPin size={12} className="shrink-0 text-slate-400" /> {client.city}
                  </>
                ) : (
                  '—'
                )}
              </span>
              <span>
                {client.contractStartDate ? format(client.contractStartDate.toDate(), 'dd MMM yyyy', { locale: ptBR }) : '—'}
              </span>
            </div>

            {owners.length > 0 && (
              <div className="flex -space-x-1.5">
                {owners.slice(0, 4).map((o) => (
                  <div key={o.id} title={o.name} className="rounded-full ring-2 ring-white">
                    <Avatar name={o.name} photoURL={o.photoURL} size="xs" />
                  </div>
                ))}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
