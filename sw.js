// Service worker: keeps a copy of the game on the device so it opens and
// plays with no internet. Only runs when the game is served over https
// (or from localhost).

const CACHE = 'paper-rally-v1';
// The track key (picture and printable PDF) is included so it works offline too.
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './track-key.jpg', './track-key.pdf'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
    ]),
  );
});

// The page tells us which files it loaded (their names change with every
// build), so they are saved on the very first visit.
self.addEventListener('message', (event) => {
  const urls = event.data && event.data.cache;
  if (Array.isArray(urls)) event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(urls)).catch(() => undefined));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const page = request.mode === 'navigate';
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // ignoreVary: servers often send "Vary: Origin", which would otherwise make
      // a saved file fail to match the page's request for it.
      const cached = await cache.match(request, { ignoreSearch: page, ignoreVary: true });
      const fresh = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => undefined);
      // Pages: newest version when online, saved copy when not.
      // Everything else: saved copy straight away, refreshed in the background.
      const answer = page ? (await fresh) ?? cached : cached ?? (await fresh);
      if (answer) return answer;
      // Offline and never saved. A page falls back to the game itself; anything
      // else fails honestly rather than being handed the wrong kind of file.
      return (page && (await cache.match('./index.html', { ignoreVary: true }))) || Response.error();
    }),
  );
});
