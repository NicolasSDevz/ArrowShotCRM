import { Tabs } from '../ui/Tabs'
import { EmptyState } from '../ui/EmptyState'
import { ClientBriefingPanel } from './ClientBriefingPanel'
import { ClientPaidTrafficBriefingPanel } from './ClientPaidTrafficBriefingPanel'
import type { Client } from '../../types'

/** Which briefing form(s) show under the "Briefing" tab depends on which
 *  services the client has contracted (Serviços contratados, no cadastro):
 *  only one service shows its form directly, both show sub-tabs. */
export function ClientBriefingTab({ client }: { client: Client }) {
  const hasSocialMedia = !!client.modules?.socialMedia
  const hasPaidTraffic = !!client.modules?.paidTraffic

  if (hasPaidTraffic && hasSocialMedia) {
    return (
      <Tabs
        label="Tipos de briefing"
        tabs={[
          { label: 'Tráfego Pago', content: <ClientPaidTrafficBriefingPanel client={client} /> },
          { label: 'Social Mídia', content: <ClientBriefingPanel client={client} /> },
        ]}
      />
    )
  }

  if (hasPaidTraffic) return <ClientPaidTrafficBriefingPanel client={client} />
  if (hasSocialMedia) return <ClientBriefingPanel client={client} />

  return (
    <EmptyState
      title="Nenhum serviço contratado"
      description='Marque "Tráfego Pago" e/ou "Social Mídia" em Serviços contratados, na edição do cliente, para habilitar o briefing correspondente.'
    />
  )
}
