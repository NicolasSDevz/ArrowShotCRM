import { differenceInDays } from 'date-fns'
import { Clock } from 'lucide-react'
import { WidgetCard, AddContentAction } from './WidgetCard'
import { EmptyState } from '../ui/EmptyState'
import type { Content } from '../../types/content'
import type { Client } from '../../types/client'

function daysAgoLabel(date: Date) {
  const n = differenceInDays(new Date(), date)
  if (n <= 0) return 'hoje'
  return `há ${n} dia${n === 1 ? '' : 's'}`
}

function WaitingApprovalRow({ content, clientName, onClick }: { content: Content; clientName?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-w-0 w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 ease-in-out hover:bg-slate-50"
    >
      <span className="truncate text-sm font-medium text-slate-900">
        {clientName && <span className="text-amber-600">{clientName}</span>}
        {clientName && ' — '}
        {content.title}
      </span>
      <span className="text-xs text-slate-400">{daysAgoLabel(content.updatedAt.toDate())} aguardando</span>
    </button>
  )
}

export function WaitingApprovalWidget({
  contents,
  clientMap,
  onOpenContent,
  onAddContent,
}: {
  contents: Content[]
  clientMap: Record<string, Client>
  onOpenContent: (id: string) => void
  onAddContent: () => void
}) {
  return (
    <WidgetCard widget="waitingApproval" title="Aguardando aprovação" icon={<Clock size={15} className="text-white" />} count={contents.length}>
      {contents.length === 0 ? (
        <EmptyState title="Nada pendente" action={<AddContentAction onClick={onAddContent} />} />
      ) : (
        contents.map((c) => (
          <WaitingApprovalRow key={c.id} content={c} clientName={clientMap[c.clientId]?.companyName} onClick={() => onOpenContent(c.id)} />
        ))
      )}
    </WidgetCard>
  )
}
