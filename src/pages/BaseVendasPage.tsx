import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, Check, Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useBaseVendas } from '../hooks/useBaseVendas'
import { saveBaseVendas } from '../services/baseVendasService'
import { Textarea, Input } from '../components/ui/Field'
import { FullPageSpinner } from '../components/ui/FullPageSpinner'
import { BASE_VENDAS_FIELD_ORDER } from '../types/baseVendas'
import type { BaseVendas, BaseVendasObjecao } from '../types/baseVendas'
import { DEFAULT_BASE_VENDAS } from '../config/baseVendasDefault'

type FormState = Omit<BaseVendas, 'updatedAt' | 'updatedBy'>

const AUTOSAVE_DELAY_MS = 900

function ObjecoesEditor({ items, onChange }: { items: BaseVendasObjecao[]; onChange: (items: BaseVendasObjecao[]) => void }) {
  const add = () => onChange([...items, { id: crypto.randomUUID(), objecao: '', resposta: '' }])
  const remove = (id: string) => onChange(items.filter((o) => o.id !== id))
  const update = (id: string, patch: Partial<BaseVendasObjecao>) =>
    onChange(items.map((o) => (o.id === id ? { ...o, ...patch } : o)))

  return (
    <div className="flex flex-col gap-3">
      {items.map((o) => (
        <div key={o.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <span className="mb-1 block text-xs font-medium text-slate-500">Objeção</span>
              <Input value={o.objecao} onChange={(e) => update(o.id, { objecao: e.target.value })} placeholder='Ex: "Quero ver resultado primeiro"' />
            </div>
            <button
              onClick={() => remove(o.id)}
              title="Remover objeção"
              className="mt-5 rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-500">Resposta preferida do Bruno</span>
            <Textarea rows={2} value={o.resposta} onChange={(e) => update(o.id, { resposta: e.target.value })} />
          </div>
        </div>
      ))}
      <button
        onClick={add}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-sm font-medium text-slate-500 hover:border-brand-400 hover:text-brand-600"
      >
        <Plus size={14} /> Adicionar objeção
      </button>
    </div>
  )
}

function SaveIndicator({ saving, savedAt }: { saving: boolean; savedAt: number | null }) {
  if (saving) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-slate-400">
        <Loader2 size={12} className="animate-spin" /> Salvando…
      </span>
    )
  }
  if (savedAt) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-600">
        <Check size={12} /> Salvo
      </span>
    )
  }
  return null
}

/** Configurações → Base de Vendas — fonte ÚNICA do conhecimento comercial
 *  usada pelo Archer (chat de IA do CRM) e pelo Copiloto de Vendas
 *  (sugestões ao vivo). Campos sempre abertos, salvamento automático
 *  (debounce). Rota restrita a admin/manager (ver App.tsx) — mesma regra
 *  do Firestore. */
export function BaseVendasPage() {
  const { profile } = useAuth()
  const { data, loading } = useBaseVendas(profile?.id)
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const loadedOnceRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Só sincroniza do Firestore na primeira carga — depois disso o form
  // local é a fonte da verdade (senão o próprio auto-save, ao confirmar,
  // "pisaria" numa tecla ainda sendo digitada).
  useEffect(() => {
    if (loadedOnceRef.current) return
    if (data) {
      loadedOnceRef.current = true
      setForm(data)
    } else if (data === null && !loading) {
      // Hook já está semeando o padrão no Firestore — mostra o padrão de
      // cara, sem esperar o round-trip, pra tela não nascer vazia.
      loadedOnceRef.current = true
      setForm(DEFAULT_BASE_VENDAS)
    }
  }, [data, loading])

  const scheduleSave = (next: FormState) => {
    setForm(next)
    if (!profile) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaving(true)
    saveTimerRef.current = setTimeout(() => {
      saveBaseVendas(next, profile.id)
        .then(() => setSavedAt(Date.now()))
        .catch((err) => console.error('[baseVendas] falha ao salvar', err))
        .finally(() => setSaving(false))
    }, AUTOSAVE_DELAY_MS)
  }

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  if (!form) return <FullPageSpinner label="Carregando Base de Vendas…" />

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => scheduleSave({ ...form, [key]: value })

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-slate-900">Base de Vendas</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Fonte única de conhecimento comercial — usada pelo Archer e pelas sugestões ao vivo do Copiloto de Vendas.
          </p>
        </div>
        <SaveIndicator saving={saving} savedAt={savedAt} />
      </div>

      <div className="flex flex-col gap-4">
        {BASE_VENDAS_FIELD_ORDER.slice(0, 8).map(({ key, label, rows }) => (
          <div key={key} className="rounded-xl border border-slate-200 bg-white p-4">
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
            <Textarea rows={rows} value={form[key]} onChange={(e) => setField(key, e.target.value)} />
          </div>
        ))}

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <label className="mb-1.5 block text-sm font-semibold text-slate-700">Objeções comuns</label>
          <p className="mb-3 text-xs text-slate-400">Pares de objeção + resposta preferida do Bruno. Adicione ou remova à vontade.</p>
          <ObjecoesEditor items={form.objecoes} onChange={(objecoes) => setField('objecoes', objecoes)} />
        </div>

        {BASE_VENDAS_FIELD_ORDER.slice(8).map(({ key, label, rows }) => (
          <div key={key} className="rounded-xl border border-slate-200 bg-white p-4">
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
            <Textarea rows={rows} value={form[key]} onChange={(e) => setField(key, e.target.value)} />
          </div>
        ))}
      </div>
    </div>
  )
}
