import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Link2, MessageSquareReply, Plus, RefreshCw, Search, Send, Trash2, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { Field, Input, Textarea } from '../ui/Field'
import { createWaTemplate, deleteWaTemplate } from '../../services/whatsappService'
import type { WaTemplate } from '../../types/whatsapp'
import { TemplateBubble, prettyTemplateName } from './WaTemplatePicker'

/* Modelos de mensagem do WhatsApp: escrever, mandar pro Meta aprovar e acompanhar o status.
 * Servidor: createTemplate/deleteTemplate em api/_lib/whatsapp.js. */

type Group = 'approved' | 'pending' | 'rejected' | 'other'

const groupOf = (status: string): Group =>
  status === 'APPROVED' ? 'approved' : status === 'PENDING' || status === 'IN_APPEAL' ? 'pending' : status === 'REJECTED' ? 'rejected' : 'other'

const STATUS_INFO: Record<string, { label: string; tone: string }> = {
  APPROVED: { label: 'Aprovado', tone: 'bg-emerald-500/15 text-emerald-300' },
  PENDING: { label: 'Em análise no Meta', tone: 'bg-amber-500/15 text-amber-300' },
  IN_APPEAL: { label: 'Em recurso', tone: 'bg-amber-500/15 text-amber-300' },
  REJECTED: { label: 'Reprovado', tone: 'bg-red-500/15 text-red-300' },
  PAUSED: { label: 'Pausado pelo Meta', tone: 'bg-orange-500/15 text-orange-300' },
  DISABLED: { label: 'Desativado', tone: 'bg-slate-500/15 text-slate-300' },
  PENDING_DELETION: { label: 'Sendo apagado', tone: 'bg-slate-500/15 text-slate-300' },
}

const REJECT_REASON: Record<string, string> = {
  INVALID_FORMAT: 'Formato inválido (variáveis, emojis demais, texto quebrado ou link estranho).',
  ABUSIVE_CONTENT: 'O Meta achou o conteúdo abusivo ou contra as regras.',
  TAG_CONTENT_MISMATCH: 'A categoria não bate com o texto (ex.: marcado como Utilidade, mas é propaganda).',
  SCAM: 'O Meta achou que parece golpe.',
  INCORRECT_CATEGORY: 'Categoria errada.',
  PROMOTIONAL: 'Texto promocional numa categoria que não aceita.',
}

const CATEGORY_LABEL: Record<string, string> = { MARKETING: 'Marketing', UTILITY: 'Utilidade', AUTHENTICATION: 'Autenticação' }

const slug = (v: string) =>
  v
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const varsOf = (body: string) => {
  const out: string[] = []
  for (const m of body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) if (!out.includes(m[1])) out.push(m[1])
  return out
}

interface DraftButton {
  type: 'QUICK_REPLY' | 'URL'
  text: string
  url: string
}

const EMPTY = { name: '', category: 'MARKETING' as 'MARKETING' | 'UTILITY', header: '', body: '', footer: '', examples: [] as string[], buttons: [] as DraftButton[] }

function NewTemplateForm({ existing, onCreated, onCancel }: { existing: WaTemplate[]; onCreated: () => void; onCancel: () => void }) {
  const [d, setD] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<typeof EMPTY>) => setD((cur) => ({ ...cur, ...patch }))

  const name = slug(d.name)
  const vars = varsOf(d.body)
  const nameTaken = Boolean(name && existing.some((t) => t.name === name && t.language === 'pt_BR'))
  const badOrder = vars.some((v, i) => v !== String(i + 1))
  const edgeVar = /^\s*\{\{/.test(d.body) || /\}\}\s*[.!?]?\s*$/.test(d.body)
  const examplesOk = vars.every((_, i) => (d.examples[i] || '').trim())
  const buttonsOk = d.buttons.every((b) => b.text.trim() && b.text.length <= 25 && (b.type === 'QUICK_REPLY' || /^https?:\/\/\S+$/.test(b.url.trim())))
  const problem = !name
    ? 'Dê um nome para o modelo.'
    : nameTaken
      ? 'Já existe um modelo com esse nome. Use outro.'
      : !d.body.trim()
        ? 'Escreva o texto da mensagem.'
        : badOrder
          ? 'As partes variáveis precisam ser {{1}}, {{2}}, {{3}}... nessa ordem.'
          : edgeVar
            ? 'O Meta não aceita texto que começa ou termina com {{n}}. Coloque uma palavra antes/depois.'
            : !examplesOk
              ? 'Preencha um exemplo para cada parte variável.'
              : !buttonsOk
                ? 'Confira os botões (texto até 25 letras; link começando com https://).'
                : ''

  const addVar = () => set({ body: `${d.body}${d.body && !/\s$/.test(d.body) ? ' ' : ''}{{${vars.length + 1}}}` })

  const preview: WaTemplate = {
    name: name || 'novo_modelo',
    language: 'pt_BR',
    status: 'PENDING',
    category: d.category,
    paramFormat: 'POSITIONAL',
    body: d.body || 'O texto da mensagem aparece aqui.',
    vars: vars.length,
    varNames: vars,
    header: d.header.trim() ? { format: 'TEXT', text: d.header.trim(), vars: 0, varName: '', example: '' } : null,
    footer: d.footer.trim(),
    buttons: d.buttons.filter((b) => b.text.trim()).map((b) => ({ type: b.type, text: b.text.trim(), url: b.url, phone: '', urlVar: false })),
  }

  const submit = async () => {
    if (problem) return
    setSaving(true)
    try {
      const out = await createWaTemplate({
        name,
        category: d.category,
        language: 'pt_BR',
        header: d.header.trim(),
        body: d.body.trim(),
        examples: vars.map((_, i) => d.examples[i].trim()),
        footer: d.footer.trim(),
        buttons: d.buttons.map((b) => ({ type: b.type, text: b.text.trim(), url: b.url.trim() })),
      })
      toast.success(out.status === 'APPROVED' ? 'Modelo aprovado na hora pelo Meta!' : 'Modelo enviado. O Meta costuma responder entre minutos e algumas horas.')
      onCreated()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-brand-500/40 bg-white p-4" aria-label="Novo modelo">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-800">Novo modelo</h3>
        <button type="button" onClick={onCancel} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Fechar o novo modelo">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-3">
          <Field label="Nome do modelo" hint={name ? `No Meta fica: ${name}` : 'Só pra achar depois. Ex.: lembrete reuniao'}>
            <Input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="convite reuniao questionario" />
          </Field>
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-slate-500">Categoria</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['MARKETING', 'Marketing', 'Convite, oferta, chamar pra conversar. Mais cara (uns R$ 0,35).'],
                  ['UTILITY', 'Utilidade', 'Lembrete, confirmação, aviso de algo combinado. Mais barata.'],
                ] as const
              ).map(([v, label, hint]) => (
                <label key={v} className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 ${d.category === v ? 'border-brand-500 bg-brand-500/10' : 'border-slate-200'}`}>
                  <input type="radio" name="tpl-cat" checked={d.category === v} onChange={() => set({ category: v })} className="mt-1 accent-emerald-500" />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800">{label}</span>
                    <span className="block text-xs text-slate-400">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-400">Se o texto for propaganda, o Meta muda para Marketing sozinho (ou reprova).</p>
          </fieldset>
          <Field label="Título (opcional, até 60 letras)">
            <Input value={d.header} maxLength={60} onChange={(e) => set({ header: e.target.value })} placeholder="Sua reunião está chegando" />
          </Field>
          <Field label="Texto da mensagem" hint="Use {{1}}, {{2}}... para o que muda em cada pessoa (ex.: nome). Não comece nem termine com {{n}}.">
            <Textarea rows={6} maxLength={1024} value={d.body} onChange={(e) => set({ body: e.target.value })} placeholder={'Oi {{1}}, tudo bem? Vi que você respondeu o nosso questionário. Posso te mostrar como a Arrow Shot pode ajudar a sua empresa?'} className="text-[14px] leading-6" />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" icon={<Plus size={14} aria-hidden="true" />} onClick={addVar}>
              Inserir parte variável {`{{${vars.length + 1}}}`}
            </Button>
            <span className="text-xs text-slate-400">{d.body.length}/1024</span>
          </div>
          {vars.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl bg-amber-500/10 p-3">
              <span className="text-xs font-medium text-amber-200">O Meta pede um exemplo de cada parte variável</span>
              {vars.map((v, i) => (
                <label key={v} className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="w-10 shrink-0 font-semibold text-amber-300">{`{{${v}}}`}</span>
                  <Input
                    value={d.examples[i] || ''}
                    onChange={(e) => set({ examples: Array.from({ length: vars.length }, (_, j) => (j === i ? e.target.value : d.examples[j] || '')) })}
                    placeholder={i === 0 ? 'Maria' : 'exemplo'}
                    aria-label={`Exemplo para {{${v}}}`}
                  />
                </label>
              ))}
            </div>
          )}
          <Field label="Rodapé (opcional, até 60 letras)">
            <Input value={d.footer} maxLength={60} onChange={(e) => set({ footer: e.target.value })} placeholder="Arrow Shot Marketing" />
          </Field>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-slate-500">Botões (opcional)</span>
            {d.buttons.map((b, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-2">
                <span className="text-xs font-semibold text-slate-500">{b.type === 'URL' ? 'Link' : 'Resposta'}</span>
                <div className="min-w-[140px] flex-1">
                  <Input value={b.text} maxLength={25} onChange={(e) => set({ buttons: d.buttons.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} placeholder={b.type === 'URL' ? 'Entrar na reunião' : 'Quero saber mais'} aria-label={`Texto do botão ${i + 1}`} />
                </div>
                {b.type === 'URL' && (
                  <div className="min-w-[180px] flex-[2]">
                    <Input value={b.url} onChange={(e) => set({ buttons: d.buttons.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} placeholder="https://..." aria-label={`Link do botão ${i + 1}`} />
                  </div>
                )}
                <button type="button" onClick={() => set({ buttons: d.buttons.filter((_, j) => j !== i) })} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-400" aria-label={`Tirar o botão ${i + 1}`}>
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            ))}
            {d.buttons.length < 10 && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" icon={<MessageSquareReply size={14} aria-hidden="true" />} onClick={() => set({ buttons: [...d.buttons, { type: 'QUICK_REPLY', text: '', url: '' }] })}>
                  Botão de resposta
                </Button>
                {d.buttons.filter((b) => b.type === 'URL').length < 2 && (
                  <Button size="sm" variant="ghost" icon={<Link2 size={14} aria-hidden="true" />} onClick={() => set({ buttons: [...d.buttons, { type: 'URL', text: '', url: '' }] })}>
                    Botão de link
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="wa-wall flex flex-col gap-2 self-start rounded-2xl p-4">
          <span className="text-xs font-semibold text-slate-400">Como chega</span>
          <TemplateBubble tpl={preview} params={vars.map((_, i) => d.examples[i] || `{{${i + 1}}}`)} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {problem && <span className="text-xs text-slate-400">{problem}</span>}
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={submit} loading={saving} disabled={Boolean(problem)} icon={<Send size={15} aria-hidden="true" />}>
          Enviar para o Meta aprovar
        </Button>
      </div>
    </section>
  )
}

export function WaTemplatesPanel({ templates, onReload, canDelete }: { templates: WaTemplate[]; onReload: () => Promise<unknown> | void; canDelete: boolean }) {
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState<Group | 'all'>('all')
  const [q, setQ] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [confirmDel, setConfirmDel] = useState('')
  const [deleting, setDeleting] = useState(false)

  const refresh = async () => {
    setRefreshing(true)
    try {
      await onReload()
    } finally {
      setRefreshing(false)
    }
  }

  // Tem modelo em análise: confere de novo a cada 1 minuto enquanto a tela está aberta.
  const hasPending = templates.some((t) => groupOf(t.status) === 'pending')
  useEffect(() => {
    if (!hasPending) return
    const id = window.setInterval(() => void onReload(), 60_000)
    return () => window.clearInterval(id)
  }, [hasPending, onReload])

  const counts = useMemo(() => {
    const c = { all: templates.length, approved: 0, pending: 0, rejected: 0, other: 0 }
    for (const t of templates) c[groupOf(t.status)]++
    return c
  }, [templates])

  const needle = q.trim().toLowerCase()
  const order: Record<Group, number> = { pending: 0, rejected: 1, approved: 2, other: 3 }
  const rows = templates
    .filter((t) => filter === 'all' || groupOf(t.status) === filter)
    .filter((t) => !needle || `${t.name} ${prettyTemplateName(t.name)} ${t.body}`.toLowerCase().includes(needle))
    .sort((a, b) => order[groupOf(a.status)] - order[groupOf(b.status)] || a.name.localeCompare(b.name))

  const remove = async (name: string) => {
    setDeleting(true)
    try {
      await deleteWaTemplate(name)
      toast.success('Modelo apagado.')
      setConfirmDel('')
      await onReload()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  const chip = (on: boolean) => `rounded-lg border px-3 py-1.5 text-sm font-medium transition ${on ? 'border-brand-500 bg-brand-500/15 text-brand-300' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {!creating && (
          <Button icon={<Plus size={15} aria-hidden="true" />} onClick={() => setCreating(true)}>
            Novo modelo
          </Button>
        )}
        <Button variant="secondary" icon={<RefreshCw size={15} aria-hidden="true" />} loading={refreshing} onClick={refresh}>
          Atualizar status
        </Button>
        {hasPending && <span className="text-xs text-slate-400">Confere sozinho a cada 1 minuto enquanto houver modelo em análise.</span>}
      </div>

      {creating && (
        <NewTemplateForm
          existing={templates}
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            setFilter('all')
            void onReload()
          }}
        />
      )}

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar modelos por status">
        {(
          [
            ['all', 'Todos'],
            ['pending', 'Em análise'],
            ['approved', 'Aprovados'],
            ['rejected', 'Reprovados'],
          ] as const
        ).map(([g, label]) => (
          <button key={g} type="button" aria-pressed={filter === g} onClick={() => setFilter(g)} className={chip(filter === g)}>
            {label} <span className="text-xs opacity-70">({counts[g]})</span>
          </button>
        ))}
      </div>
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar modelo"
          aria-label="Buscar modelo pelo nome ou texto"
          className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <ul className="flex flex-col gap-2" aria-label="Modelos">
        {rows.length === 0 && <li className="rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-400">Nenhum modelo aqui.</li>}
        {rows.map((t) => {
          const info = STATUS_INFO[t.status] || { label: t.status, tone: 'bg-slate-500/15 text-slate-300' }
          const key = `${t.name}|${t.language}`
          return (
            <li key={key} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{prettyTemplateName(t.name)}</p>
                  <p className="text-xs text-slate-400">
                    {t.name} · {CATEGORY_LABEL[t.category] || t.category} · {t.language}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${info.tone}`}>{info.label}</span>
              </div>
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">{t.body}</p>
              {t.status === 'REJECTED' && (
                <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  Motivo: {REJECT_REASON[t.rejectedReason || ''] || t.rejectedReason || 'o Meta não informou.'} Dá pra apagar e mandar de novo com outro texto (e outro nome).
                </p>
              )}
              {canDelete && (
                <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                  {confirmDel === key ? (
                    <>
                      <span className="text-xs text-red-300">Apagar esse modelo do Meta? Disparos e lembretes que usam ele param de funcionar.</span>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDel('')}>
                        Não
                      </Button>
                      <Button size="sm" variant="danger" loading={deleting} onClick={() => remove(t.name)}>
                        Sim, apagar
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" icon={<Trash2 size={14} aria-hidden="true" />} onClick={() => setConfirmDel(key)} aria-label={`Apagar o modelo ${prettyTemplateName(t.name)}`}>
                      Apagar
                    </Button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
