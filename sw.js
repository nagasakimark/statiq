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
  const legacyShim = path.match(/^\/(?:statiq\/)?(asset-rewrite|document-server-shim|asc-desktop-fonts|custom-fonts-merge)\.js$/);
  if (legacyShim) return `/office-shims/${legacyShim[1]}.js`;
  for (const [from, to] of EDITOR_ALIASES) {
    if (path.startsWith(from)) return to + path.slice(from.length);
  }
  return null;
}

const CACHE = "statiq-v14";

const PRECACHE = [
  withBase("/"),
  withBase("/manifest.json"),
  withBase("/icons/logo.png"),
  withBase("/icons/icon-192.png"),
  withBase("/icons/icon-512.png"),
  withBase("/icons/word.png"),
  withBase("/icons/excel.png"),
  withBase("/icons/powerpoint.png"),
  withBase("/editor/"),
  withBase("/settings/"),
  withBase("/templates/new.docx"),
  withBase("/templates/new.xlsx"),
  withBase("/templates/new.pptx"),
  withBase("/office-shims/asset-rewrite.js"),
  withBase("/office-shims/document-server-shim.js"),
  withBase("/office-shims/asc-desktop-fonts.js"),
  withBase("/office-shims/custom-fonts-merge.js"),
  withBase("/web-apps/apps/api/documents/api.js"),
  withBase("/web-apps/apps/api/documents/preload.html"),
  withBase("/sdkjs/common/AllFonts.js"),
  withBase("/allfontsgen/allfontsgen.js"),
  withBase("/allfontsgen/allfontsgen.wasm"),
  withBase("/x2t/x2t.js"),
  withBase("/x2t/x2t.wasm"),
];

async function cacheFirst(request, cache) {
  const cached = await cache.match(request);
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
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const fallback = await cache.match(withBase("/"));
      if (fallback) return fallback;
    }
    throw new Error("offline and not cached: " + request.url);
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
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const path = stripBase(url.pathname);

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

  if (isOfficeAsset || isStaticChunk) {
    event.respondWith(caches.open(CACHE).then((cache) => cacheFirst(request, cache)));
    return;
  }

  if (request.mode === "navigate" || path.endsWith(".html") || path.endsWith("/")) {
    event.respondWith(caches.open(CACHE).then((cache) => networkFirst(request, cache)));
    return;
  }

  event.respondWith(caches.open(CACHE).then((cache) => networkFirst(request, cache)));
});
