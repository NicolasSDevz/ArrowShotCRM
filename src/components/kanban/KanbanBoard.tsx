import { useState, type ReactNode } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { KanbanColumn } from './KanbanColumn'

export interface KanbanItemBase {
  id: string
  order: number
}

export function KanbanBoard<T extends KanbanItemBase, S extends string>({
  columns,
  items,
  getStatus,
  renderCard,
  onMove,
  pageSize,
}: {
  columns: { id: S; label: string; accent?: string; accentColor?: string }[]
  items: T[]
  getStatus: (item: T) => S
  renderCard: (item: T) => ReactNode
  onMove: (item: T, newStatus: S, newOrder: number) => void
  /** Mostra só os N primeiros cartões de cada coluna, com "Mostrar mais"
   *  (coluna com centenas de leads travava a tela). Sem valor = todos. */
  pageSize?: number
}) {
  const [limits, setLimits] = useState<Record<string, number>>({})
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const byColumn = (status: S) =>
    items.filter((i) => getStatus(i) === status).sort((a, b) => a.order - b.order)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    const activeItem = items.find((i) => i.id === active.id)
    if (!activeItem) return

    const overIsColumn = String(over.id).startsWith('col:')
    const destStatus = (overIsColumn ? String(over.id).slice(4) : getStatus(items.find((i) => i.id === over.id)!)) as S

    const destItems = byColumn(destStatus).filter((i) => i.id !== activeItem.id)
    const overIndex = overIsColumn ? destItems.length : destItems.findIndex((i) => i.id === over.id)
    const index = overIndex === -1 ? destItems.length : overIndex

    let newOrder: number
    if (destItems.length === 0) newOrder = 1000
    else if (index === 0) newOrder = destItems[0].order - 1000
    else if (index >= destItems.length) newOrder = destItems[destItems.length - 1].order + 1000
    else newOrder = (destItems[index - 1].order + destItems[index].order) / 2

    if (destStatus === getStatus(activeItem) && newOrder === activeItem.order) return
    onMove(activeItem, destStatus, newOrder)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="flex h-full gap-3 overflow-x-auto pb-2">
        {columns.map((col) => {
          const colItems = byColumn(col.id)
          const limit = pageSize ? (limits[col.id] ?? pageSize) : colItems.length
          const shown = colItems.slice(0, limit)
          return (
            <KanbanColumn key={col.id} id={`col:${col.id}`} label={col.label} count={colItems.length} accent={col.accent} accentColor={col.accentColor}>
              <SortableContext items={shown.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2">
                  {shown.map((item) => (
                    <div key={item.id}>{renderCard(item)}</div>
                  ))}
                  {colItems.length > shown.length && (
                    <button
                      type="button"
                      onClick={() => setLimits((l) => ({ ...l, [col.id]: limit + (pageSize ?? 0) }))}
                      className="rounded-lg border border-dashed border-slate-300 py-2 text-xs font-semibold text-slate-500 hover:border-brand-400 hover:text-brand-600"
                    >
                      Mostrar mais ({colItems.length - shown.length} restantes)
                    </button>
                  )}
                </div>
              </SortableContext>
            </KanbanColumn>
          )
        })}
      </div>
    </DndContext>
  )
}
