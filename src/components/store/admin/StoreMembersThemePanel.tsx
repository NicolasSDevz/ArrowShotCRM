import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { Eye, ExternalLink, Home, LayoutDashboard, Lock, LogIn, Moon, Plus, Sun, Trash2, Users } from 'lucide-react'
import { storePreviewAsMember } from '../../../services/storeApi'
import { useAuth } from '../../../context/AuthContext'
import { useStoreMemberAreas } from '../../../hooks/useStore'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { Field, Input, Select, Textarea } from '../../ui/Field'
import { ImageField } from './ImageField'
import { EditorSection, Toggle } from '../../leads/LeadFormBuilderParts'
import { Segmented } from '../../leads/LeadFormBlocksEditor'
import { MembersLoginView } from '../members/MembersLoginView'
import { PreviewFrame } from '../../ui/PreviewFrame'
import { useGoogleFont } from '../checkoutUtils'
import { askConfirm } from '../../../utils/confirmDialog'
import {
  createStoreMemberArea,
  deleteStoreMemberArea,
  saveStoreMemberArea,
  saveStoreMembersTheme,
  subscribeStoreMembersTheme,
} from '../../../services/storeService'
import { MAIN_MEMBERS_AREA, STORE_FONTS, defaultMembersTheme, membersBasePath, membersThemeVars, type StoreMembersTheme } from '../../../types/store'

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

type Tab = 'area' | 'home' | 'login'

/** Personalização da área de membros (cada área tem a sua), do Início e da tela de login. A prévia segue a aba. */
export function StoreMembersThemePanel() {
  const { profile } = useAuth()
  const { data: areas } = useStoreMemberAreas()
  const [areaId, setAreaId] = useState<string>(MAIN_MEMBERS_AREA)
  const [mainTheme, setMainTheme] = useState<StoreMembersTheme | null>(null)
  const [form, setForm] = useState<StoreMembersTheme>(defaultMembersTheme())
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<Tab>('area')
  const [dirty, setDirty] = useState(false)
  const [creating, setCreating] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const loadedFor = useRef<string | null>(null)
  useGoogleFont(form.font)

  const area = areas.find((a) => a.id === areaId) ?? null
  const isMain = areaId === MAIN_MEMBERS_AREA
  const folder = isMain ? 'tema' : `area-${areaId}`
  const base = membersBasePath(area?.slug)

  useEffect(
    () =>
      subscribeStoreMembersTheme(
        (t) => setMainTheme({ ...defaultMembersTheme(), ...(t ?? {}) }),
        (err) => {
          console.error(err)
          toast.error('Não foi possível carregar o visual salvo. Recarregue a página.')
          setMainTheme(defaultMembersTheme())
        }
      ),
    []
  )

  // Troca de área: carrega o visual dela uma vez (depois só muda pela tela).
  useEffect(() => {
    if (loadedFor.current === areaId) return
    const source = isMain ? mainTheme : area
    if (!source) return
    loadedFor.current = areaId
    setForm({ ...defaultMembersTheme(), ...source })
    setDirty(false)
    setLoaded(true)
  }, [areaId, isMain, mainTheme, area])

  const pickArea = async (id: string) => {
    if (id === areaId) return
    if (dirty && !(await askConfirm({ title: 'Trocar de área sem salvar?', message: 'As mudanças desta área ainda não foram salvas.', confirmLabel: 'Trocar sem salvar' }))) return
    loadedFor.current = null
    setLoaded(false)
    setAreaId(id)
  }

  const set = (patch: Partial<StoreMembersTheme>) => {
    setForm((f) => ({ ...f, ...patch }))
    setDirty(true)
  }

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!profile) return
    setBusy(true)
    try {
      const data = { ...form, supportWhatsapp: (form.supportWhatsapp ?? '').replace(/\D/g, '') }
      if (isMain) await saveStoreMembersTheme(data, profile.id)
      else {
        // "Só eu vejo" muda pelo botão da área; o visual carregado pode estar com o valor antigo.
        const { privateTo: _p, ...visual } = data as StoreMembersTheme & { privateTo?: string | null }
        await saveStoreMemberArea(areaId, visual, profile.id)
      }
      setDirty(false)
      toast.success('Visual salvo')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const togglePrivate = async () => {
    if (!profile || !area) return
    try {
      await saveStoreMemberArea(area.id, { privateTo: area.privateTo ? null : profile.id }, profile.id)
      toast.success(area.privateTo ? 'A equipe volta a ver esta área' : 'Agora só você vê esta área no CRM')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  // Abre a área como aluno, com todos os cursos dela liberados (aba nova).
  const viewAsMember = async () => {
    const tab = window.open('', '_blank')
    setPreviewing(true)
    try {
      const r = await storePreviewAsMember(area?.slug ?? null)
      if (tab) tab.location.href = r.accessUrl
      else window.location.href = r.accessUrl
      if (!r.courses) toast('Esta área ainda não tem cursos. Escolha a área no produto, aba Área de membros.')
    } catch (err) {
      tab?.close()
      toast.error((err as Error).message)
    } finally {
      setPreviewing(false)
    }
  }

  const removeArea = async () => {
    if (!area) return
    if (!(await askConfirm({ title: `Excluir a área "${area.name}"?`, message: `O endereço ${base} para de funcionar. Os cursos dela voltam pra área principal (/membros) até você escolher outra no produto.`, confirmLabel: 'Excluir área', danger: true }))) return
    await deleteStoreMemberArea(area.id)
    loadedFor.current = null
    setAreaId(MAIN_MEMBERS_AREA)
    toast.success('Área excluída')
  }

  const vars = membersThemeVars(form)
  const loginOwnMode = form.loginMode ?? null
  const loginVars = membersThemeVars({ ...form, mode: loginOwnMode || form.mode, backgroundColor: loginOwnMode && loginOwnMode !== form.mode ? null : form.backgroundColor, cardColor: loginOwnMode && loginOwnMode !== form.mode ? null : form.cardColor })

  const areaTab = (
    <>
      <EditorSection title="Marca">
        <Field label="Nome da área de membros"><Input value={form.brandName} onChange={(e) => set({ brandName: e.target.value })} placeholder="Ex.: Escola Arrow Shot" /></Field>
        <ImageField label="Logo" value={form.logoUrl} onChange={(v) => set({ logoUrl: v })} productId={folder} assetKey="members-logo" aspect="aspect-[3/1]" hint="PNG com fundo transparente. Aparece no topo da área e no login." />
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
                onClick={() => set({ mode: p.mode, primaryColor: p.primary, backgroundColor: p.bg, cardColor: p.card, textColor: null, headerColor: null })}
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
          onChange={(v) => set({ mode: v, backgroundColor: null, cardColor: null, textColor: null, headerColor: null })}
          options={[
            { value: 'dark', title: 'Escuro', desc: 'Estilo Netflix', preview: modePreview(true) },
            { value: 'light', title: 'Claro', desc: 'Fundo branco', preview: modePreview(false) },
          ]}
        />
        <Color label="Cor principal" hint="Botões, progresso e destaques" value={form.primaryColor} fallback="#2563eb" onChange={(v) => set({ primaryColor: v || '#2563eb' })} />
        <Color label="Fundo" value={form.backgroundColor ?? ''} fallback={vars['--m-bg']} onChange={(v) => set({ backgroundColor: v || null })} />
        <Color label="Cartões" value={form.cardColor ?? ''} fallback={vars['--m-card']} onChange={(v) => set({ cardColor: v || null })} />
        <Color label="Textos" value={form.textColor ?? ''} fallback={form.mode === 'light' ? '#0f172a' : '#f5f5f5'} onChange={(v) => set({ textColor: v || null })} />
        <Color label="Topo (menu)" value={form.headerColor ?? ''} fallback={vars['--m-bg']} hint="Igual ao fundo" onChange={(v) => set({ headerColor: v || null })} />
        <Segmented
          label="Cantos de botões e capas"
          value={form.radius ?? 'soft'}
          onChange={(v) => set({ radius: v })}
          options={[
            { value: 'square', content: 'Retos', title: 'Quase sem arredondar' },
            { value: 'soft', content: 'Médios', title: 'Padrão' },
            { value: 'round', content: 'Redondos', title: 'Bem arredondados' },
          ]}
        />
        <p className="text-[11px] text-slate-400">A cor de cada curso pode ser trocada no produto, na aba Área de membros. Se não trocar, vale a cor principal daqui.</p>
      </EditorSection>

      <EditorSection title="Rodapé">
        <Field label="Texto do rodapé (opcional)"><Input value={form.footerText ?? ''} onChange={(e) => set({ footerText: e.target.value })} placeholder="Ex.: Flores da Ana, CNPJ 00.000.000/0001-00" /></Field>
      </EditorSection>
    </>
  )

  const homeTab = (
    <>
      <EditorSection title="Banner principal" hint="É o banner do topo do Início, da área toda (não de um produto). Em branco, usa o banner do primeiro curso do aluno.">
        <ImageField label="Banner do computador" value={form.homeBannerUrl ?? null} onChange={(v) => set({ homeBannerUrl: v })} productId={folder} assetKey="home-banner" hint="1920 x 700 px" aspect="aspect-[16/6]" />
        <ImageField label="Banner do celular (opcional)" value={form.homeBannerMobileUrl ?? null} onChange={(v) => set({ homeBannerMobileUrl: v })} productId={folder} assetKey="home-banner-mobile" hint="1080 x 1080 px. Em branco, usa o de cima." aspect="aspect-square" fallback={form.homeBannerUrl} />
        <Segmented
          label="Altura"
          value={form.homeBannerHeight ?? 'medium'}
          onChange={(v) => set({ homeBannerHeight: v })}
          options={[
            { value: 'small', content: 'Baixa', title: 'Mais conteúdo aparece logo' },
            { value: 'medium', content: 'Média', title: 'Padrão' },
            { value: 'large', content: 'Alta', title: 'Banner bem grande' },
          ]}
        />
        <Field label={`Escurecer o banner: ${form.homeOverlay ?? 0}%`}>
          <input type="range" min={0} max={80} step={5} value={form.homeOverlay ?? 0} onChange={(e) => set({ homeOverlay: Number(e.target.value) })} className="w-full accent-brand-600" />
        </Field>
      </EditorSection>

      <EditorSection title="Textos do banner" hint="Em branco, usa o título e o texto de boas-vindas do curso em destaque.">
        <Toggle label="Mostrar “Olá, Maria!” em cima do título" checked={form.homeGreeting !== false} onChange={(v) => set({ homeGreeting: v })} />
        <Field label="Título"><Input value={form.homeTitle ?? ''} onChange={(e) => set({ homeTitle: e.target.value })} placeholder="Ex.: Bem-vinda ao Ateliê das Flores" /></Field>
        <Field label="Texto"><Textarea rows={3} value={form.homeText ?? ''} onChange={(e) => set({ homeText: e.target.value })} /></Field>
        <Field label="Texto do botão"><Input value={form.homeButtonText ?? ''} onChange={(e) => set({ homeButtonText: e.target.value })} placeholder="Começar / Continuar" /></Field>
        <Segmented
          label="Alinhamento"
          value={form.homeAlign ?? 'left'}
          onChange={(v) => set({ homeAlign: v })}
          options={[
            { value: 'left', content: 'À esquerda', title: 'Padrão' },
            { value: 'center', content: 'No centro', title: 'Título e botão no meio do banner' },
          ]}
        />
      </EditorSection>

      <EditorSection title="Cursos">
        <Segmented
          label="Formato das capas"
          value={form.cardShape ?? 'portrait'}
          onChange={(v) => set({ cardShape: v })}
          options={[
            { value: 'portrait', content: 'Em pé', title: 'Capa vertical, estilo Netflix (600 x 900)' },
            { value: 'square', content: 'Quadrada', title: 'Capa quadrada (usa a capa do curso)' },
            { value: 'landscape', content: 'Deitada', title: 'Capa deitada, maior (usa o banner do curso)' },
          ]}
        />
        <Toggle label="Barrinha de progresso embaixo de cada capa" checked={form.cardProgress !== false} onChange={(v) => set({ cardProgress: v })} />
        <Toggle label="Mostrar os outros cursos desta área bloqueados, com botão de comprar" checked={form.showCatalog !== false} onChange={(v) => set({ showCatalog: v })} />
        <Field label="Título: continuar"><Input value={form.continueTitle ?? ''} onChange={(e) => set({ continueTitle: e.target.value })} placeholder="Continuar assistindo" /></Field>
        <Field label="Título: cursos do aluno"><Input value={form.coursesTitle ?? ''} onChange={(e) => set({ coursesTitle: e.target.value })} placeholder="Meus cursos" /></Field>
        <Field label="Título: bloqueados"><Input value={form.catalogTitle ?? ''} onChange={(e) => set({ catalogTitle: e.target.value })} placeholder="Mais conteúdos para você" /></Field>
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
        <ImageField label="Imagem de fundo" value={form.loginBgUrl} onChange={(v) => set({ loginBgUrl: v })} productId={folder} assetKey="login-bg" hint="1920 x 1080 px" />
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
        <ImageField label="Logo só do login (opcional)" value={form.loginLogoUrl ?? null} onChange={(v) => set({ loginLogoUrl: v })} productId={folder} assetKey="login-logo" aspect="aspect-[3/1]" hint="Útil quando o login é claro e a área é escura (logo de outra cor)." fallback={form.logoUrl} />
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
    { key: 'area', label: 'Visual', icon: <LayoutDashboard size={15} /> },
    { key: 'home', label: 'Início', icon: <Home size={15} /> },
    { key: 'login', label: 'Login', icon: <LogIn size={15} /> },
  ]

  const shape = form.cardShape ?? 'portrait'
  const previewBanner = form.homeBannerUrl
  const overlay = Math.min(80, Math.max(0, form.homeOverlay ?? 0)) / 100

  return (
    <div className="space-y-4">
      {/* Áreas: a principal (/membros) e as extras (/m/nome), cada uma com o próprio visual e os próprios cursos. */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        <span className="text-sm font-medium text-slate-600">Área:</span>
        <div role="radiogroup" aria-label="Área de membros" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {[{ id: MAIN_MEMBERS_AREA, name: 'Principal', privateTo: null as string | null | undefined }, ...areas].map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={areaId === a.id}
              onClick={() => pickArea(a.id)}
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${areaId === a.id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {a.privateTo && <Lock size={11} aria-label="Só você vê" />}
              {a.name}
            </button>
          ))}
        </div>
        <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>Nova área</Button>
        <Button size="sm" variant="secondary" icon={<Eye size={14} />} loading={previewing} onClick={viewAsMember}>Ver como aluno</Button>
        <span className="ml-auto truncate text-xs text-slate-400">Endereço: {window.location.origin}{base}</span>
        {area && (
          <div className="flex w-full flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-xs">
            <span className="text-slate-500">Os cursos entram nesta área pelo produto (aba Área de membros).</span>
            <button type="button" onClick={togglePrivate} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-slate-600 hover:bg-slate-100">
              {area.privateTo ? <><Users size={13} aria-hidden="true" /> Mostrar para a equipe</> : <><Lock size={13} aria-hidden="true" /> Só eu vejo</>}
            </button>
            <button type="button" onClick={removeArea} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-red-600 hover:bg-red-50">
              <Trash2 size={13} aria-hidden="true" /> Excluir área
            </button>
          </div>
        )}
      </div>

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
          <div key={areaId} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4" role="tabpanel">
            {tab === 'area' ? areaTab : tab === 'home' ? homeTab : login}
          </div>
          {/* bg-white (não bg-white/95): só a cor cheia é trocada no modo escuro do CRM. Com a translúcida a barra ficava branca e o botão claro do modo escuro sumia nela. */}
          <div className="sticky bottom-0 z-10 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <Button type="submit" loading={busy} disabled={!loaded}>Salvar visual</Button>
            <a href={tab === 'login' ? `${base}/login` : base} target="_blank" rel="noreferrer" className="inline-flex h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
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
                <div className="flex h-14 items-center gap-5 border-b border-[var(--m-border2)] bg-[var(--m-header)] px-4">
                  {form.logoUrl ? <img src={form.logoUrl} alt="" className="h-7 w-auto" /> : <span className="font-bold">{form.brandName}</span>}
                  <span className="text-sm text-[var(--m-text)]">Início</span>
                  <span className="text-sm text-[var(--m-muted)]">Meu perfil</span>
                </div>
                <div
                  className={`relative flex items-end bg-[var(--m-card2)] bg-cover bg-center p-5 ${form.homeBannerHeight === 'small' ? 'h-40' : form.homeBannerHeight === 'large' ? 'h-72' : 'h-56'}`}
                  style={previewBanner ? { backgroundImage: `url(${previewBanner})` } : undefined}
                >
                  {overlay > 0 && <div className="absolute inset-0 bg-black" style={{ opacity: overlay }} aria-hidden="true" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--m-bg)] to-transparent" aria-hidden="true" />
                  <div className={`relative w-full ${form.homeAlign === 'center' ? 'flex flex-col items-center text-center' : ''}`}>
                    {form.homeGreeting !== false && <p className="text-xs text-[var(--m-text2)]">Olá, Maria!</p>}
                    <p className="text-2xl font-extrabold">{form.homeTitle || 'Nome do seu curso'}</p>
                    {form.homeText && <p className="mt-1 max-w-md text-sm text-[var(--m-text2)]">{form.homeText}</p>}
                    <span className="mt-3 inline-block bg-[var(--m-primary)] px-4 py-2 text-sm font-semibold text-white" style={{ borderRadius: 'var(--m-radius)' }}>{form.homeButtonText || 'Começar'}</span>
                  </div>
                </div>
                <div className="p-5">
                  <p className="mb-3 font-bold">{form.coursesTitle || 'Meus cursos'}</p>
                  <div className={`grid gap-3 ${shape === 'landscape' ? 'grid-cols-2' : 'grid-cols-4'}`}>
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i}>
                        <div className={`${shape === 'landscape' ? 'aspect-video' : shape === 'square' ? 'aspect-square' : 'aspect-[2/3]'} bg-[var(--m-card)]`} style={{ borderRadius: 'var(--m-radius)' }} />
                        {form.cardProgress !== false && <div className="mt-1.5 h-1 rounded-full bg-[var(--m-soft2)]"><div className="h-1 rounded-full bg-[var(--m-primary)]" style={{ width: `${i * 22}%` }} /></div>}
                        <p className="mt-1 text-xs text-[var(--m-muted)]">Curso {i}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {form.footerText && <p className="border-t border-[var(--m-border2)] px-4 py-4 text-center text-[11px] text-[var(--m-faint)]">{form.footerText}</p>}
              </div>
            )}
            </PreviewFrame>
          </div>
        </div>
      </div>

      <NewAreaModal
        open={creating}
        onClose={() => setCreating(false)}
        taken={areas.map((a) => a.slug)}
        base={form}
        onCreated={(id) => {
          loadedFor.current = null
          setLoaded(false)
          setAreaId(id)
        }}
      />
    </div>
  )
}

/** Área nova: nome, endereço (/m/{slug}) e se só você vê. O visual começa igual ao da área aberta. */
function NewAreaModal({ open, onClose, taken, base, onCreated }: { open: boolean; onClose: () => void; taken: string[]; base: StoreMembersTheme; onCreated: (id: string) => void }) {
  const { profile } = useAuth()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [onlyMe, setOnlyMe] = useState(false)
  const [busy, setBusy] = useState(false)
  const autoSlug = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return
    const s = autoSlug(slug || name)
    if (!name.trim()) return toast.error('Dê um nome para a área')
    if (!/^[a-z0-9-]{2,40}$/.test(s)) return toast.error('Endereço: só letras minúsculas, números e hífen')
    if (taken.includes(s)) return toast.error('Esse endereço já é de outra área')
    setBusy(true)
    try {
      const id = await createStoreMemberArea(name.trim(), s, { ...defaultMembersTheme(), ...base, homeBannerUrl: null, homeBannerMobileUrl: null, homeTitle: '', homeText: '', logoUrl: null, loginLogoUrl: null, loginBgUrl: null }, onlyMe, profile.id)
      toast.success('Área criada. Agora escolha ela nos produtos (aba Área de membros).')
      onCreated(id)
      onClose()
      setName('')
      setSlug('')
      setSlugTouched(false)
      setOnlyMe(false)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova área de membros">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-500">Uma área separada, com visual e endereço próprios. Os alunos dela só veem os cursos dela (bom para um negócio que não tem nada a ver com o outro).</p>
        <Field label="Nome" required>
          <Input value={name} autoFocus onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(autoSlug(e.target.value)) }} placeholder="Ex.: Ateliê das Flores" />
        </Field>
        <Field label="Endereço">
          <div className="flex items-center gap-1 text-sm text-slate-500">
            <span className="shrink-0">{window.location.origin}/m/</span>
            <Input value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')) }} placeholder="flores" aria-label="Final do endereço" />
          </div>
        </Field>
        <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
          <input type="checkbox" checked={onlyMe} onChange={(e) => setOnlyMe(e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>
            <span className="flex items-center gap-1.5 font-medium"><Lock size={13} aria-hidden="true" /> Só eu vejo no CRM</span>
            <span className="block text-xs text-slate-400">O resto da equipe não vê esta área na Loja.</span>
          </span>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy}>Criar área</Button>
        </div>
      </form>
    </Modal>
  )
}
