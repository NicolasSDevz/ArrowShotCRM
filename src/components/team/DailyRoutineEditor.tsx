import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, Trash2, Plus, Save } from 'lucide-react'
import { Button } from '../ui/Button'
import { saveDailyRoutineItems } from '../../services/dailyRoutineItemsService'
import { resolveRoutinePersonKey, materializeDefaultRoutine, type RoutineItem } from '../../services/dailyRoutineTemplates'

function makeId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `item-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function SortableRow({
  item,
  editing,
  onStartEdit,
  onChangeText,
  onCommitEdit,
  onRemove,
}: {
  item: RoutineItem
  editing: boolean
  onStartEdit: () => void
  onChangeText: (v: string) => void
  onCommitEdit: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-2.5 py-2 ${isDragging ? 'opacity-50' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        className="shrink-0 cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing"
        title="Arrastar para reordenar"
      >
        <GripVertical size={15} />
      </button>
      {editing ? (
        <input
          autoFocus
          value={item.text}
          onChange={(e) => onChangeText(e.target.value)}
          onBlur={onCommitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onCommitEdit()
            }
          }}
          className="min-w-0 flex-1 rounded border border-brand-300 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-brand-100"
        />
      ) : (
        <span className="min-w-0 flex-1 text-sm text-slate-700">{item.text}</span>
      )}
      <button
        type="button"
        onClick={onStartEdit}
        className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        title="Editar"
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
        title="Remover"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

/** Lista editável da rotina diária de uma pessoa — usada tanto no modal
 *  aberto pelo widget do Dashboard (rotina do próprio usuário logado)
 *  quanto na ficha do membro em Equipe (admin editando a de qualquer um).
 *  Edição fica só em estado local até "Salvar rotina"; "Cancelar" descarta. */
export function DailyRoutineEditor({
  userId,
  userName,
  initialItems,
  onDone,
}: {
  userId: string
  userName: string
  initialItems: RoutineItem[]
  onDone?: () => void
}) {
  const [items, setItems] = useState<RoutineItem[]>(initialItems)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newText, setNewText] = useState('')
  const [saving, setSaving] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Troca de usuário-alvo (ex.: admin abre a ficha de outro membro em
  // seguida) — reseta o rascunho pro estado salvo desse usuário.
  useEffect(() => {
    setItems(initialItems)
    setEditingId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const personKey = resolveRoutinePersonKey(userName)

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id)
      const newIndex = prev.findIndex((i) => i.id === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  const handleRemove = (id: string) => {
    if (!confirm('Remover este item?')) return
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  const handleAdd = () => {
    const text = newText.trim()
    if (!text) return
    setItems((prev) => [...prev, { id: makeId(), text }])
    setNewText('')
  }

  const handleRestoreDefault = () => {
    if (!personKey) return
    if (!confirm('Restaurar os itens padrão? As alterações não salvas serão perdidas.')) return
    setItems(materializeDefaultRoutine(personKey))
    setEditingId(null)
  }

  const handleCancel = () => {
    setItems(initialItems)
    setEditingId(null)
    onDone?.()
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveDailyRoutineItems(userId, items)
      toast.success('✅ Rotina atualizada!')
      onDone?.()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar a rotina')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1.5">
            {items.map((item) => (
              <SortableRow
                key={item.id}
                item={item}
                editing={editingId === item.id}
                onStartEdit={() => setEditingId(item.id)}
                onChangeText={(v) => setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, text: v } : i)))}
                onCommitEdit={() => setEditingId(null)}
                onRemove={() => handleRemove(item.id)}
              />
            ))}
            {items.length === 0 && <p className="py-2 text-center text-sm text-slate-400">Nenhum item ainda.</p>}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex items-center gap-2">
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAdd()
            }
          }}
          placeholder="Digite um novo item da rotina..."
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        />
        <Button type="button" variant="secondary" size="sm" icon={<Plus size={14} />} onClick={handleAdd}>
          Adicionar
        </Button>
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        {personKey ? (
          <button
            type="button"
            onClick={handleRestoreDefault}
            className="text-xs text-slate-400 underline underline-offset-2 hover:text-slate-600"
          >
            Restaurar padrão
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button type="button" size="sm" icon={<Save size={14} />} loading={saving} onClick={handleSave}>
            Salvar rotina
          </Button>
        </div>
      </div>
    </div>
  )
}
