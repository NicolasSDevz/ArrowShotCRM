import { useState } from 'react'
import { writeBatch, doc } from 'firebase/firestore'
import { Timestamp } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { db } from '../../firebase/config'
import { useAuth } from '../../context/AuthContext'
import type { Client } from '../../types/client'

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '')
}

interface Props {
  clients: Client[]
}

type Step = 'idle' | 'confirming' | 'running' | 'done'

export function JornadaMigrationBanner({ clients }: Props) {
  const { profile } = useAuth()
  const [step, setStep] = useState<Step>('idle')
  const [match, setMatch] = useState<Client | null>(null)
  const [error, setError] = useState<string | null>(null)

  const needsMigration = clients.some((c) => c.participaJornada === undefined)
  if (!needsMigration || profile?.role !== 'admin') return null

  const handleFind = () => {
    setError(null)
    const target = normalize('limpecenter')
    const matches = clients.filter((c) => normalize(c.companyName).includes(target))

    if (matches.length === 0) {
      setError('Nenhum cliente com "limpecenter" no nome encontrado. Verifique o nome e avise o dev.')
      return
    }
    if (matches.length > 1) {
      setError(
        `Mais de um cliente encontrado: ${matches.map((c) => `"${c.companyName}" (${c.id})`).join(', ')}. Avise o dev para fazer a migração manualmente.`,
      )
      return
    }
    setMatch(matches[0])
    setStep('confirming')
  }

  const handleConfirm = async () => {
    if (!match || !profile) return
    setStep('running')
    try {
      // Firestore writeBatch supports up to 500 ops; split if needed.
      const BATCH_SIZE = 400
      const now = Timestamp.now()
      for (let i = 0; i < clients.length; i += BATCH_SIZE) {
        const batch = writeBatch(db)
        const chunk = clients.slice(i, i + BATCH_SIZE)
        for (const c of chunk) {
          const isLimpecenter = c.id === match.id
          const ref = doc(db, 'clients', c.id)
          batch.update(ref, {
            participaJornada: isLimpecenter,
            updatedBy: profile.id,
            updatedAt: now,
            ...(isLimpecenter && !c.dataInicioJornada
              ? { dataInicioJornada: c.contractStartDate ?? c.createdAt ?? now }
              : {}),
          })
        }
        await batch.commit()
      }
      setStep('done')
      toast.success('Migração da Jornada concluída!')
    } catch (err) {
      console.error(err)
      setStep('idle')
      toast.error('Erro na migração. Veja o console.')
    }
  }

  if (step === 'done') return null

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-800">Migração da Jornada do Cliente pendente</p>
      <p className="mt-1 text-xs text-amber-700">
        Clientes existentes ainda não têm o campo <code>participaJornada</code>. Esta migração vai marcar todos como{' '}
        <strong>false</strong>, exceto a <strong>Limpecenter</strong> (true, primeiro cliente do plano novo).
      </p>

      {error && (
        <p className="mt-2 rounded-md bg-red-100 px-3 py-2 text-xs font-medium text-red-700">{error}</p>
      )}

      {step === 'idle' && (
        <button
          onClick={handleFind}
          className="mt-3 rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
        >
          Localizar Limpecenter e verificar
        </button>
      )}

      {step === 'confirming' && match && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="rounded-md bg-white px-3 py-2 text-xs text-slate-700 ring-1 ring-slate-200">
            Cliente encontrado: <strong>{match.companyName}</strong> — ID: <code>{match.id}</code>
          </p>
          <p className="text-xs text-amber-700">
            {clients.length} clientes serão atualizados: <strong>Limpecenter = true</strong>, todos os outros = <strong>false</strong>.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
            >
              Confirmar e executar migração
            </button>
            <button
              onClick={() => { setStep('idle'); setMatch(null) }}
              className="rounded-lg px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-amber-100"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {step === 'running' && (
        <p className="mt-3 text-xs text-amber-700">Executando migração...</p>
      )}
    </div>
  )
}
