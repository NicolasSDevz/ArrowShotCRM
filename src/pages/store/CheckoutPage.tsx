import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchCheckout, type PublicCheckout } from '../../services/storeApi'
import { CheckoutView } from '../../components/store/CheckoutView'
import { loadMetaPixel } from '../../utils/metaPixel'
import { Spinner } from '../../components/ui/FullPageSpinner'

/** /pay/:slug — página pública de pagamento de um produto da Loja. */
export function CheckoutPage() {
  const { slug = '' } = useParams()
  const [data, setData] = useState<PublicCheckout | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchCheckout(slug)
      .then((d) => {
        setData(d)
        document.title = d.name
        if (d.checkout.fbPixelId) loadMetaPixel(d.checkout.fbPixelId)
      })
      .catch((err: Error) => setError(err.message))
  }, [slug])

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-center">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Página indisponível</h1>
          <p className="mt-1 text-sm text-slate-500">{error}</p>
        </div>
      </main>
    )
  }
  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100" aria-busy="true">
        <Spinner className="h-6 w-6" />
      </main>
    )
  }
  return (
    <main className="min-h-screen">
      <CheckoutView data={data} />
    </main>
  )
}
