import type { Client } from '../types'
import type { OptimizationPlatform } from '../types'

/** Serviços de tráfego pago contratados pelo cliente (cadastro → "Serviços
 *  contratados"). Guardados em `client.modules.metaAds` / `.googleAds`
 *  (só marcados quando `paidTraffic` está ativo — ver ClientFormModal). */
export interface TrafficServices {
  meta: boolean
  google: boolean
  both: boolean
  onlyMeta: boolean
  onlyGoogle: boolean
  /** true se tem pelo menos uma das duas. */
  any: boolean
  /** ['meta'] | ['google'] | ['meta','google'] — pronto pra usar em
   *  Optimization.platforms, checkboxes de relatório, etc. */
  platforms: OptimizationPlatform[]
}

export function trafficServices(client?: Pick<Client, 'modules'> | null): TrafficServices {
  const mods = client?.modules
  let meta = !!mods?.metaAds
  let google = !!mods?.googleAds

  // Docs antigos: paidTraffic marcado mas nenhuma plataforma escolhida —
  // trata como "ambos" pra não esconder nada que já existia.
  if (mods?.paidTraffic && !meta && !google) {
    meta = true
    google = true
  }
  // Nenhum sinal de tráfego pago (só Social Media, ou cadastro incompleto):
  // também assume ambos, já que qualquer aba de tráfego só aparece se o
  // gestor abriu — melhor mostrar tudo do que esconder por engano.
  if (!mods?.paidTraffic && !meta && !google) {
    meta = true
    google = true
  }

  const platforms: OptimizationPlatform[] = []
  if (meta) platforms.push('meta')
  if (google) platforms.push('google')

  return {
    meta,
    google,
    both: meta && google,
    onlyMeta: meta && !google,
    onlyGoogle: google && !meta,
    any: meta || google,
    platforms,
  }
}

/** Badge da(s) plataforma(s) do cliente — usado no widget do Dashboard e
 *  nos registros de otimização. */
export const PLATFORM_BADGE: Record<OptimizationPlatform, string> = {
  meta: 'bg-blue-100 text-blue-700',
  google: 'bg-red-100 text-red-700',
}

export function platformBadgeLabel(platforms: OptimizationPlatform[]): { label: string; className: string } {
  const hasMeta = platforms.includes('meta')
  const hasGoogle = platforms.includes('google')
  if (hasMeta && hasGoogle) return { label: '🟣 Meta + Google', className: 'badge bg-violet-100 text-violet-700' }
  if (hasGoogle) return { label: '🔴 Google Ads', className: `badge ${PLATFORM_BADGE.google}` }
  return { label: '🔵 Meta Ads', className: `badge ${PLATFORM_BADGE.meta}` }
}
