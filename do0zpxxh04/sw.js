// One More Shot service worker (written by game/tools/build_pwa.py).
// Network first for every same-origin file, so a deploy is picked up on the next load
// and a stale index.pck is never served while online; the cache (named after the build
// md5) is only the offline fallback. Old builds' caches are deleted on activate.
const BUILD = '9236fe74ed53';
const CACHE = 'oms-' + BUILD;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
	event.waitUntil(caches.keys()
		.then((keys) => Promise.all(keys.filter((k) => k.startsWith('oms-') && k !== CACHE).map((k) => caches.delete(k))))
		.then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET' || req.headers.has('range')) return;
	const url = new URL(req.url);
	if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL('./', self.location).pathname)) return;
	if (url.pathname.endsWith('/sw.js')) return;
	event.respondWith(
		fetch(req, { cache: 'no-cache' }).then((res) => {
			if (res.ok && res.type === 'basic') {
				const copy = res.clone();
				caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
			}
			return res;
		}).catch(() => caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true }))
			.then((hit) => hit || (req.mode === 'navigate' ? caches.open(CACHE).then((c) => c.match('./')) : undefined))
			.then((hit) => hit || Response.error()))
	);
});
