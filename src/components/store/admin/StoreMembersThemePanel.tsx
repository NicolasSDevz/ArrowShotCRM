import { useEffect, useRef, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { ExternalLink } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import { Button } from '../../ui/Button'
import { Field, Input, Select, Textarea } from '../../ui/Field'
import { ImageField } from './ImageField'
import { MembersLoginView } from '../members/MembersLoginView'
import { useGoogleFont } from '../checkoutUtils'
import { saveStoreMembersTheme, subscribeStoreMembersTheme } from '../../../services/storeService'
import { STORE_FONTS, defaultMembersTheme, membersThemeVars, type StoreMembersTheme } from '../../../types/store'

function Color({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <input type="color" value={value || '#000000'} onChange={(e) => onChange(e.target.value)} className="h-[38px] w-12 cursor-pointer rounded-lg border border-slate-200" aria-label={`${label}: seletor`} />
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={`${label}: código`} />
      </div>
    </Field>
  )
}

/** Personalização da área de membros (marca, cores, fonte) e da tela de login. */
export function StoreMembersThemePanel() {
  const { profile } = useAuth()
  const [form, setForm] = useState<StoreMembersTheme>(defaultMembersTheme())
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<'login' | 'area'>('login')
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

  const set = (patch: Partial<StoreMembersTheme>) => setForm((f) => ({ ...f, ...patch }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    try {
      await saveStoreMembersTheme({ ...form, supportWhatsapp: (form.supportWhatsapp ?? '').replace(/\D/g, '') }, profile.id)
      toast.success('Visual da área de membros salvo')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const vars = membersThemeVars(form)

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <form onSubmit={submit} className="space-y-4">
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-800">Marca</h3>
          <Field label="Nome da área de membros"><Input value={form.brandName} onChange={(e) => set({ brandName: e.target.value })} placeholder="Ex.: Escola Arrow Shot" /></Field>
          <ImageField label="Logo" value={form.logoUrl} onChange={(v) => set({ logoUrl: v })} productId="tema" assetKey="members-logo" aspect="aspect-[3/1]" hint="PNG com fundo transparente fica melhor" />
          <Field label="Fonte">
            <Select value={form.font} onChange={(e) => set({ font: e.target.value })}>
              {STORE_FONTS.map((f) => <option key={f}>{f}</option>)}
            </Select>
          </Field>
        </section>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-800">Cores</h3>
          <Field label="Modo">
            <Select value={form.mode} onChange={(e) => set({ mode: e.target.value as StoreMembersTheme['mode'], backgroundColor: null, cardColor: null })}>
              <option value="dark">Escuro (estilo Netflix)</option>
              <option value="light">Claro</option>
            </Select>
          </Field>
          <Color label="Cor principal (botões e destaques)" value={form.primaryColor} onChange={(v) => set({ primaryColor: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Color label="Fundo (opcional)" value={form.backgroundColor ?? ''} onChange={(v) => set({ backgroundColor: v || null })} placeholder={vars['--m-bg']} />
            <Color label="Cartões (opcional)" value={form.cardColor ?? ''} onChange={(v) => set({ cardColor: v || null })} placeholder={vars['--m-card']} />
          </div>
          <p className="text-[11px] text-slate-400">A cor de cada curso pode ser trocada no produto, na aba Área de membros. Se não trocar, vale a cor principal daqui.</p>
        </section>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-800">Tela de login</h3>
          <Field label="Layout">
            <Select value={form.loginLayout} onChange={(e) => set({ loginLayout: e.target.value as StoreMembersTheme['loginLayout'] })}>
              <option value="center">Cartão no centro, com a imagem de fundo</option>
              <option value="split">Imagem de um lado, formulário do outro</option>
            </Select>
          </Field>
          <ImageField label="Imagem de fundo" value={form.loginBgUrl} onChange={(v) => set({ loginBgUrl: v })} productId="tema" assetKey="login-bg" hint="1920 x 1080 px" />
          <Field label="Título"><Input value={form.loginTitle} onChange={(e) => set({ loginTitle: e.target.value })} /></Field>
          <Field label="Texto abaixo do título (opcional)"><Textarea rows={2} value={form.loginText ?? ''} onChange={(e) => set({ loginText: e.target.value })} /></Field>
          <Field label="Texto do botão"><Input value={form.loginButtonText} onChange={(e) => set({ loginButtonText: e.target.value })} /></Field>
          <Field label="Ajuda para o primeiro acesso"><Textarea rows={3} value={form.loginHelpText ?? ''} onChange={(e) => set({ loginHelpText: e.target.value })} /></Field>
          <Field label="WhatsApp do suporte (opcional, mostra o botão Falar com o suporte)">
            <Input value={form.supportWhatsapp ?? ''} onChange={(e) => set({ supportWhatsapp: e.target.value })} inputMode="tel" placeholder="(27) 99999-9999" />
          </Field>
        </section>

        <div className="flex gap-2">
          <Button type="submit" loading={busy} disabled={!loaded}>Salvar visual</Button>
          <a href="/membros/login" target="_blank" rel="noreferrer" className="inline-flex h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <ExternalLink size={15} /> Abrir o login
          </a>
        </div>
      </form>

      <div className="xl:sticky xl:top-4 xl:self-start">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-600">Pré-visualização</p>
          <div role="radiogroup" aria-label="O que pré-visualizar" className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {(['login', 'area'] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={preview === k} onClick={() => setPreview(k)} className={`rounded-md px-2.5 py-1 text-xs font-medium ${preview === k ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>
                {k === 'login' ? 'Tela de login' : 'Área de membros'}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm" role="region" aria-label="Pré-visualização">
          {preview === 'login' ? (
            <MembersLoginView theme={form} preview />
          ) : (
            <div className="min-h-[560px] bg-[var(--m-bg)] text-[var(--m-text)]" style={vars}>
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
                      <p className="mt-1.5 text-xs text-[var(--m-muted)]">Curso {i}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
