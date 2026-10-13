import { useState } from 'react'
import toast from 'react-hot-toast'
import { KeyRound, Mail, MessageCircle, Copy } from 'lucide-react'
import { Button } from '../../ui/Button'
import { Modal } from '../../ui/Modal'
import { storeTempPassword } from '../../../services/storeApi'
import { copyText } from './StoreOrdersTable'
import type { StoreMember } from '../../../types/store'

function untilLabel(iso: string) {
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')}`
}

/** wa.me precisa do número com DDI (Brasil = 55 quando vier só DDD + número). */
function waNumber(phone?: string | null) {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (!digits) return ''
  return digits.length <= 11 ? `55${digits}` : digits
}

/** Gera uma senha provisória (vale 3 dias) e ajuda a mandar por WhatsApp ou e-mail.
 *  No primeiro login o aluno é levado a criar a senha dele. */
export function TempPasswordModal({
  member,
  productId,
  emailOn,
  onClose,
}: {
  member: StoreMember | null
  productId?: string
  /** E-mail (Resend) configurado na Vercel? */
  emailOn: boolean
  onClose: () => void
}) {
  const [busy, setBusy] = useState<'gen' | 'email' | null>(null)
  const [result, setResult] = useState<{ password: string; expiresAt: string; loginUrl: string } | null>(null)
  const [phone, setPhone] = useState('')

  if (!member) return null
  const number = waNumber(phone || member.phone)
  const first = member.name.split(' ')[0] || member.name

  const message = result
    ? `Olá, ${first}! Seu acesso à área de membros:\n\nLink: ${result.loginUrl}\nE-mail: ${member.email}\nSenha provisória: ${result.password}\n\nEssa senha vale até ${untilLabel(result.expiresAt)}. No primeiro acesso, crie a sua senha.`
    : ''

  const close = () => {
    setResult(null)
    setPhone('')
    onClose()
  }

  const generate = async (send?: 'email') => {
    setBusy(send ?? 'gen')
    try {
      const r = await storeTempPassword(member.id, productId, send)
      setResult(r)
      if (send === 'email') {
        if (r.emailSent) toast.success(`Senha provisória enviada para ${member.email}`)
        else toast.error('Não consegui mandar o e-mail. Copie a mensagem e envie pelo WhatsApp.')
      } else {
        toast.success('Senha provisória criada')
      }
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open={!!member} onClose={close} title={`Senha provisória de ${member.name}`}>
      {!result ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Cria uma senha que vale por 3 dias. O aluno entra com o e-mail e essa senha e, no primeiro acesso, cria a senha dele. Se ele já tinha senha, ela é trocada pela provisória.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={close}>Cancelar</Button>
            {emailOn && (
              <Button variant="secondary" icon={<Mail size={14} />} loading={busy === 'email'} disabled={!!busy} onClick={() => generate('email')}>
                Criar e enviar por e-mail
              </Button>
            )}
            <Button icon={<KeyRound size={14} />} loading={busy === 'gen'} disabled={!!busy} onClick={() => generate()}>
              Criar senha
            </Button>
          </div>
          {!emailOn && <p className="text-xs text-slate-400">O envio automático por e-mail não está configurado. Depois de criar, mande pelo WhatsApp ou copie a mensagem.</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <dl className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <div className="flex gap-2"><dt className="text-slate-500">E-mail:</dt><dd className="font-medium text-slate-800">{member.email}</dd></div>
            <div className="flex gap-2"><dt className="text-slate-500">Senha provisória:</dt><dd className="font-mono text-base font-semibold text-slate-900">{result.password}</dd></div>
            <div className="flex gap-2"><dt className="text-slate-500">Vale até:</dt><dd className="text-slate-800">{untilLabel(result.expiresAt)}</dd></div>
          </dl>
          <p className="text-xs text-slate-400">A senha não fica salva no CRM. Se fechar sem enviar, é só criar outra.</p>

          {!number && (
            <label className="block text-sm text-slate-600">
              WhatsApp do aluno (com DDD)
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="Ex.: 11 98765-4321"
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
              />
            </label>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" icon={<Copy size={14} />} onClick={() => copyText(message, 'Mensagem copiada')}>
              Copiar mensagem
            </Button>
            {emailOn && (
              <Button variant="secondary" icon={<Mail size={14} />} loading={busy === 'email'} disabled={!!busy} onClick={() => generate('email')} aria-label={`Criar outra senha e enviar por e-mail para ${member.email}`}>
                Enviar por e-mail
              </Button>
            )}
            <a
              href={number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!number}
              onClick={(e) => {
                if (!number) {
                  e.preventDefault()
                  toast.error('Informe o WhatsApp do aluno')
                }
              }}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-white ${number ? 'bg-emerald-600 hover:bg-emerald-700' : 'cursor-not-allowed bg-emerald-300'}`}
            >
              <MessageCircle size={14} aria-hidden="true" /> Enviar pelo WhatsApp
            </a>
          </div>
          {emailOn && <p className="text-xs text-slate-400">"Enviar por e-mail" cria uma senha nova e manda; a que está acima deixa de valer.</p>}
        </div>
      )}
    </Modal>
  )
}
