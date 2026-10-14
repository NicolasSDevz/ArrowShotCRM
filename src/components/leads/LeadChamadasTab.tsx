import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { ChevronLeft, Copy, Mic, Radio, Sparkles } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { EmptyState } from '../ui/EmptyState'
import { Button } from '../ui/Button'
import { ResumoReview } from './ResumoReview'
import { SugestaoCard } from './SugestaoCard'
import { useAuth } from '../../context/AuthContext'
import { useChamadas } from '../../hooks/useChamadas'
import { gerarResumoChamada } from '../../services/copilotoResumoService'
import { salvarResumo } from '../../services/chamadaService'
import { updateLead } from '../../services/leadService'
import { buildLeadUpdateFromResumo } from '../../utils/leadResumoUpdate'
import {
  CHAMADA_TEMPERATURA_BADGE,
  CHAMADA_TEMPERATURA_LABEL,
  type Chamada,
  type BlocoTranscricao,
  type ResumoChamada,
} from '../../types/chamada'
import type { Lead } from '../../types'

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${mins}min ${String(secs).padStart(2, '0')}s`
}

function chamadaDuration(chamada: Chamada): string {
  const start = chamada.iniciadaEm?.toDate()
  if (!start) return '—'
  const end = chamada.encerradaEm?.toDate() ?? new Date()
  return formatDuration(end.getTime() - start.getTime())
}

function formatBlocoTime(ms: number): string {
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function transcricaoTexto(chamada: Chamada): string {
  const inicio = chamada.iniciadaEm?.toMillis() ?? 0
  return (
    chamada.blocos
      .map((b) => `[${formatBlocoTime(b.timestampMs)}] ${b.speaker}: ${b.texto}`)
      .join('\n')
      .trim() || `(chamada sem falas transcritas — iniciada em ${format(new Date(inicio), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })})`
  )
}

function BlocoRow({ bloco }: { bloco: BlocoTranscricao }) {
  const isBruno = bloco.speaker === 'Bruno'
  return (
    <div className={`flex gap-2.5 ${isBruno ? 'flex-row' : 'flex-row-reverse'}`}>
      <div
        className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
          isBruno ? 'bg-brand-100 text-brand-700' : 'bg-emerald-100 text-emerald-700'
        }`}
      >
        {isBruno ? 'B' : 'C'}
      </div>
      <div className={`max-w-[85%] ${isBruno ? '' : 'items-end'} flex flex-col gap-0.5`}>
        <div className={`flex items-center gap-1.5 ${isBruno ? '' : 'flex-row-reverse'}`}>
          <span className="text-[11px] font-semibold text-slate-400">{bloco.speaker}</span>
          <span className="text-[11px] text-slate-300">{formatBlocoTime(bloco.timestampMs)}</span>
        </div>
        <div
          className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
            isBruno ? 'rounded-tl-sm bg-brand-50 text-slate-800' : 'rounded-tr-sm bg-emerald-50 text-slate-800'
          }`}
        >
          {bloco.texto}
        </div>
      </div>
    </div>
  )
}

/** Mostra um resumo já salvo (somente leitura) — a versão editável
 *  (ResumoReview) é só pra revisar antes de salvar, na hora de gerar. */
function ResumoDisplay({ resumo }: { resumo: ResumoChamada }) {
  const copiarFollowUp = async () => {
    try {
      await navigator.clipboard.writeText(resumo.followUpMensagem)
      toast.success('Mensagem copiada')
    } catch (err) {
      console.error(err)
      toast.error('Não foi possível copiar')
    }
  }

  const campo = (label: string, valor: string) => (
    <div>
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="whitespace-pre-wrap text-sm text-slate-700">{valor}</p>
    </div>
  )

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <Badge className={CHAMADA_TEMPERATURA_BADGE[resumo.temperatura]}>{CHAMADA_TEMPERATURA_LABEL[resumo.temperatura]}</Badge>
        {resumo.geradoEm && (
          <span className="text-xs text-slate-400">
            Gerado em {format(resumo.geradoEm.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500">{resumo.temperaturaJustificativa}</p>

      {campo('Dores do cliente', resumo.dores)}
      {campo('Situação atual', resumo.situacaoAtual)}
      {campo('Objeções', resumo.objecoes)}
      {campo('Plano ou valor discutido', resumo.planoOuValor)}
      {campo('Próximos passos', resumo.proximosPassos + (resumo.proximoPassoData ? ` (${resumo.proximoPassoData})` : ''))}

      <div className="rounded-lg bg-slate-50 p-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500">Mensagem de follow-up</span>
          <Button size="sm" variant="secondary" icon={<Copy size={13} />} onClick={copiarFollowUp}>
            Copiar mensagem
          </Button>
        </div>
        <p className="whitespace-pre-wrap text-sm text-slate-700">{resumo.followUpMensagem}</p>
      </div>
    </div>
  )
}

function ChamadaRow({ chamada, onClick }: { chamada: Chamada; onClick: () => void }) {
  const start = chamada.iniciadaEm?.toDate()
  const isAtiva = chamada.status === 'ativa'
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2.5 text-left hover:bg-slate-50"
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            isAtiva ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {isAtiva ? <Radio size={14} className="animate-pulse" /> : <Mic size={14} />}
        </span>
        <div>
          <p className="text-sm font-medium text-slate-800">
            {start ? format(start, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : 'Data desconhecida'}
          </p>
          <p className="text-xs text-slate-400">{chamadaDuration(chamada)}</p>
        </div>
      </div>
      {chamada.resumo ? (
        <Badge className={CHAMADA_TEMPERATURA_BADGE[chamada.resumo.temperatura]}>
          {CHAMADA_TEMPERATURA_LABEL[chamada.resumo.temperatura]}
        </Badge>
      ) : (
        <Badge className={isAtiva ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}>
          {isAtiva ? 'Em andamento' : 'Sem resumo'}
        </Badge>
      )}
    </button>
  )
}

/** Aba "Chamadas" do LeadDrawer — histórico de chamadas transcritas pelo
 *  Copiloto de Vendas (ver CopilotoPage/useCopiloto). Visível só para quem
 *  tem acesso ao Copiloto (admin/manager — checado pelo chamador). Quando o
 *  Copiloto encerra uma chamada, o toast de lá linka pra `/leads?lead=
 *  {id}&chamada={id}`, que o LeadsPage resolve em `initialChamadaId` e passa
 *  pra esta aba já aberta na chamada certa. */
export function LeadChamadasTab({ lead, initialChamadaId }: { lead: Lead; initialChamadaId?: string | null }) {
  const { profile } = useAuth()
  const { data: chamadas, loading } = useChamadas(lead.id)
  const [selectedId, setSelectedId] = useState<string | null>(initialChamadaId ?? null)
  const [gerando, setGerando] = useState(false)
  const [resumoRascunho, setResumoRascunho] = useState<Omit<ResumoChamada, 'geradoEm'> | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (initialChamadaId) setSelectedId(initialChamadaId)
  }, [initialChamadaId])

  const selected = chamadas.find((c) => c.id === selectedId) ?? null

  const handleCopy = async (chamada: Chamada) => {
    try {
      await navigator.clipboard.writeText(transcricaoTexto(chamada))
      toast.success('Transcrição copiada')
    } catch (err) {
      console.error(err)
      toast.error('Não foi possível copiar a transcrição')
    }
  }

  const handleGerarResumo = async (chamada: Chamada) => {
    setGerando(true)
    try {
      const r = await gerarResumoChamada(lead.id, chamada.blocos, chamada.sugestoes ?? [])
      setResumoRascunho(r)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Falha ao gerar o resumo')
    } finally {
      setGerando(false)
    }
  }

  const handleSalvarResumo = async (chamada: Chamada) => {
    if (!resumoRascunho || !profile) return
    setSalvando(true)
    try {
      await salvarResumo(lead.id, chamada.id, resumoRascunho, profile.id)
      await updateLead(lead.id, buildLeadUpdateFromResumo(resumoRascunho), profile.id, profile.name)
      toast.success('Resumo salvo no lead')
      setResumoRascunho(null)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar o resumo')
    } finally {
      setSalvando(false)
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Carregando chamadas…</p>

  if (selected) {
    const start = selected.iniciadaEm?.toDate()
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => {
              setSelectedId(null)
              setResumoRascunho(null)
            }}
            className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            <ChevronLeft size={15} /> Voltar para chamadas
          </button>
          <Button size="sm" variant="secondary" icon={<Copy size={13} />} onClick={() => handleCopy(selected)}>
            Copiar transcrição
          </Button>
        </div>

        <p className="text-sm font-medium text-slate-700">
          {start ? format(start, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : 'Data desconhecida'} · {chamadaDuration(selected)}
        </p>

        {/* Resumo — salvo (leitura), rascunho recém-gerado (edição) ou botão pra gerar */}
        {selected.resumo ? (
          <ResumoDisplay resumo={selected.resumo} />
        ) : resumoRascunho ? (
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Revise antes de salvar</p>
            <ResumoReview resumo={resumoRascunho} onChange={setResumoRascunho} onSalvar={() => handleSalvarResumo(selected)} salvando={salvando} />
          </div>
        ) : selected.status === 'encerrada' ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 p-5 text-center">
            <p className="text-sm text-slate-400">Esta chamada terminou sem gerar um resumo.</p>
            <Button size="sm" icon={<Sparkles size={13} />} onClick={() => handleGerarResumo(selected)} loading={gerando}>
              Gerar resumo agora
            </Button>
          </div>
        ) : null}

        {/* Sugestões da chamada */}
        {selected.sugestoes && selected.sugestoes.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Sugestões durante a chamada</p>
            <div className="flex flex-col gap-2">
              {selected.sugestoes.map((s) => (
                <SugestaoCard key={s.id} tipo={s.tipo} resumo={s.resumo} frases={s.frases} pergunta={s.pergunta} />
              ))}
            </div>
          </div>
        )}

        {/* Transcrição completa, recolhível */}
        <details className="rounded-xl border border-slate-100 p-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-400">
            Transcrição completa ({selected.blocos.length} bloco{selected.blocos.length !== 1 ? 's' : ''})
          </summary>
          {selected.blocos.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">Nenhuma fala transcrita nesta chamada.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              {selected.blocos.map((b) => (
                <BlocoRow key={b.id} bloco={b} />
              ))}
            </div>
          )}
        </details>
      </div>
    )
  }

  if (chamadas.length === 0) {
    return (
      <EmptyState
        title="Nenhuma chamada registrada ainda"
        description='Use "Abrir Copiloto de Vendas" no topo da ficha para transcrever a próxima ligação com este lead.'
      />
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {chamadas.map((chamada) => (
        <ChamadaRow key={chamada.id} chamada={chamada} onClick={() => setSelectedId(chamada.id)} />
      ))}
    </div>
  )
}
