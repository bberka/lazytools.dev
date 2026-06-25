try {
  importScripts('/sw-precache.js');
} catch (e) {
  console.warn('[sw.js] Could not load /sw-precache.js, falling back to static list.');
}

const CACHE_VERSION = 'dev-tools-pwa-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const STATIC_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/app-icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
];

const COMMON_TOOL_ROUTES = self.__precacheRoutes || [
  '/tools/base64-converter',
  '/tools/json-formatter',
  '/tools/hash-generator',
  '/tools/uuid-generator',
  '/tools/password-generator',
  '/tools/snowflake-id-generator',
  '/tools/jwt-decoder',
  '/tools/url-encoder',
  '/tools/markdown-editor',
  '/tools/regex-tester',
];

const PRECACHE_URLS = [...STATIC_ASSETS, ...COMMON_TOOL_ROUTES];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![STATIC_CACHE, RUNTIME_CACHE].includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  // Bypass HMR hot-reloading and development server WebSocket connections
  if (
    url.pathname.includes('webpack-hmr') ||
    (url.pathname.startsWith('/_next/') && !url.pathname.startsWith('/_next/static/'))
  ) {
    return;
  }

  // Use Network-First for page navigations to prevent stale HTML hydration/reload loops when online.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    const url = new URL(request.url);
    const normalizedPath = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
    const fallbackResponse = await caches.match(normalizedPath || '/');
    if (fallbackResponse) {
      return fallbackResponse;
    }
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cachedResponse = await caches.match(request);
  const cache = await caches.open(RUNTIME_CACHE);

  if (cachedResponse) {
    fetch(request)
      .then((response) => {
        if (response.ok) {
          cache.put(request, response.clone());
        }
      })
      .catch(() => undefined);

    return cachedResponse;
  }

  const response = await fetch(request);

  if (response.ok) {
    cache.put(request, response.clone());
  }

  return response;
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    ['.css', '.js', '.json', '.webmanifest', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff2'].some(
      (extension) => url.pathname.endsWith(extension)
    )
  );
}
