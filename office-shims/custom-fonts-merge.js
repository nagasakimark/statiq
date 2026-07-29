(function () {
  "use strict";

  var FONT_XOR_KEY = [160, 102, 214, 32, 20, 150, 71, 250, 149, 105, 184, 80, 176, 65, 73, 72];
  var MANIFEST_KEY = "statiq-custom-font-manifest";
  var FONT_SEED_KEY = "statiq-custom-font-seed";

  function fontStore() {
    if (!window.__statiqFontStore) {
      window.__statiqFontStore = Object.create(null);
    }
    return window.__statiqFontStore;
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

  function bytesToBase64(bytes) {
    var binary = "";
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function ensurePayload(payload) {
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
      var limit = Math.min(32, bytes.length);
      for (var i = 0; i < limit; i++) {
        bytes[i] ^= FONT_XOR_KEY[i % 16];
      }
    }
    if (!isLikelyOpenTypeFontBytes(bytes)) return null;

    return bytes.length + ";" + bytesToBase64(bytes);
  }

  function cacheFontPayload(id, payload) {
    var normalized = ensurePayload(payload);
    if (!id || !normalized) return;
    fontStore()[id] = normalized;
    try {
      window[id] = normalized;
    } catch (e) {
      // Numeric ids cannot become expando props on Window in some engines.
    }
  }

  function hydrateBinaries(binaries) {
    if (!binaries || typeof binaries !== "object") return;
    for (var id in binaries) {
      if (Object.prototype.hasOwnProperty.call(binaries, id)) {
        cacheFontPayload(id, binaries[id]);
      }
    }
  }

  function base64ToBytes(b64) {
    try {
      var binary = atob(b64);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i) & 0xff;
      }
      return bytes;
    } catch (e) {
      return null;
    }
  }

  function readInt32LE(bytes, offset) {
    return (
      (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
    );
  }

  function writeInt32LE(bytes, offset, value) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >> 8) & 0xff;
    bytes[offset + 2] = (value >> 16) & 0xff;
    bytes[offset + 3] = (value >> 24) & 0xff;
  }

  // The sdk font matcher resolves family names against records parsed from
  // g_fonts_selection_bin only. Without appending our records, custom fonts show
  // in the picker but always render with a substituted stock font.
  function mergeSelectionBin(selection) {
    if (!selection || !selection.bin) return;
    if (window.__statiqSelectionMerged) return;

    var jsVersion = window["__all_fonts_js_version__"] || 0;
    if (selection.version !== jsVersion) {
      console.warn(
        "Custom font selection version mismatch",
        selection.version,
        "!=",
        jsVersion
      );
      return;
    }

    var stock = window["g_fonts_selection_bin"];
    if (!stock) return;

    var stockBytes = base64ToBytes(stock);
    var customBytes = base64ToBytes(selection.bin);
    if (!stockBytes || stockBytes.length < 4 || !customBytes || customBytes.length <= 4) return;

    var merged = new Uint8Array(stockBytes.length + customBytes.length - 4);
    merged.set(stockBytes, 0);
    merged.set(customBytes.subarray(4), stockBytes.length);
    writeInt32LE(merged, 0, readInt32LE(stockBytes, 0) + readInt32LE(customBytes, 0));

    window["g_fonts_selection_bin"] = bytesToBase64(merged);
    window.__statiqSelectionMerged = true;
  }

  function mergeCustomFonts() {
    try {
      var raw =
        window.__statiqFontManifestRaw ||
        (typeof localStorage !== "undefined" ? localStorage.getItem(MANIFEST_KEY) : null);
      if (!raw) return;
      var manifest = JSON.parse(raw);
      if (!manifest || !manifest.files || !manifest.files.length) return;

      // Idempotent — sdk may call __statiqRemergeFonts immediately before consume.
      var files = window.__fonts_files || [];
      var infos = window.__fonts_infos || [];
      var fi;
      for (fi = 0; fi < manifest.files.length; fi++) {
        if (files.indexOf(manifest.files[fi]) < 0) files.push(manifest.files[fi]);
      }
      window.__fonts_files = files;

      var infosIn = Array.isArray(manifest.infos) ? manifest.infos : [];
      for (fi = 0; fi < infosIn.length; fi++) {
        var family = infosIn[fi] && infosIn[fi][0];
        if (!family) continue;
        var exists = false;
        for (var ki = 0; ki < infos.length; ki++) {
          if (infos[ki] && infos[ki][0] === family) {
            exists = true;
            break;
          }
        }
        if (!exists) infos.push(infosIn[fi]);
      }
      window.__fonts_infos = infos;

      hydrateBinaries(manifest.binaries);

      var seedRaw =
        typeof localStorage !== "undefined" ? localStorage.getItem(FONT_SEED_KEY) : null;
      if (seedRaw) {
        hydrateBinaries(JSON.parse(seedRaw));
      }

      mergeSelectionBin(manifest.selection);
      window.__statiqFontsMerged = infosIn.length;
    } catch (e) {
      console.warn("Custom font manifest merge failed", e);
    }
  }

  window.__statiqRemergeFonts = mergeCustomFonts;
  mergeCustomFonts();
})();
