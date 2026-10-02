import { useState } from 'react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { createTeamSurvey, updateTeamSurvey } from '../../services/teamSurveyService'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { DEFAULT_SURVEY_QUESTIONS, type SurveyQuestion, type SurveyQuestionKind, type TeamSurvey } from '../../types'

const KIND_LABEL: Record<SurveyQuestionKind, string> = {
  scale: 'Nota de 1 a 5',
  nps: 'Nota de 0 a 10 (indicaria?)',
  text: 'Resposta escrita',
}

function defaultTitle() {
  const month = format(new Date(), 'MMMM yyyy', { locale: ptBR })
  return `Avaliação de desempenho e satisfação de ${month}`
}

/** Cria uma rodada nova (com as perguntas padrão) ou edita uma que ainda não
 *  tem respostas — depois da primeira resposta as perguntas ficam travadas. */
export function SurveyEditorModal({ open, onClose, survey }: { open: boolean; onClose: () => void; survey?: TeamSurvey | null }) {
  const { profile } = useAuth()
  const [title, setTitle] = useState(survey?.title ?? defaultTitle())
  const [description, setDescription] = useState(
    survey?.description ??
      'Queremos saber como você está se sentindo na equipe. É anônimo: ninguém, nem a liderança, sabe quem respondeu o quê.'
  )
  const [questions, setQuestions] = useState<SurveyQuestion[]>(survey?.questions ?? DEFAULT_SURVEY_QUESTIONS)
  const [saving, setSaving] = useState(false)

  const patch = (id: string, data: Partial<SurveyQuestion>) => setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...data } : q)))

  const add = () =>
    setQuestions((qs) => [
      ...qs,
      {
        id: `q-${crypto.randomUUID().slice(0, 8)}`,
        section: qs[qs.length - 1]?.section ?? 'Geral',
        text: '',
        kind: 'scale',
        minLabel: 'Discordo totalmente',
        maxLabel: 'Concordo totalmente',
      },
    ])

  const save = async () => {
    if (!profile) return
    if (!title.trim()) return toast.error('Dê um nome à avaliação')
    const clean = questions
      .filter((q) => q.text.trim())
      .map((q) => ({ ...q, text: q.text.trim(), section: q.section.trim() || 'Geral' }))
    if (clean.length === 0) return toast.error('Coloque pelo menos uma pergunta')
    setSaving(true)
    try {
      if (survey) {
        await updateTeamSurvey(survey.id, { title: title.trim(), description: description.trim(), questions: clean }, profile.id)
        toast.success('Avaliação atualizada')
      } else {
        await createTeamSurvey({ title: title.trim(), description: description.trim(), questions: clean, status: 'open' }, profile.id)
        toast.success('Avaliação aberta para a equipe')
      }
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar a avaliação')
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={survey ? 'Editar avaliação' : 'Nova avaliação da equipe'} width="max-w-3xl">
      <div className="flex flex-col gap-4">
        <Field label="Nome" required>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Texto de abertura (aparece para quem vai responder)">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <h3 className="mt-2 text-sm font-semibold text-slate-700">Perguntas ({questions.length})</h3>
        <ol className="flex flex-col gap-3">
          {questions.map((q, i) => (
            <li key={q.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 w-6 shrink-0 text-xs font-bold text-slate-400">{i + 1}.</span>
                <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_200px]">
                  <Input aria-label={`Pergunta ${i + 1}`} value={q.text} onChange={(e) => patch(q.id, { text: e.target.value })} placeholder="Texto da pergunta" />
                  <Input aria-label={`Seção da pergunta ${i + 1}`} value={q.section} onChange={(e) => patch(q.id, { section: e.target.value })} placeholder="Seção" />
                  <Select aria-label={`Tipo da pergunta ${i + 1}`} value={q.kind} onChange={(e) => patch(q.id, { kind: e.target.value as SurveyQuestionKind })}>
                    {Object.entries(KIND_LABEL).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  {q.kind === 'scale' && (
                    <>
                      <Input aria-label={`O que significa a nota 1 na pergunta ${i + 1}`} value={q.minLabel ?? ''} onChange={(e) => patch(q.id, { minLabel: e.target.value })} placeholder="1 significa..." />
                      <Input aria-label={`O que significa a nota 5 na pergunta ${i + 1}`} value={q.maxLabel ?? ''} onChange={(e) => patch(q.id, { maxLabel: e.target.value })} placeholder="5 significa..." />
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))}
                  aria-label={`Remover pergunta ${i + 1}`}
                  title="Remover"
                  className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ol>
        <Button variant="secondary" size="sm" icon={<Plus size={13} />} onClick={add} className="w-fit">
          Adicionar pergunta
        </Button>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            {survey ? 'Salvar' : 'Abrir para a equipe'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
