import type { MetaTokenStatus } from '../services/metaApi'

export type TokenValidityLevel = 'green' | 'yellow' | 'red' | 'unknown' | 'none'

export interface TokenValidity {
  level: TokenValidityLevel
  /** Dias até expirar (negativo = já expirou). undefined se não aplicável. */
  daysLeft?: number
  /** Rótulo curto pronto pra exibir, com emoji. */
  label: string
  /** Cor tailwind (texto/badge). */
  badgeClass: string
  /** Peso pra ordenar por urgência (menor = mais urgente). */
  sortWeight: number
}

const YELLOW_THRESHOLD_DAYS = 15

/** Traduz o status do token (do backend) num indicador 🟢🟡🔴⚪. */
export function tokenValidity(status?: Pick<MetaTokenStatus, 'hasToken' | 'expiresAt'> | null): TokenValidity {
  if (!status?.hasToken) {
    return { level: 'none', label: '⚪ Token não configurado', badgeClass: 'bg-slate-100 text-slate-500', sortWeight: 5 }
  }
  if (!status.expiresAt) {
    return {
      level: 'unknown',
      label: '⚪ Validade desconhecida',
      badgeClass: 'bg-slate-100 text-slate-500',
      sortWeight: 4,
    }
  }

  const daysLeft = Math.floor((new Date(status.expiresAt).getTime() - Date.now()) / (24 * 3600 * 1000))

  if (daysLeft < 0) {
    return {
      level: 'red',
      daysLeft,
      label: '🔴 Token expirado — renovar agora',
      badgeClass: 'bg-red-100 text-red-700',
      sortWeight: 0,
    }
  }
  if (daysLeft <= YELLOW_THRESHOLD_DAYS) {
    return {
      level: 'yellow',
      daysLeft,
      label: `🟡 Token expira em breve — ${daysLeft} dia${daysLeft === 1 ? '' : 's'} restante${daysLeft === 1 ? '' : 's'}`,
      badgeClass: 'bg-amber-100 text-amber-700',
      sortWeight: 1,
    }
  }
  return {
    level: 'green',
    daysLeft,
    label: `🟢 Token válido — expira em ${daysLeft} dias`,
    badgeClass: 'bg-emerald-100 text-emerald-700',
    sortWeight: 2,
  }
}

/** dd/mm/aaaa de uma data ISO (ou '—'). */
export function fmtExpiry(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}
