// Service worker de Piedrazón: guarda la app para que abra sin señal y sirve los últimos datos conocidos.
//   - La app (html, js, css, íconos, Leaflet, fuentes): se muestra lo guardado y se actualiza en segundo plano.
//   - Los datos (data/*.json): siempre de la red primero; si no hay conexión, los últimos que se guardaron.
//   - Los mosaicos del mapa no se guardan.
// Cambiar VERSION cuando cambie la lista de archivos de APP.
const VERSION = 'piedrazon-2026-10-24-2';
const APP = ['./', 'index.html', 'app.js', 'piedrazon.js', 'cuis.js', 'style.css', 'manifest.webmanifest',
  'iconos/icono-192.png', 'iconos/icono-512.png', 'iconos/apple-touch-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'];

const DATOS = ['granizo_ahora.json', 'granizo_pronostico.json', 'granizo_horas.json', 'localidades.json', 'smn.json'];

self.addEventListener('install', ev => {
  // los datos se guardan sin el ?t=… con el que los pide la app, para tenerlos sin conexión desde la primera visita
  const datos = c => DATOS.map(n => new URL('data/' + n, self.location).href)
    .map(u => fetch(u, { cache: 'reload' }).then(r => r.ok && c.put(u, r)).catch(() => null));
  ev.waitUntil(caches.open(VERSION).then(c => Promise.all([...APP.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => null)), ...datos(c)])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function redPrimero(req, clave) {
  const cache = await caches.open(VERSION);
  try {
    const r = await fetch(req);
    if (r.ok) cache.put(clave, r.clone());
    return r;
  } catch (e) {
    const guardada = await cache.match(clave);
    if (guardada) return guardada;
    throw e;
  }
}

async function guardadoYActualizar(ev, req) {
  const cache = await caches.open(VERSION);
  const guardada = await cache.match(req, { ignoreSearch: true });
  const nueva = fetch(req).then(r => {
    if (r.ok || r.type === 'opaque') cache.put(req.url.split('?')[0], r.clone());
    return r;
  }).catch(() => null);
  if (guardada) { ev.waitUntil(nueva); return guardada; }
  return (await nueva) || Response.error();
}

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('tile.openstreetmap.org')) return;
  const propio = url.origin === self.location.origin;
  if (propio && url.pathname.includes('/data/')) {
    // los datos se piden con ?t=… para saltar la caché del navegador; se guardan sin eso
    ev.respondWith(redPrimero(req, url.origin + url.pathname));
    return;
  }
  if (req.mode === 'navigate') {
    // la página siempre fresca si hay señal, y la guardada si no
    ev.respondWith(redPrimero(req, new URL('./', self.location).href).catch(async () => (await caches.match('index.html')) || Response.error()));
    return;
  }
  if (propio || url.hostname === 'unpkg.com' || url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    ev.respondWith(guardadoYActualizar(ev, req));
  }
});

// Número rojo en el ícono de la app: la cantidad de avisos sin leer (iPhone con iOS 16.4 o más, y Android)
async function actualizarNumero() {
  if (!self.navigator.setAppBadge) return;
  try {
    const n = (await self.registration.getNotifications()).length;
    if (n) await self.navigator.setAppBadge(n); else await self.navigator.clearAppBadge();
  } catch (e) { /* el sistema no lo permite */ }
}

// Aviso al celular (web push), que manda scripts/notificar.py cuando una localidad sube de nivel
self.addEventListener('push', ev => {
  let d = {};
  try { d = ev.data ? ev.data.json() : {}; } catch (e) { d = { cuerpo: ev.data ? ev.data.text() : '' }; }
  ev.waitUntil(self.registration.showNotification(d.titulo || 'Piedrazón', {
    body: d.cuerpo || '', icon: 'iconos/icono-192.png', badge: 'iconos/icono-192.png', lang: 'es-AR',
    tag: d.tag || 'piedrazon', renotify: true, vibrate: [200, 100, 200], data: { url: d.url || './' },
  }).then(actualizarNumero));
});

// Al tocar un aviso, abre (o enfoca) Piedrazón
self.addEventListener('notificationclick', ev => {
  ev.notification.close();
  ev.waitUntil(actualizarNumero());
  const destino = (ev.notification.data && ev.notification.data.url) || './';
  ev.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const abierta = cs.find(c => c.url.startsWith(self.registration.scope));
    // con la app abierta, la lleva a la localidad del aviso; si no, la abre ahí
    return abierta ? abierta.focus().then(c => (c && c.navigate ? c.navigate(destino) : c)) : self.clients.openWindow(destino);
  }));
});
