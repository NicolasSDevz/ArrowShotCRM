import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getPublicLeadForm, submitLeadFormResponse } from '../services/leadFormService'
import type { LeadForm } from '../types/leadForm'
import { Spinner } from '../components/ui/FullPageSpinner'
import { LeadFormRenderer } from '../components/leads/LeadFormRenderer'

type Phase = 'loading' | 'invalid' | 'ready'

/** Página pública de captura de leads — sem login, sem menu, sem nenhum dado
 *  do CRM: só o formulário que o admin configurou em Leads > Formulários.
 *  Pensada pra ser o link colocado direto num anúncio do Meta (rota
 *  /captura/:formId, formId é o "link" escolhido na criação do formulário).
 *  A escrita do lead é anônima e estritamente scoped em firestore.rules —
 *  quem responde nunca consegue ler outros leads nem nada do painel. O
 *  visual (banner/logo/cores) e as perguntas/telas de resultado são
 *  renderizados por LeadFormRenderer, o mesmo componente usado no preview
 *  ao vivo do construtor. */
export function LeadCapturePage() {
  const { formId } = useParams<{ formId: string }>()
  const [phase, setPhase] = useState<Phase>('loading')
  const [form, setForm] = useState<LeadForm | null>(null)

  // A página é do lead, não do CRM: sempre no visual claro, mesmo que quem
  // abriu o link tenha o modo escuro ligado neste navegador.
  useEffect(() => {
    const root = document.documentElement
    const previous = root.getAttribute('data-theme')
    root.removeAttribute('data-theme')
    return () => {
      if (previous) root.setAttribute('data-theme', previous)
    }
  }, [])

  useEffect(() => {
    if (!formId) {
      setPhase('invalid')
      return
    }
    getPublicLeadForm(formId)
      .then((f) => {
        if (!f) {
          setPhase('invalid')
          return
        }
        setForm(f)
        setPhase('ready')
      })
      .catch(() => setPhase('invalid'))
  }, [formId])

  if (phase === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (phase === 'invalid' || !form) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">Este formulário não existe ou não está mais disponível.</p>
        </div>
      </div>
    )
  }

  return <LeadFormRenderer form={form} formId={form.id} onSubmitted={(answers, otherTexts) => submitLeadFormResponse(form, answers, otherTexts)} fillViewport />
}
