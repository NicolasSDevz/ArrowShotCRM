import { useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { UploadCloud, FileDown, TriangleAlert, ArrowLeft } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Select } from '../ui/Field'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { importLeads } from '../../services/leadService'
import { findUserIdByName } from '../../utils/userLookup'
import { LEAD_SOURCE_LABEL } from '../../types'
import {
  readLeadCsv,
  guessColumnMapping,
  mapRowsToLeads,
  mapRowToLead,
  downloadLeadImportTemplate,
  LEAD_IMPORT_FIELDS,
  type ColumnMapping,
  type LeadFieldKey,
  type ParsedLeadRow,
} from '../../utils/leadImport'

type Stage = 'select' | 'map'

function pluralize(n: number, singular: string, plural: string) {
  return n === 1 ? singular : plural
}

function serviceLabel(services: ParsedLeadRow['services']): string {
  const parts: string[] = []
  if (services.paidTraffic) parts.push('Tráfego Pago')
  if (services.socialMedia) parts.push('Social Mídia')
  return parts.join(' + ') || '—'
}

export function ImportLeadsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [stage, setStage] = useState<Stage>('select')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [showPreview, setShowPreview] = useState(false)
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setDragOver(false)
    setFile(null)
    setStage('select')
    setHeaders([])
    setRows([])
    setMapping({})
    setShowPreview(false)
    setBusy(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const pickFile = (f: File | null | undefined) => {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.csv')) {
      toast.error('Selecione um arquivo .csv')
      return
    }
    setFile(f)
  }

  const readFile = async () => {
    if (!file) return
    setBusy(true)
    try {
      const text = await file.text()
      const { headers: hdrs, rows: dataRows } = readLeadCsv(text)
      if (hdrs.length === 0 || dataRows.length === 0) {
        toast.error('O arquivo está vazio ou não contém linhas de dados.')
        return
      }
      setHeaders(hdrs)
      setRows(dataRows)
      setMapping(guessColumnMapping(hdrs))
      setShowPreview(false)
      setStage('map')
    } catch (err) {
      console.error(err)
      toast.error('Não foi possível ler o arquivo CSV.')
    } finally {
      setBusy(false)
    }
  }

  const setFieldColumn = (key: LeadFieldKey, value: string) => {
    setShowPreview(false)
    setMapping((m) => {
      const next = { ...m }
      if (value === '') delete next[key]
      else next[key] = Number(value)
      return next
    })
  }

  const nameMapped = mapping.contactName != null

  const preview = useMemo(
    () => rows.slice(0, 3).map((cols, idx) => mapRowToLead(cols, mapping, idx + 2)),
    [rows, mapping]
  )

  const { valid, errors } = useMemo(() => mapRowsToLeads(rows, mapping), [rows, mapping])

  const runImport = async () => {
    if (!profile || !nameMapped) return
    setBusy(true)
    try {
      const assignedTo = findUserIdByName(users, 'Bruno')
      const { created, failedLines } = await importLeads(valid, assignedTo, profile.id, profile.name)

      if (created > 0) {
        toast.success(`${created} ${pluralize(created, 'lead importado', 'leads importados')} com sucesso`)
      } else {
        toast.error('Nenhum lead foi importado.')
      }
      const problemLines = [...errors.map((e) => e.line), ...failedLines].sort((a, b) => a - b)
      if (created > 0 && problemLines.length > 0) {
        toast.error(
          `${problemLines.length} ${pluralize(problemLines.length, 'linha ignorada', 'linhas ignoradas')} por erro: ${problemLines.join(', ')}`
        )
      }
      handleClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Importar Leads via CSV" width={stage === 'map' ? 'max-w-2xl' : 'max-w-xl'}>
      <div className="flex flex-col gap-3">
        {stage === 'select' && (
          <>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                pickFile(e.dataTransfer.files?.[0])
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors duration-150 ease-in-out ${
                dragOver ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
              }`}
            >
              <UploadCloud size={28} className="text-slate-400" />
              {file ? (
                <p className="text-sm font-medium text-slate-700">{file.name}</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-600">Arraste o arquivo aqui ou clique para selecionar</p>
                  <p className="text-xs text-slate-400">Apenas arquivos .csv</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  pickFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </div>

            <p className="text-xs text-slate-400">
              O arquivo pode ter qualquer cabeçalho — na próxima etapa você escolhe qual coluna corresponde a cada campo.
              Só o <strong>Nome</strong> é obrigatório.
            </p>

            <Button
              variant="secondary"
              size="sm"
              icon={<FileDown size={13} />}
              onClick={downloadLeadImportTemplate}
              className="self-start"
            >
              Baixar modelo CSV
            </Button>

            <div className="mt-2 flex justify-end gap-2">
              <Button variant="secondary" onClick={handleClose} disabled={busy}>
                Cancelar
              </Button>
              <Button onClick={readFile} loading={busy} disabled={!file}>
                Continuar
              </Button>
            </div>
          </>
        )}

        {stage === 'map' && (
          <>
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {headers.length} {pluralize(headers.length, 'coluna encontrada', 'colunas encontradas')} no arquivo •{' '}
              {rows.length} {pluralize(rows.length, 'linha de dados', 'linhas de dados')}
            </div>

            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <span>Coluna do seu arquivo</span>
                <span />
                <span>Campo na plataforma</span>
              </div>
              {LEAD_IMPORT_FIELDS.map((f) => (
                <div key={f.key} className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
                  <div>
                    <Select value={mapping[f.key] ?? ''} onChange={(e) => setFieldColumn(f.key, e.target.value)}>
                      <option value="">Ignorar este campo</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Coluna ${i + 1}`}
                        </option>
                      ))}
                    </Select>
                    {f.hint && <p className="mt-1 px-0.5 text-[11px] text-slate-400">{f.hint}</p>}
                  </div>
                  <span className="pt-2 text-slate-300">→</span>
                  <div className="pt-2">
                    <span className="text-sm font-medium text-slate-700">{f.label}</span>
                    {f.required && <span className="ml-1 text-xs text-red-500">*</span>}
                  </div>
                </div>
              ))}
            </div>

            {!nameMapped && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                <span>Escolha qual coluna corresponde ao campo <strong>Nome</strong> para continuar.</span>
              </div>
            )}

            {showPreview && nameMapped && (
              <div className="flex flex-col gap-2 rounded-lg border border-slate-100 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Pré-visualização — {Math.min(3, rows.length)} de {rows.length}{' '}
                  {pluralize(rows.length, 'linha', 'linhas')}
                </p>
                {preview.map(({ lead, error }, i) =>
                  lead ? (
                    <div key={i} className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <p className="text-sm font-semibold text-slate-800">
                        {lead.contactName}
                        {lead.companyName ? <span className="font-normal text-slate-400"> — {lead.companyName}</span> : null}
                      </p>
                      <p className="mt-0.5">
                        {[
                          lead.whatsapp,
                          lead.email,
                          lead.cityRegion,
                          serviceLabel(lead.services) !== '—' ? serviceLabel(lead.services) : null,
                          LEAD_SOURCE_LABEL[lead.source],
                          lead.estimatedValue != null
                            ? lead.estimatedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' • ')}
                      </p>
                      {lead.notes && <p className="mt-0.5 text-slate-400">{lead.notes}</p>}
                    </div>
                  ) : (
                    <div key={i} className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
                      <strong>Linha {error?.line}:</strong> {error?.message}
                    </div>
                  )
                )}
                <p className="text-xs text-slate-400">
                  {valid.length} {pluralize(valid.length, 'linha será importada', 'linhas serão importadas')}
                  {errors.length > 0
                    ? ` • ${errors.length} ${pluralize(errors.length, 'linha com erro será ignorada', 'linhas com erro serão ignoradas')}`
                    : ''}
                  .
                </p>
              </div>
            )}

            <div className="mt-2 flex items-center justify-between gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<ArrowLeft size={13} />}
                onClick={() => setStage('select')}
                disabled={busy}
              >
                Voltar
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setShowPreview(true)}
                  disabled={busy || !nameMapped}
                >
                  Pré-visualizar
                </Button>
                <Button onClick={runImport} loading={busy} disabled={!nameMapped || valid.length === 0}>
                  Confirmar importação{valid.length > 0 ? ` (${valid.length})` : ''}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
