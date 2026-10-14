import { useCallback, useEffect, useRef, useState } from 'react'
import { streamSugestao } from '../services/copilotoSugestaoService'
import { salvarSugestoes } from '../services/chamadaService'
import { shouldTriggerSuggestion } from '../utils/copilotoTriggers'
import type { BlocoTranscricao, Sugestao, SugestaoTipo } from '../types/chamada'

const JANELA_RECENTE_MS = 3 * 60_000
const COOLDOWN_AUTO_MS = 20_000
const MAX_BLOCOS_RESUMO = 20

const TIPO_LABEL_TO_KEY: Record<string, SugestaoTipo> = {
  objeção: 'objecao',
  objecao: 'objecao',
  dúvida: 'duvida',
  duvida: 'duvida',
  'sinal de compra': 'sinal_compra',
  geral: 'geral',
}

export interface SugestaoParcial {
  tipo: SugestaoTipo
  resumo: string
  frases: string[]
}

/** Parser tolerante a texto incompleto (chega em pedaços durante o stream) —
 *  formato esperado em SUGESTAO_FORMAT_INSTRUCTIONS (api/_lib/copilotoSugestao.js). */
export function parseSugestaoRaw(raw: string): SugestaoParcial {
  const tipoMatch = raw.match(/TIPO:\s*(.+)/i)
  const resumoMatch = raw.match(/RESUMO:\s*(.+)/i)
  const frases = [...raw.matchAll(/FRASE:\s*(.+)/gi)].map((m) => m[1].trim()).filter(Boolean)
  const tipoRaw = (tipoMatch?.[1] ?? '').trim().toLowerCase()
  return {
    tipo: TIPO_LABEL_TO_KEY[tipoRaw] ?? 'geral',
    resumo: (resumoMatch?.[1] ?? '').trim(),
    frases,
  }
}

function blocosParaTexto(blocos: BlocoTranscricao[]): string {
  return blocos.map((b) => `${b.speaker}: ${b.texto}`).join('\n')
}

/** Monta transcrição recente (~3min) + resumo do que ficou de fora, a
 *  partir dos blocos já carregados em memória (useCopiloto) — sem round-
 *  trip extra de IA só pra resumir (ver comentário no pedido original). */
function montarContexto(blocos: BlocoTranscricao[]) {
  if (blocos.length === 0) return { transcricaoRecente: '', resumoAnterior: '' }
  const agora = blocos[blocos.length - 1].timestampMs
  const corte = agora - JANELA_RECENTE_MS
  const recentes = blocos.filter((b) => b.timestampMs >= corte)
  const antigos = blocos.filter((b) => b.timestampMs < corte).slice(-MAX_BLOCOS_RESUMO)
  return {
    transcricaoRecente: blocosParaTexto(recentes),
    resumoAnterior: antigos.length > 0 ? blocosParaTexto(antigos) : '',
  }
}

export function useCopilotoSugestoes(leadId: string, chamadaId: string | null, blocos: BlocoTranscricao[], userId: string | undefined) {
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([])
  const [streaming, setStreaming] = useState<SugestaoParcial | null>(null)
  const [generating, setGenerating] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const sugestoesRef = useRef<Sugestao[]>([])
  const generatingRef = useRef(false)
  const lastAutoAtRef = useRef(0)
  const lastSeenBlocoIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    sugestoesRef.current = sugestoes
  }, [sugestoes])

  const gerar = useCallback(
    async (pergunta: string | undefined, origem: 'auto' | 'manual') => {
      if (generatingRef.current || !chamadaId || !userId) return
      generatingRef.current = true
      setGenerating(true)
      setErro(null)
      setStreaming({ tipo: 'geral', resumo: '', frases: [] })

      const { transcricaoRecente, resumoAnterior } = montarContexto(blocos)
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const raw = await streamSugestao(
          { leadId, pergunta, transcricaoRecente, resumoAnterior },
          (textoAteAgora) => setStreaming(parseSugestaoRaw(textoAteAgora)),
          controller.signal
        )
        const parsed = parseSugestaoRaw(raw)
        const sugestao: Sugestao = {
          id: crypto.randomUUID(),
          tipo: parsed.tipo,
          resumo: parsed.resumo || '(sem resumo)',
          frases: parsed.frases.length > 0 ? parsed.frases : ['(sem frase sugerida)'],
          timestampMs: blocos.length > 0 ? blocos[blocos.length - 1].timestampMs : Date.now(),
          origem,
          pergunta,
        }
        const next = [...sugestoesRef.current, sugestao]
        setSugestoes(next)
        sugestoesRef.current = next
        salvarSugestoes(leadId, chamadaId, next, userId).catch((err) => console.warn('[copiloto] falha ao salvar sugestão', err))
      } catch (err) {
        console.error('[copiloto] falha ao gerar sugestão', err)
        setErro('Sugestões pausadas — a transcrição continua normal.')
      } finally {
        setStreaming(null)
        setGenerating(false)
        generatingRef.current = false
        abortRef.current = null
      }
    },
    [blocos, chamadaId, leadId, userId]
  )

  // Disparo automático: todo novo bloco do Cliente passa pelo detector de
  // palavra-chave, respeitando o cooldown de 20s (só pra disparo automático).
  useEffect(() => {
    const ultimo = blocos[blocos.length - 1]
    if (!ultimo || ultimo.id === lastSeenBlocoIdRef.current) return
    lastSeenBlocoIdRef.current = ultimo.id

    if (ultimo.speaker !== 'Cliente') return
    if (!shouldTriggerSuggestion(ultimo.texto)) return
    if (Date.now() - lastAutoAtRef.current < COOLDOWN_AUTO_MS) return
    if (generatingRef.current) return

    lastAutoAtRef.current = Date.now()
    void gerar(undefined, 'auto')
  }, [blocos, gerar])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const pedirAjuda = useCallback(
    (pergunta?: string) => {
      void gerar(pergunta?.trim() || undefined, 'manual')
    },
    [gerar]
  )

  return { sugestoes, streaming, generating, erro, pedirAjuda }
}
