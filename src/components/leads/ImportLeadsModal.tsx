import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { UploadCloud, FileDown, TriangleAlert } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { importLeads } from '../../services/leadService'
import { findUserIdByName } from '../../utils/userLookup'
import {
  parseLeadImportCsv,
  downloadLeadImportTemplate,
  type ParsedLeadRow,
  type LeadImportRowError,
} from '../../utils/leadImport'

type Stage = 'select' | 'reviewErrors'

function pluralize(n: number, singular: string, plural: string) {
  return n === 1 ? singular : plural
}

export function ImportLeadsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [stage, setStage] = useState<Stage>('select')
  const [valid, setValid] = useState<ParsedLeadRow[]>([])
  const [errors, setErrors] = useState<LeadImportRowError[]>([])
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setDragOver(false)
    setFile(null)
    setStage('select')
    setValid([])
    setErrors([])
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

  const runImport = async (rows: ParsedLeadRow[]) => {
    if (!profile) return
    const assignedTo = findUserIdByName(users, 'Bruno')
    const { created, failedLines } = await importLeads(rows, assignedTo, profile.id, profile.name)

    if (created > 0) {
      toast.success(`${created} ${pluralize(created, 'lead importado', 'leads importados')} com sucesso`)
    }
    const problemLines = [...errors.map((e) => e.line), ...failedLines].sort((a, b) => a - b)
    if (created === 0) {
      toast.error('Nenhum lead foi importado.')
    } else if (problemLines.length > 0) {
      toast.error(
        `${problemLines.length} ${pluralize(problemLines.length, 'linha com problema', 'linhas com problema')}: ${problemLines.join(', ')}`
      )
    }
    handleClose()
  }

  const handlePrimaryAction = async () => {
    if (stage === 'select') {
      if (!file) return
      setBusy(true)
      try {
        const text = await file.text()
        const { valid: validRows, errors: rowErrors } = parseLeadImportCsv(text)
        if (validRows.length === 0 && rowErrors.length === 0) {
          toast.error('O arquivo está vazio ou não contém linhas de dados.')
          return
        }
        setValid(validRows)
        setErrors(rowErrors)
        if (rowErrors.length > 0) {
          setStage('reviewErrors')
        } else {
          await runImport(validRows)
        }
      } catch (err) {
        console.error(err)
        toast.error('Não foi possível ler o arquivo CSV.')
      } finally {
        setBusy(false)
      }
      return
    }

    setBusy(true)
    try {
      await runImport(valid)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Importar Leads via CSV" width="max-w-xl">
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
              Colunas: nome (obrigatório), empresa, whatsapp, email, cidade, servico_interesse, plataforma, origem,
              valor_estimado, observacoes. Os leads entram na coluna "Novo Lead" com o Bruno como responsável.
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
          </>
        )}

        {stage === 'reviewErrors' && (
          <>
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              <span>
                {errors.length} {pluralize(errors.length, 'linha com erro', 'linhas com erro')} de {valid.length + errors.length}{' '}
                no total. {valid.length} {pluralize(valid.length, 'linha válida será importada', 'linhas válidas serão importadas')}.
              </span>
            </div>
            <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-100">
              <ul className="divide-y divide-slate-100">
                {errors.map((e) => (
                  <li key={e.line} className="px-3 py-1.5 text-xs text-slate-600">
                    <strong className="text-slate-700">Linha {e.line}:</strong> {e.message}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-slate-400">
              Deseja continuar e importar apenas as linhas válidas, ignorando as linhas com erro?
            </p>
          </>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handlePrimaryAction} loading={busy} disabled={stage === 'select' && !file}>
            {stage === 'select' ? 'Importar' : `Importar mesmo assim (${valid.length})`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
