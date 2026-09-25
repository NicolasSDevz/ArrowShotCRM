import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { AlertTriangle, ChevronDown, Copy } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'
import { onErrorDialog, type FriendlyError } from '../../utils/notifyError'

/** Pop-up global de erro (ver utils/notifyError): título + explicação em
 *  português, com o texto técnico escondido num "Ver detalhes". Montado uma
 *  vez no App. */
export function ErrorDialogHost() {
  const [error, setError] = useState<FriendlyError | null>(null)
  const [showDetails, setShowDetails] = useState(false)

  useEffect(
    () =>
      onErrorDialog((e) => {
        setError(e)
        setShowDetails(false)
      }),
    []
  )

  const copy = () =>
    navigator.clipboard.writeText(error?.details ?? '').then(
      () => toast.success('Detalhes copiados'),
      () => toast.error('Não foi possível copiar')
    )

  return (
    <Modal
      open={!!error}
      onClose={() => setError(null)}
      title={
        <span className="flex items-center gap-2">
          <AlertTriangle size={17} className="text-red-500" />
          {error?.title}
        </span>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-slate-700">{error?.message}</p>
        {error?.details && (
          <div>
            <button type="button" onClick={() => setShowDetails((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-600">
              <ChevronDown size={13} className={`transition-transform ${showDetails ? 'rotate-180' : ''}`} />
              {showDetails ? 'Esconder detalhes técnicos' : 'Ver detalhes técnicos'}
            </button>
            {showDetails && (
              <div className="mt-2 flex flex-col gap-2">
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{error.details}</pre>
                <button type="button" onClick={copy} className="flex w-fit items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                  <Copy size={12} /> Copiar detalhes
                </button>
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end">
          <Button onClick={() => setError(null)}>Entendi</Button>
        </div>
      </div>
    </Modal>
  )
}
