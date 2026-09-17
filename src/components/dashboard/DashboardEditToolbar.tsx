import { Plus, RotateCcw, Save, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { WIDGET_LABEL } from './dashboardWidgetCatalog'
import type { DashboardWidgetId } from '../../types/dashboardLayout'

export function DashboardEditToolbar({
  availableWidgetIds,
  onAddWidget,
  onSave,
  onCancel,
  onRestoreDefault,
  saving,
}: {
  availableWidgetIds: DashboardWidgetId[]
  onAddWidget: (id: DashboardWidgetId) => void
  onSave: () => void
  onCancel: () => void
  onRestoreDefault: () => void
  saving: boolean
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-blue-300 bg-blue-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-600">Modo de edição — arraste os widgets pra reordenar</p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />} onClick={onRestoreDefault}>
            Restaurar padrão
          </Button>
          <Button variant="secondary" size="sm" icon={<X size={13} />} onClick={onCancel}>
            Cancelar
          </Button>
          <Button size="sm" icon={<Save size={13} />} onClick={onSave} loading={saving}>
            Salvar layout
          </Button>
        </div>
      </div>

      {availableWidgetIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-blue-200 pt-3">
          <span className="text-xs font-medium text-slate-500">Adicionar:</span>
          {availableWidgetIds.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onAddWidget(id)}
              className="flex items-center gap-1 rounded-full border border-blue-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-brand-400 hover:text-brand-600"
            >
              <Plus size={11} />
              {WIDGET_LABEL[id]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
