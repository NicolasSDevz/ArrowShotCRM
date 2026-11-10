import type { ReactNode } from 'react'

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center">
      {icon && <div className="mb-1 text-slate-300">{icon}</div>}
      <p className="text-[15px] font-medium text-[#94A3B8]">{title}</p>
      {description && <p className="max-w-xs text-[13px] text-slate-400">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
