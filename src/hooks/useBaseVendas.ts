import { useEffect, useRef, useState } from 'react'
import type { FirestoreError } from 'firebase/firestore'
import { subscribeBaseVendas, saveBaseVendas } from '../services/baseVendasService'
import { DEFAULT_BASE_VENDAS } from '../config/baseVendasDefault'
import type { BaseVendas } from '../types/baseVendas'

/** Lê a Base de Vendas (fonte única do Archer + Copiloto). Se o documento
 *  ainda não existir (ninguém abriu a tela "Base de Vendas" ainda), semeia
 *  automaticamente com o conteúdo padrão (ver config/baseVendasDefault.ts)
 *  — garante que o Archer e o Copiloto sempre têm conhecimento, mesmo antes
 *  de qualquer edição manual. */
export function useBaseVendas(userId: string | undefined) {
  const [data, setData] = useState<BaseVendas | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<FirestoreError | null>(null)
  const seededRef = useRef(false)

  useEffect(() => {
    const unsub = subscribeBaseVendas(
      (value) => {
        setData(value)
        setLoading(false)
        if (value === null && !seededRef.current && userId) {
          seededRef.current = true
          saveBaseVendas(DEFAULT_BASE_VENDAS, userId).catch((err) => {
            console.error('[baseVendas] falha ao semear o padrão', err)
            seededRef.current = false
          })
        }
      },
      (err) => {
        console.error(err)
        setError(err)
        setLoading(false)
      }
    )
    return unsub
  }, [userId])

  return { data, loading, error }
}
