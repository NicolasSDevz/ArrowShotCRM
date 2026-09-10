import { toWhatsappDigits } from './masks'

/** Mensagem de parabéns padrão da Arrow Shot, personalizada com o primeiro
 *  nome do aniversariante. IMPORTANTE: o mesmo texto está replicado em
 *  api/cron/birthday-notifications.js (o cron não consegue importar de src/).
 *  Se mudar aqui, mude lá também. */
export function birthdayWhatsappMessage(name: string): string {
  const first = (name || '').trim().split(/\s+/)[0] || 'você'
  return (
    `Olá, ${first}! 🎂\n\n` +
    `A equipe Arrow Shot veio te desejar um feliz aniversário! 🎉\n\n` +
    `Que este novo ano seja repleto de muito sucesso, conquistas e ótimos negócios!\n\n` +
    `Obrigado por confiar no nosso trabalho. É um prazer fazer parte da sua jornada! 🚀\n\n` +
    `— Equipe Arrow Shot`
  )
}

/** Link wa.me com a mensagem de aniversário já codificada. Abre o WhatsApp Web
 *  no desktop e o app no celular. Retorna undefined se não houver número. */
export function birthdayWhatsappLink(name: string, whatsappRaw?: string | null): string | undefined {
  const digits = toWhatsappDigits(whatsappRaw)
  if (!digits) return undefined
  return `https://wa.me/${digits}?text=${encodeURIComponent(birthdayWhatsappMessage(name))}`
}
