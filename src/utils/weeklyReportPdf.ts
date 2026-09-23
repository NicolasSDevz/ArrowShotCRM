import { jsPDF } from 'jspdf'

const BLUE: [number, number, number] = [37, 99, 235]
const DARK: [number, number, number] = [15, 23, 42]
const MUTED: [number, number, number] = [100, 116, 139]

function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** PDF simples de uma página com o texto do relatório semanal — usado pelo
 *  botão "Exportar PDF" da lista de relatórios (o formato principal do
 *  semanal é o texto para WhatsApp, não um PDF; isso é só uma cópia
 *  imprimível). */
export function generateWeeklyReportPdf(clientName: string, text: string): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const marginX = 18
  const contentW = 210 - marginX * 2

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(BLUE[0], BLUE[1], BLUE[2])
  doc.text('Quiver — Relatório Semanal', marginX, 22)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(DARK[0], DARK[1], DARK[2])
  doc.text(clientName, marginX, 30)

  doc.setDrawColor(MUTED[0], MUTED[1], MUTED[2])
  doc.setLineWidth(0.2)
  doc.line(marginX, 34, 210 - marginX, 34)

  doc.setFont('courier', 'normal')
  doc.setFontSize(10)
  const lines = doc.splitTextToSize(text, contentW) as string[]
  doc.text(lines, marginX, 44)

  doc.save(`Relatorio_Semanal_${slug(clientName) || 'Cliente'}.pdf`)
}
