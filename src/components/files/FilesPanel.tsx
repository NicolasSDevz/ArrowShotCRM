import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Upload, FileText, FileSpreadsheet, FileVideo, Trash2, Download, FileType2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useRelatedFiles } from '../../hooks/useFiles'
import { uploadFile, deleteFile } from '../../services/fileService'
import { ACCEPTED_FILE_TYPES, type EntityType, type FileCategory, type FileMeta } from '../../types'
import { Spinner } from '../ui/FullPageSpinner'

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('video/')) return <FileVideo size={20} className="text-brand-400" />
  if (mimeType === 'application/pdf') return <FileType2 size={20} className="text-red-400" />
  if (mimeType.includes('sheet') || mimeType.includes('excel') || mimeType === 'text/csv')
    return <FileSpreadsheet size={20} className="text-emerald-500" />
  return <FileText size={20} className="text-slate-400" />
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FilesPanel({
  clientId,
  category,
  relatedType,
  relatedId,
}: {
  clientId: string
  category: FileCategory
  relatedType: EntityType
  relatedId: string
}) {
  const { profile } = useAuth()
  const { data: files, loading } = useRelatedFiles(relatedType, relatedId)
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState<{ name: string; pct: number }[]>([])

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || !profile) return
    Array.from(fileList).forEach((file) => {
      setUploading((prev) => [...prev, { name: file.name, pct: 0 }])
      const { promise } = uploadFile({
        file,
        clientId,
        category,
        relatedType,
        relatedId,
        uploadedBy: profile.id,
        uploadedByName: profile.name,
        onProgress: (pct) =>
          setUploading((prev) => prev.map((u) => (u.name === file.name ? { ...u, pct } : u))),
      })
      promise
        .catch((err) => {
          console.error('upload failed', err)
          toast.error(
            err?.code === 'storage/unknown' || err?.code === 'storage/unauthorized'
              ? 'Envio de arquivos ainda não está disponível. Fale com o admin sobre ativar o Firebase Storage.'
              : `Erro ao enviar "${file.name}"`
          )
        })
        .finally(() => setUploading((prev) => prev.filter((u) => u.name !== file.name)))
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          handleFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed border-slate-200 py-6 text-center hover:border-brand-300 hover:bg-brand-50/40"
      >
        <Upload size={18} className="text-slate-400" />
        <p className="text-xs text-slate-500">Arraste arquivos ou clique para enviar</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {uploading.map((u) => (
        <div key={u.name} className="flex items-center gap-2 text-xs text-slate-500">
          <Spinner className="h-3 w-3" />
          <span className="flex-1 truncate">{u.name}</span>
          <span>{u.pct}%</span>
        </div>
      ))}

      {loading ? (
        <Spinner />
      ) : files.length === 0 && uploading.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum arquivo anexado.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {files.map((f) => (
            <FileRow key={f.id} file={f} />
          ))}
        </ul>
      )}
    </div>
  )
}

function FileRow({ file }: { file: FileMeta }) {
  const isImage = file.mimeType.startsWith('image/')
  const isVideo = file.mimeType.startsWith('video/')
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (deleting) return
    if (!confirm(`Excluir "${file.fileName}"? Esta ação não pode ser desfeita.`)) return
    setDeleting(true)
    try {
      await deleteFile(file)
      toast.success('Arquivo excluído')
      // row unmounts when the snapshot drops the file — no setDeleting(false)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao excluir o arquivo')
      setDeleting(false)
    }
  }

  return (
    <li className="flex items-center gap-2.5 rounded-lg border border-slate-100 px-2.5 py-2">
      <a href={file.downloadUrl} target="_blank" rel="noreferrer" className="shrink-0" title="Abrir">
        {isImage ? (
          <img src={file.downloadUrl} alt={file.fileName} className="h-9 w-9 rounded object-cover" />
        ) : isVideo ? (
          <video src={file.downloadUrl} muted preload="metadata" className="h-9 w-9 rounded bg-black object-cover" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded bg-slate-50">
            <FileIcon mimeType={file.mimeType} />
          </div>
        )}
      </a>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-slate-700">{file.fileName}</p>
        <p className="text-[11px] text-slate-400">
          {formatSize(file.size)} · {file.uploadedByName}
        </p>
      </div>
      <a
        href={file.downloadUrl}
        target="_blank"
        rel="noreferrer"
        className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <Download size={14} />
      </a>
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
      >
        <Trash2 size={14} />
      </button>
    </li>
  )
}
