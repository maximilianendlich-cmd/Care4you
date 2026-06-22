/* ============================================================
   care4you Service Worker  —  Offline-Fähigkeit (PWA)
   Behebt: "Offline-Fähigkeit (PWA) — Service Worker fehlt noch"
   ============================================================ */

const CACHE_VERSION = 'c4y-v1.0.0';
const CACHE_NAME = `care4you-${CACHE_VERSION}`;

// App-Shell: alles was die App zum Starten braucht
const APP_SHELL = [
  './',
  './index.html',
  './momo.html',
  './motion.html',
  './assessment.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Merriweather:wght@400;700;900&display=swap',
];

// ── Install: App-Shell vorab cachen ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // addAll schlägt fehl wenn EINE Ressource fehlt; daher einzeln & tolerant
        return Promise.allSettled(
          APP_SHELL.map((url) => cache.add(url).catch((e) => console.warn('SW: skip', url, e)))
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activate: alte Caches aufräumen ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k.startsWith('care4you-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch-Strategie ──
// Navigations & App-Dateien: Network-first mit Cache-Fallback (immer frisch wenn online)
// Fonts/Assets: Cache-first (schnell, ändern sich selten)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // API-Aufrufe NIE cachen (Gesundheitsdaten müssen aktuell & sicher sein)
  if (url.pathname.includes('/api/') || url.search.includes('no-cache')) {
    event.respondWith(
      fetch(req).catch(() =>
        new Response(JSON.stringify({ offline: true, error: 'Keine Verbindung' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503,
        })
      )
    );
    return;
  }

  // Fonts & CDN: cache-first
  if (url.hostname.includes('fonts.g') || url.hostname.includes('cdnjs')) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // HTML & App: network-first, fallback auf Cache (Offline!)
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) =>
          cached || caches.match('./index.html')
        )
      )
  );
});

// ── Background Sync: Daten nachsenden wenn wieder online ──
// (Frontend legt fehlgeschlagene Writes in IndexedDB-Queue ab; hier abgearbeitet)
self.addEventListener('sync', (event) => {
  if (event.tag === 'c4y-sync-data') {
    event.waitUntil(syncPendingData());
  }
});

async function syncPendingData() {
  // Die App benachrichtigen, dass sie ihre Outbox leeren soll
  const clients = await self.clients.matchAll();
  clients.forEach((client) => client.postMessage({ type: 'SYNC_NOW' }));
}

// ── Push-Benachrichtigungen (Erinnerungen) ──
self.addEventListener('push', (event) => {
  let data = { title: 'care4you', body: 'Zeit für Ihren Check-in 🌿' };
  try { if (event.data) data = event.data.json(); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon:
      badge:
      tag: data.tag || 'c4y-reminder',
      requireInteraction: false,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('./index.html'));
});
