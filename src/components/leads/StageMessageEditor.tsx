import { MessageCircle, X } from 'lucide-react'
import { Input, Select } from '../ui/Field'
import { TemplateBubble, TemplateExtraFields, TemplatePickerField, tplKey } from '../whatsapp/WaTemplatePicker'
import { useWaTemplates } from '../../hooks/useWaConversations'
import type { PipelineStage, StageVarSource, StageWaMessage } from '../../types/leadPipeline'
import type { WaTemplate } from '../../types/whatsapp'

const SOURCE_LABEL: Record<StageVarSource, string> = {
  first: 'Primeiro nome do lead',
  full: 'Nome completo',
  company: 'Empresa',
  city: 'Cidade',
  fixed: 'Texto fixo',
}

const SAMPLE: Record<Exclude<StageVarSource, 'fixed'>, string> = { first: 'Maria', full: 'Maria Souza', company: 'Limpeza Brilho', city: 'Campinas' }

function emptyFor(t: WaTemplate): StageWaMessage {
  return {
    templateName: t.name,
    templateLang: t.language,
    vars: Array.from({ length: t.vars }, (_, i) => ({ source: i === 0 ? 'first' : 'fixed', text: i === 0 ? 'tudo bem' : '' })),
    extras: {},
    aiMode: 'auto',
  }
}

/** Escolha do modelo de WhatsApp que sai quando o lead entra nesta etapa. */
export function StageMessageEditor({ stage, onChange }: { stage: PipelineStage; onChange: (m: StageWaMessage | null) => void }) {
  const templates = useWaTemplates()
  const msg = stage.waMessage || null
  const tpl = msg ? templates.find((t) => t.name === msg.templateName && t.language === msg.templateLang) : undefined
  const preview = msg ? msg.vars.map((v) => (v.source === 'fixed' ? v.text : SAMPLE[v.source])) : []
  const setVar = (i: number, patch: Partial<StageWaMessage['vars'][number]>) => msg && onChange({ ...msg, vars: msg.vars.map((v, j) => (j === i ? { ...v, ...patch } : v)) })

  return (
    <div className="w-full rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3" role="group" aria-label={`Mensagem de WhatsApp da etapa ${stage.label || 'sem nome'}`}>
      <div className="mb-2 flex items-center gap-2">
        <MessageCircle size={15} className="text-emerald-400" aria-hidden="true" />
        <p className="flex-1 text-xs font-semibold text-slate-700">Quando o lead entrar nesta etapa, mandar no WhatsApp:</p>
        {msg && (
          <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-red-500/10 hover:text-red-400">
            <X size={12} aria-hidden="true" /> Tirar mensagem
          </button>
        )}
      </div>

      <TemplatePickerField
        templates={templates}
        value={msg ? tplKey({ name: msg.templateName, language: msg.templateLang }) : ''}
        onChange={(t) => onChange(t ? emptyFor(t) : null)}
        label="Modelo aprovado pelo Meta"
      />

      {msg && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            {msg.vars.map((v, i) => (
              <div key={i} className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-amber-300">{`{{${tpl?.varNames?.[i] || i + 1}}}`}</span>
                <div className="flex gap-1.5">
                  <Select value={v.source} onChange={(e) => setVar(i, { source: e.target.value as StageVarSource })} className="max-w-[170px] text-xs" aria-label={`Variável ${i + 1}: de onde vem`}>
                    {(Object.entries(SOURCE_LABEL) as [StageVarSource, string][]).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </Select>
                  <Input
                    value={v.text}
                    onChange={(e) => setVar(i, { text: e.target.value })}
                    placeholder={v.source === 'fixed' ? 'Texto' : 'Se faltar o dado'}
                    aria-label={v.source === 'fixed' ? `Variável ${i + 1}: texto fixo` : `Variável ${i + 1}: texto se o lead não tiver o dado`}
                    className="min-w-0 flex-1 text-xs"
                  />
                </div>
              </div>
            ))}
            {tpl && <TemplateExtraFields tpl={tpl} extras={msg.extras || {}} onChange={(extras) => onChange({ ...msg, extras })} />}
            <fieldset className="mt-1">
              <legend className="mb-1 text-xs font-medium text-slate-500">Quando o lead responder</legend>
              {(['auto', 'off'] as const).map((m) => (
                <label key={m} className="flex cursor-pointer items-center gap-2 py-0.5 text-xs text-slate-700">
                  <input type="radio" name={`stage-ai-${stage.id}`} checked={msg.aiMode === m} onChange={() => onChange({ ...msg, aiMode: m })} className="accent-emerald-500" />
                  {m === 'auto' ? 'O Jonas responde e faz o follow-up' : 'Fica com a equipe (o Bruno responde)'}
                </label>
              ))}
            </fieldset>
          </div>
          <div className="wa-wall flex min-h-[120px] items-start rounded-xl p-2">
            {tpl ? <TemplateBubble tpl={tpl} params={preview} extras={msg.extras || {}} /> : <p className="m-auto text-center text-xs text-amber-400">Modelo não encontrado ou não aprovado.</p>}
          </div>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-500">Sai quando alguém da equipe move o lead para esta etapa. Não repete para o mesmo lead em 7 dias.</p>
    </div>
  )
}
