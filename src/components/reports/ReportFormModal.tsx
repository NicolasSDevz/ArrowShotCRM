import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Timestamp } from 'firebase/firestore'
import { format, subDays, startOfMonth } from 'date-fns'
import toast from 'react-hot-toast'
import { Copy, Save, Loader2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Field, Input, Select } from '../ui/Field'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { useClients } from '../../hooks/useClients'
import { createReport } from '../../services/reportService'
import { fetchMetaReportSnapshot } from '../../utils/metaReportData'
import { buildWeeklyReportText } from '../../utils/metaWeeklyReportText'
import type { ReportMetaSnapshot, ReportPlatform, ReportType } from '../../types'

function toDateStr(d: Date) {
  return format(d, 'yyyy-MM-dd')
}

export function ReportFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  // Todos os clientes cadastrados — sem filtrar por status nem por já ter o
  // ID da conta Meta Ads preenchido (essa checagem acontece só ao clicar em
  // "Buscar dados", com um aviso específico — ver handleGenerate).
  const { data: clients } = useClients()

  const [clientId, setClientId] = useState('')
  const [type, setType] = useState<ReportType>('weekly')
  const [platforms, setPlatforms] = useState<ReportPlatform[]>(['meta'])
  const [startStr, setStartStr] = useState(toDateStr(subDays(new Date(), 7)))
  const [endStr, setEndStr] = useState(toDateStr(new Date()))
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [metaSnapshot, setMetaSnapshot] = useState<ReportMetaSnapshot | null>(null)
  const [weeklyText, setWeeklyText] = useState('')
  const [generated, setGenerated] = useState(false)

  const client = clients.find((c) => c.id === clientId)

  const reset = () => {
    setClientId('')
    setType('weekly')
    setPlatforms(['meta'])
    setStartStr(toDateStr(type === 'weekly' ? subDays(new Date(), 7) : startOfMonth(new Date())))
    setEndStr(toDateStr(new Date()))
    setMetaSnapshot(null)
    setWeeklyText('')
    setGenerated(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const togglePlatform = (p: ReportPlatform) =>
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))

  const handleGenerate = async () => {
    if (!client) {
      toast.error('Selecione um cliente')
      return
    }
    if (platforms.length === 0) {
      toast.error('Selecione ao menos uma plataforma')
      return
    }
    const start = new Date(`${startStr}T00:00:00`)
    const end = new Date(`${endStr}T00:00:00`)
    if (start > end) {
      toast.error('A data de início deve ser anterior à data de fim')
      return
    }

    const accountId = client.campaignPlanning?.acessos?.metaAdsAccountId
    if (platforms.includes('meta') && !accountId) {
      toast.error(
        'Este cliente não tem o ID da conta Meta Ads cadastrado. Adicione o ID na aba Planejamento de Campanha → Acessos antes de gerar o relatório.'
      )
      return
    }

    setLoading(true)
    setGenerated(false)
    try {
      let meta: ReportMetaSnapshot | null = null
      if (platforms.includes('meta') && accountId) {
        meta = await fetchMetaReportSnapshot(accountId, start, end)
        setMetaSnapshot(meta)
      }

      if (type === 'weekly') {
        const text = buildWeeklyReportText({
          clientName: client.companyName,
          periodStart: start,
          periodEnd: end,
          meta,
          google: platforms.includes('google') ? { available: false } : null,
        })
        setWeeklyText(text)
      }
      // Mensal: só busca o snapshot — o painel visual é montado em
      // /relatorios/:id depois de salvar.

      setGenerated(true)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Erro ao buscar dados do Meta Ads')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!client || !profile) return
    setSaving(true)
    try {
      const reportId = await createReport(
        {
          clientId: client.id,
          type,
          platforms,
          periodStart: Timestamp.fromDate(new Date(`${startStr}T00:00:00`)),
          periodEnd: Timestamp.fromDate(new Date(`${endStr}T00:00:00`)),
          meta: metaSnapshot ?? undefined,
          google: platforms.includes('google') ? { available: false } : undefined,
          weeklyText: type === 'weekly' ? weeklyText : undefined,
          generatedBy: profile.id,
          generatedByName: profile.name,
        },
        profile.id,
        profile.name
      )
      toast.success('Relatório salvo')
      handleClose()
      if (type === 'monthly') navigate(`/relatorios/${reportId}`)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao salvar relatório')
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(weeklyText)
      toast.success('Texto copiado')
    } catch {
      toast.error('Não foi possível copiar — copie manualmente')
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Novo relatório" width="max-w-2xl">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Cliente" required>
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Selecione...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.companyName}</option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo de relatório">
            <Select value={type} onChange={(e) => setType(e.target.value as ReportType)}>
              <option value="weekly">Semanal (texto para WhatsApp)</option>
              <option value="monthly">Mensal (apresentação completa)</option>
            </Select>
          </Field>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-slate-500">Plataformas</span>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={platforms.includes('meta')}
                onChange={() => togglePlatform('meta')}
                className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
              />
              Meta Ads
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={platforms.includes('google')}
                onChange={() => togglePlatform('google')}
                className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
              />
              Google Ads
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Data início" required>
            <Input type="date" value={startStr} onChange={(e) => setStartStr(e.target.value)} />
          </Field>
          <Field label="Data fim" required>
            <Input type="date" value={endStr} onChange={(e) => setEndStr(e.target.value)} />
          </Field>
        </div>

        <Button
          icon={loading ? <Loader2 size={14} className="animate-spin" /> : undefined}
          onClick={handleGenerate}
          disabled={loading || !clientId}
          className="self-start"
        >
          {loading ? 'Buscando dados do Meta Ads...' : 'Buscar dados e gerar relatório'}
        </Button>

        {generated && type === 'weekly' && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-slate-500">Texto do relatório (editável)</span>
            <textarea
              rows={14}
              value={weeklyText}
              onChange={(e) => setWeeklyText(e.target.value)}
              className="w-full rounded-lg border border-slate-200 p-3 font-mono text-[13px] leading-relaxed text-slate-800 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
            />
            <Button variant="secondary" icon={<Copy size={14} />} onClick={handleCopy} className="self-start">
              Copiar texto
            </Button>
          </div>
        )}

        {generated && type === 'monthly' && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Dados carregados. Clique em "Salvar relatório" para abrir o painel visual.
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>
            Cancelar
          </Button>
          {generated && (
            <Button icon={<Save size={14} />} onClick={handleSave} loading={saving}>
              Salvar relatório
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
