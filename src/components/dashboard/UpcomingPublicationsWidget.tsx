import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarDays } from 'lucide-react'
import { EmptyState } from '../ui/EmptyState'
import { CONTENT_FORMAT_LABEL, CONTENT_TYPE_LABEL } from '../../types/content'
import type { Content } from '../../types/content'
import type { Client } from '../../types/client'

function PublicationRow({ content, clientName, onClick }: { content: Content; clientName?: string; onClick: () => void }) {
  const date = content.scheduledDate?.toDate()
  return (
    <button
      onClick={onClick}
      className="flex w-full min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-150 ease-in-out hover:bg-slate-50"
    >
      {date && (
        <div className="flex w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-blue-50 py-1">
          <span className="text-sm font-bold leading-none text-blue-600">{format(date, 'dd')}</span>
          <span className="text-[10px] font-medium uppercase leading-none text-blue-500">{format(date, 'MMM', { locale: ptBR })}</span>
        </div>
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
        {clientName && <span className="font-medium">{clientName}</span>}
        {clientName && ' — '}
        {content.title}
      </span>
      <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
        {CONTENT_FORMAT_LABEL[content.type] ?? CONTENT_TYPE_LABEL[content.type]}
      </span>
    </button>
  )
}

export function UpcomingPublicationsWidget({
  contents,
  clientMap,
  onOpenContent,
}: {
  contents: Content[]
  clientMap: Record<string, Client>
  onOpenContent: (id: string) => void
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-2.5 rounded-t-2xl px-6 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500">
          <CalendarDays size={15} className="text-white" />
        </div>
        <p className="text-[16px] font-semibold text-slate-900">Próximas publicações</p>
        <span className="ml-auto shrink-0 text-xs font-medium text-slate-400">{contents.length}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 px-6 pb-5 pt-1">
        {contents.length === 0 ? (
          <EmptyState title="Nenhuma publicação agendada" />
        ) : (
          contents.map((c) => (
            <PublicationRow key={c.id} content={c} clientName={clientMap[c.clientId]?.companyName} onClick={() => onOpenContent(c.id)} />
          ))
        )}
      </div>
    </div>
  )
}
