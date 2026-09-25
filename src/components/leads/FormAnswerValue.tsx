import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { getDownloadURL, ref } from 'firebase/storage'
import { storage } from '../../firebase/config'
import { filesInAnswer, type LeadFormUploadedFile } from '../../utils/leadFormFiles'

/** Valor de uma resposta de formulário na ficha do lead: mantém as quebras de
 *  linha (listas), vira botão de download pra arquivos enviados e link
 *  clicável pra respostas que são um endereço de site. */
export function FormAnswerValue({ value }: { value: string }) {
  const files = filesInAnswer(value)
  if (files.length > 0) {
    return (
      <div className="mt-1 flex flex-col gap-1.5">
        {files.map((f) => (
          <FileDownloadButton key={f.path} file={f} />
        ))}
      </div>
    )
  }
  if (/^https?:\/\/\S+$/.test(value.trim())) {
    return (
      <a href={value.trim()} target="_blank" rel="noopener noreferrer" className="break-all text-sm text-brand-600 underline underline-offset-2">
        {value.trim()}
      </a>
    )
  }
  return <p className="whitespace-pre-line text-sm text-slate-700">{value}</p>
}

function FileDownloadButton({ file }: { file: LeadFormUploadedFile }) {
  const [busy, setBusy] = useState(false)
  const open = async () => {
    setBusy(true)
    try {
      window.open(await getDownloadURL(ref(storage, file.path)), '_blank', 'noopener')
    } catch (err) {
      console.error(err)
      toast.error('Não foi possível abrir o arquivo')
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      onClick={open}
      disabled={busy}
      className="flex w-fit max-w-full items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-left text-sm text-slate-700 hover:border-brand-300 hover:bg-brand-50 disabled:opacity-60"
    >
      {busy ? <Loader2 size={14} className="shrink-0 animate-spin" /> : <Download size={14} className="shrink-0 text-brand-600" />}
      <span className="truncate">{file.name}</span>
    </button>
  )
}
