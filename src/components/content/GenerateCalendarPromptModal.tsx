import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Copy, Check, Sparkles } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Field, Input, Select, Textarea } from '../ui/Field'
import { Button } from '../ui/Button'
import { useClients } from '../../hooks/useClients'
import {
  CLIENT_PACKAGE_LABEL,
  STYLE_CATALOG_LABEL,
  type ClientPackage,
  type StyleCatalog,
} from '../../types/client'

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const RESPONSAVEIS = ['Nicolas', 'Ciane']

function buildPrompt(opts: {
  mes: string
  ano: number
  segmento: string
  pacote: ClientPackage
  catalogo: StyleCatalog
  responsavel: string
}): string {
  const pacoteWord = opts.pacote === 'weekly' ? 'Semanal' : 'Mensal'
  const distribuicao =
    opts.pacote === 'weekly'
      ? `- 5 posts por semana (segunda a sexta)
- 2 reels por semana (terça e quinta)
- 3 stories por semana (segunda, quarta e sexta)
- Total do mês: aproximadamente 20 posts, 8 reels e 12 stories`
      : `- 3 posts por semana (segunda, quarta e sexta)
- 1 reel por semana (quarta-feira)
- 2 stories por semana (terça e quinta)
- Total do mês: aproximadamente 12 posts, 4 reels e 8 stories`

  return `Crie um calendário editorial de Social Mídia para o mês de ${opts.mes} de ${opts.ano} para um cliente do segmento de ${opts.segmento || '[segmento]'}, no pacote ${pacoteWord}.

Catálogo de estilo: ${STYLE_CATALOG_LABEL[opts.catalogo]}

Gere em formato CSV com as seguintes colunas (exatamente nessa ordem e com esses nomes):
data, titulo, formato, pilar, responsavel, legenda, observacoes

Regras:
- data: formato YYYY-MM-DD
- formato: apenas Post, Reel ou Stories
- pilar: apenas um destes valores exatos: Dor/Solução, Autoridade, Prova Social, Bastidores, Educativo, Engajamento, Institucional, Antes e Depois, Diferenciais, Comercial, CTA
- responsavel: ${opts.responsavel}
- legenda: escrever a legenda completa do post com CTA no final
- observacoes: dicas de produção para o designer (opcional)

Distribuição do conteúdo:
${distribuicao}

Retorne APENAS o CSV, sem explicações, sem texto antes ou depois, sem blocos de código, sem aspas no início ou fim. Apenas as linhas do CSV começando pelo cabeçalho.`
}

export function GenerateCalendarPromptModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: clients } = useClients()
  const now = new Date()

  const [clientId, setClientId] = useState('')
  const [mes, setMes] = useState(MONTHS[now.getMonth()])
  const [ano, setAno] = useState(now.getFullYear())
  const [pacote, setPacote] = useState<ClientPackage>('weekly')
  const [catalogo, setCatalogo] = useState<StyleCatalog>(1)
  const [segmento, setSegmento] = useState('')
  const [responsavel, setResponsavel] = useState(RESPONSAVEIS[0])
  const [prompt, setPrompt] = useState('')
  const [copied, setCopied] = useState(false)

  const eligibleClients = useMemo(
    () =>
      clients
        .filter((c) => c.status === 'active' && c.modules?.socialMedia)
        .sort((a, b) => a.companyName.localeCompare(b.companyName)),
    [clients]
  )

  const handleClientChange = (id: string) => {
    setClientId(id)
    const c = clients.find((x) => x.id === id)
    if (c) {
      setSegmento(c.segment ?? '')
      if (c.package) setPacote(c.package)
      if (c.styleCatalog) setCatalogo(c.styleCatalog)
    }
  }

  const handleGenerate = () => {
    setPrompt(buildPrompt({ mes, ano, segmento, pacote, catalogo, responsavel }))
    setCopied(false)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Não foi possível copiar — selecione o texto e copie manualmente.')
    }
  }

  const close = () => {
    setPrompt('')
    setCopied(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={close} title="Gerar Calendário Editorial" width="max-w-2xl">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Cliente">
            <Select value={clientId} onChange={(e) => handleClientChange(e.target.value)}>
              <option value="">Selecione...</option>
              {eligibleClients.map((c) => (
                <option key={c.id} value={c.id}>{c.companyName}</option>
              ))}
            </Select>
          </Field>
          <Field label="Responsável pela produção">
            <Select value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
              {RESPONSAVEIS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <Field label="Mês">
            <Select value={mes} onChange={(e) => setMes(e.target.value)}>
              {MONTHS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </Field>
          <Field label="Ano">
            <Input
              type="number"
              min="2024"
              max="2100"
              value={ano}
              onChange={(e) => setAno(Number(e.target.value) || now.getFullYear())}
            />
          </Field>
          <Field label="Pacote">
            <Select value={pacote} onChange={(e) => setPacote(e.target.value as ClientPackage)}>
              {(Object.entries(CLIENT_PACKAGE_LABEL) as [ClientPackage, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="Catálogo">
            <Select value={catalogo} onChange={(e) => setCatalogo(Number(e.target.value) as StyleCatalog)}>
              {(Object.entries(STYLE_CATALOG_LABEL) as unknown as [string, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Segmento do cliente">
              <Input value={segmento} onChange={(e) => setSegmento(e.target.value)} placeholder="Ex: Limpeza pós-obra" />
            </Field>
          </div>
        </div>

        <Button icon={<Sparkles size={14} />} onClick={handleGenerate} className="self-start">
          Gerar prompt
        </Button>

        {prompt && (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={handleCopy}
                className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                {copied ? (
                  <>
                    <Check size={12} /> Copiado!
                  </>
                ) : (
                  <>
                    <Copy size={12} /> Copiar prompt
                  </>
                )}
              </button>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-[300px] font-mono text-[13px] leading-relaxed"
                style={{ minHeight: 300 }}
              />
            </div>
            <p className="text-xs text-slate-400">
              Cole esse prompt no Claude para gerar o CSV. Depois importe o arquivo gerado usando o botão Importar
              calendário.
            </p>
          </div>
        )}

        <div className="flex justify-end border-t border-slate-100 pt-3">
          <Button variant="secondary" onClick={close}>
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
