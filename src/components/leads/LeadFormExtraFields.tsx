import { useRef, useState } from 'react'
import { Check, FileUp, Loader2, Plus, X } from 'lucide-react'
import { decodeFileAnswer, encodeFileAnswer, LEAD_FORM_FILE_ACCEPT, LEAD_FORM_FILE_MAX_COUNT, LEAD_FORM_FILE_MAX_MB, type LeadFormUploadedFile } from '../../utils/leadFormFiles'
import type { LeadFormTheme } from './leadFormUtils'

/** Campos dos tipos de resposta "Lista", "Arquivo" e "Confirmação" na página
 *  do formulário (os demais tipos ficam no próprio LeadFormRenderer). */

export function ListAnswerField({
  value,
  onChange,
  placeholder,
  addLabel,
  autoFocus,
  invalid,
  inputClass,
  theme,
}: {
  value: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  addLabel?: string
  autoFocus: boolean
  invalid: boolean
  inputClass: string
  theme: LeadFormTheme
}) {
  const items = value.length > 0 ? value : ['']
  const [focusIndex, setFocusIndex] = useState<number | null>(autoFocus ? 0 : null)
  const set = (i: number, v: string) => onChange(items.map((x, idx) => (idx === i ? v : x)))
  const add = () => {
    onChange([...items, ''])
    setFocusIndex(items.length)
  }
  const remove = (i: number) => {
    const next = items.filter((_, idx) => idx !== i)
    onChange(next.length ? next : [''])
    setFocusIndex(Math.max(0, i - 1))
  }
  const canAdd = items[items.length - 1]?.trim() !== ''

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-center text-xs text-slate-400" style={theme.text ? { color: theme.text, opacity: 0.6 } : undefined}>
            {i + 1}.
          </span>
          <input
            autoFocus={focusIndex === i}
            className={`${inputClass} ${invalid && !item.trim() ? 'border-red-300' : ''}`}
            value={item}
            placeholder={placeholder || 'Escreva aqui'}
            onChange={(e) => set(i, e.target.value)}
            onKeyDown={(e) => {
              // Enter no último item preenchido abre o próximo (em vez de avançar a pergunta).
              if (e.key === 'Enter') {
                e.preventDefault()
                if (item.trim() && i === items.length - 1) add()
                else setFocusIndex(i + 1)
              }
            }}
          />
          {items.length > 1 && (
            <button type="button" onClick={() => remove(i)} aria-label="Remover" className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-500">
              <X size={15} />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        disabled={!canAdd}
        className="ml-7 flex w-fit items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-sm font-medium transition-opacity disabled:opacity-40"
        style={{ borderColor: theme.primary, color: theme.primary }}
      >
        <Plus size={14} /> {addLabel?.trim() || 'Adicionar outro'}
      </button>
    </div>
  )
}

export function FileAnswerField({
  value,
  onChange,
  onUpload,
  onUploadingChange,
  invalid,
  theme,
}: {
  value: string[]
  onChange: (v: string[]) => void
  /** Ausente no preview do construtor — lá o envio fica desligado. */
  onUpload?: (file: File) => Promise<LeadFormUploadedFile>
  onUploadingChange: (uploading: boolean) => void
  invalid: boolean
  theme: LeadFormTheme
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const files = value.map(decodeFileAnswer).filter((f): f is LeadFormUploadedFile => !!f)

  const pick = async (list: FileList | null) => {
    if (!list || !onUpload) return
    setProblem(null)
    const room = LEAD_FORM_FILE_MAX_COUNT - files.length
    const chosen = Array.from(list).slice(0, room)
    const tooBig = chosen.filter((f) => f.size > LEAD_FORM_FILE_MAX_MB * 1024 * 1024)
    const ok = chosen.filter((f) => f.size <= LEAD_FORM_FILE_MAX_MB * 1024 * 1024)
    if (tooBig.length) setProblem(`${tooBig.map((f) => f.name).join(', ')}: passa de ${LEAD_FORM_FILE_MAX_MB} MB.`)
    if (list.length > room) setProblem(`Dá pra enviar até ${LEAD_FORM_FILE_MAX_COUNT} arquivos.`)
    if (!ok.length) return
    setUploading((n) => n + ok.length)
    onUploadingChange(true)
    const done: string[] = []
    for (const f of ok) {
      try {
        done.push(encodeFileAnswer(await onUpload(f)))
      } catch (err) {
        console.error(err)
        setProblem(`Não foi possível enviar ${f.name}. Tente de novo.`)
      }
    }
    setUploading((n) => n - ok.length)
    onUploadingChange(false)
    if (done.length) onChange([...value, ...done])
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="flex flex-col gap-2">
      {files.map((f, i) => (
        <div key={f.path} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
          <Check size={15} className="shrink-0 text-emerald-500" />
          <span className="min-w-0 flex-1 truncate">{f.name}</span>
          <button
            type="button"
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            aria-label={`Tirar ${f.name}`}
            className="shrink-0 rounded p-1 text-slate-400 hover:text-red-500"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      {files.length < LEAD_FORM_FILE_MAX_COUNT && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={!onUpload || uploading > 0}
          className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
            invalid ? 'border-red-300' : ''
          }`}
          style={invalid ? { color: theme.primary } : { borderColor: `${theme.primary}66`, color: theme.primary }}
        >
          {uploading > 0 ? <Loader2 size={22} className="animate-spin" /> : <FileUp size={22} />}
          {uploading > 0 ? 'Enviando…' : files.length ? 'Enviar mais um arquivo' : 'Escolher arquivo'}
          <span className="text-xs font-normal opacity-70">
            {onUpload ? `Imagem, PDF, AI, CDR, PSD ou ZIP · até ${LEAD_FORM_FILE_MAX_MB} MB` : 'No preview o envio fica desligado'}
          </span>
        </button>
      )}
      <input ref={inputRef} type="file" multiple accept={LEAD_FORM_FILE_ACCEPT} className="hidden" onChange={(e) => void pick(e.target.files)} />
      {problem && <p className="text-xs text-red-500">{problem}</p>}
    </div>
  )
}

export function ConfirmAnswerField({
  checked,
  label,
  onChange,
  invalid,
  theme,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
  invalid: boolean
  theme: LeadFormTheme
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left text-sm transition-colors ${checked ? '' : invalid ? 'border-red-300' : 'border-slate-200'}`}
      style={checked ? { borderColor: theme.primary, background: `${theme.primary}1A`, color: theme.primary } : theme.text ? { color: theme.text } : undefined}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? '' : 'border-slate-300 bg-white'}`}
        style={checked ? { borderColor: theme.primary, background: theme.primary } : undefined}
      >
        {checked && <Check size={13} strokeWidth={3} style={{ color: theme.buttonText }} />}
      </span>
      <span className="font-medium">{label}</span>
    </button>
  )
}
