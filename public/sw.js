// Service worker do CRM instalado como app: só cuida das notificações push.
// Não guarda páginas em cache (o app sempre abre a versão mais nova).

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Quiver', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag,
      requireInteraction: Boolean(data.actions),
      actions: (data.actions || []).slice(0, 2).map((a) => ({ action: a.action, title: a.title })),
      data: { url: data.url || '/', actions: data.actions || [] },
    })
  )
})

// Toque na notificação: abre (ou traz pra frente) o CRM na tela do aviso.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Botão da notificação (ex.: "Sim, IA atende"): chama o link na hora, sem abrir o app.
  const btn = (event.notification.data?.actions || []).find((a) => a.action === event.action)
  if (btn?.url) {
    event.waitUntil(
      fetch(btn.url, { headers: { Accept: 'application/json' } })
        .then((r) => r.json().catch(() => ({})).then((j) => ({ ok: r.ok, j })))
        .then(({ ok, j }) =>
          self.registration.showNotification(ok ? 'Feito' : 'Não deu certo', {
            body: ok ? j.message || 'Pronto.' : j.error || 'Abra a conversa no CRM.',
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: event.notification.tag,
            data: { url: event.notification.data?.url || '/' },
          })
        )
        .catch(() => self.clients.openWindow(new URL(event.notification.data?.url || '/', self.location.origin).href))
    )
    return
  }
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate?.(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
