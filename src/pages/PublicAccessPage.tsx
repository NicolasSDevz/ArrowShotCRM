import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Lock } from 'lucide-react'
import { getCredentialRequest, submitCredentialRequest } from '../services/credentialsApi'
import { CREDENTIAL_SERVICES } from '../types/clientCredentials'

type Draft = Record<string, { login: string; password: string; note: string }>

const emptyDraft = (): Draft => Object.fromEntries(CREDENTIAL_SERVICES.map((s) => [s.key, { login: '', password: '', note: '' }]))

/** Link público (/acessos/:token) onde o cliente preenche os acessos das
 *  contas dele. Tudo vai direto pra aba "Acessos" da ficha do cliente, com a
 *  senha criptografada. Campo em branco não apaga nada do que a agência já tem. */
export function PublicAccessPage() {
  const { token = '' } = useParams<{ token: string }>()
  const [clientName, setClientName] = useState<string | null | undefined>(undefined)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [show, setShow] = useState<Record<string, boolean>>({})
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)

  useEffect(() => {
    document.title = 'Acesso das contas'
    getCredentialRequest(token)
      .then((r) => setClientName(r.clientName))
      .catch(() => setClientName(null))
  }, [token])

  const set = (key: string, field: 'login' | 'password' | 'note', v: string) =>
    setDraft((d) => ({ ...d, [key]: { ...d[key], [field]: v } }))

  const filledCount = Object.values(draft).filter((d) => d.login.trim() || d.password).length

  const send = async () => {
    setError(null)
    if (filledCount === 0) return setError('Preencha pelo menos um acesso antes de enviar.')
    setSending(true)
    try {
      const entries = Object.fromEntries(
        Object.entries(draft)
          .filter(([, d]) => d.login.trim() || d.password || d.note.trim())
          .map(([k, d]) => [k, { login: d.login, password: d.password, note: d.note }])
      )
      const { saved } = await submitCredentialRequest(token, entries)
      setDone(saved)
      setDraft(emptyDraft())
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar. Tente de novo.')
    } finally {
      setSending(false)
    }
  }

  if (clientName === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }
  if (clientName === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-50 p-6 text-center">
        <img src="/favicon.png" alt="" className="mb-2 h-10 w-10 rounded-lg" />
        <p className="text-lg font-semibold text-slate-800">Link indisponível</p>
        <p className="max-w-sm text-sm text-slate-500">Este link foi desativado ou não existe. Peça um novo link para a sua agência.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-[#0F172A] px-5 py-6 text-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <img src="/favicon.png" alt="" className="h-10 w-10 rounded-lg" />
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-slate-400">Acesso das contas</p>
            <h1 className="truncate text-xl font-bold">{clientName}</h1>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
        {done !== null ? (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600" />
            <div className="text-sm text-emerald-900">
              <p className="font-semibold">Recebemos {done === 1 ? '1 acesso' : `${done} acessos`}. Obrigado!</p>
              <p className="mt-0.5 text-emerald-800">Se faltou algum, é só preencher abaixo e enviar de novo — o que você já mandou continua salvo.</p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-600">
            <p className="font-semibold text-slate-800">Preencha os acessos das suas contas</p>
            <p className="mt-1">
              Precisamos deles pra configurar e cuidar das suas contas. Preencha só o que você tiver — o que ficar em branco a gente
              combina depois.
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              <Lock size={12} /> As senhas são enviadas com segurança e guardadas criptografadas. Só a nossa equipe tem acesso.
            </p>
          </div>
        )}

        {CREDENTIAL_SERVICES.map((s) => {
          const d = draft[s.key]
          const visible = !!show[s.key]
          return (
            <div key={s.key} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <KeyRound size={14} className="text-slate-400" /> {s.label}
              </p>
              {s.hint && <p className="text-xs text-slate-400">{s.hint}</p>}
              <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-500">
                  {s.loginLabel}
                  <input
                    value={d.login}
                    onChange={(e) => set(s.key, 'login', e.target.value)}
                    autoComplete="off"
                    autoCapitalize="off"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Senha
                  <div className="relative mt-1">
                    <input
                      type={visible ? 'text' : 'password'}
                      value={d.password}
                      onChange={(e) => set(s.key, 'password', e.target.value)}
                      autoComplete="new-password"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2.5 pr-10 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShow((v) => ({ ...v, [s.key]: !v[s.key] }))}
                      aria-label={visible ? 'Esconder senha' : 'Mostrar senha'}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 hover:text-slate-600"
                    >
                      {visible ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </label>
              </div>
              <input
                value={d.note}
                onChange={(e) => set(s.key, 'note', e.target.value)}
                placeholder="Observação (opcional) — ex: o código de verificação chega no meu celular"
                className="mt-2.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 outline-none focus:border-brand-500"
              />
            </div>
          )
        })}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3.5 text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {sending ? <Loader2 size={18} className="animate-spin" /> : <Lock size={16} />}
          {sending ? 'Enviando…' : filledCount > 0 ? `Enviar ${filledCount === 1 ? '1 acesso' : `${filledCount} acessos`} com segurança` : 'Enviar com segurança'}
        </button>
        <p className="pb-6 text-center text-xs text-slate-400">Você pode voltar neste link depois pra completar o que faltou.</p>
      </div>
    </div>
  )
}
