import { useEffect, useState, type ReactNode } from 'react'
import { Save } from 'lucide-react'
import { Button } from '../ui/Button'

/** Peças comuns aos dois briefings (Tráfego Pago e Social Mídia). Quem
 *  preenche é o Jamilson, que usa leitor de tela: títulos de verdade (h3/h4)
 *  pra navegar por seção, caixas de marcar com rótulo, nada desabilitado
 *  (campo desabilitado some da navegação por Tab) e aviso falado ao salvar. */

export function SectionTitle({ children }: { children: string }) {
  return <h3 className="mb-3 text-sm font-semibold text-slate-700">{children}</h3>
}

export function SubTitle({ children }: { children: string }) {
  return <h4 className="mb-2 mt-1 text-xs font-semibold uppercase tracking-wide text-slate-600">{children}</h4>
}

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
      />
      {label}
    </label>
  )
}

/** Avisa antes de fechar ou recarregar a página com alterações não salvas. */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
}

/** Quantas perguntas principais já têm resposta, lido logo no começo do
 *  formulário. Os nomes das que faltam vêm escritos, não só o número. */
export function BriefingProgress({ answered, missing }: { answered: number; missing: string[] }) {
  const total = answered + missing.length
  if (total === 0) return null
  return (
    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
      {missing.length === 0 ? (
        <>Todas as {total} perguntas principais estão respondidas.</>
      ) : (
        <>
          Respondidas {answered} de {total} perguntas principais. Faltam: {missing.join(', ')}.
        </>
      )}
    </p>
  )
}

/** Botão de salvar + região falada: "Alterações não salvas" enquanto houver
 *  mudança e a confirmação depois de salvar. */
export function SaveBar({
  dirty,
  saving,
  onSave,
  savedMessage,
}: {
  dirty: boolean
  saving: boolean
  onSave: () => void
  savedMessage: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button icon={<Save size={14} />} onClick={onSave} loading={saving}>
        Salvar briefing
      </Button>
      <p role="status" aria-live="polite" className="text-sm text-slate-600">
        {saving ? 'Salvando...' : dirty ? 'Há alterações não salvas.' : savedMessage}
      </p>
    </div>
  )
}

/** Mostra campos que saíram do formulário mas já têm resposta gravada, pra
 *  nada se perder. Some quando não há nenhum. */
export function OldAnswers({ children, count }: { children: ReactNode; count: number }) {
  const [open, setOpen] = useState(false)
  if (count === 0) return null
  return (
    <section aria-labelledby="briefing-old-answers" className="rounded-lg border border-slate-200 p-3">
      <h3 id="briefing-old-answers" className="text-sm font-semibold text-slate-700">
        Respostas de perguntas antigas
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        {count === 1 ? 'Uma pergunta que saiu do briefing já tinha resposta.' : `${count} perguntas que saíram do briefing já tinham resposta.`}{' '}
        Elas continuam guardadas.
      </p>
      <Button variant="ghost" size="sm" className="mt-2" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? 'Esconder respostas antigas' : 'Ver respostas antigas'}
      </Button>
      {open && <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>}
    </section>
  )
}
