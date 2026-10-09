import { useState, type FormEvent } from 'react'
import { MessageCircle } from 'lucide-react'
import { membersThemeVars, type StoreMembersTheme } from '../../../types/store'

const inputCls =
  'h-11 w-full rounded-lg border border-[var(--m-border)] bg-[var(--m-soft)] px-3 text-[var(--m-text)] outline-none placeholder:text-[var(--m-faint)] focus:border-[var(--m-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--m-primary)_30%,transparent)]'

/** Tela de login da área de membros, com o visual do tema. Usada na página
 *  real (/membros/login) e na prévia do CRM (preview = não envia nada). */
export function MembersLoginView({
  theme,
  preview = false,
  onLogin,
}: {
  theme: StoreMembersTheme
  preview?: boolean
  onLogin?: (email: string, password: string) => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const split = theme.loginLayout === 'split'
  const whatsapp = String(theme.supportWhatsapp || '').replace(/\D/g, '')

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (preview || !onLogin) return
    setBusy(true)
    setError('')
    try {
      await onLogin(email, password)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const card = (
    <div className={`w-full max-w-sm rounded-2xl border border-[var(--m-border)] bg-[var(--m-card)] p-7 text-[var(--m-text)] ${split ? '' : 'shadow-2xl'}`}>
      {theme.logoUrl && <img src={theme.logoUrl} alt={theme.brandName} className="mb-5 h-10 w-auto" />}
      <h1 className="text-xl font-bold">{theme.loginTitle || 'Acessar área de membros'}</h1>
      {theme.loginText && <p className="mt-1.5 text-sm text-[var(--m-muted)]">{theme.loginText}</p>}
      <form onSubmit={onSubmit} className="mt-5 space-y-3">
        <label className="block text-sm text-[var(--m-muted)]">
          E-mail usado na compra
          <input className={`${inputCls} mt-1`} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required={!preview} />
        </label>
        <label className="block text-sm text-[var(--m-muted)]">
          Senha
          <input className={`${inputCls} mt-1`} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required={!preview} />
        </label>
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        <button disabled={busy} className="h-11 w-full rounded-lg bg-[var(--m-primary)] font-semibold text-white hover:brightness-110 disabled:opacity-60">
          {busy ? 'Entrando...' : theme.loginButtonText || 'Entrar'}
        </button>
      </form>
      {theme.loginHelpText && <p className="mt-5 text-sm text-[var(--m-muted)]">{theme.loginHelpText}</p>}
      {whatsapp && (
        <a
          href={`https://wa.me/${whatsapp.startsWith('55') ? whatsapp : `55${whatsapp}`}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--m-primary)] hover:underline"
        >
          <MessageCircle size={16} aria-hidden="true" /> Falar com o suporte
        </a>
      )}
    </div>
  )

  const bg = theme.loginBgUrl ? { backgroundImage: `url(${theme.loginBgUrl})` } : undefined

  return (
    <main className={`min-h-full ${preview ? 'min-h-[560px]' : 'min-h-screen'} bg-[var(--m-bg)]`} style={membersThemeVars(theme)}>
      {split ? (
        <div className={`grid ${preview ? 'min-h-[560px]' : 'min-h-screen'} md:grid-cols-2`}>
          <div className="hidden bg-[var(--m-card2)] bg-cover bg-center md:block" style={bg} aria-hidden="true" />
          <div className="flex items-center justify-center px-4 py-10">{card}</div>
        </div>
      ) : (
        <div className={`relative flex ${preview ? 'min-h-[560px]' : 'min-h-screen'} items-center justify-center bg-cover bg-center px-4 py-10`} style={bg}>
          {theme.loginBgUrl && <div className="absolute inset-0 bg-black/45" aria-hidden="true" />}
          <div className="relative w-full max-w-sm">{card}</div>
        </div>
      )}
    </main>
  )
}
