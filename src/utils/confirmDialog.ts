/** Confirmação com a cara do CRM, no lugar do confirm() do navegador (aquela
 *  janelinha cinza "o site diz…"). Uso: `if (!(await askConfirm({ … }))) return`.
 *  Quem desenha é o ConfirmDialogHost, montado uma vez no App. */
export interface ConfirmRequest {
  title: string
  message?: string
  /** Texto do botão de confirmar (padrão "Confirmar"). */
  confirmLabel?: string
  /** Botão vermelho — pra excluir/apagar. */
  danger?: boolean
}

type Listener = (req: ConfirmRequest, resolve: (ok: boolean) => void) => void
let listener: Listener | null = null

export function onConfirmRequest(fn: Listener) {
  listener = fn
  return () => {
    if (listener === fn) listener = null
  }
}

export function askConfirm(req: ConfirmRequest): Promise<boolean> {
  // Sem o host montado (não deveria acontecer): cai no do navegador pra não travar.
  if (!listener) return Promise.resolve(window.confirm([req.title, req.message].filter(Boolean).join('\n\n')))
  return new Promise((resolve) => listener!(req, resolve))
}
