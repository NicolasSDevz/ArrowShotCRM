import { jsPDF } from 'jspdf'

/** Certificado de conclusão em PDF (A4 deitado), gerado no navegador. */
export function downloadCertificate(opts: { studentName: string; courseName: string; producerName: string; hours?: number; color: string }) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = 297
  const H = 210
  const [r, g, b] = hexToRgb(opts.color)

  pdf.setFillColor(15, 23, 42)
  pdf.rect(0, 0, W, H, 'F')
  pdf.setDrawColor(r, g, b)
  pdf.setLineWidth(1.5)
  pdf.rect(10, 10, W - 20, H - 20)
  pdf.setLineWidth(0.4)
  pdf.rect(14, 14, W - 28, H - 28)

  pdf.setTextColor(r, g, b)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(14)
  pdf.text('CERTIFICADO DE CONCLUSÃO', W / 2, 45, { align: 'center' })

  pdf.setTextColor(203, 213, 225)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(13)
  pdf.text('Certificamos que', W / 2, 70, { align: 'center' })

  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(32)
  pdf.text(opts.studentName, W / 2, 90, { align: 'center', maxWidth: W - 60 })

  pdf.setTextColor(203, 213, 225)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(13)
  const hours = opts.hours ? `, com carga horária de ${opts.hours} horas` : ''
  pdf.text(`concluiu o curso`, W / 2, 108, { align: 'center' })
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(20)
  pdf.text(opts.courseName, W / 2, 122, { align: 'center', maxWidth: W - 60 })
  pdf.setTextColor(203, 213, 225)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(12)
  const date = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  pdf.text(`em ${date}${hours}.`, W / 2, 134, { align: 'center' })

  pdf.setDrawColor(148, 163, 184)
  pdf.line(W / 2 - 45, 165, W / 2 + 45, 165)
  pdf.setFontSize(12)
  pdf.setTextColor(255, 255, 255)
  pdf.text(opts.producerName, W / 2, 172, { align: 'center' })

  const file = `certificado-${opts.courseName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}.pdf`
  pdf.save(file)
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [37, 99, 235]
}
