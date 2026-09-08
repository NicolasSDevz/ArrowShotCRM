import { useRef, useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { UploadCloud, FileDown, TriangleAlert } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { useUsers } from '../../hooks/useUsers'
import { createContent } from '../../services/contentService'
import { notifyAdminsOfAction } from '../../services/notificationService'
import { getClientName } from '../../services/clientLookup'
import {
  parseEditorialCalendarCsv,
  downloadEditorialCalendarTemplate,
  type EditorialCalendarRow,
  type EditorialCalendarRowError,
} from '../../utils/editorialCalendarImport'
import { CONTENT_PILLAR_LABEL } from '../../types/content'

type Stage = 'select' | 'reviewErrors'

function pluralize(n: number, singular: string, plural: string) {
  return n === 1 ? singular : plural
}

export function ImportEditorialCalendarModal({
  open,
  onClose,
  clientId,
}: {
  open: boolean
  onClose: () => void
  clientId: string
}) {
  const { profile } = useAuth()
  const { data: users } = useUsers()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [stage, setStage] = useState<Stage>('select')
  const [valid, setValid] = useState<EditorialCalendarRow[]>([])
  const [errors, setErrors] = useState<EditorialCalendarRowError[]>([])
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

  const resolveAssignee = (raw: string): string | undefined => {
    if (!raw) return undefined
    const needle = raw.trim().toLowerCase()
    const exact = users.find((u) => u.name.trim().toLowerCase() === needle)
    if (exact) return exact.id
    const partial = users.find((u) => u.name.trim().toLowerCase().includes(needle))
    return partial?.id
  }

  const runImport = async (rows: EditorialCalendarRow[]) => {
    if (!profile) return
    let created = 0
    for (const row of rows) {
      try {
        await createContent(
          {
            clientId,
            title: row.title,
            type: row.type,
            platform: 'instagram',
            pillar: row.pillar,
            scheduledDate: Timestamp.fromDate(row.scheduledDate),
            assignedTo: resolveAssignee(row.responsavelRaw),
            caption: row.caption,
            notes: row.notes,
            status: 'ideas',
            order: Date.now() + created,
            hashtags: [],
          },
          profile.id,
          profile.name,
          { skipAdminCc: true }
        )
        created++
      } catch (err) {
        console.error('Falha ao importar linha do calendário editorial', row.line, err)
      }
    }
    if (created > 0) {
      const clientName = await getClientName(clientId)
      await notifyAdminsOfAction({
        type: 'content_imported',
        message: `${profile.name} importou ${created} ${pluralize(created, 'conteúdo', 'conteúdos')} do calendário editorial${clientName ? ` — ${clientName}` : ''}`,
        actorId: profile.id,
        actorName: profile.name,
        entityType: 'content',
      })
    }
    const skipped = errors.length + (rows.length - created)
    toast.success(
      `${created} ${pluralize(created, 'card criado', 'cards criados')} com sucesso. ${skipped} ${pluralize(skipped, 'linha ignorada', 'linhas ignoradas')} por erro.`
    )
    handleClose()
  }

  const handlePrimaryAction = async () => {
    if (stage === 'select') {
      if (!file) return
      setBusy(true)
      try {
        const text = await file.text()
        const { valid: validRows, errors: rowErrors } = parseEditorialCalendarCsv(text)
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
    <Modal open={open} onClose={handleClose} title="Importar Calendário Editorial" width="max-w-xl">
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
              O arquivo CSV deve conter as colunas: data, titulo, formato, pilar, responsavel, legenda, observacoes
            </p>
            <p className="text-xs text-slate-400">
              Pilares aceitos: {Object.values(CONTENT_PILLAR_LABEL).join(', ')}.
            </p>

            <Button
              variant="secondary"
              size="sm"
              icon={<FileDown size={13} />}
              onClick={downloadEditorialCalendarTemplate}
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
                {errors.length} {pluralize(errors.length, 'linha com erro', 'linhas com erro')} de {valid.length + errors.length} no
                total. {valid.length} {pluralize(valid.length, 'linha válida será importada', 'linhas válidas serão importadas')}.
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
