import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronRight } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { usePrivacy } from '../../context/PrivacyContext'
import type { Client, Report } from '../../types'

/** Card de um cliente na visão "Blocos" de Relatórios — quantos relatórios
 *  de cada tipo ele tem e quando foi o mais recente, sem precisar abrir nada
 *  pra ter esse resumo. Clicar abre o histórico completo (ClientReportsDrawer). */
export function ReportsClientCard({ client, reports, onClick }: { client: Client; reports: Report[]; onClick: () => void }) {
  const { isPrivacyMode } = usePrivacy()
  const monthly = reports.filter((r) => r.type === 'monthly').length
  const weekly = reports.filter((r) => r.type === 'weekly').length
  const latest = [...reports].sort((a, b) => b.periodEnd.toMillis() - a.periodEnd.toMillis())[0]

  return (
    <button
      onClick={onClick}
      className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors duration-150 ease-in-out hover:border-brand-300 hover:bg-brand-50/30"
    >
      <Avatar name={isPrivacyMode ? 'Cliente' : client.companyName} photoURL={isPrivacyMode ? null : client.logoUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">{isPrivacyMode ? '••••••' : client.companyName}</p>
        <p className="mt-0.5 text-xs text-slate-400">
          {monthly > 0 && `${monthly} mensal${monthly === 1 ? '' : 'is'}`}
          {monthly > 0 && weekly > 0 && ' · '}
          {weekly > 0 && `${weekly} semanal${weekly === 1 ? '' : 'is'}`}
        </p>
        {latest && (
          <p className="mt-1 text-xs text-slate-400">Último em {format(latest.periodEnd.toDate(), 'dd/MM/yyyy', { locale: ptBR })}</p>
        )}
      </div>
      <ChevronRight size={16} className="shrink-0 text-slate-300" />
    </button>
  )
}
