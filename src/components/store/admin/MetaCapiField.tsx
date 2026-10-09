import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { Field, Input } from '../../ui/Field'
import { Toggle } from '../../leads/LeadFormBuilderParts'
import { storeCapiStatus, storeSaveCapiToken, storeTestCapi } from '../../../services/storeApi'

/** API de Conversões do Meta: token por pixel (fica cifrado no servidor),
 *  liga/desliga por produto e código de teste. */
export function MetaCapiField({
  pixelId,
  enabled,
  testCode,
  onChange,
}: {
  pixelId: string | null
  enabled: boolean
  testCode: string
  onChange: (patch: { capiEnabled?: boolean; capiTestCode?: string | null }) => void
}) {
  const id = (pixelId || '').replace(/\D/g, '')
  const [saved, setSaved] = useState<Record<string, { updatedAt: string | null; updatedBy: string | null }> | null>(null)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    storeCapiStatus()
      .then((r) => setSaved(r.pixels))
      .catch(() => setSaved({}))
  }, [])

  if (id.length < 10) return <p className="text-[11px] text-slate-400">Coloque o número do pixel acima para ligar a API de Conversões.</p>

  const has = !!saved?.[id]

  const save = async (value: string) => {
    setBusy(true)
    try {
      await storeSaveCapiToken(id, value)
      setSaved((s) => {
        const next = { ...(s || {}) }
        if (value) next[id] = { updatedAt: new Date().toISOString(), updatedBy: null }
        else delete next[id]
        return next
      })
      setToken('')
      toast.success(value ? 'Token salvo' : 'Token removido')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    setResult(null)
    try {
      const r = await storeTestCapi(id, testCode)
      setResult(r.ok ? { ok: true, text: testCode ? 'Enviado. Confira em Eventos de teste no Gerenciador de Eventos.' : 'O Meta recebeu o evento. Dica: use um código de teste para ver ele chegando sem sujar os dados.' } : { ok: false, text: r.error || 'O Meta recusou o evento' })
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-3">
      <div>
        <p className="text-sm font-semibold text-slate-800">API de Conversões (venda marcada pelo servidor)</p>
        <p className="text-[11px] leading-relaxed text-slate-400">
          Igual à Kiwify: a compra aprovada vai direto do servidor pro Meta, mesmo se a pessoa fechar a página (Pix confirmado depois, bloqueador, iPhone). O Pixel do navegador manda o mesmo ID, então o Meta não conta duas vezes.
        </p>
      </div>
      <Toggle label="Enviar compras pela API de Conversões" checked={enabled} onChange={(v) => onChange({ capiEnabled: v })} />
      {enabled && (
        <>
          <p className={`flex items-center gap-1.5 text-xs font-medium ${has ? 'text-emerald-600' : 'text-amber-600'}`} aria-live="polite">
            {has ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertCircle size={14} aria-hidden="true" />}
            {saved === null ? 'Conferindo...' : has ? `Token salvo para o pixel ${id}` : `Falta o token do pixel ${id}`}
          </p>
          <Field label={has ? 'Trocar token' : 'Token de acesso'}>
            <div className="flex gap-2">
              <Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAB..." />
              <button type="button" disabled={busy || token.trim().length < 30} onClick={() => save(token.trim())} className="shrink-0 rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white disabled:opacity-50">Salvar</button>
            </div>
          </Field>
          <p className="text-[11px] leading-relaxed text-slate-400">
            Onde pegar: Gerenciador de Eventos, escolha o pixel, aba Configurações, "API de Conversões", "Gerar token de acesso". O token fica guardado cifrado no servidor e vale pra todos os produtos com esse pixel.
          </p>
          <Field label="Código de teste (opcional)">
            <Input value={testCode} onChange={(e) => onChange({ capiTestCode: e.target.value.trim() || null })} placeholder="TEST12345" />
          </Field>
          <p className="text-[11px] text-slate-400">Pegue em Gerenciador de Eventos, Eventos de teste. Enquanto estiver preenchido, as vendas reais também vão como teste. Apague depois de conferir.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy || !has} onClick={test} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Testar envio</button>
            {has && (
              <button type="button" disabled={busy} onClick={() => save('')} className="text-xs text-slate-400 hover:text-red-600">Remover token</button>
            )}
          </div>
          {result && <p role="status" className={`rounded-lg p-2 text-xs ${result.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{result.text}</p>}
        </>
      )}
    </div>
  )
}
