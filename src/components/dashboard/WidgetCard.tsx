import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '../ui/Button'

export type WidgetAccent = 'overdue' | 'today' | 'upcoming' | 'inProduction' | 'waitingApproval' | 'approved'

const WIDGET_STYLE: Record<WidgetAccent, { border: string; iconBg: string; headerBg?: string }> = {
  overdue: { border: 'border-l-red-500', iconBg: 'bg-red-500', headerBg: 'bg-red-50' },
  today: { border: 'border-l-blue-500', iconBg: 'bg-blue-500' },
  upcoming: { border: 'border-l-amber-500', iconBg: 'bg-amber-500' },
  inProduction: { border: 'border-l-violet-500', iconBg: 'bg-violet-500' },
  waitingApproval: { border: 'border-l-amber-500', iconBg: 'bg-amber-500' },
  approved: { border: 'border-l-emerald-500', iconBg: 'bg-emerald-500' },
}

/** Card padrão dos widgets de tarefas/conteúdo do Dashboard Operacional —
 *  extraído de OperationalDashboard.tsx pra ser reutilizado pelos widgets
 *  agora individuais (personalização por usuário). */
export function WidgetCard({
  widget,
  title,
  icon,
  count,
  urgent,
  footer,
  children,
}: {
  widget: WidgetAccent
  title: string
  icon: ReactNode
  count: number
  /** Bold colored counter badge instead of a plain number — reserved for Atrasadas. */
  urgent?: boolean
  footer?: ReactNode
  children: ReactNode
}) {
  const styles = WIDGET_STYLE[widget]

  return (
    <div
      data-dash-accent
      className={`flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 border-l-4 ${styles.border} bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)] transition-all duration-150 ease-in-out`}
    >
      <div className={`flex min-w-0 items-center gap-2.5 rounded-t-2xl px-6 py-4 ${styles.headerBg ?? ''}`}>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${styles.iconBg}`}>{icon}</div>
        <p className="truncate text-[16px] font-semibold text-slate-900">{title}</p>
        {urgent ? (
          <span className="ml-auto shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">{count}</span>
        ) : (
          <span className="ml-auto shrink-0 text-xs font-medium text-slate-400">{count}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 px-6 pb-5 pt-1">{children}</div>
      {footer && <div className="min-w-0 border-t border-slate-100 px-6 py-3">{footer}</div>}
    </div>
  )
}

export function AddTaskAction({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={onClick}>
      Adicionar tarefa
    </Button>
  )
}

export function AddContentAction({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={onClick}>
      Criar conteúdo
    </Button>
  )
}
