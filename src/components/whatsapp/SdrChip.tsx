import { SDR_STAGE, SDR_TEMP } from './waSdr'
import type { WaSdr } from '../../types/whatsapp'

/** Selo curto: temperatura + etapa. Status sempre escrito (não só cor). */
export function SdrChip({ sdr, size = 'sm' }: { sdr?: WaSdr | null; size?: 'xs' | 'sm' }) {
  if (!sdr) return null
  const t = SDR_TEMP[sdr.temperature] ?? SDR_TEMP.morno
  const st = SDR_STAGE[sdr.stage] ?? SDR_STAGE.abertura
  const cls = size === 'xs' ? 'px-1.5 py-0.5 text-[10.5px]' : 'px-2 py-0.5 text-[11px]'
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-md font-semibold ${cls}`} style={{ background: t.bg, color: t.color }}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: t.color }} aria-hidden="true" />
      <span className="truncate">
        {t.label}
        <span className="font-medium opacity-80">, {st.label}</span>
      </span>
    </span>
  )
}

