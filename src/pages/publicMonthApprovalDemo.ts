import { Timestamp } from 'firebase/firestore'
import type { Content } from '../types/content'
import type { ApprovalLink } from '../services/socialMonthService'

/** Dados de exemplo do /aprovacao/demo (só em desenvolvimento). */
export function demoMonth(): { link: ApprovalLink; contents: Content[] } {
  const img = (n: number) => ({ url: `/__demo/anuncio-jl-carrossel-${n}.png`, storagePath: `demo-${n}`, kind: 'image' as const, name: `tela-${n}.png` })
  const d = (day: number) => Timestamp.fromDate(new Date(2026, 11, day, 11))
  const base = { clientId: 'demo', platform: 'instagram' as const, status: 'waiting_client' as const, order: 0, approvalToken: 'demo' }
  const contents = [
    { ...base, id: 'd1', title: 'Estático · Antes e Depois', type: 'post' as const, scheduledDate: d(1), media: [img(1)],
      caption: 'Obra acabou, mas a casa ainda não está pronta pra morar.\n\nA gente tira o pó fino, o resto de cimento e as manchas de tinta que ficam escondidas. Chama no WhatsApp e pede seu orçamento.', hashtags: ['#limpezaposobra', '#jllimpezas'] },
    { ...base, id: 'd2', title: 'Carrossel · Educativo', type: 'carousel' as const, scheduledDate: d(3), media: [1, 2, 3, 4, 5].map(img),
      caption: '5 erros que estragam o piso novo na limpeza pós-obra 👇\n\nSalva pra mostrar pra quem vai fazer a sua.' },
    { ...base, id: 'd3', title: 'Reels · Bastidores', type: 'reels' as const, scheduledDate: d(5), media: [img(3)],
      caption: 'Um dia com a equipe JL num galpão de 800 m². Do caos ao pronto pra inaugurar.' },
    { ...base, id: 'd4', title: 'Estático · Prova Social', type: 'post' as const, scheduledDate: d(8), media: [],
      caption: 'O que nossos clientes falam depois da entrega.' },
  ] as unknown as Content[]
  return {
    link: { id: 'demo', clientId: 'demo', clientNameSnapshot: 'JL Limpezas (exemplo)', logoUrl: null, month: '2026-12', contentIds: contents.map((c) => c.id), active: true, deadline: '2026-11-25' },
    contents,
  }
}
