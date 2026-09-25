import type { ReactNode } from 'react'
import { InfoTip } from '../ui/InfoTip'

/** Cartão padrão do Dashboard (mesmo visual em todas as seções). */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)] ${className}`}
    >
      {children}
    </div>
  )
}

export function CardTitle({ children, tip, action }: { children: ReactNode; tip?: { title?: string; body: ReactNode }; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-2">
      <p className="text-[15px] font-semibold text-slate-900">{children}</p>
      <div className="flex shrink-0 items-center gap-2">
        {action}
        {tip && <InfoTip title={tip.title}>{tip.body}</InfoTip>}
      </div>
    </div>
  )
}
