import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { memberEnter, memberLogin, memberSendLink, memberSetPassword } from '../../../services/storeApi'
import { useMembers } from '../../../components/store/members/MembersContext'
import { Spinner } from '../../../components/ui/FullPageSpinner'
import { MyPurchases } from '../../../components/store/members/MyPurchases'
import { MembersLoginView } from '../../../components/store/members/MembersLoginView'

const inputCls = 'h-11 w-full rounded-lg border border-[var(--m-border)] bg-[var(--m-soft)] px-3 text-[var(--m-text)] outline-none placeholder:text-[var(--m-faint)] focus:border-[var(--m-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--m-primary)_30%,transparent)]'

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--m-bg)] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--m-border)] bg-[var(--m-card)] p-7 text-[var(--m-text)]">
        <h1 className="mb-5 text-xl font-bold">{title}</h1>
        {children}
      </div>
    </main>
  )
}

/** /membros/login — e-mail e senha (a senha é criada pelo aluno no primeiro acesso). */
export function MembersLoginPage() {
  const { user, loading, signInWithToken, theme } = useMembers()
  const navigate = useNavigate()

  if (!loading && user) return <Navigate to="/membros" replace />

  return (
    <MembersLoginView
      theme={theme}
      onLogin={async (email, password) => {
        const { token } = await memberLogin(email, password)
        await signInWithToken(token)
        navigate('/membros', { replace: true })
      }}
      onSendLink={async (email) => (await memberSendLink(email)).email}
    />
  )
}

/** /membros/entrar?code= — link de acesso que sai na compra ou que a equipe gera no CRM. */
export function MembersEnterPage() {
  const [params] = useSearchParams()
  const { signInWithToken } = useMembers()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const code = params.get('code') || ''
    memberEnter(code)
      .then(async ({ token, hasPassword }) => {
        await signInWithToken(token)
        navigate(hasPassword ? '/membros' : '/membros?bemvindo=1', { replace: true })
      })
      .catch((err: Error) => setError(err.message))
  }, [params, signInWithToken, navigate])

  return (
    <AuthCard title={error ? 'Não deu certo' : 'Entrando...'}>
      {error ? (
        <>
          <p role="alert" className="text-sm text-red-400">{error}</p>
          <Link to="/membros/login" className="mt-4 inline-block text-sm text-[var(--m-primary)] hover:underline">Entrar com e-mail e senha ou pedir um link novo</Link>
        </>
      ) : (
        <p className="flex items-center gap-2 text-sm text-[var(--m-muted)]" aria-live="polite"><Spinner className="h-4 w-4" /> Liberando o seu acesso</p>
      )}
    </AuthCard>
  )
}

/** /membros/perfil — dados do aluno e criação/troca de senha. */
export function MembersProfilePage() {
  const { member } = useMembers()
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setMsg('')
    setError('')
    if (password.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.')
    if (password !== password2) return setError('As senhas não são iguais.')
    setBusy(true)
    try {
      await memberSetPassword(password)
      setPassword('')
      setPassword2('')
      setMsg('Senha salva. Agora você pode entrar com o seu e-mail e essa senha.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-bold">Meu perfil</h1>
      <dl className="mt-5 space-y-2 rounded-xl border border-[var(--m-border)] bg-[var(--m-card)] p-5 text-sm">
        <div><dt className="text-[var(--m-faint)]">Nome</dt><dd>{member?.name}</dd></div>
        <div><dt className="text-[var(--m-faint)]">E-mail</dt><dd>{member?.email}</dd></div>
      </dl>
      <form onSubmit={onSubmit} className="mt-6 space-y-3 rounded-xl border border-[var(--m-border)] bg-[var(--m-card)] p-5">
        <h2 className="font-semibold">{member?.hasPassword ? 'Trocar senha' : 'Criar senha'}</h2>
        <label className="block text-sm text-[var(--m-muted)]">
          Nova senha
          <input className={`${inputCls} mt-1`} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="block text-sm text-[var(--m-muted)]">
          Repita a senha
          <input className={`${inputCls} mt-1`} type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        {msg && <p role="status" className="text-sm text-emerald-400">{msg}</p>}
        <button disabled={busy} className="h-11 rounded-lg bg-[var(--m-primary)] px-5 font-semibold text-white hover:brightness-110 disabled:opacity-60">
          {busy ? 'Salvando...' : 'Salvar senha'}
        </button>
      </form>
      <MyPurchases />
    </main>
  )
}
