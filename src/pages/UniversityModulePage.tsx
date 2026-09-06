import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import ReactMarkdown from 'react-markdown'
import { ArrowLeft, CheckCircle2, FileText } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useModules } from '../hooks/useModules'
import { useMyProgress } from '../hooks/useProgress'
import { completeModule } from '../services/progressService'
import { ChecklistBlock } from '../components/university/ChecklistBlock'
import { QuizBlock } from '../components/university/QuizBlock'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/FullPageSpinner'
import { toYoutubeEmbedUrl } from '../utils/youtubeEmbed'
import { QUIZ_PASS_THRESHOLD, type ChecklistItem } from '../types'

export function UniversityModulePage() {
  const { trailId, moduleId } = useParams<{ trailId: string; moduleId: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { data: modules, loading } = useModules(trailId)
  const { data: progress } = useMyProgress(profile?.id)

  const module = modules.find((m) => m.id === moduleId)
  const existingProgress = progress.find((p) => p.moduleId === moduleId)

  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [quizScore, setQuizScore] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  // Reset local checklist/quiz state whenever the module changes.
  useEffect(() => {
    setChecklist(module?.checklist ?? [])
    setQuizScore(null)
  }, [module?.id])

  const embedUrl = useMemo(() => (module?.videoUrl ? toYoutubeEmbedUrl(module.videoUrl) : null), [module?.videoUrl])

  const checklistDone = checklist.length === 0 || checklist.every((i) => i.done)
  const hasQuiz = (module?.quiz?.length ?? 0) > 0
  const quizDone = !hasQuiz || (quizScore !== null && quizScore >= QUIZ_PASS_THRESHOLD)
  const canComplete = checklistDone && quizDone

  const handleComplete = async () => {
    if (!profile || !module || !trailId) return
    setSaving(true)
    try {
      await completeModule({
        userId: profile.id,
        trailId,
        moduleId: module.id,
        quizScore: quizScore ?? 100,
        checklistDone,
      })
      toast.success('Módulo concluído!')
      navigate(`/universidade/${trailId}`)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao concluir módulo')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner />
  if (!module) return null

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <button
        onClick={() => navigate(`/universidade/${trailId}`)}
        className="flex w-fit items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft size={14} /> Voltar
      </button>

      <div>
        <h1 className="text-[28px] font-extrabold text-slate-900">{module.title}</h1>
        <p className="text-[15px] text-[#64748B]">{module.description}</p>
      </div>

      {existingProgress?.completed && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 size={16} /> Você já concluiu este módulo (nota do quiz: {existingProgress.quizScore}%).
        </div>
      )}

      {embedUrl && (
        <div className="aspect-video w-full overflow-hidden rounded-xl border border-slate-100">
          <iframe
            src={embedUrl}
            title={module.title}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {module.content && (
        <div className="prose prose-sm prose-slate max-w-none rounded-xl border border-slate-100 bg-white p-4">
          <ReactMarkdown>{module.content}</ReactMarkdown>
        </div>
      )}

      {module.materialUrl && (
        <a
          href={module.materialUrl}
          target="_blank"
          rel="noreferrer"
          className="flex w-fit items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          <FileText size={15} /> Material de apoio
        </a>
      )}

      <ChecklistBlock
        items={checklist}
        onChange={setChecklist}
        disabled={!!existingProgress?.completed}
      />

      {hasQuiz && !existingProgress?.completed && (
        <QuizBlock quiz={module.quiz} onSubmit={setQuizScore} />
      )}

      {!existingProgress?.completed && (
        <Button onClick={handleComplete} loading={saving} disabled={!canComplete} className="w-fit">
          Concluir módulo
        </Button>
      )}
    </div>
  )
}
