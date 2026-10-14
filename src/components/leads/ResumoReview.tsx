import { Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Button } from '../ui/Button'
import { CHAMADA_TEMPERATURA_LABEL, type ChamadaTemperatura, type ResumoChamada } from '../../types/chamada'

type ResumoForm = Omit<ResumoChamada, 'geradoEm'>

/** Tela de revisão do resumo pós-chamada (Etapa 3) — tudo editável, campos
 *  sempre abertos (sem acordeão), igual pedido. Usada tanto logo após
 *  encerrar a chamada (CopilotoPage) quanto em "Gerar resumo agora"
 *  (LeadChamadasTab, pra uma chamada antiga sem resumo). */
export function ResumoReview({
  resumo,
  onChange,
  onSalvar,
  salvando,
}: {
  resumo: ResumoForm
  onChange: (resumo: ResumoForm) => void
  onSalvar: () => void
  salvando: boolean
}) {
  const set = <K extends keyof ResumoForm>(key: K, value: ResumoForm[K]) => onChange({ ...resumo, [key]: value })

  const copiarFollowUp = async () => {
    try {
      await navigator.clipboard.writeText(resumo.followUpMensagem)
      toast.success('Mensagem copiada')
    } catch (err) {
      console.error(err)
      toast.error('Não foi possível copiar')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Dores do cliente">
        <Textarea rows={2} value={resumo.dores} onChange={(e) => set('dores', e.target.value)} />
      </Field>

      <Field label="Situação atual (região, equipe, como chegam clientes, WhatsApp, anúncios...)">
        <Textarea rows={3} value={resumo.situacaoAtual} onChange={(e) => set('situacaoAtual', e.target.value)} />
      </Field>

      <Field label="Objeções levantadas e como foram respondidas">
        <Textarea rows={3} value={resumo.objecoes} onChange={(e) => set('objecoes', e.target.value)} />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Temperatura">
          <Select value={resumo.temperatura} onChange={(e) => set('temperatura', e.target.value as ChamadaTemperatura)}>
            {(Object.entries(CHAMADA_TEMPERATURA_LABEL) as [ChamadaTemperatura, string][]).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Justificativa da temperatura">
          <Input value={resumo.temperaturaJustificativa} onChange={(e) => set('temperaturaJustificativa', e.target.value)} />
        </Field>
      </div>

      <Field label="Plano ou valor discutido">
        <Textarea rows={2} value={resumo.planoOuValor} onChange={(e) => set('planoOuValor', e.target.value)} />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <Field label="Próximos passos combinados">
          <Textarea rows={2} value={resumo.proximosPassos} onChange={(e) => set('proximosPassos', e.target.value)} />
        </Field>
        <Field label="Data (se houver)">
          <Input
            type="date"
            value={resumo.proximoPassoData ?? ''}
            onChange={(e) => set('proximoPassoData', e.target.value || null)}
          />
        </Field>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500">Mensagem de follow-up (WhatsApp)</span>
          <Button size="sm" variant="secondary" icon={<Copy size={13} />} onClick={copiarFollowUp}>
            Copiar mensagem
          </Button>
        </div>
        <Textarea rows={4} value={resumo.followUpMensagem} onChange={(e) => set('followUpMensagem', e.target.value)} />
      </div>

      <Button onClick={onSalvar} loading={salvando} className="self-end">
        Salvar no lead
      </Button>
    </div>
  )
}
