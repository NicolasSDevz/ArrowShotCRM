import { useState } from 'react'
import { nextMonday, isMonday } from 'date-fns'
import toast from 'react-hot-toast'
import { Modal } from '../ui/Modal'
import { Field, Input, Select } from '../ui/Field'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { useClients } from '../../hooks/useClients'
import { generateMonthlyPauta, generateWeeklyPauta } from '../../services/contentTemplates'
import { CLIENT_PACKAGE_LABEL, type ClientPackage } from '../../types/client'

function defaultStartDate() {
  const today = new Date()
  return isMonday(today) ? today : nextMonday(today)
}

export function GeneratePautaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useAuth()
  const { data: clients } = useClients()

  const [clientId, setClientId] = useState('')
  const [pkg, setPkg] = useState<ClientPackage>('weekly')
  const [startDate, setStartDate] = useState(defaultStartDate().toISOString().slice(0, 10))
  const [generating, setGenerating] = useState(false)

  const client = clients.find((c) => c.id === clientId)

  const handleSelectClient = (id: string) => {
    setClientId(id)
    const c = clients.find((x) => x.id === id)
    if (c?.package) setPkg(c.package)
  }

  const handleGenerate = async () => {
    if (!clientId || !profile) return
    setGenerating(true)
    try {
      const date = new Date(`${startDate}T00:00:00`)
      const count =
        pkg === 'weekly'
          ? await generateWeeklyPauta(clientId, date, profile.id, profile.name)
          : await generateMonthlyPauta(clientId, date, profile.id, profile.name)
      toast.success(`${count} conteúdos criados na coluna Produzir`)
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Erro ao gerar a pauta')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Gerar pauta">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-slate-500">
          Cria os conteúdos da semana (ou dos 4 blocos do mês) direto na coluna "Produzir", já com pilar, formato e
          legenda-base preenchidos conforme o roteiro padrão da Quiver.
        </p>

        <Field label="Cliente" required>
          <Select value={clientId} onChange={(e) => handleSelectClient(e.target.value)}>
            <option value="">Selecione...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Pacote">
          <Select value={pkg} onChange={(e) => setPkg(e.target.value as ClientPackage)}>
            {Object.entries(CLIENT_PACKAGE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          {client && !client.package && (
            <p className="mt-1 text-xs text-amber-600">Esse cliente ainda não tem pacote definido no cadastro.</p>
          )}
        </Field>

        <Field label={pkg === 'weekly' ? 'Início da semana (segunda-feira)' : 'Início do mês (segunda-feira)'} required>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleGenerate} loading={generating} disabled={!clientId}>
            Gerar {pkg === 'weekly' ? '5 conteúdos' : '12 conteúdos'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
