import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { Field, Input } from '../components/ui/Field'
import { Button } from '../components/ui/Button'

export function LoginPage() {
  const { firebaseUser, loading, signIn, resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [mode, setMode] = useState<'signin' | 'reset'>('signin')
  const [resetSubmitting, setResetSubmitting] = useState(false)

  if (!loading && firebaseUser) return <Navigate to="/" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await signIn(email, password)
    } catch (err) {
      console.error(err)
      toast.error('E-mail ou senha inválidos')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetSubmitting(true)
    try {
      await resetPassword(email)
      toast.success('Se esse e-mail tiver uma conta, enviamos um link para redefinir a senha.')
      setMode('signin')
    } catch (err) {
      console.error(err)
      const code = (err as { code?: string })?.code
      if (code === 'auth/user-not-found') {
        // Mesma mensagem do sucesso — não revela se o e-mail existe.
        toast.success('Se esse e-mail tiver uma conta, enviamos um link para redefinir a senha.')
        setMode('signin')
      } else if (code === 'auth/invalid-email') {
        toast.error('E-mail inválido. Confira o endereço digitado.')
      } else {
        toast.error('Não foi possível enviar o e-mail. Tente de novo em instantes.')
      }
    } finally {
      setResetSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-navy-900 p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-2">
          <img src="/favicon.png" alt="Arrow Shot" className="h-12 w-12 rounded-lg" />
          <h1 className="font-display text-xl font-semibold text-white">Arrow Shot CRM</h1>
          <p className="text-xs text-slate-400">
            {mode === 'signin' ? 'Entre com sua conta da equipe' : 'Redefinir senha'}
          </p>
        </div>

        {mode === 'signin' ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Field label="E-mail" required>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </Field>
            <Field label="Senha" required>
              <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button type="submit" loading={submitting} className="mt-2 w-full">
              Entrar
            </Button>
            <button
              type="button"
              onClick={() => setMode('reset')}
              className="text-center text-xs text-slate-400 hover:text-brand-400"
            >
              Esqueci minha senha
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="flex flex-col gap-3">
            <p className="text-xs text-slate-500">
              Digite o e-mail cadastrado pelo admin. Vamos te enviar um link para você criar sua própria senha.
            </p>
            <Field label="E-mail" required>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </Field>
            <Button type="submit" loading={resetSubmitting} className="mt-2 w-full">
              Enviar link de redefinição
            </Button>
            <button
              type="button"
              onClick={() => setMode('signin')}
              className="text-center text-xs text-slate-400 hover:text-brand-400"
            >
              Voltar para o login
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
