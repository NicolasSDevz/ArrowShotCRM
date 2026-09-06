import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Muda de valor para "resetar" o boundary (ex.: a rota atual) — assim um
   *  erro numa página não trava as outras depois que o usuário navega. */
  resetKey?: string
}
interface State {
  error: Error | null
}

/** Impede que um erro de render em qualquer página deixe a tela branca —
 *  mostra uma mensagem com opção de recarregar / voltar. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary capturou:', error, info.componentStack)
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-6 text-center">
          <p className="text-lg font-semibold text-slate-800">Algo deu errado nesta tela</p>
          <p className="max-w-md text-sm text-slate-500">
            O problema foi registrado. Você pode recarregar a página ou voltar para o início — seus dados
            não foram perdidos.
          </p>
          <p className="max-w-md truncate text-xs text-slate-400">{this.state.error.message}</p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Tentar de novo
            </button>
            <button
              onClick={() => {
                window.location.href = '/'
              }}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Ir para o início
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
