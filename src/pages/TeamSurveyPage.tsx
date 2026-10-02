import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { BarChart3, CheckCircle2, ClipboardList, EyeOff, Lock, LockOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useCollectionSubscription } from '../hooks/useCollectionSubscription'
import { useTeamMembers } from '../hooks/useTeamMembers'
import {
  deleteTeamSurvey,
  setSurveyStatus,
  subscribeAnswered,
  subscribeParticipantCount,
  subscribeTeamSurveys,
} from '../services/teamSurveyService'
import { askConfirm } from '../utils/confirmDialog'
import { SurveyForm } from '../components/survey/SurveyForm'
import { SurveyResults } from '../components/survey/SurveyResults'
import { SurveyEditorModal } from '../components/survey/SurveyEditorModal'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/FullPageSpinner'
import { EmptyState } from '../components/ui/EmptyState'
import type { TeamSurvey } from '../types'

function AnonymityNotice() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50/60 p-4 text-sm text-slate-700">
      <EyeOff size={18} className="mt-0.5 shrink-0 text-brand-600" aria-hidden="true" />
      <p>
        <strong>Sua resposta é anônima.</strong> O CRM guarda só as notas e os comentários, sem o seu nome, sem o seu login e sem o horário. Nem
        a liderança consegue ver quem respondeu o quê. O resultado aparece só somado, da equipe toda, e só depois de pelo menos 3 respostas.
      </p>
    </div>
  )
}

/** Cartão de uma avaliação aberta, do ponto de vista de quem responde. */
function AnswerCard({ survey }: { survey: TeamSurvey }) {
  const { profile } = useAuth()
  const [answered, setAnswered] = useState<boolean | null>(null)
  const [answering, setAnswering] = useState(false)

  const uid = profile?.id
  useEffect(() => (uid ? subscribeAnswered(survey.id, uid, setAnswered) : undefined), [survey.id, uid])

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900">{survey.title}</h2>
          {survey.description && <p className="mt-1 text-sm text-slate-500">{survey.description}</p>}
        </div>
        {answered === false && !answering && (
          <Button icon={<ClipboardList size={14} />} onClick={() => setAnswering(true)}>
            Responder agora
          </Button>
        )}
      </div>
      {answered === null ? (
        <Spinner />
      ) : answered ? (
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-700" role="status">
          <CheckCircle2 size={16} aria-hidden="true" />
          Você já respondeu esta avaliação. Obrigado!
        </p>
      ) : answering ? (
        <SurveyForm survey={survey} onDone={() => setAnswering(false)} />
      ) : (
        <p className="text-sm text-slate-500">
          {survey.questions.length} perguntas, leva uns 5 minutos.
        </p>
      )}
    </article>
  )
}

/** Linha de gestão (Admin): status, quantos responderam, ações e resultado. */
function AdminSurveyRow({ survey, teamSize, onEdit }: { survey: TeamSurvey; teamSize: number; onEdit: () => void }) {
  const { profile } = useAuth()
  const [count, setCount] = useState(0)
  const [showResults, setShowResults] = useState(false)

  useEffect(() => subscribeParticipantCount(survey.id, setCount), [survey.id])

  const toggleStatus = async () => {
    if (!profile) return
    const next = survey.status === 'open' ? 'closed' : 'open'
    try {
      await setSurveyStatus(survey.id, next, profile.id)
      toast.success(next === 'open' ? 'Avaliação reaberta' : 'Avaliação encerrada')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao mudar o status')
    }
  }

  const remove = async () => {
    const ok = await askConfirm({
      title: `Excluir "${survey.title}"?`,
      message: 'As respostas desta rodada serão apagadas para sempre.',
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteTeamSurvey(survey.id)
      toast.success('Avaliação excluída')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao excluir')
    }
  }

  return (
    <li className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-800">{survey.title}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Badge className={survey.status === 'open' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}>
              {survey.status === 'open' ? 'Aberta' : 'Encerrada'}
            </Badge>
            <span>
              {count} de {teamSize} {teamSize === 1 ? 'pessoa respondeu' : 'pessoas responderam'}
            </span>
            {survey.createdAt && <span>Criada em {format(survey.createdAt.toDate(), "dd 'de' MMM yyyy", { locale: ptBR })}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant={showResults ? 'primary' : 'secondary'} icon={<BarChart3 size={13} />} onClick={() => setShowResults((v) => !v)} aria-expanded={showResults}>
            {showResults ? 'Esconder resultado' : 'Ver resultado'}
          </Button>
          {count === 0 && (
            <Button size="sm" variant="secondary" icon={<Pencil size={13} />} onClick={onEdit}>
              Editar perguntas
            </Button>
          )}
          <Button size="sm" variant="secondary" icon={survey.status === 'open' ? <Lock size={13} /> : <LockOpen size={13} />} onClick={() => void toggleStatus()}>
            {survey.status === 'open' ? 'Encerrar' : 'Reabrir'}
          </Button>
          <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={() => void remove()} aria-label={`Excluir ${survey.title}`}>
            Excluir
          </Button>
        </div>
      </div>
      {showResults && <SurveyResults survey={survey} />}
    </li>
  )
}

export function TeamSurveyPage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const { data: surveys, loading } = useCollectionSubscription<TeamSurvey>(subscribeTeamSurveys)
  const { data: members } = useTeamMembers()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<TeamSurvey | null>(null)

  const open = surveys.filter((s) => s.status === 'open')
  const teamSize = members.filter((m) => m.status === 'active' && m.userId).length

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-extrabold text-slate-900">Avaliação da equipe</h1>
          <p className="text-[15px] text-[#64748B]">Desempenho e satisfação, respondido de forma anônima.</p>
        </div>
        {isAdmin && (
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
            Nova avaliação
          </Button>
        )}
      </div>

      <AnonymityNotice />

      {loading ? (
        <Spinner />
      ) : open.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={28} />}
          title="Nenhuma avaliação aberta agora"
          description={isAdmin ? 'Clique em "Nova avaliação" para abrir uma rodada para a equipe.' : 'Quando a liderança abrir uma rodada, ela aparece aqui.'}
        />
      ) : (
        <section className="flex flex-col gap-4" aria-label="Avaliações para responder">
          {open.map((s) => (
            <AnswerCard key={s.id} survey={s} />
          ))}
        </section>
      )}

      {isAdmin && surveys.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-slate-700">Resultados e gestão (só você vê)</h2>
          <ul className="flex flex-col gap-3">
            {surveys.map((s) => (
              <AdminSurveyRow key={s.id} survey={s} teamSize={teamSize} onEdit={() => setEditing(s)} />
            ))}
          </ul>
        </section>
      )}

      {creating && <SurveyEditorModal open onClose={() => setCreating(false)} />}
      {editing && <SurveyEditorModal key={editing.id} open survey={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
