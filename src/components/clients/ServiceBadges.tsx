import { Badge } from '../ui/Badge'
import type { Client } from '../../types/client'

/** Badges de serviço contratado — usado na listagem de clientes
 *  (ClientsTable) e na ficha do cliente (ClientDetailPage). O combo
 *  Tráfego/Social/Ambos é o que já existia; Landing Page é independente
 *  (pode aparecer junto com qualquer um dos outros). */
export function ClientServiceBadges({ client }: { client: Client }) {
  const paidTraffic = !!client.modules?.paidTraffic
  const socialMedia = !!client.modules?.socialMedia
  const landingPage = !!client.modules?.landingPage

  const trafficSocialBadge = paidTraffic && socialMedia ? (
    <Badge className="badge-service-both">Ambos</Badge>
  ) : paidTraffic ? (
    <Badge className="badge-service-traffic">Tráfego</Badge>
  ) : socialMedia ? (
    <Badge className="badge-service-social">Social Mídia</Badge>
  ) : null

  if (!trafficSocialBadge && !landingPage) {
    return <span className="text-xs text-slate-400">—</span>
  }

  return (
    <span className="flex flex-wrap items-center gap-1">
      {trafficSocialBadge}
      {landingPage && <Badge className="badge-service-landing">Landing Page</Badge>}
    </span>
  )
}
