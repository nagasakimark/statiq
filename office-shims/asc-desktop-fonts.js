(function () {
  "use strict";

  function withBase(path) {
    var base = window.__STATIQ_BASE_PATH__ || "";
    if (!path) return base || "/";
    if (path.charAt(0) !== "/") path = "/" + path;
    if (!base) return path;
    if (path === base || path.indexOf(base + "/") === 0) return path;
    return base + path;
  }

  var FONT_XOR_KEY = [160, 102, 214, 32, 20, 150, 71, 250, 149, 105, 184, 80, 176, 65, 73, 72];
  var EMPTY_PLUGINS = JSON.stringify([
    { url: "", pluginsData: [] },
    { url: "", pluginsData: [] },
  ]);
  var DEFAULT_THEME = { id: "theme-classic-light", type: "light", system: "disabled" };

  function configuredTheme() {
    var id = "";
    try {
      id = new URLSearchParams(window.location.search).get("uitheme") || "";
    } catch (e) {}
    if (!id) {
      try {
        var settings = JSON.parse(localStorage.getItem("statiq-app-settings") || "{}");
        id = settings.editorTheme || "";
      } catch (e) {}
    }
    if (!id) return DEFAULT_THEME;
    return {
      id: id,
      type: /(?:dark|night)/i.test(id) ? "dark" : "light",
      system: "disabled",
    };
  }

  function noop() {}

  function deobfuscateFontBytes(bytes) {
    var limit = Math.min(32, bytes.length);
    for (var i = 0; i < limit; i++) {
      bytes[i] ^= FONT_XOR_KEY[i % 16];
    }
    return bytes;
  }

  function fontStore() {
    if (!window.__statiqFontStore) {
      window.__statiqFontStore = Object.create(null);
    }
    return window.__statiqFontStore;
  }

  function bytesToBase64(bytes) {
    var binary = "";
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function isLikelyOpenTypeFontBytes(bytes) {
    if (!bytes || bytes.length < 4) return false;
    return (
      (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) ||
      (bytes[0] === 0x4f && bytes[1] === 0x54 && bytes[2] === 0x54 && bytes[3] === 0x4f) ||
      (bytes[0] === 0x74 && bytes[1] === 0x72 && bytes[2] === 0x75 && bytes[3] === 0x65)
    );
  }

  function decodeDesktopPayload(payload) {
    if (!payload) return null;
    var base64 = payload;
    if (/^\d+;/.test(payload)) {
      base64 = payload.slice(payload.indexOf(";") + 1);
    }
    try {
      var binary = atob(base64);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i) & 0xff;
      }
      return bytes;
    } catch (e) {
      return null;
    }
  }

  function toDesktopPayload(bytes) {
    return bytes.length + ";" + bytesToBase64(bytes);
  }

  function ensureDeobfuscatedPayload(payload) {
    if (!payload) return null;

    var normalized = payload;
    if (!/^\d+;/.test(payload)) {
      try {
        var raw = atob(payload);
        normalized = raw.length + ";" + payload;
      } catch (e) {
        return null;
      }
    }

    var bytes = decodeDesktopPayload(normalized);
    if (!bytes || !bytes.length) return null;

    if (!isLikelyOpenTypeFontBytes(bytes)) {
      deobfuscateFontBytes(bytes);
    }
    if (!isLikelyOpenTypeFontBytes(bytes)) return null;

    return toDesktopPayload(bytes);
  }

  var FONT_SEED_KEY = "statiq-custom-font-seed";
  var FONT_MANIFEST_KEY = "statiq-custom-font-manifest";

  function readSeedMap() {
    try {
      var raw = localStorage.getItem(FONT_SEED_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function readManifest() {
    try {
      var raw = localStorage.getItem(FONT_MANIFEST_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function readManifestBinaries() {
    var manifest = readManifest();
    return manifest && manifest.binaries ? manifest.binaries : null;
  }

  function isCustomFontId(name) {
    var manifest = readManifest();
    if (manifest && manifest.files && manifest.files.indexOf(String(name)) !== -1) return true;
    var numericId = parseInt(String(name), 10);
    return isFinite(numericId) && numericId >= 218;
  }

  function readParentCustomFont(name) {
    try {
      var loader = window.parent && window.parent.__statiqLoadCustomFontBase64;
      if (typeof loader !== "function") return "";
      return ensureDeobfuscatedPayload(loader(String(name))) || "";
    } catch (e) {
      return "";
    }
  }

  function readDiskIdSet() {
    var manifest = readManifest();
    var set = Object.create(null);
    if (!manifest) return set;
    if (manifest.diskIds) {
      for (var i = 0; i < manifest.diskIds.length; i++) {
        set[manifest.diskIds[i]] = true;
      }
    }
    return set;
  }

  function assignFontPayload(name, payload) {
    var normalized = ensureDeobfuscatedPayload(payload);
    if (!name || !normalized) return;
    fontStore()[name] = normalized;
    try {
      window[name] = normalized;
    } catch (e) {
      // Numeric ids cannot become expando props on Window in some engines.
    }
  }

  function syncFetchObfuscatedBinary(url) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, false);
    xhr.overrideMimeType("text/plain; charset=x-user-defined");
    xhr.send();
    if (xhr.status !== 200) return null;

    var text = xhr.responseText;
    var bytes = new Uint8Array(text.length);
    for (var i = 0; i < text.length; i++) {
      bytes[i] = text.charCodeAt(i) & 0xff;
    }
    return bytes;
  }

  function fetchAndCacheFontBinary(name) {
    var parentPayload = readParentCustomFont(name);
    if (parentPayload) {
      assignFontPayload(name, parentPayload);
      return parentPayload;
    }
    // Custom IDs are browser-local. They can never exist in the immutable
    // GitHub Pages /fonts directory, so do not emit a misleading 404.
    if (isCustomFontId(name)) return "";

    var origin = window.location.origin;
    var urls = [origin + withBase("/fonts/" + name)];
    if (!window.__STATIQ_BASE_PATH__) {
      urls.unshift(origin + withBase("/api/fonts/binary/" + name + "/"));
    }

    for (var u = 0; u < urls.length; u++) {
      var bytes = syncFetchObfuscatedBinary(urls[u]);
      if (!bytes || !bytes.length) continue;

      deobfuscateFontBytes(bytes);
      if (!isLikelyOpenTypeFontBytes(bytes)) continue;

      var payload = toDesktopPayload(bytes);
      assignFontPayload(name, payload);
      return payload;
    }

    return "";
  }

  function fetchFontPayloadAsync(name) {
    if (fontStore()[name]) return Promise.resolve(fontStore()[name]);
    var parentPayload = readParentCustomFont(name);
    if (parentPayload) {
      assignFontPayload(name, parentPayload);
      return Promise.resolve(parentPayload);
    }
    if (isCustomFontId(name)) return Promise.resolve(null);

    var origin = window.location.origin;
    var urls = [origin + withBase("/fonts/" + name)];
    if (!window.__STATIQ_BASE_PATH__) {
      urls.unshift(origin + withBase("/api/fonts/binary/" + name + "/"));
    }

    function tryUrl(index) {
      if (index >= urls.length) return Promise.resolve(null);
      return fetch(urls[index])
        .then(function (response) {
          if (!response.ok) return tryUrl(index + 1);
          return response.arrayBuffer();
        })
        .then(function (buffer) {
          if (!buffer) return tryUrl(index + 1);
          var bytes = new Uint8Array(buffer);
          deobfuscateFontBytes(bytes);
          if (!isLikelyOpenTypeFontBytes(bytes)) return tryUrl(index + 1);
          var payload = toDesktopPayload(bytes);
          assignFontPayload(name, payload);
          return payload;
        })
        .catch(function () {
          return tryUrl(index + 1);
        });
    }

    return tryUrl(0);
  }

  function prewarmManifestFonts() {
    var manifest = readManifest();
    if (!manifest || !manifest.files || !manifest.files.length) return;

    var diskOnly = readDiskIdSet();

    for (var i = 0; i < manifest.files.length; i++) {
      var id = manifest.files[i];
      if (!id || fontStore()[id] || diskOnly[id]) continue;
      fetchAndCacheFontBinary(id);
    }
  }

  function preloadCriticalFontsAsync() {
    var CJK_FALLBACK_IDS = ["081", "134", "217"];
    var manifest = readManifest();
    var ids = CJK_FALLBACK_IDS.slice();
    if (manifest && manifest.files) {
      for (var i = 0; i < manifest.files.length; i++) {
        ids.push(manifest.files[i]);
      }
    }
    var seen = Object.create(null);
    for (var j = 0; j < ids.length; j++) {
      var fid = ids[j];
      if (!fid || seen[fid] || fontStore()[fid]) continue;
      seen[fid] = true;
      fetchFontPayloadAsync(fid);
    }
  }

  function hydrateSeedCache() {
    var seed = readSeedMap();
    if (seed) {
      for (var id in seed) {
        if (Object.prototype.hasOwnProperty.call(seed, id) && seed[id]) {
          assignFontPayload(id, seed[id]);
        }
      }
    }

    var manifestBinaries = readManifestBinaries();
    if (manifestBinaries) {
      for (var mid in manifestBinaries) {
        if (Object.prototype.hasOwnProperty.call(manifestBinaries, mid) && manifestBinaries[mid]) {
          assignFontPayload(mid, manifestBinaries[mid]);
        }
      }
    }

    prewarmManifestFonts();
    preloadCriticalFontsAsync();
  }

  hydrateSeedCache();

  // Cache manifest for AllFonts.js merge (runs later via require). Same window.
  try {
    var cachedManifest = localStorage.getItem("statiq-custom-font-manifest");
    if (cachedManifest) window.__statiqFontManifestRaw = cachedManifest;
  } catch (e) {
    /* localStorage may be unavailable */
  }

  /**
   * Extend the stock font thumbnail sprite with one row per custom font, rendered
   * with the real face via FontFace. ComboBoxFonts (patched) prefers
   * window.__statiqFontsSprite[ratio] over the stock sprite path.
   *
   * Custom fonts are appended to __fonts_infos, so their imgidx values are
   * stockRows, stockRows+1, … — rows here must stay aligned with that ordinal.
   */
  function notifyFontSpritesReady() {
    window.__statiqFontsSpriteReady = true;
    function fire() {
      try {
        if (window.Common && Common.NotificationCenter) {
          Common.NotificationCenter.trigger("statiq:fonts-sprite-ready");
          return true;
        }
      } catch (e) {}
      return false;
    }
    if (fire()) return;
    // Sprite gen often finishes before web-apps boots — retry briefly.
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      if (fire() || tries > 40) clearInterval(timer);
    }, 250);
  }

  function generateFontSprites() {
    var manifest = readManifest();
    if (!manifest || !manifest.files || !manifest.files.length || !manifest.infos) return;
    if (typeof FontFace === "undefined") return;

    // Keep one slot per manifest.infos entry so row index == stockRows + infoIndex
    // matches SDK imgidx (position in concatenated __fonts_infos).
    var entries = [];
    for (var i = 0; i < manifest.infos.length; i++) {
      var family = (manifest.infos[i] && manifest.infos[i][0]) || "";
      entries.push({
        family: family,
        fileId: manifest.files[i],
        infoIndex: i,
      });
    }
    if (!entries.length) return;

    window.__statiqFontsSpritePending = true;

    function loadFontFace(entry) {
      if (!entry.family || !entry.fileId) return Promise.resolve(null);
      var payload =
        fontStore()[entry.fileId] ||
        ensureDeobfuscatedPayload((readManifestBinaries() || {})[entry.fileId]);

      function fromPayload(p) {
        if (!p) return Promise.resolve(null);
        var bytes = decodeDesktopPayload(p);
        if (!bytes || !bytes.length) return Promise.resolve(null);
        try {
          var copy = bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength
          );
          var face = new FontFace(entry.family, copy);
          return face
            .load()
            .then(function (loaded) {
              document.fonts.add(loaded);
              return loaded;
            })
            .catch(function () {
              return null;
            });
        } catch (e) {
          return Promise.resolve(null);
        }
      }

      if (payload) return fromPayload(payload);
      return fetchFontPayloadAsync(entry.fileId).then(fromPayload);
    }

    var faceLoads = entries.map(loadFontFace);

    var lang = String(window.lang || "en").split(/[\-\_]/)[0];
    var ea = /^(zh|ja|ko)$/i.test(lang) ? "_ea" : "";
    var ratios = [
      { suffix: "", r: 1 },
      { suffix: "@1.25x", r: 1.25 },
      { suffix: "@1.5x", r: 1.5 },
      { suffix: "@1.75x", r: 1.75 },
      { suffix: "@2x", r: 2 },
    ];

    Promise.all(faceLoads).then(function () {
      var pending = ratios.length;
      var completed = 0;

      function ratioDone() {
        completed += 1;
        if (completed >= pending) {
          window.__statiqFontsSpritePending = false;
          notifyFontSpritesReady();
        }
      }

      ratios.forEach(function (cfg) {
        var img = new Image();
        img.onload = function () {
          try {
            var rowH = Math.round(28 * cfg.r);
            var stockRows = Math.round(img.naturalHeight / rowH);
            var canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight + rowH * entries.length;
            var ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            ctx.fillStyle = "#000";
            ctx.textBaseline = "middle";
            for (var i = 0; i < entries.length; i++) {
              if (!entries[i].family) continue;
              ctx.font = Math.round(16 * cfg.r) + 'px "' + entries[i].family + '", sans-serif';
              ctx.fillText(
                entries[i].family,
                Math.round(2 * cfg.r),
                (stockRows + entries[i].infoIndex) * rowH + Math.round(rowH / 2),
                canvas.width - Math.round(4 * cfg.r)
              );
            }
            window.__statiqFontsSprite = window.__statiqFontsSprite || {};
            window.__statiqFontsSprite[cfg.r] = canvas.toDataURL("image/png");
          } catch (e) {
            console.warn("Custom font sprite generation failed", e);
          }
          ratioDone();
        };
        img.onerror = function () {
          console.warn("Custom font sprite stock image failed", cfg.suffix);
          ratioDone();
        };
        img.src = withBase("/sdkjs/common/Images/fonts_thumbnail" + ea + cfg.suffix + ".png");
      });
    });
  }

  try {
    generateFontSprites();
  } catch (e) {
    console.warn("Custom font sprite bootstrap failed", e);
  }

  function loadFontBase64(name) {
    if (!name) return "";
    var cache = fontStore();
    if (cache[name]) return cache[name];

    var seed = readSeedMap();
    if (seed && seed[name]) {
      assignFontPayload(name, seed[name]);
      if (cache[name]) return cache[name];
    }

    var manifestBinaries = readManifestBinaries();
    if (manifestBinaries && manifestBinaries[name]) {
      assignFontPayload(name, manifestBinaries[name]);
      if (cache[name]) return cache[name];
    }

    var parentPayload = readParentCustomFont(name);
    if (parentPayload) {
      assignFontPayload(name, parentPayload);
      if (cache[name]) return cache[name];
    }

    if (isCustomFontId(name)) {
      console.warn("LoadFontBase64: custom font is not ready in local storage", name);
      return "";
    }

    var payload = fetchAndCacheFontBinary(name);
    if (!payload) {
      console.warn("LoadFontBase64: no binary for", name);
    }
    return payload;
  }

  function getFontsSprite(suffix) {
    suffix = suffix || "";
    var lang = String(window.lang || "en").split(/[\-\_]/)[0];
    var ea = /^(zh|ja|ko)$/i.test(lang) ? "_ea" : "";
    return withBase("/sdkjs/common/Images/fonts_thumbnail" + ea + suffix + ".png");
  }

  function ensureRendererProcessVariable() {
    window.RendererProcessVariable = window.RendererProcessVariable || {};
    if (!window.RendererProcessVariable.theme) {
      window.RendererProcessVariable.theme = configuredTheme();
    }
    if (!window.RendererProcessVariable.localthemes) {
      window.RendererProcessVariable.localthemes = {};
    }
    return window.RendererProcessVariable.theme;
  }

  function wireDesktopShell(editor) {
    var theme = ensureRendererProcessVariable();
    editor.theme = editor.theme || theme;
    editor.features = editor.features || {};
    window.desktop = editor;
    window.uitheme = window.uitheme || {};
    if (!window.uitheme.id) {
      window.uitheme.id = theme.id;
      window.uitheme.type = theme.type;
    }
  }

  var existing = window.AscDesktopEditor || {};
  window.AscDesktopEditor = existing;
  existing.IsLocalFile = existing.IsLocalFile || function () {
    return true;
  };
  existing.IsSupportMedia = existing.IsSupportMedia || function () {
    return true;
  };
  existing.LoadFontBase64 = loadFontBase64;
  existing.getFontsSprite = existing.getFontsSprite || getFontsSprite;
  // Force ComboBoxFonts onto the PNG path so __statiqFontsSprite (extended with
  // custom-font rows) is used. Stock .bin sprites only contain 144 rows.
  existing.isSupportBinaryFontsSprite = false;
  existing.CreateEditorApi = existing.CreateEditorApi || noop;
  existing.SetFullscreen = existing.SetFullscreen || noop;
  existing.startReporter = existing.startReporter || noop;
  existing.endReporter = existing.endReporter || noop;
  existing.GetInstallPlugins = existing.GetInstallPlugins || function () {
    return EMPTY_PLUGINS;
  };
  existing.CheckNeedWheel = existing.CheckNeedWheel || function () {
    return true;
  };
  existing.Copy = existing.Copy || function () {
    try {
      return document.execCommand("copy");
    } catch (e) {
      return false;
    }
  };
  existing.Cut = existing.Cut || function () {
    try {
      return document.execCommand("cut");
    } catch (e) {
      return false;
    }
  };
  existing.Paste = existing.Paste || function () {
    try {
      return document.execCommand("paste");
    } catch (e) {
      return false;
    }
  };
  existing.execCommand = existing.execCommand || noop;
  existing.LocalFileRecents = existing.LocalFileRecents || noop;
  existing.LocalFileGetImageUrl = existing.LocalFileGetImageUrl || function (file) {
    if (!file) return "";
    return String(file).replace(/^media\//, "");
  };

  wireDesktopShell(existing);
})();
