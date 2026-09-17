import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Tabs } from '../components/ui/Tabs'
import { useAllContents } from '../hooks/useContents'
import { SocialMediaClientList } from '../components/socialMedia/SocialMediaClientList'
import { SocialMediaGlobalCalendar } from '../components/socialMedia/SocialMediaGlobalCalendar'

/** Landing do módulo Social Mídia — duas abas: "Por cliente" (padrão) e
 *  "Calendário geral". O board único de antes virou a tela por cliente
 *  (/social-media/:clientId, ver SocialMediaClientPage.tsx). */
export function SocialMediaPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { data: contents } = useAllContents()

  // Deep link de notificação/dashboard (?content=id) — antes abria o drawer
  // direto nesta página; agora que o módulo é por cliente, redireciona pra
  // tela do cliente dono desse conteúdo (que reabre o mesmo drawer).
  useEffect(() => {
    const id = searchParams.get('content')
    if (!id) return
    const content = contents.find((c) => c.id === id)
    if (content) navigate(`/social-media/${content.clientId}?content=${id}`, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, contents])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[28px] font-extrabold text-slate-900">Social Mídia</h1>
        <p className="text-[15px] text-[#64748B]">Fluxo de produção de conteúdo, da ideia à publicação.</p>
      </div>

      <Tabs
        tabs={[
          { label: 'Por cliente', content: <SocialMediaClientList /> },
          { label: 'Calendário geral', content: <SocialMediaGlobalCalendar /> },
        ]}
      />
    </div>
  )
}
