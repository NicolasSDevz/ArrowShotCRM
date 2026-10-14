import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { ChevronLeft, Copy, Mic, Radio } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { EmptyState } from '../ui/EmptyState'
import { Button } from '../ui/Button'
import { useChamadas } from '../../hooks/useChamadas'
import type { Chamada, BlocoTranscricao } from '../../types/chamada'
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

function transcricaoTexto(chamada: Chamada): string {
  const inicio = chamada.iniciadaEm?.toMillis() ?? 0
  return chamada.blocos
    .map((b) => `[${formatBlocoTime(b.timestampMs)}] ${b.speaker}: ${b.texto}`)
    .join('\n')
    .trim() || `(chamada sem falas transcritas — iniciada em ${format(new Date(inicio), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })})`
}

function formatBlocoTime(ms: number): string {
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
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
          <p className="text-xs text-slate-400">
            {chamadaDuration(chamada)} · {chamada.blocos.length} bloco{chamada.blocos.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      <Badge className={isAtiva ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}>
        {isAtiva ? 'Em andamento' : 'Finalizada'}
      </Badge>
    </button>
  )
}

/** Aba "Chamadas" do LeadDrawer — histórico de chamadas transcritas pelo
 *  Copiloto de Vendas (ver CopilotoPage/useCopiloto). Visível só para quem
 *  tem acesso ao Copiloto (admin/manager — checado pelo chamador). Quando o
 *  Copiloto encerra uma chamada, o toast de lá linka pra `/leads?lead=
 *  {id}&chamada={id}`, que o LeadsPage resolve em `initialChamadaId` e passa
 *  pra esta aba já aberta na transcrição certa. */
export function LeadChamadasTab({ lead, initialChamadaId }: { lead: Lead; initialChamadaId?: string | null }) {
  const { data: chamadas, loading } = useChamadas(lead.id)
  const [selectedId, setSelectedId] = useState<string | null>(initialChamadaId ?? null)

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

  if (loading) return <p className="text-sm text-slate-400">Carregando chamadas…</p>

  if (selected) {
    const start = selected.iniciadaEm?.toDate()
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setSelectedId(null)}
            className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            <ChevronLeft size={15} /> Voltar para chamadas
          </button>
          <Button size="sm" variant="secondary" icon={<Copy size={13} />} onClick={() => handleCopy(selected)}>
            Copiar transcrição
          </Button>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-sm font-medium text-slate-700">
            {start ? format(start, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : 'Data desconhecida'} · {chamadaDuration(selected)}
          </p>
          <Badge className={selected.status === 'ativa' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}>
            {selected.status === 'ativa' ? 'Em andamento' : 'Finalizada'}
          </Badge>
        </div>

        {selected.blocos.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Nenhuma fala transcrita nesta chamada.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {selected.blocos.map((b) => (
              <BlocoRow key={b.id} bloco={b} />
            ))}
          </div>
        )}
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
