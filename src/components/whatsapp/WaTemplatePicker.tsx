import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronRight, ExternalLink, FileText, Image as ImageIcon, LayoutTemplate, Phone, Reply, Search, Video } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, Input } from '../ui/Field'
import type { WaTemplate, WaTemplateExtras } from '../../types/whatsapp'

/* Escolha de modelo do WhatsApp: lista com busca + prévia do jeito que chega no celular.
 * Usado na conversa, nas configurações (follow-up, lembrete, carrinho) e no disparo. */

export const tplKey = (t: Pick<WaTemplate, 'name' | 'language'>) => `${t.name}|${t.language}`

export const CATEGORY_LABEL: Record<string, string> = { MARKETING: 'Marketing', UTILITY: 'Utilidade', AUTHENTICATION: 'Autenticação' }

const LANG_LABEL: Record<string, string> = { pt_BR: 'Português', en_US: 'Inglês', en: 'Inglês', es: 'Espanhol', es_ES: 'Espanhol' }

/** "boas_vindas_lead_2" → "Boas vindas lead 2" */
export function prettyTemplateName(name: string) {
  const s = name.replace(/[_-]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Troca as variáveis pelo valor; sem valor, mostra o nome da variável destacado. */
function renderParts(text: string, values: string[], names: string[]) {
  const parts: { t: string; v?: boolean }[] = []
  let last = 0
  for (const m of text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
    if (m.index! > last) parts.push({ t: text.slice(last, m.index) })
    const key = m[1]
    const i = /^\d+$/.test(key) ? Number(key) - 1 : names.indexOf(key)
    const val = values[i]?.trim()
    parts.push({ t: val || `{{${key}}}`, v: !val })
    last = m.index! + m[0].length
  }
  if (last < text.length) parts.push({ t: text.slice(last) })
  return parts
}

/** *negrito* e _itálico_ do WhatsApp, simples. */
function Rich({ text, values = [], names = [] }: { text: string; values?: string[]; names?: string[] }) {
  return (
    <>
      {renderParts(text, values, names).map((p, i) =>
        p.v ? (
          <mark key={i} className="rounded bg-amber-400/20 px-1 font-semibold text-amber-200">
            {p.t}
          </mark>
        ) : (
          <span key={i}>
            {p.t.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((seg, j) =>
              /^\*[^*]+\*$/.test(seg) ? <strong key={j}>{seg.slice(1, -1)}</strong> : /^_[^_]+_$/.test(seg) ? <em key={j}>{seg.slice(1, -1)}</em> : seg
            )}
          </span>
        )
      )}
    </>
  )
}

/** Balão do modelo como aparece no WhatsApp: topo, texto, rodapé e botões. */
export function TemplateBubble({ tpl, params = [], extras = {}, className = '' }: { tpl: WaTemplate; params?: string[]; extras?: WaTemplateExtras; className?: string }) {
  const h = tpl.header
  const media = h && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(h.format)
  const mediaLink = extras.headerMedia || h?.example || ''
  const [imgOk, setImgOk] = useState(true)
  useEffect(() => setImgOk(true), [mediaLink])
  return (
    <div className={`w-full max-w-[340px] overflow-hidden rounded-2xl rounded-tl-md bg-[var(--dk-surface-3)] text-[14px] leading-relaxed text-slate-800 shadow-md ring-1 ring-white/5 ${className}`}>
      {media && (
        <div className="p-1">
          {h!.format === 'IMAGE' && mediaLink && imgOk ? (
            <img src={mediaLink} alt="Imagem do topo do modelo" onError={() => setImgOk(false)} className="max-h-48 w-full rounded-xl object-cover" />
          ) : (
            <div className="flex h-28 flex-col items-center justify-center gap-1 rounded-xl bg-black/30 text-slate-400">
              {h!.format === 'VIDEO' ? <Video size={26} aria-hidden="true" /> : h!.format === 'DOCUMENT' ? <FileText size={26} aria-hidden="true" /> : <ImageIcon size={26} aria-hidden="true" />}
              <span className="text-xs">{h!.format === 'VIDEO' ? 'Vídeo' : h!.format === 'DOCUMENT' ? 'Documento' : 'Imagem'} no topo</span>
            </div>
          )}
        </div>
      )}
      <div className="px-3 pb-2 pt-2">
        {h?.format === 'TEXT' && h.text && (
          <p className="mb-1 font-bold">
            <Rich text={h.text} values={[extras.headerText || '']} names={[h.varName]} />
          </p>
        )}
        <p className="whitespace-pre-wrap break-words">
          <Rich text={tpl.body} values={params} names={tpl.varNames || []} />
        </p>
        {tpl.footer && <p className="mt-1 text-[12px] text-slate-400">{tpl.footer}</p>}
        <p className="mt-0.5 text-right text-[10.5px] text-slate-400" aria-hidden="true">
          10:30
        </p>
      </div>
      {(tpl.buttons || []).length > 0 && (
        <div className="divide-y divide-white/5 border-t border-white/5">
          {tpl.buttons!.map((b, i) => (
            <div key={i} className="flex items-center justify-center gap-1.5 py-2 text-[13.5px] font-medium text-sky-400">
              {b.type === 'URL' ? <ExternalLink size={14} aria-hidden="true" /> : b.type === 'PHONE_NUMBER' ? <Phone size={14} aria-hidden="true" /> : <Reply size={14} aria-hidden="true" />}
              {b.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CategoryChip({ category }: { category: string }) {
  const tone = category === 'MARKETING' ? 'bg-violet-500/15 text-violet-300' : category === 'UTILITY' ? 'bg-sky-500/15 text-sky-300' : 'bg-slate-500/15 text-slate-300'
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{CATEGORY_LABEL[category] || category}</span>
}

/** Janela de escolha: lista à esquerda, prévia à direita (no celular, um embaixo do outro). */
export function TemplatePickerModal({
  open,
  onClose,
  templates,
  value,
  onPick,
  title = 'Escolher modelo',
}: {
  open: boolean
  onClose: () => void
  templates: WaTemplate[]
  value: string
  onPick: (tpl: WaTemplate) => void
  title?: string
}) {
  const approved = useMemo(() => templates.filter((t) => t.status === 'APPROVED'), [templates])
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [focus, setFocus] = useState(value)
  const previewRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) {
      setFocus(value || (approved[0] ? tplKey(approved[0]) : ''))
      setQ('')
    }
  }, [open, value, approved])

  const cats = [...new Set(approved.map((t) => t.category))]
  const needle = q.trim().toLowerCase()
  const list = approved.filter((t) => (!cat || t.category === cat) && (!needle || `${t.name} ${prettyTemplateName(t.name)} ${t.body}`.toLowerCase().includes(needle)))
  const current = approved.find((t) => tplKey(t) === focus)

  const choose = (t: WaTemplate) => {
    onPick(t)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-5xl">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar pelo nome ou pelo texto"
              aria-label="Buscar modelo"
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Tipo de modelo">
            {['', ...cats].map((c) => (
              <button
                key={c || 'all'}
                type="button"
                aria-pressed={cat === c}
                onClick={() => setCat(c)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${cat === c ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {c ? CATEGORY_LABEL[c] || c : `Todos (${approved.length})`}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_380px]">
          <ul className="flex max-h-[52vh] flex-col gap-1.5 overflow-y-auto pr-1 md:max-h-[60vh]" aria-label="Modelos aprovados">
            {list.length === 0 && <li className="py-10 text-center text-sm text-slate-400">Nenhum modelo com esse filtro.</li>}
            {list.map((t) => {
              const k = tplKey(t)
              const on = k === focus
              return (
                <li key={k}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setFocus(k)
                      if (window.matchMedia('(max-width: 767px)').matches) previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }}
                    onDoubleClick={() => choose(t)}
                    className={`group flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                      on ? 'border-brand-500 bg-brand-500/10' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400" aria-hidden="true">
                      {t.header && t.header.format === 'IMAGE' ? <ImageIcon size={16} /> : t.header?.format === 'VIDEO' ? <Video size={16} /> : <LayoutTemplate size={16} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-slate-800">{prettyTemplateName(t.name)}</span>
                        <CategoryChip category={t.category} />
                        {t.language !== 'pt_BR' && <span className="text-[11px] text-slate-400">{LANG_LABEL[t.language] || t.language}</span>}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-slate-500">{t.body}</span>
                    </span>
                    <ChevronRight size={16} className={`mt-2 shrink-0 ${on ? 'text-brand-500' : 'text-slate-300'}`} aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>

          <div ref={previewRef} className="wa-wall flex flex-col gap-3 rounded-2xl p-4 md:sticky md:top-0">
            {current ? (
              <>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{prettyTemplateName(current.name)}</p>
                  <p className="text-xs text-slate-400">
                    {CATEGORY_LABEL[current.category] || current.category} · {current.vars ? `${current.vars} variáve${current.vars === 1 ? 'l' : 'is'}` : 'sem variáveis'}
                    {current.header && current.header.format !== 'TEXT' ? ' · com mídia no topo' : ''}
                  </p>
                </div>
                <TemplateBubble tpl={current} />
                {current.vars > 0 && <p className="text-[11px] text-slate-400">As partes em amarelo são preenchidas depois (nome, empresa...).</p>}
                <Button onClick={() => choose(current)} icon={<Check size={15} aria-hidden="true" />} className="mt-auto w-full">
                  Usar este modelo
                </Button>
              </>
            ) : (
              <p className="m-auto py-10 text-center text-sm text-slate-400">Toque num modelo para ver como ele chega.</p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

/** Campo que abre a janela de modelos. value = "nome|idioma" ('' = nenhum). */
export function TemplatePickerField({
  templates,
  value,
  onChange,
  label,
  allowNone = false,
  noneLabel = 'Nenhum',
}: {
  templates: WaTemplate[]
  value: string
  onChange: (tpl: WaTemplate | null) => void
  label: string
  allowNone?: boolean
  noneLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const approved = templates.filter((t) => t.status === 'APPROVED')
  const tpl = approved.find((t) => tplKey(t) === value)
  const missing = value && !tpl
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!approved.length}
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
        >
          <LayoutTemplate size={17} className="shrink-0 text-emerald-400" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {tpl ? (
              <>
                <span className="block truncate text-sm font-semibold text-slate-800">{prettyTemplateName(tpl.name)}</span>
                <span className="block truncate text-xs text-slate-500">{tpl.body}</span>
              </>
            ) : missing ? (
              <span className="block truncate text-sm text-amber-400">{value.split('|')[0]} (não aprovado ou não encontrado)</span>
            ) : (
              <span className="block text-sm text-slate-400">{approved.length ? `Escolher entre ${approved.length} modelos` : 'Nenhum modelo aprovado ainda'}</span>
            )}
          </span>
          <span className="shrink-0 text-xs font-semibold text-brand-500">{tpl ? 'Trocar' : 'Escolher'}</span>
        </button>
        {allowNone && value && (
          <Button variant="ghost" onClick={() => onChange(null)} aria-label={`${noneLabel}: tirar o modelo`}>
            {noneLabel}
          </Button>
        )}
      </div>
      <TemplatePickerModal open={open} onClose={() => setOpen(false)} templates={templates} value={value} onPick={(t) => onChange(t)} />
    </div>
  )
}

/** O que um modelo pede além das variáveis do corpo: link da mídia, texto do topo, final do link do botão. */
export function templateNeeds(tpl: WaTemplate | undefined) {
  const h = tpl?.header
  return {
    media: h && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(h.format) ? h.format : '',
    headerVar: Boolean(h && h.format === 'TEXT' && h.vars),
    urlButtons: (tpl?.buttons || []).map((b, i) => ({ ...b, index: i })).filter((b) => b.type === 'URL' && b.urlVar),
  }
}

export function TemplateExtraFields({ tpl, extras, onChange }: { tpl: WaTemplate; extras: WaTemplateExtras; onChange: (e: WaTemplateExtras) => void }) {
  const need = templateNeeds(tpl)
  if (!need.media && !need.headerVar && !need.urlButtons.length) return null
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {need.media && (
        <div className="sm:col-span-2">
          <Field label={`Link ${need.media === 'IMAGE' ? 'da imagem' : need.media === 'VIDEO' ? 'do vídeo' : 'do documento'} do topo`} hint="Vazio = usa a do exemplo aprovado no Meta. Para trocar, cole o link direto e público do arquivo.">
            <Input value={extras.headerMedia || ''} onChange={(e) => onChange({ ...extras, headerMedia: e.target.value.trim() })} placeholder="https://..." inputMode="url" />
          </Field>
        </div>
      )}
      {need.headerVar && (
        <Field label="Texto do título (topo)">
          <Input value={extras.headerText || ''} onChange={(e) => onChange({ ...extras, headerText: e.target.value })} maxLength={60} />
        </Field>
      )}
      {need.urlButtons.map((b) => (
        <Field key={b.index} label={`Final do link do botão "${b.text}"`} hint={b.url.replace(/\{\{\s*\w+\s*\}\}/, '…')}>
          <Input value={extras.buttonParams?.[b.index] || ''} onChange={(e) => onChange({ ...extras, buttonParams: { ...(extras.buttonParams || {}), [b.index]: e.target.value.trim() } })} />
        </Field>
      ))}
    </div>
  )
}
