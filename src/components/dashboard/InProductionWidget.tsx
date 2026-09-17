import { Pencil } from 'lucide-react'
import { WidgetCard, AddContentAction } from './WidgetCard'
import { EmptyState } from '../ui/EmptyState'
import { CONTENT_PILLAR_LABEL, CONTENT_PILLAR_COLOR, CONTENT_FORMAT_LABEL, CONTENT_TYPE_LABEL } from '../../types/content'
import type { Content } from '../../types/content'
import type { Client } from '../../types/client'

function ProductionContentRow({ content, clientName, onClick }: { content: Content; clientName?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-w-0 w-full flex-col gap-1 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 ease-in-out hover:bg-slate-50"
    >
      <span className="truncate text-sm font-medium text-slate-900">
        {clientName && <span className="text-violet-600">{clientName}</span>}
        {clientName && ' — '}
        {content.title}
      </span>
      <span className="flex items-center gap-1.5 text-xs text-slate-400">
        {content.pillar && (
          <>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CONTENT_PILLAR_COLOR[content.pillar] }} />
              {CONTENT_PILLAR_LABEL[content.pillar]}
            </span>
            <span>·</span>
          </>
        )}
        <span>{CONTENT_FORMAT_LABEL[content.type] ?? CONTENT_TYPE_LABEL[content.type]}</span>
      </span>
    </button>
  )
}

export function InProductionWidget({
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
    <WidgetCard widget="inProduction" title="Em produção" icon={<Pencil size={15} className="text-white" />} count={contents.length}>
      {contents.length === 0 ? (
        <EmptyState title="Nada em produção" action={<AddContentAction onClick={onAddContent} />} />
      ) : (
        contents.map((c) => (
          <ProductionContentRow key={c.id} content={c} clientName={clientMap[c.clientId]?.companyName} onClick={() => onOpenContent(c.id)} />
        ))
      )}
    </WidgetCard>
  )
}
