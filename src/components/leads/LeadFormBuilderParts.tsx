import { useRef, useState, type ReactNode } from 'react'
import { Upload, X, CheckCircle2, AlertCircle, ChevronDown } from 'lucide-react'
import { Spinner } from '../ui/FullPageSpinner'
import { Input } from '../ui/Field'
import { uploadLeadFormImage, LEAD_FORM_IMAGE_ACCEPT_ATTR } from '../../services/leadFormAssetService'
import { parseYouTubeId } from '../../utils/youtube'
import type { LeadFormDesign } from '../../types/leadForm'
import { showError } from '../../utils/notifyError'

/** Bloco com título + explicação curta — usado pra dividir o painel de edição
 *  de cada tela em grupos fáceis de bater o olho. */
export function EditorSection({
  title,
  hint,
  children,
  collapsible = false,
  defaultOpen = true,
  badge,
}: {
  title: string
  hint?: string
  children: ReactNode
  /** Seção que começa fechada (só o título) — pra o painel não virar uma
   *  lista enorme de campos que quase ninguém usa. */
  collapsible?: boolean
  defaultOpen?: boolean
  badge?: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const expanded = !collapsible || open
  const heading = (
    <>
      <h3 className="text-[13px] font-semibold text-slate-800">{title}</h3>
      {badge}
      {collapsible && <ChevronDown size={14} className={`ml-auto text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />}
    </>
  )
  return (
    <section className="flex flex-col gap-2.5 border-b border-slate-100 pb-4 last:border-b-0 last:pb-0">
      <div>
        {collapsible ? (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 text-left">
            {heading}
          </button>
        ) : (
          <div className="flex items-center gap-2">{heading}</div>
        )}
        {hint && expanded && <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{hint}</p>}
      </div>
      {expanded && children}
    </section>
  )
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-start gap-3 text-left">
      <span className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-brand-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-700">{label}</span>
        {hint && <span className="block text-xs leading-relaxed text-slate-400">{hint}</span>}
      </span>
    </button>
  )
}

/** Modelos prontos de cor (fundo + destaque) — um atalho pra quem não quer
 *  escolher cor por cor, sem tirar a opção de personalizar tudo à mão logo
 *  abaixo (os dois seletores de cor continuam livres pra qualquer valor). */
type ColorPreset = { name: string; backgroundColor: string; cardColor: string; primaryColor: string; buttonTextColor: string; textColor: string }

/** Cada modelo define TODAS as cores (antes só fundo + botão, e uma cor de
 *  texto/cartão escolhida antes ficava misturada — ex: texto claro em fundo claro). */
/** Cores com que todo formulário novo começa (nada de página toda branca). */
export const DEFAULT_FORM_COLORS: ColorPreset = { name: 'Azul vivo', backgroundColor: '#1D4ED8', cardColor: '#1E40AF', primaryColor: '#FACC15', buttonTextColor: '#172554', textColor: '#FFFFFF' }

const COLOR_PRESETS: ColorPreset[] = [
  DEFAULT_FORM_COLORS,
  { name: 'Azul', backgroundColor: '#F8FAFC', cardColor: '#FFFFFF', primaryColor: '#2563EB', buttonTextColor: '#FFFFFF', textColor: '#0F172A' },
  { name: 'Verde', backgroundColor: '#F0FDF4', cardColor: '#FFFFFF', primaryColor: '#16A34A', buttonTextColor: '#FFFFFF', textColor: '#14532D' },
  { name: 'Roxo', backgroundColor: '#FAF5FF', cardColor: '#FFFFFF', primaryColor: '#9333EA', buttonTextColor: '#FFFFFF', textColor: '#3B0764' },
  { name: 'Laranja', backgroundColor: '#FFF7ED', cardColor: '#FFFFFF', primaryColor: '#EA580C', buttonTextColor: '#FFFFFF', textColor: '#431407' },
  { name: 'Rosa', backgroundColor: '#FDF2F8', cardColor: '#FFFFFF', primaryColor: '#DB2777', buttonTextColor: '#FFFFFF', textColor: '#500724' },
  { name: 'Vermelho', backgroundColor: '#FEF2F2', cardColor: '#FFFFFF', primaryColor: '#DC2626', buttonTextColor: '#FFFFFF', textColor: '#450A0A' },
  { name: 'Grafite', backgroundColor: '#F1F5F9', cardColor: '#FFFFFF', primaryColor: '#334155', buttonTextColor: '#FFFFFF', textColor: '#0F172A' },
  { name: 'Escuro', backgroundColor: '#0F172A', cardColor: '#1E293B', primaryColor: '#38BDF8', buttonTextColor: '#0F172A', textColor: '#F1F5F9' },
  { name: 'Preto', backgroundColor: '#0A0A0A', cardColor: '#171717', primaryColor: '#FACC15', buttonTextColor: '#0A0A0A', textColor: '#FAFAFA' },
]

const same = (a?: string, b?: string) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase()

export function ColorPresetPicker({ design, onDesignChange }: { design: LeadFormDesign; onDesignChange: (next: LeadFormDesign) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {COLOR_PRESETS.map((p) => {
        const active =
          same(design.backgroundColor || '#F8FAFC', p.backgroundColor) &&
          same(design.primaryColor || '#2563EB', p.primaryColor) &&
          same(design.textColor || '#0F172A', p.textColor)
        return (
          <button
            key={p.name}
            type="button"
            title={p.name}
            onClick={() =>
              onDesignChange({
                ...design,
                backgroundColor: p.backgroundColor,
                cardColor: p.cardColor,
                primaryColor: p.primaryColor,
                buttonTextColor: p.buttonTextColor,
                textColor: p.textColor,
                screenColors: undefined,
              })
            }
            className={`flex flex-col overflow-hidden rounded-lg border-2 text-left transition-colors ${active ? 'border-brand-600' : 'border-slate-200 hover:border-slate-300'}`}
          >
            {/* `background` (não backgroundColor) pro modo escuro do CRM não recolorir a amostra */}
            <span className="flex h-11 w-full items-center justify-center gap-1.5 px-2" style={{ background: p.backgroundColor }}>
              <span className="text-[11px] font-bold" style={{ color: p.textColor }}>Aa</span>
              <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: p.primaryColor, color: p.buttonTextColor }}>
                Botão
              </span>
            </span>
            <span className="block w-full truncate bg-white px-1.5 py-1 text-center text-[11px] font-medium text-slate-600">{p.name}</span>
          </button>
        )
      })}
    </div>
  )
}

export function ColorField({ label, hint, value, fallback, onChange }: { label: string; hint: string; value?: string; fallback: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <input type="color" value={value || fallback} onChange={(e) => onChange(e.target.value)} className="h-9 w-11 shrink-0 cursor-pointer rounded border border-slate-200 bg-white" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="text-xs text-slate-400">{hint}</p>
      </div>
    </div>
  )
}

export function ImageUploadField({
  label,
  url,
  formId,
  assetKey,
  sizeHint,
  canUpload,
  onChange,
}: {
  label: string
  url?: string | null
  formId: string
  assetKey: string
  sizeHint: 'banner' | 'logo'
  /** false enquanto o link (slug) do formulário não foi definido — o
   *  caminho no Storage usa esse id. */
  canUpload: boolean
  onChange: (url: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFile = async (file: File) => {
    setUploading(true)
    try {
      onChange(await uploadLeadFormImage(formId, assetKey, file, sizeHint))
    } catch (err) {
      showError(err, 'Erro ao enviar imagem')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-slate-500">{label}</span>
      {url ? (
        <div className="flex items-center gap-2">
          <img src={url} alt="" className={sizeHint === 'banner' ? 'h-14 w-24 rounded object-cover' : 'h-14 w-14 rounded-full object-cover'} />
          <button type="button" onClick={() => onChange(null)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-500">
            <X size={12} /> Remover
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || !canUpload}
          title={canUpload ? undefined : 'Defina o link do formulário (no topo) pra poder enviar imagens'}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-500 hover:border-brand-400 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {uploading ? <Spinner className="h-3.5 w-3.5" /> : <Upload size={13} />}
          {uploading ? 'Enviando...' : canUpload ? 'Enviar imagem' : 'Defina o link no topo pra enviar'}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={LEAD_FORM_IMAGE_ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void handleFile(file)
        }}
      />
    </div>
  )
}

/** Campo de link do YouTube: aceita qualquer formato de link (watch, youtu.be,
 *  shorts…), mostra na hora se reconheceu o vídeo e uma miniatura. */
export function VideoField({ label, value, onChange, hint }: { label: string; value?: string; onChange: (v: string) => void; hint?: string }) {
  const id = parseYouTubeId(value)
  const filled = !!value?.trim()
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="Cole o link do YouTube (ex: https://youtu.be/...)" />
      {filled && (
        <div className={`mt-1.5 flex items-center gap-2 text-xs ${id ? 'text-emerald-600' : 'text-amber-600'}`}>
          {id ? (
            <>
              <img src={`https://img.youtube.com/vi/${id}/mqdefault.jpg`} alt="" className="h-9 w-16 rounded object-cover" />
              <CheckCircle2 size={13} /> Vídeo reconhecido
            </>
          ) : (
            <>
              <AlertCircle size={13} /> Não consegui reconhecer esse link — use o link normal do vídeo no YouTube
            </>
          )}
        </div>
      )}
      {hint && !filled && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}
