import { useMemo } from 'react'
import { Sparkles } from 'lucide-react'

/** Frases de marketing/vendas/produtividade — sem autoria específica,
 *  tom direto, adequadas ao dia a dia de uma agência. */
const QUOTES = [
  'Resultado bom é resultado que se repete todo mês — otimize pensando em consistência, não em sorte.',
  'Cliente satisfeito indica. Cliente encantado não sai.',
  'Um relatório bem feito vale mais que mil justificativas.',
  'A melhor campanha é aquela que você testa, mede e melhora — nessa ordem.',
  'Antes de pedir mais orçamento, pergunte: o que já temos está otimizado de verdade?',
  'Ninguém lembra do prazo que você cumpriu. Todo mundo lembra do que você perdeu.',
  'Dado sem contexto é só número. Contexto é o que vira decisão.',
  'O primeiro "não" do cliente geralmente é sobre clareza, não sobre preço.',
  'Tráfego pago compra atenção. O que você faz com ela decide se compra também o resultado.',
  'Rotina boa não é a que engessa — é a que libera espaço pra pensar no que importa.',
  'Todo cliente que você mantém feliz é um caso de sucesso que ainda não foi escrito.',
  'Otimizar não é mexer todo dia — é mexer no que realmente move o ponteiro.',
  'A régua de qualidade da agência é a régua do pior entregável do mês, não do melhor.',
  'Quem entende o funil do cliente entrega mais do que quem só entende a plataforma.',
  'Um "ainda não sei" respondido rápido vale mais que um "sim" prometido tarde.',
  'Comunicação proativa evita 90% das reclamações — o cliente odeia ser pego de surpresa.',
  'Métrica de vaidade engorda relatório. Métrica de negócio muda decisão.',
  'O trabalho que ninguém vê (organização, dados, processo) é o que sustenta o que todo mundo vê.',
  'Cliente não compra "tráfego pago" — compra o problema que o tráfego pago resolve.',
  'Feedback difícil de ouvir é o mais barato que existe: ele já veio de graça, só falta aplicar.',
  'Toda meta batida começou com uma rotina chata sendo levada a sério.',
  'Se o resultado caiu, a primeira pergunta é "o que mudou", não "o que fazer agora".',
  'Agência boa não esconde número ruim do cliente — explica e mostra o plano.',
  'O detalhe que parece pequeno pro time é o que o cliente mais nota.',
  'Criativo cansado gasta orçamento sem gerar resultado — teste antes de aceitar isso como normal.',
  'Prazo combinado é compromisso, não sugestão.',
  'Quem organiza o dia de manhã decide o dia. Quem não organiza, é decidido por ele.',
  'Um cliente bem informado reclama menos, mesmo quando o resultado não é o ideal.',
  'Excelência não é fazer tudo perfeito — é fazer o essencial muito bem, sempre.',
  'A pergunta certa pro cliente vale mais que dez slides de relatório.',
]

/** Escolhe uma frase por dia útil — mesma pro dia inteiro pra todo mundo,
 *  troca sozinha à meia-noite (sem precisar de Firestore/cron). Sábado e
 *  domingo não tem frase. O índice conta só dias úteis desde uma data fixa,
 *  então nenhuma frase é "gasta" num fim de semana. */
function quoteOfTheDay(): string | null {
  const now = new Date()
  const dow = now.getDay()
  if (dow === 0 || dow === 6) return null
  // 05/01/1970 foi uma segunda-feira: semanas completas × 5 + dia da semana.
  const days = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(1970, 0, 5)) / 86_400_000)
  const businessDays = Math.floor(days / 7) * 5 + (days % 7)
  return QUOTES[businessDays % QUOTES.length]
}

export function MotivationalQuoteBanner() {
  const quote = useMemo(() => quoteOfTheDay(), [])
  if (!quote) return null

  return (
    <div className="flex items-start gap-3 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 p-4 text-white shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
      <Sparkles size={18} className="mt-0.5 shrink-0 text-brand-200" />
      <p className="text-[14px] font-medium leading-relaxed">{quote}</p>
    </div>
  )
}
