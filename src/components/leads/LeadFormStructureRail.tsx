import { useState, type ReactNode } from 'react'
import { Plus, GripVertical, GitBranch, ChevronUp, ChevronDown, AlertTriangle, Hand, Flag, Palette, X, Radar } from 'lucide-react'
import { LEAD_FIELD_PRESETS, QUESTION_TYPE_META, ROLE_LABEL, conditionProblem } from './leadFormMeta'
import type { BuilderSelection } from './leadFormUtils'
import { FIELD_GROUP_PRESETS } from './leadFormFieldGroups'
import type { LeadFormFieldRole, LeadFormOutcome, LeadFormQuestion, LeadFormQuestionType } from '../../types/leadForm'

type LeadFieldPreset = (typeof LEAD_FIELD_PRESETS)[number]

function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-1 mt-4 flex items-center justify-between px-1 first:mt-0">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{children}</span>
      {action}
    </div>
  )
}

function RailButton({ selected, onClick, icon, children, badge }: { selected: boolean; onClick: () => void; icon: ReactNode; children: ReactNode; badge?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[13px] transition-colors ${
        selected ? 'border-brand-200 bg-brand-50 font-semibold text-brand-700' : 'border-transparent text-slate-600 hover:bg-slate-100'
      }`}
    >
      <span className={`shrink-0 ${selected ? 'text-brand-600' : 'text-slate-400'}`}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {badge}
    </button>
  )
}

/** Coluna da esquerda do construtor — a "planta" do formulário: tela de
 *  início, perguntas (arrastáveis), telas finais e cores. Clicar num item
 *  abre o painel de edição dele e o preview passa a mostrar aquela tela. */
export function LeadFormStructureRail({
  questions,
  outcomes,
  hasRouting,
  onEnableRouting,
  selection,
  onSelect,
  onAddQuestion,
  onAddLeadField,
  onAddFieldsPreset,
  onReorder,
  onAddOutcome,
}: {
  questions: LeadFormQuestion[]
  outcomes: LeadFormOutcome[]
  hasRouting: boolean
  onEnableRouting: () => void
  selection: BuilderSelection
  onSelect: (s: BuilderSelection) => void
  onAddQuestion: (type: LeadFormQuestionType) => void
  onAddLeadField: (preset: LeadFieldPreset) => void
  onAddFieldsPreset: (key: string) => void
  onReorder: (from: number, to: number) => void
  onAddOutcome: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const usedRoles = new Set(questions.map((q) => q.role).filter((r): r is NonNullable<LeadFormFieldRole> => !!r))
  const missing = LEAD_FIELD_PRESETS.filter((p) => (p.role === 'name' || p.role === 'whatsapp') && !usedRoles.has(p.role))
  const resetDrag = () => {
    setDragIndex(null)
    setOverIndex(null)
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3">
      <SectionLabel>Início</SectionLabel>
      <RailButton selected={selection.kind === 'welcome'} onClick={() => onSelect({ kind: 'welcome' })} icon={<Hand size={14} />}>
        Tela de início
      </RailButton>

      <SectionLabel
        action={<span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{questions.length}</span>}
      >
        Perguntas
      </SectionLabel>

      {missing.length > 0 && (
        <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs leading-relaxed text-amber-800">
          <p className="mb-1.5 flex items-start gap-1.5">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>O lead precisa ter {missing.map((m) => ROLE_LABEL[m.role].replace(' do lead', '')).join(' e ')} pra chegar no CRM.</span>
          </p>
          <div className="flex flex-wrap gap-1">
            {missing.map((m) => (
              <button
                key={m.role}
                type="button"
                onClick={() => onAddLeadField(m)}
                className="rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
              >
                + {ROLE_LABEL[m.role].replace(' do lead', '')}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col">
        {questions.map((q, i) => {
          const selected = selection.kind === 'question' && selection.id === q.id
          const Icon = QUESTION_TYPE_META[q.type].icon
          const over = overIndex === i && dragIndex !== null && dragIndex !== i
          return (
            <div
              key={q.id}
              draggable
              onDragStart={(e) => {
                setDragIndex(i)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                e.preventDefault()
                setOverIndex(i)
              }}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== i) onReorder(dragIndex, i)
                resetDrag()
              }}
              onDragEnd={resetDrag}
              className={`group flex items-center border-y-2 border-transparent ${over ? (dragIndex! > i ? 'border-t-brand-500' : 'border-b-brand-500') : ''} ${
                dragIndex === i ? 'opacity-40' : ''
              }`}
            >
              <div
                onClick={() => onSelect({ kind: 'question', id: q.id })}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect({ kind: 'question', id: q.id })
                  }
                }}
                className={`flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-lg border py-1.5 pl-1 pr-2 text-[13px] transition-colors ${
                  selected ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-transparent text-slate-600 hover:bg-slate-100'
                }`}
              >
                <GripVertical size={13} className="shrink-0 cursor-grab text-slate-300 group-hover:text-slate-400" />
                <span className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded px-1 text-[10px] font-bold ${selected ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {i + 1}
                </span>
                <Icon size={13} className={`shrink-0 ${selected ? 'text-brand-600' : 'text-slate-400'}`} />
                <span className={`min-w-0 flex-1 truncate ${selected ? 'font-semibold' : ''} ${q.label.trim() ? '' : 'italic text-slate-400'}`}>
                  {q.label.trim() || 'Pergunta sem texto'}
                </span>
                {q.condition &&
                  (conditionProblem(q, i, questions) ? (
                    <AlertTriangle size={12} className="shrink-0 text-amber-500" aria-label="Lógica com problema" />
                  ) : (
                    <GitBranch size={12} className="shrink-0 text-brand-500" aria-label="Tem lógica condicional" />
                  ))}
                {selected && (
                  <span className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      title="Subir"
                      disabled={i === 0}
                      onClick={(e) => {
                        e.stopPropagation()
                        onReorder(i, i - 1)
                      }}
                      className="text-brand-400 hover:text-brand-700 disabled:opacity-25"
                    >
                      <ChevronUp size={12} />
                    </button>
                    <button
                      type="button"
                      title="Descer"
                      disabled={i === questions.length - 1}
                      onClick={(e) => {
                        e.stopPropagation()
                        onReorder(i, i + 1)
                      }}
                      className="text-brand-400 hover:text-brand-700 disabled:opacity-25"
                    >
                      <ChevronDown size={12} />
                    </button>
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {questions.length === 0 && <p className="px-1 pb-2 text-xs text-slate-400">Nenhuma pergunta ainda.</p>}

      {adding ? (
        <div className="mt-1.5 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Que pergunta adicionar?</span>
            <button type="button" onClick={() => setAdding(false)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100">
              <X size={13} />
            </button>
          </div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Dados do lead</p>
          <div className="mb-2.5 grid grid-cols-2 gap-1">
            {LEAD_FIELD_PRESETS.map((p) => {
              const used = usedRoles.has(p.role)
              return (
                <button
                  key={p.role}
                  type="button"
                  disabled={used}
                  onClick={() => {
                    onAddLeadField(p)
                    setAdding(false)
                  }}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-300 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-transparent"
                >
                  {ROLE_LABEL[p.role].replace(' do lead', '')}
                  {used && ' ✓'}
                </button>
              )
            })}
          </div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Modelos de vários campos</p>
          <div className="mb-2.5 grid grid-cols-1 gap-1">
            {FIELD_GROUP_PRESETS.filter((p) => p.key !== 'custom').map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  onAddFieldsPreset(p.key)
                  setAdding(false)
                }}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-left text-xs font-medium text-slate-600 hover:border-brand-300 hover:bg-brand-50"
              >
                {p.name}
              </button>
            ))}
          </div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Outras perguntas</p>
          <div className="grid grid-cols-1 gap-1">
            {(['single_choice', 'multi_choice', 'short_text', 'long_text', 'list', 'document', 'link', 'file', 'confirm', 'fields'] as LeadFormQuestionType[]).map((type) => {
              const m = QUESTION_TYPE_META[type]
              const Icon = m.icon
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    onAddQuestion(type)
                    setAdding(false)
                  }}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-left hover:border-brand-300 hover:bg-brand-50"
                >
                  <Icon size={14} className="shrink-0 text-brand-600" />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-slate-700">{m.label}</span>
                    <span className="block text-[11px] text-slate-400">{m.hint}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-semibold text-slate-500 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-600"
        >
          <Plus size={13} /> Adicionar pergunta
        </button>
      )}

      <SectionLabel>{hasRouting ? 'Telas finais' : 'Final'}</SectionLabel>
      {hasRouting ? (
        <>
          {outcomes.map((o) => (
            <RailButton
              key={o.id}
              selected={selection.kind === 'end' && selection.id === o.id}
              onClick={() => onSelect({ kind: 'end', id: o.id })}
              icon={<Flag size={14} />}
              badge={o.isDefault ? <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">padrão</span> : undefined}
            >
              {o.label || 'Tela sem nome'}
            </RailButton>
          ))}
          <button type="button" onClick={onAddOutcome} className="mt-1 flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50">
            <Plus size={12} /> Adicionar tela final
          </button>
          <div className="mt-1">
            <RailButton selected={selection.kind === 'routing'} onClick={() => onSelect({ kind: 'routing' })} icon={<GitBranch size={14} />}>
              Qual resposta vai pra qual tela
            </RailButton>
          </div>
        </>
      ) : (
        <>
          <RailButton selected={selection.kind === 'end'} onClick={() => onSelect({ kind: 'end', id: null })} icon={<Flag size={14} />}>
            Tela final
          </RailButton>
          <button type="button" onClick={onEnableRouting} title="Ex: uma tela pra lead qualificado e outra pra desqualificado" className="mt-1 flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-brand-600 hover:bg-brand-50">
            <Plus size={12} className="shrink-0" /> Separar por resposta (qualificado / desqualificado)
          </button>
        </>
      )}

      <SectionLabel>Aparência</SectionLabel>
      <RailButton selected={selection.kind === 'theme'} onClick={() => onSelect({ kind: 'theme' })} icon={<Palette size={14} />}>
        Cores e tema
      </RailButton>
      <RailButton selected={selection.kind === 'tracking'} onClick={() => onSelect({ kind: 'tracking' })} icon={<Radar size={14} />}>
        Pixel do Meta
      </RailButton>
    </div>
  )
}
