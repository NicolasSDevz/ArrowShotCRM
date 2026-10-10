import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { subscribeStoreLinks } from '../../../services/storeService'

/** Script para colar na página de vendas (a que o anúncio abre antes do checkout).
 *  Os cookies do Pixel e o fbclid ficam presos ao domínio da página de vendas; sem
 *  repassar no link do botão, o checkout não sabe de qual anúncio veio a compra e
 *  o Meta não liga a venda à campanha. */
export function SalesPageSnippet() {
  const [domain, setDomain] = useState<string | null>(null)
  useEffect(() => subscribeStoreLinks((l) => setDomain(l?.checkoutDomain ?? null)), [])

  const hosts = [window.location.host, domain].filter(Boolean) as string[]
  const script = `<script>
(function () {
  var hosts = ${JSON.stringify(hosts)};
  var keys = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','src','fbclid'];
  var q = new URLSearchParams(location.search);
  function cookie(n) { var m = document.cookie.match('(?:^|; )' + n + '=([^;]*)'); return m ? m[1] : null; }
  function fix(a) {
    try {
      var u = new URL(a.href);
      if (hosts.indexOf(u.host) < 0) return;
      keys.forEach(function (k) { if (q.get(k) && !u.searchParams.get(k)) u.searchParams.set(k, q.get(k)); });
      var fbp = cookie('_fbp'), fbc = cookie('_fbc');
      if (fbp) u.searchParams.set('fbp', fbp);
      if (fbc) u.searchParams.set('fbc', fbc);
      a.href = u.toString();
    } catch (e) {}
  }
  document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[href]'); if (a) fix(a); }, true);
})();
</script>`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(script)
      toast.success('Script copiado')
    } catch {
      toast.error('Não deu pra copiar. Selecione o texto e copie à mão.')
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3">
      <div>
        <p className="text-sm font-semibold text-slate-800">Página de vendas antes do checkout?</p>
        <p className="text-[11px] leading-relaxed text-slate-400">
          Se o anúncio abre uma página de vendas (outro site) e só depois o checkout, cole este script nela, antes de fechar o &lt;/body&gt;. Ele leva as UTMs, o clique do anúncio e os cookies do Pixel no link do botão de comprar. Sem isso o Meta recebe a venda, mas não sabe de qual anúncio ela veio. Também precisa ter o mesmo Pixel instalado na página de vendas.
        </p>
      </div>
      <textarea readOnly value={script} rows={5} aria-label="Script para a página de vendas" className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] text-slate-700" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" onClick={copy} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Copiar script</button>
    </div>
  )
}
