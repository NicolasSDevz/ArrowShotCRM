import { CheckCircle2 } from 'lucide-react'
import { WidgetCard } from './WidgetCard'
import { EmptyState } from '../ui/EmptyState'
import type { Content } from '../../types/content'
import type { Client } from '../../types/client'

function ApprovedContentRow({ content, clientName, onClick }: { content: Content; clientName?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 ease-in-out hover:bg-slate-50"
    >
      <span className="min-w-0 truncate text-sm font-medium text-slate-900">
        {clientName && <span className="text-emerald-600">{clientName}</span>}
        {clientName && ' — '}
        {content.title}
      </span>
    </button>
  )
}

export function ApprovedContentWidget({
  contents,
  clientMap,
  onOpenContent,
}: {
  contents: Content[]
  clientMap: Record<string, Client>
  onOpenContent: (id: string) => void
}) {
  return (
    <WidgetCard widget="approved" title="Conteúdos aprovados" icon={<CheckCircle2 size={15} className="text-white" />} count={contents.length}>
      {contents.length === 0 ? (
        <EmptyState title="Nada aprovado ainda" />
      ) : (
        contents.map((c) => (
          <ApprovedContentRow key={c.id} content={c} clientName={clientMap[c.clientId]?.companyName} onClick={() => onOpenContent(c.id)} />
        ))
      )}
    </WidgetCard>
  )
}
