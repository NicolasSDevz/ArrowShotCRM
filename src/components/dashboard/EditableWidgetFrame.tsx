import type { ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X, Columns2, RectangleHorizontal } from 'lucide-react'
import type { DashboardWidgetId, DashboardWidgetWidth } from '../../types/dashboardLayout'

/** Wrapper usado só em modo de edição — fora dele os widgets renderizam
 *  direto, sem esse frame. O conteúdo do widget fica inerte (pointer-events
 *  desligado) pra evitar abrir drawers/enviar formulários sem querer
 *  enquanto se está reorganizando o layout. */
export function EditableWidgetFrame({
  id,
  label,
  width,
  onRemove,
  onToggleWidth,
  children,
}: {
  id: DashboardWidgetId
  label: string
  width: DashboardWidgetWidth
  onRemove: () => void
  onToggleWidth: () => void
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`overflow-hidden rounded-2xl border-2 border-dashed bg-blue-50/30 transition-opacity ${
        isDragging ? 'border-brand-500 opacity-50' : 'border-blue-400'
      }`}
    >
      <div className="flex items-center justify-between gap-2 bg-blue-50 px-3 py-1.5">
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="flex min-w-0 cursor-grab items-center gap-1.5 text-slate-500 hover:text-slate-700 active:cursor-grabbing"
          title="Arrastar para reordenar"
        >
          <GripVertical size={14} className="shrink-0" />
          <span className="truncate text-xs font-medium">{label}</span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggleWidth}
            className="flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-blue-100 hover:text-slate-700"
            title={width === 'full' ? 'Deixar meia largura' : 'Deixar largura total'}
          >
            {width === 'full' ? <Columns2 size={13} /> : <RectangleHorizontal size={13} />}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-red-100 hover:text-red-600"
            title="Remover widget"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="pointer-events-none p-2">{children}</div>
    </div>
  )
}
