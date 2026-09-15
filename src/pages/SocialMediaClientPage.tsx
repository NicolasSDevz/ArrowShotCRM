import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useClients } from '../hooks/useClients'
import { Avatar } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { ClientContentsTab } from '../components/clients/ClientContentsTab'
import { CLIENT_PACKAGE_LABEL, STYLE_CATALOG_LABEL } from '../types/client'

/** Tela dedicada de um cliente dentro do módulo Social Mídia — mesmo
 *  Kanban+Calendário da aba "Conteúdos" da ficha do cliente (ver
 *  ClientContentsTab.tsx), só com um cabeçalho próprio e o link "Voltar"
 *  pra lista de clientes do módulo, em vez do resto da ficha completa. */
export function SocialMediaClientPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const navigate = useNavigate()
  const { data: clients } = useClients()
  const client = clients.find((c) => c.id === clientId)

  if (!client) {
    return (
      <EmptyState
        title="Cliente não encontrado"
        action={<Button onClick={() => navigate('/social-media')}>Voltar</Button>}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={() => navigate('/social-media')}
        className="flex w-fit items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
      >
        <ArrowLeft size={13} /> Social Mídia
      </button>

      <div className="flex items-center gap-3">
        <Avatar name={client.companyName} photoURL={client.logoUrl} size="md" />
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-800">{client.companyName}</h1>
          {client.package && <Badge className="bg-brand-50 text-brand-600">{CLIENT_PACKAGE_LABEL[client.package]}</Badge>}
          {client.styleCatalog && (
            <Badge className="bg-slate-100 text-slate-500">{STYLE_CATALOG_LABEL[client.styleCatalog]}</Badge>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-4">
        <ClientContentsTab client={client} />
      </div>
    </div>
  )
}
