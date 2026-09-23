/** Card de número simples (rótulo + valor grande) usado no topo de painéis
 *  de listagem (Relatórios, Equipe...) pra dar um resumo rápido antes da
 *  lista/tabela em si. */
export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <p className="text-[13px] font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-[22px] font-extrabold leading-tight text-slate-900">{value}</p>
    </div>
  )
}
