const SW_BASE = new URL(self.location.href).pathname.replace(/\/sw\.js$/, "") || "";

function withBase(path) {
  if (!SW_BASE) return path;
  if (path === SW_BASE || path.startsWith(`${SW_BASE}/`)) return path;
  return `${SW_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

function stripBase(pathname) {
  if (SW_BASE && pathname.startsWith(`${SW_BASE}/`)) return pathname.slice(SW_BASE.length);
  if (SW_BASE && pathname === SW_BASE) return "/";
  return pathname;
}

// DocumentServer-style aliases used by ONLYOFFICE assets (api.js loader, svg
// icon sprites, chart editor) that would otherwise 404 on a static host.
const EDITOR_ALIASES = [
  ["/editor/word/", "/web-apps/apps/documenteditor/main/"],
  ["/editor/cell/", "/web-apps/apps/spreadsheeteditor/main/"],
  ["/editor/slide/", "/web-apps/apps/presentationeditor/main/"],
  ["/editor/pdf/", "/web-apps/apps/pdfeditor/main/"],
  ["/editor/visio/", "/web-apps/apps/visioeditor/main/"],
  ["/common/main/", "/web-apps/apps/common/main/"],
];

const THEMES_JSON_TARGET = "/web-apps/apps/common/main/resources/themes/themes.json";

const APP_EDITOR_ROUTES = new Set([
  "/editor",
  "/editor/",
  "/editor/word",
  "/editor/word/",
  "/editor/cell",
  "/editor/cell/",
  "/editor/slide",
  "/editor/slide/",
  "/editor/pdf",
  "/editor/pdf/",
]);

function editorResourcesTarget(referrer) {
  if (referrer.includes("/presentationeditor/") || /\/editor\/slide(?:\/|$|\?)/.test(referrer)) {
    return "/web-apps/apps/presentationeditor/main/resources/";
  }
  if (referrer.includes("/spreadsheeteditor/") || /\/editor\/cell(?:\/|$|\?)/.test(referrer)) {
    return "/web-apps/apps/spreadsheeteditor/main/resources/";
  }
  if (referrer.includes("/documenteditor/") || /\/editor\/word(?:\/|$|\?)/.test(referrer)) {
    return "/web-apps/apps/documenteditor/main/resources/";
  }
  if (referrer.includes("/pdfeditor/") || /\/editor\/pdf(?:\/|$|\?)/.test(referrer)) {
    return "/web-apps/apps/pdfeditor/main/resources/";
  }
  return "/web-apps/apps/common/main/resources/";
}

function editorContextFromReferrer(referrer) {
  if (referrer.includes("/presentationeditor/")) return "/web-apps/apps/presentationeditor/main/";
  if (referrer.includes("/spreadsheeteditor/")) return "/web-apps/apps/spreadsheeteditor/main/";
  if (referrer.includes("/documenteditor/")) return "/web-apps/apps/documenteditor/main/";
  if (referrer.includes("/pdfeditor/")) return "/web-apps/apps/pdfeditor/main/";
  return referrer;
}

function rewriteAlias(path, referrer = "") {
  if (APP_EDITOR_ROUTES.has(path)) return null;
  if (path === "/themes.json") return THEMES_JSON_TARGET;
  if (path.startsWith("/editor/resources/")) {
    return editorResourcesTarget(editorContextFromReferrer(referrer)) + path.slice("/editor/resources/".length);
  }
  const legacyShim = path.match(/^\/(?:statiq\/)?(asset-rewrite|document-server-shim|asc-desktop-fonts|custom-fonts-merge|custom-fonts-picker)\.js$/);
  if (legacyShim) return `/office-shims/${legacyShim[1]}.js`;
  for (const [from, to] of EDITOR_ALIASES) {
    if (path.startsWith(from)) return to + path.slice(from.length);
  }
  return null;
}

const CACHE = "statiq-FIZrBjqpnXGnJQAEul6J1";

// App shell only. Editor runtimes are downloaded from Settings, not on first visit.
const PRECACHE = [
  withBase("/"),
  withBase("/manifest.json"),
  withBase("/offline-pack.json"),
  withBase("/icons/logo.png"),
  withBase("/icons/icon-192.png"),
  withBase("/icons/icon-512.png"),
  withBase("/icons/word.png"),
  withBase("/icons/excel.png"),
  withBase("/icons/powerpoint.png"),
  withBase("/editor/"),
  withBase("/editor/word/"),
  withBase("/editor/cell/"),
  withBase("/editor/slide/"),
  withBase("/editor/pdf/"),
  withBase("/settings/"),
  withBase("/comparison/"),
  withBase("/office-shims/asset-rewrite.js"),
  withBase("/office-shims/document-server-shim.js"),
  withBase("/office-shims/asc-desktop-fonts.js"),
  withBase("/office-shims/custom-fonts-merge.js"),
  withBase("/office-shims/custom-fonts-picker.js"),
  withBase("/office-shims/pwa-file-launch.js"),
];

async function isPackComplete(cache) {
  const probes = [
    withBase("/__offline_complete__/core"),
    withBase("/__offline_complete__/full"),
  ];
  for (const probe of probes) {
    const request = new Request(new URL(probe, self.location.origin));
    if (
      (await cache.match(request, { ignoreSearch: true })) ||
      (await caches.match(request, { ignoreSearch: true }))
    ) {
      return true;
    }
  }
  return false;
}

async function cacheFirst(request, cache) {
  const cached =
    (await cache.match(request, { ignoreSearch: true })) ||
    (await caches.match(request, { ignoreSearch: true }));
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cache) {
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const cached =
      (await cache.match(request, { ignoreSearch: true })) ||
      (await caches.match(request, { ignoreSearch: true }));
    if (cached) return cached;
    throw new Error("offline and not cached: " + request.url);
  }
}

async function staleWhileRevalidate(event, request, cache) {
  const cached =
    (await cache.match(request, { ignoreSearch: true })) ||
    (await caches.match(request, { ignoreSearch: true }));

  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(network);
    return cached;
  }

  const fresh = await network;
  if (fresh) return fresh;

  if (request.mode === "navigate") {
    const path = stripBase(new URL(request.url).pathname);
    const routeFallback =
      path.startsWith("/settings") ? withBase("/settings/") :
      path.startsWith("/comparison") ? withBase("/comparison/") :
      path.startsWith("/editor") ? withBase("/editor/") :
      withBase("/");
    const fallback = await cache.match(routeFallback, { ignoreSearch: true });
    if (fallback) return fallback;
  }
  throw new Error("offline and not cached: " + request.url);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith("statiq-") && key !== CACHE).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method === "HEAD") {
    const getRequest = new Request(request.url, { method: "GET" });
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached =
          (await cache.match(getRequest, { ignoreSearch: true })) ||
          (await caches.match(getRequest, { ignoreSearch: true }));
        if (cached) {
          return new Response(null, { status: cached.status, headers: cached.headers });
        }
        try {
          const response = await fetch(getRequest);
          return new Response(null, { status: response.status, headers: response.headers });
        } catch {
          return new Response(null, { status: 504 });
        }
      }),
    );
    return;
  }
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const path = stripBase(url.pathname);

  if (path === "/offline-pack.json" || path.startsWith("/offline-packs/")) {
    event.respondWith(fetch(request));
    return;
  }

  const aliased = rewriteAlias(path, request.referrer || "");
  if (aliased) {
    const target = new URL(request.url);
    target.pathname = withBase(aliased);
    event.respondWith(
      caches.open(CACHE).then((cache) => cacheFirst(new Request(target.href), cache)),
    );
    return;
  }

  const isMutableFontBinary = path.startsWith("/api/fonts/binary/");

  const isOfficeAsset =
    path.startsWith("/sdkjs-plugins/") ||
    path.startsWith("/sdkjs/") ||
    path.startsWith("/web-apps/") ||
    path.startsWith("/fonts/") ||
    path.startsWith("/x2t/") ||
    path.startsWith("/allfontsgen/") ||
    path.startsWith("/office-shims/") ||
    path.startsWith("/templates/") ||
    path === "/plugins.json";

  const isStaticChunk = path.startsWith("/_next/static/");

  if (isMutableFontBinary) {
    event.respondWith(
      caches.open(CACHE).then((cache) => networkFirst(request, cache)),
    );
    return;
  }

  const isBrandIcon = path.startsWith("/icons/");

  if (isOfficeAsset || isStaticChunk || isBrandIcon) {
    event.respondWith(caches.open(CACHE).then((cache) => cacheFirst(request, cache)));
    return;
  }

  if (request.mode === "navigate" || path.endsWith(".html") || path.endsWith("/")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        if (await isPackComplete(cache)) return cacheFirst(request, cache);
        return staleWhileRevalidate(event, request, cache);
      }),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then((cache) => staleWhileRevalidate(event, request, cache)),
  );
});
