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

/** Collapse /statiq/statiq/settings/ from links that already included basePath. */
function canonicalizePathname(pathname) {
  if (!SW_BASE) return pathname;
  const doubled = `${SW_BASE}${SW_BASE}`;
  if (pathname === doubled || pathname.startsWith(`${doubled}/`)) {
    return `${SW_BASE}${pathname.slice(doubled.length)}` || SW_BASE;
  }
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

/** Statiq app pages — never map these to ONLYOFFICE's DocumentServer aliases. */
function isStatiqAppEditorPath(path) {
  return (
    path === "/editor" ||
    path === "/editor/" ||
    /^\/editor\/(?:word|cell|slide|pdf)\/?(?:index\.(?:html|txt))?$/.test(path)
  );
}

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

/** If an older SW rewrote the address bar to ONLYOFFICE's shell, bounce back. */
const WEB_APPS_EDITOR_NAV = [
  ["/web-apps/apps/presentationeditor/main", "/editor/slide/"],
  ["/web-apps/apps/documenteditor/main", "/editor/word/"],
  ["/web-apps/apps/spreadsheeteditor/main", "/editor/cell/"],
  ["/web-apps/apps/pdfeditor/main", "/editor/pdf/"],
];

function recoverStatiqEditorNavigation(url) {
  const id = url.searchParams.get("id");
  if (!id) return null;
  const keys = [...url.searchParams.keys()];
  if (keys.some((key) => key !== "id")) return null;

  const path = stripBase(url.pathname).replace(/\/index\.html$/, "").replace(/\/$/, "");
  for (const [from, to] of WEB_APPS_EDITOR_NAV) {
    if (path === from) {
      const target = new URL(withBase(to), self.location.origin);
      target.search = url.search;
      return target.href;
    }
  }
  return null;
}

function rewriteAlias(path, referrer = "") {
  if (isStatiqAppEditorPath(path)) return null;
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

const CACHE = "statiq-cZWdzB-SH6M4byD01HvRH";

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
    if (await cache.match(request, { ignoreSearch: true })) {
      return true;
    }
  }
  return false;
}

async function matchCached(request, cache) {
  return (
    (await cache.match(request, { ignoreSearch: true })) ||
    (await caches.match(request, { ignoreSearch: true }))
  );
}

/** Next exports `/editor/slide/index.html`; navigations use `/editor/slide/?id=`. */
async function matchHtmlRoute(request, cache) {
  const direct = await matchCached(request, cache);
  if (direct) return direct;

  const url = new URL(request.url);
  const path = url.pathname;
  const candidates = [];
  if (path.endsWith("/")) {
    candidates.push(`${path}index.html`);
  } else if (!/\.[a-z0-9]+$/i.test(path)) {
    candidates.push(`${path}/`, `${path}/index.html`);
  } else if (path.endsWith(".html")) {
    candidates.push(path.replace(/\/index\.html$/, "/"));
  }

  for (const candidate of candidates) {
    const hit = await matchCached(new Request(new URL(candidate, url.origin).href), cache);
    if (hit) return hit;
  }
  return null;
}

function navigationFallbackResponse(_url) {
  return new Response("Offline", {
    status: 503,
    statusText: "Offline",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function isDocumentRequest(request) {
  return (
    request.mode === "navigate" ||
    request.destination === "document" ||
    request.destination === "iframe"
  );
}

async function appShellFallback(request, cache) {
  const path = stripBase(new URL(request.url).pathname);
  if (
    !path.startsWith("/editor") &&
    !path.startsWith("/settings") &&
    !path.startsWith("/comparison") &&
    path !== "/"
  ) {
    return null;
  }
  const routeFallback =
    path.startsWith("/settings") ? withBase("/settings/") :
    path.startsWith("/comparison") ? withBase("/comparison/") :
    path.startsWith("/editor") ? withBase("/editor/") :
    withBase("/");
  return (
    (await matchHtmlRoute(new Request(new URL(routeFallback, self.location.origin).href), cache)) ||
    (await matchHtmlRoute(new Request(new URL(withBase("/"), self.location.origin).href), cache))
  );
}

async function lookupCached(request, cache) {
  return isDocumentRequest(request)
    ? matchHtmlRoute(request, cache)
    : matchCached(request, cache);
}

async function cacheFirst(request, cache) {
  const cached = await lookupCached(request, cache);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      try {
        await cache.put(request, response.clone());
      } catch {
        /* quota or uncacheable request */
      }
      return response;
    }
  } catch {
    /* GitHub Pages 503 / dropped connection */
  }
  const fallback = (await lookupCached(request, cache)) || (await appShellFallback(request, cache));
  if (fallback) return fallback;
  if (isDocumentRequest(request)) return navigationFallbackResponse(request.url);
  return new Response("Offline", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function networkFirst(request, cache) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      try {
        await cache.put(request, response.clone());
      } catch {
        /* quota or uncacheable request */
      }
      return response;
    }
  } catch {
    /* offline */
  }
  const cached = await matchCached(request, cache);
  if (cached) return cached;
  return new Response("Offline", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function staleWhileRevalidate(event, request, cache) {
  const cached = await lookupCached(request, cache);

  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        try {
          await cache.put(request, response.clone());
        } catch {
          /* quota or uncacheable request */
        }
        return response;
      }
      return null;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(network);
    return cached;
  }

  const fresh = await network;
  if (fresh) return fresh;

  const fallback = await appShellFallback(request, cache);
  if (fallback) return fallback;
  if (isDocumentRequest(request)) return navigationFallbackResponse(request.url);
  return new Response("Offline", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function cacheHasAppShell(name) {
  try {
    const cache = await caches.open(name);
    const home = await matchHtmlRoute(
      new Request(new URL(withBase("/"), self.location.origin).href),
      cache,
    );
    return Boolean(home);
  } catch {
    return false;
  }
}

async function pruneStaleCaches({ keepPreviousAppCache }) {
  const keys = await caches.keys();
  const others = keys.filter((key) => key.startsWith("statiq-") && key !== CACHE);
  const previous = [];
  for (const key of others) {
    if (keepPreviousAppCache && (await cacheHasAppShell(key))) {
      previous.push(key);
      continue;
    }
    await caches.delete(key);
  }
  if (keepPreviousAppCache && previous.length > 1) {
    const ranked = [];
    for (const key of previous) {
      const cache = await caches.open(key);
      ranked.push({ key, complete: await isPackComplete(cache) });
    }
    ranked.sort((a, b) => Number(b.complete) - Number(a.complete));
    await Promise.all(ranked.slice(1).map(({ key }) => caches.delete(key)));
  }
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
      const cache = await caches.open(CACHE);
      await pruneStaleCaches({ keepPreviousAppCache: !(await isPackComplete(cache)) });
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "statiq-pack-complete") return;
  event.waitUntil(pruneStaleCaches({ keepPreviousAppCache: false }));
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

  const canonicalPath = canonicalizePathname(url.pathname);
  if (canonicalPath !== url.pathname) {
    url.pathname = canonicalPath;
    event.respondWith(Response.redirect(url.href, 302));
    return;
  }

  const path = stripBase(url.pathname);

  if (request.mode === "navigate" || request.destination === "document") {
    const recovered = recoverStatiqEditorNavigation(url);
    if (recovered) {
      event.respondWith(Response.redirect(recovered, 302));
      return;
    }
  }

  // Always hit the network so offline devices can see a newer changelog / pack.
  if (
    path === "/offline-pack.json" ||
    path === "/app-update.txt" ||
    path.startsWith("/offline-packs/")
  ) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          }),
      ),
    );
    return;
  }

  const isAppDocument =
    request.mode === "navigate" || request.destination === "document";
  const aliased = isAppDocument ? null : rewriteAlias(path, request.referrer || "");
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
