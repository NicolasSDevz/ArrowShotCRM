import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { ExternalLink, LayoutDashboard, LogIn, Moon, Sun } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import { Button } from '../../ui/Button'
import { Field, Input, Select, Textarea } from '../../ui/Field'
import { ImageField } from './ImageField'
import { EditorSection } from '../../leads/LeadFormBuilderParts'
import { MembersLoginView } from '../members/MembersLoginView'
import { PreviewFrame } from '../../ui/PreviewFrame'
import { useGoogleFont } from '../checkoutUtils'
import { saveStoreMembersTheme, subscribeStoreMembersTheme } from '../../../services/storeService'
import { STORE_FONTS, defaultMembersTheme, membersThemeVars, type StoreMembersTheme } from '../../../types/store'

/** Cor com botão "limpar" (vazio = herda). */
function Color({ label, value, onChange, fallback, hint }: { label: string; value: string; onChange: (v: string) => void; fallback: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <input type="color" value={value || fallback} onChange={(e) => onChange(e.target.value)} className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white" aria-label={label} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="truncate text-xs text-slate-400">{value ? value.toUpperCase() : hint || `Padrão (${fallback.toUpperCase()})`}</p>
      </div>
      {value && (
        <button type="button" onClick={() => onChange('')} className="shrink-0 rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          Padrão
        </button>
      )}
    </div>
  )
}

/** Cartões grandes de escolha (modo, layout). */
function Choice<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; label: string; options: { value: T; title: string; desc: string; preview: ReactNode }[] }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`overflow-hidden rounded-xl border-2 text-left transition ${value === o.value ? 'border-brand-600 shadow-sm' : 'border-slate-200 hover:border-slate-300'}`}
        >
          <span className="block h-16" aria-hidden="true">{o.preview}</span>
          <span className="block border-t border-slate-100 bg-white px-2.5 py-1.5">
            <span className="block text-xs font-semibold text-slate-800">{o.title}</span>
            <span className="block text-[11px] leading-snug text-slate-400">{o.desc}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

const PRESETS: { name: string; mode: 'dark' | 'light'; primary: string; bg: string | null; card: string | null }[] = [
  { name: 'Netflix', mode: 'dark', primary: '#e50914', bg: null, card: null },
  { name: 'Azul escuro', mode: 'dark', primary: '#3b82f6', bg: '#0b1220', card: '#131c2e' },
  { name: 'Verde', mode: 'dark', primary: '#22c55e', bg: '#07140d', card: '#0f2218' },
  { name: 'Roxo', mode: 'dark', primary: '#a855f7', bg: '#120a1c', card: '#1d1230' },
  { name: 'Claro azul', mode: 'light', primary: '#2563eb', bg: null, card: null },
  { name: 'Claro verde', mode: 'light', primary: '#16a34a', bg: '#f0fdf4', card: '#ffffff' },
]

const modePreview = (dark: boolean) => (
  <span className={`flex h-full items-center justify-center gap-1.5 ${dark ? 'bg-neutral-900' : 'bg-slate-100'}`} style={{ background: dark ? '#0a0a0a' : '#f8fafc' }}>
    {[0, 1, 2].map((i) => <span key={i} className="h-10 w-7 rounded" style={{ background: dark ? '#262626' : '#e2e8f0' }} />)}
    {dark ? <Moon size={14} className="text-neutral-400" /> : <Sun size={14} className="text-amber-500" />}
  </span>
)

type Tab = 'area' | 'login'

/** Personalização da área de membros e, separada, da tela de login. A prévia segue a aba. */
export function StoreMembersThemePanel() {
  const { profile } = useAuth()
  const [form, setForm] = useState<StoreMembersTheme>(defaultMembersTheme())
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<Tab>('area')
  const [dirty, setDirty] = useState(false)
  const first = useRef(true)
  useGoogleFont(form.font)

  useEffect(
    () =>
      subscribeStoreMembersTheme(
        (t) => {
          if (first.current) {
            first.current = false
            setForm({ ...defaultMembersTheme(), ...(t ?? {}) })
          }
          setLoaded(true)
        },
        (err) => {
          console.error(err)
          toast.error('Não foi possível carregar o visual salvo. Recarregue a página.')
          setLoaded(true)
        }
      ),
    []
  )

  const set = (patch: Partial<StoreMembersTheme>) => {
    setForm((f) => ({ ...f, ...patch }))
    setDirty(true)
  }

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!profile) return
    setBusy(true)
    try {
      await saveStoreMembersTheme({ ...form, supportWhatsapp: (form.supportWhatsapp ?? '').replace(/\D/g, '') }, profile.id)
      setDirty(false)
      toast.success('Visual salvo')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const vars = membersThemeVars(form)
  const loginOwnMode = form.loginMode ?? null
  const loginVars = membersThemeVars({ ...form, mode: loginOwnMode || form.mode, backgroundColor: loginOwnMode && loginOwnMode !== form.mode ? null : form.backgroundColor, cardColor: loginOwnMode && loginOwnMode !== form.mode ? null : form.cardColor })

  const area = (
    <>
      <EditorSection title="Marca">
        <Field label="Nome da área de membros"><Input value={form.brandName} onChange={(e) => set({ brandName: e.target.value })} placeholder="Ex.: Escola Arrow Shot" /></Field>
        <ImageField label="Logo" value={form.logoUrl} onChange={(v) => set({ logoUrl: v })} productId="tema" assetKey="members-logo" aspect="aspect-[3/1]" hint="PNG com fundo transparente. Aparece no topo da área e no login." />
        <Field label="Fonte">
          <Select value={form.font} onChange={(e) => set({ font: e.target.value })}>
            {STORE_FONTS.map((f) => <option key={f}>{f}</option>)}
          </Select>
        </Field>
      </EditorSection>

      <EditorSection title="Modelos prontos" hint="Troca modo e cores de uma vez. Depois ajuste o que quiser.">
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => {
            const active = form.mode === p.mode && form.primaryColor.toLowerCase() === p.primary && (form.backgroundColor ?? null) === p.bg
            const bg = p.bg || (p.mode === 'dark' ? '#0a0a0a' : '#f8fafc')
            const card = p.card || (p.mode === 'dark' ? '#171717' : '#ffffff')
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => set({ mode: p.mode, primaryColor: p.primary, backgroundColor: p.bg, cardColor: p.card })}
                className={`overflow-hidden rounded-lg border-2 ${active ? 'border-brand-600' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <span className="flex h-11 items-center justify-center gap-1" style={{ background: bg }}>
                  <span className="h-6 w-4 rounded-sm" style={{ background: card }} />
                  <span className="h-6 w-4 rounded-sm" style={{ background: card }} />
                  <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold text-white" style={{ background: p.primary }}>Play</span>
                </span>
                <span className="block truncate bg-white px-1.5 py-1 text-center text-[11px] font-medium text-slate-600">{p.name}</span>
              </button>
            )
          })}
        </div>
      </EditorSection>

      <EditorSection title="Modo e cores">
        <Choice
          label="Modo"
          value={form.mode}
          onChange={(v) => set({ mode: v, backgroundColor: null, cardColor: null })}
          options={[
            { value: 'dark', title: 'Escuro', desc: 'Estilo Netflix', preview: modePreview(true) },
            { value: 'light', title: 'Claro', desc: 'Fundo branco', preview: modePreview(false) },
          ]}
        />
        <Color label="Cor principal" hint="Botões, progresso e destaques" value={form.primaryColor} fallback="#2563eb" onChange={(v) => set({ primaryColor: v || '#2563eb' })} />
        <Color label="Fundo" value={form.backgroundColor ?? ''} fallback={vars['--m-bg']} onChange={(v) => set({ backgroundColor: v || null })} />
        <Color label="Cartões" value={form.cardColor ?? ''} fallback={vars['--m-card']} onChange={(v) => set({ cardColor: v || null })} />
        <p className="text-[11px] text-slate-400">A cor de cada curso pode ser trocada no produto, na aba Área de membros. Se não trocar, vale a cor principal daqui.</p>
      </EditorSection>
    </>
  )

  const login = (
    <>
      <EditorSection title="Layout">
        <Choice
          label="Layout do login"
          value={form.loginLayout}
          onChange={(v) => set({ loginLayout: v })}
          options={[
            {
              value: 'center',
              title: 'Cartão no centro',
              desc: 'Imagem de fundo atrás',
              preview: (
                <span className="flex h-full items-center justify-center bg-slate-300">
                  <span className="h-10 w-12 rounded bg-white shadow" />
                </span>
              ),
            },
            {
              value: 'split',
              title: 'Dividido',
              desc: 'Imagem de um lado',
              preview: (
                <span className="grid h-full grid-cols-2">
                  <span className="bg-slate-300" />
                  <span className="flex items-center justify-center bg-white"><span className="h-10 w-10 rounded border border-slate-200" /></span>
                </span>
              ),
            },
          ]}
        />
        <ImageField label="Imagem de fundo" value={form.loginBgUrl} onChange={(v) => set({ loginBgUrl: v })} productId="tema" assetKey="login-bg" hint="1920 x 1080 px" />
        {form.loginBgUrl && form.loginLayout === 'center' && (
          <Field label={`Escurecer a imagem: ${form.loginOverlay ?? 45}%`}>
            <input type="range" min={0} max={80} step={5} value={form.loginOverlay ?? 45} onChange={(e) => set({ loginOverlay: Number(e.target.value) })} className="w-full accent-brand-600" />
          </Field>
        )}
      </EditorSection>

      <EditorSection title="Cores só do login" hint="Em branco = igual à área de membros. Assim você pode ter o login claro e a área escura, por exemplo.">
        <Choice
          label="Modo do login"
          value={loginOwnMode || 'same'}
          onChange={(v) => set({ loginMode: v === 'same' ? null : (v as 'dark' | 'light'), loginBackgroundColor: null, loginCardColor: null })}
          options={[
            { value: 'same', title: 'Igual à área', desc: form.mode === 'dark' ? 'Escuro' : 'Claro', preview: modePreview(form.mode === 'dark') },
            { value: form.mode === 'dark' ? 'light' : 'dark', title: form.mode === 'dark' ? 'Claro' : 'Escuro', desc: 'Só no login', preview: modePreview(form.mode !== 'dark') },
          ]}
        />
        <Color label="Cor do botão" value={form.loginPrimaryColor ?? ''} fallback={form.primaryColor} hint="Igual à área" onChange={(v) => set({ loginPrimaryColor: v || null })} />
        <Color label="Fundo" value={form.loginBackgroundColor ?? ''} fallback={loginVars['--m-bg']} hint="Igual à área" onChange={(v) => set({ loginBackgroundColor: v || null })} />
        <Color label="Cartão do formulário" value={form.loginCardColor ?? ''} fallback={loginVars['--m-card']} hint="Igual à área" onChange={(v) => set({ loginCardColor: v || null })} />
        <ImageField label="Logo só do login (opcional)" value={form.loginLogoUrl ?? null} onChange={(v) => set({ loginLogoUrl: v })} productId="tema" assetKey="login-logo" aspect="aspect-[3/1]" hint="Útil quando o login é claro e a área é escura (logo de outra cor)." fallback={form.logoUrl} />
      </EditorSection>

      <EditorSection title="Textos">
        <Field label="Título"><Input value={form.loginTitle} onChange={(e) => set({ loginTitle: e.target.value })} /></Field>
        <Field label="Texto abaixo do título (opcional)"><Textarea rows={2} value={form.loginText ?? ''} onChange={(e) => set({ loginText: e.target.value })} /></Field>
        <Field label="Texto do botão"><Input value={form.loginButtonText} onChange={(e) => set({ loginButtonText: e.target.value })} /></Field>
        <Field label="Ajuda para o primeiro acesso"><Textarea rows={3} value={form.loginHelpText ?? ''} onChange={(e) => set({ loginHelpText: e.target.value })} /></Field>
        <Field label="WhatsApp do suporte (opcional)">
          <Input value={form.supportWhatsapp ?? ''} onChange={(e) => set({ supportWhatsapp: e.target.value })} inputMode="tel" placeholder="(27) 99999-9999" />
        </Field>
      </EditorSection>
    </>
  )

  const tabs: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: 'area', label: 'Área de membros', icon: <LayoutDashboard size={15} /> },
    { key: 'login', label: 'Tela de login', icon: <LogIn size={15} /> },
  ]

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <form onSubmit={submit} className="space-y-3">
        <div role="tablist" aria-label="O que personalizar" className="flex rounded-xl bg-slate-100 p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold ${tab === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <span aria-hidden="true">{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4" role="tabpanel">
          {tab === 'area' ? area : login}
        </div>
        <div className="sticky bottom-0 z-10 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
          <Button type="submit" loading={busy} disabled={!loaded}>Salvar visual</Button>
          <a href={tab === 'login' ? '/membros/login' : '/membros'} target="_blank" rel="noreferrer" className="inline-flex h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <ExternalLink size={15} aria-hidden="true" /> Abrir {tab === 'login' ? 'o login' : 'a área'}
          </a>
          {dirty && <span className="ml-auto text-xs font-medium text-amber-600" aria-live="polite">Alterações não salvas</span>}
        </div>
      </form>

      <div className="xl:sticky xl:top-4 xl:self-start">
        <p className="mb-2 text-sm font-medium text-slate-600">Pré-visualização: {tab === 'login' ? 'tela de login' : 'área de membros'}</p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
          <PreviewFrame title="Pré-visualização" height="600px">
          {tab === 'login' ? (
            <MembersLoginView theme={form} preview />
          ) : (
            <div className="min-h-[560px] bg-[var(--m-bg)] text-[var(--m-text)]" style={{ ...vars }}>
              <div className="flex h-14 items-center gap-5 border-b border-[var(--m-border2)] px-4">
                {form.logoUrl ? <img src={form.logoUrl} alt="" className="h-7 w-auto" /> : <span className="font-bold">{form.brandName}</span>}
                <span className="text-sm text-[var(--m-text)]">Início</span>
                <span className="text-sm text-[var(--m-muted)]">Meu perfil</span>
              </div>
              <div className="relative flex h-56 items-end bg-[var(--m-card2)] p-5">
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--m-bg)] to-transparent" aria-hidden="true" />
                <div className="relative">
                  <p className="text-xs text-[var(--m-text2)]">Olá, Maria!</p>
                  <p className="text-2xl font-extrabold">Nome do seu curso</p>
                  <span className="mt-3 inline-block rounded-lg bg-[var(--m-primary)] px-4 py-2 text-sm font-semibold text-white">Começar</span>
                </div>
              </div>
              <div className="p-5">
                <p className="mb-3 font-bold">Meus cursos</p>
                <div className="grid grid-cols-4 gap-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i}>
                      <div className="aspect-[2/3] rounded-lg bg-[var(--m-card)]" />
                      <div className="mt-1.5 h-1 rounded-full bg-[var(--m-soft2)]"><div className="h-1 rounded-full bg-[var(--m-primary)]" style={{ width: `${i * 22}%` }} /></div>
                      <p className="mt-1 text-xs text-[var(--m-muted)]">Curso {i}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          </PreviewFrame>
        </div>
      </div>
    </div>
  )
}
