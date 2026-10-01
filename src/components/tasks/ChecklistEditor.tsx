import { useEffect, useState } from 'react'
import { Plus, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import type { ChecklistItem } from '../../types/task'

/** `onChange` recebe o checklist completo já com a mudança aplicada. Se
 *  devolver uma Promise que rejeita (save no Firebase falhou), o editor
 *  mostra "salvando" enquanto aguarda e reverte + avisa em caso de erro.
 *  Também aceita um setState síncrono (uso em formulários em memória). */
export function ChecklistEditor({
  items,
  onChange,
}: {
  items: ChecklistItem[]
  onChange: (items: ChecklistItem[]) => void | Promise<void>
}) {
  const [text, setText] = useState('')
  // Estado otimista: enquanto o save está no ar, mostramos a mudança na hora;
  // se o servidor confirmar (o prop `items` chega igual) largamos o override,
  // se falhar revertemos.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [busyList, setBusyList] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  // Toda vez que o `items` do servidor chega (snapshot novo — inclusive o
  // snapshot otimista do cache local, ou uma reversão quando o servidor
  // recusa a escrita), ele passa a ser a fonte da verdade: descarta os
  // overrides. Também cobre edições feitas por outra pessoa.
  useEffect(() => {
    setOverrides((prev) => (Object.keys(prev).length === 0 ? prev : {}))
  }, [items])

  const view = items.map((it) => (it.id in overrides ? { ...it, done: overrides[it.id] } : it))
  const done = view.filter((i) => i.done).length

  const setSavingId = (id: string, on: boolean) =>
    setSaving((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })

  const dropOverride = (id: string) =>
    setOverrides((o) => {
      if (!(id in o)) return o
      const n = { ...o }
      delete n[id]
      return n
    })

  const toggle = async (id: string, next: boolean) => {
    setOverrides((o) => ({ ...o, [id]: next }))
    setSavingId(id, true)
    try {
      await Promise.resolve(onChange(view.map((i) => (i.id === id ? { ...i, done: next } : i))))
      dropOverride(id) // servidor confirmou — `items` já reflete
      const item = view.find((i) => i.id === id)
      if (item) setAnnouncement(`${next ? 'Marcado' : 'Desmarcado'}: ${item.text}`)
    } catch (err) {
      console.error('[checklist] falha ao salvar item', err)
      toast.error('Não foi possível salvar o item. Revertido.')
      dropOverride(id) // volta ao estado do servidor
    } finally {
      setSavingId(id, false)
    }
  }

  const add = async () => {
    const value = text.trim()
    if (!value || busyList) return
    setBusyList(true)
    try {
      await Promise.resolve(onChange([...view, { id: crypto.randomUUID(), text: value, done: false }]))
      setText('')
      setAnnouncement(`Item adicionado: ${value}`)
    } catch (err) {
      console.error('[checklist] falha ao adicionar item', err)
      toast.error('Não foi possível adicionar o item.')
    } finally {
      setBusyList(false)
    }
  }

  const remove = async (id: string) => {
    if (busyList) return
    setBusyList(true)
    try {
      const removed = view.find((i) => i.id === id)
      await Promise.resolve(onChange(view.filter((i) => i.id !== id)))
      if (removed) setAnnouncement(`Item removido: ${removed.text}`)
    } catch (err) {
      console.error('[checklist] falha ao remover item', err)
      toast.error('Não foi possível remover o item.')
    } finally {
      setBusyList(false)
    }
  }

  return (
    <div>
      {view.length > 0 && (
        <div
          role="progressbar"
          aria-label="Progresso do checklist"
          aria-valuemin={0}
          aria-valuemax={view.length}
          aria-valuenow={done}
          aria-valuetext={`${done} de ${view.length} itens concluídos`}
          className="mb-2 h-1 w-full overflow-hidden rounded-full bg-slate-100"
        >
          <div className="h-full bg-brand-500 transition-all" style={{ width: `${(done / view.length) * 100}%` }} />
        </div>
      )}
      {/* Leitor de tela: anuncia o que acabou de ser marcado/desmarcado. */}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <ul className="flex flex-col gap-1" aria-label={`Checklist, ${done} de ${view.length} itens concluídos`}>
        {view.map((item) => {
          const isSaving = saving.has(item.id)
          const inputId = `checklist-${item.id}`
          return (
            <li key={item.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-slate-50">
              {/* O checkbox fica sempre montado (mesmo salvando) pra não perder o foco do teclado. */}
              <input
                id={inputId}
                type="checkbox"
                checked={item.done}
                aria-busy={isSaving}
                onChange={(e) => toggle(item.id, e.target.checked)}
                className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
              />
              <label htmlFor={inputId} className={`flex-1 cursor-pointer text-sm ${item.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                {item.text}
              </label>
              {isSaving && <Loader2 size={14} className="animate-spin text-brand-500" aria-hidden="true" />}
              <button
                type="button"
                onClick={() => remove(item.id)}
                disabled={busyList}
                aria-label={`Remover item: ${item.text}`}
                className="rounded text-slate-300 opacity-0 hover:text-red-500 focus:opacity-100 disabled:opacity-40 group-hover:opacity-100"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>
      <div className="mt-1.5 flex items-center gap-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Adicionar item..."
          aria-label="Novo item do checklist"
          className="flex-1 rounded-md border border-transparent px-1.5 py-1 text-sm outline-none placeholder:text-slate-400 focus:border-slate-200"
        />
        <button
          type="button"
          onClick={add}
          disabled={busyList || !text.trim()}
          aria-label="Adicionar item ao checklist"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
        >
          {busyList ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}
