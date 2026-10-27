import type { ReactNode } from 'react'

/** Cabeçalho padrão das telas do CRM: título, uma linha de apoio e, à direita,
 *  as ações da página. Todas as telas usam este, pra ficarem iguais. */
export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  /** Ícone opcional ao lado do título (lucide, tamanho 18). */
  icon?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-brand-500"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-[26px] font-bold leading-tight tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
