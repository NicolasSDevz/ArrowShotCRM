import { useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { deleteClient } from '../../services/clientService'
import type { Client } from '../../types/client'
import { showError } from '../../utils/notifyError'

export function DeleteClientModal({
  client,
  onClose,
  onDeleted,
}: {
  client: Client | null
  onClose: () => void
  onDeleted?: () => void
}) {
  const { profile } = useAuth()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!client || !profile) return
    setDeleting(true)
    try {
      await deleteClient(client, profile.id, profile.name)
      toast.success('Cliente excluído com sucesso')
      onClose()
      onDeleted?.()
    } catch (err) {
      console.error(err)
      showError(err, 'Erro ao excluir cliente')
      setDeleting(false)
    }
  }

  return (
    <Modal open={!!client} onClose={deleting ? () => {} : onClose} title="Excluir cliente">
      {client && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            Tem certeza que deseja excluir <span className="font-semibold text-slate-800">{client.companyName}</span>? Esta ação
            não pode ser desfeita. Todas as tarefas vinculadas a este cliente também serão excluídas.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={deleting}>
              Cancelar
            </Button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex h-[38px] items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-all duration-150 ease-in-out hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? 'Excluindo...' : 'Excluir permanentemente'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
