// Offline support.
// - Pages and unhashed files (manifest, icons): network first, cache fallback.
// - Hashed build assets (assets/*): cache first; their names change every build.
// BUILD_ID is replaced at build time, so every deploy gets a fresh cache and old
// caches are deleted on activate. Saves live in IndexedDB and are never touched.
const BUILD_ID = '__BUILD_ID__';
const PRECACHE = /*__PRECACHE__*/ [];
// Caches are named per scope, so two copies of the game on one site (for example
// two GitHub Pages projects) never delete each other's files.
const PREFIX = `tidepool-${self.registration ? self.registration.scope : ''}-`;
const CACHE = `${PREFIX}${BUILD_ID}`;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(['./', ...PRECACHE]).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => (k.startsWith(PREFIX) && k !== CACHE) || (k.startsWith('tidepool-') && !k.includes('://'))).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const put = (req, res) => {
  if (res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const hashed = url.pathname.includes('/assets/');
  if (hashed) {
    e.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => put(req, res))));
    return;
  }
  e.respondWith(
    fetch(req)
      .then((res) => put(req, res))
      .catch(() => caches.match(req, { ignoreVary: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('./', { ignoreVary: true }) : undefined))),
  );
});
