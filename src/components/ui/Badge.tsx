import type { HTMLAttributes, ReactNode } from 'react'

export function Badge({
  children,
  className = '',
  ...rest
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`badge inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${className}`} {...rest}>
      {children}
    </span>
  )
}
