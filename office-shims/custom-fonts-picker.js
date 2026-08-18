/**
 * Append compiled custom fonts to the editor font dropdown.
 *
 * sdk-all-min never reads __fonts_infos from AllFonts.js, so Layer A (catalog)
 * must hook the web-apps Fonts collection. Parent-page inject runs too early
 * (Common / PE not loaded yet). This shim patches NotificationCenter.trigger
 * inside the editor iframe so customs are merged before ComboBoxFonts.fillFonts.
 */
(function () {
  "use strict";

  var MANIFEST_KEY = "statiq-custom-font-manifest";
  /** Stock rows in fonts_thumbnail sprite / __fonts_infos before customs. */
  var STOCK_FONT_ROWS = 144;

  function readManifest() {
    try {
      var raw = window.__statiqFontManifestRaw;
      if (!raw) {
        try {
          if (window.parent && window.parent !== window && window.parent.__statiqFontManifestRaw) {
            raw = window.parent.__statiqFontManifestRaw;
          }
        } catch (e) {
          raw = null;
        }
      }
      if (!raw && typeof localStorage !== "undefined") {
        raw = localStorage.getItem(MANIFEST_KEY);
      }
      if (!raw) return null;
      var manifest = JSON.parse(raw);
      if (!manifest || !manifest.infos || !manifest.infos.length) return null;
      return manifest;
    } catch (e) {
      return null;
    }
  }

  function collectionNames(collection) {
    var names = Object.create(null);
    if (!collection) return names;
    if (typeof collection.each === "function") {
      collection.each(function (model) {
        var n = model.get && model.get("name");
        if (n) names[n] = true;
      });
      return names;
    }
    var models = collection.models || [];
    for (var i = 0; i < models.length; i++) {
      var name = models[i].get && models[i].get("name");
      if (name) names[name] = true;
    }
    return names;
  }

  function appendCustomFonts(collection) {
    var manifest = readManifest();
    if (!manifest || !collection || typeof collection.add !== "function") return 0;

    var Common = window.Common;
    if (!Common) return 0;

    var existing = collectionNames(collection);
    var toAdd = [];
    var ui = Common.UI;

    for (var i = 0; i < manifest.infos.length; i++) {
      var family = manifest.infos[i] && manifest.infos[i][0];
      if (!family || existing[family]) continue;
      toAdd.push({
        id: ui && ui.getId ? ui.getId() : "statiq-font-" + i,
        name: family,
        imgidx: STOCK_FONT_ROWS + i,
        type: 1,
      });
    }

    if (!toAdd.length) return 0;
    collection.add(toAdd);
    return toAdd.length;
  }

  function patchNotificationCenter() {
    if (!window.Common || !Common.NotificationCenter) return false;
    var nc = Common.NotificationCenter;
    if (nc.__statiqFontsPickerPatched) return true;

    var origTrigger = nc.trigger;
    if (typeof origTrigger !== "function") return false;

    nc.trigger = function (event) {
      if (event === "fonts:load" && arguments.length > 1) {
        var added = appendCustomFonts(arguments[1]);
        if (added > 0) {
          try {
            console.info("Statiq: added " + added + " custom font(s) to picker");
          } catch (e) {}
        }
      }
      return origTrigger.apply(this, arguments);
    };

    nc.__statiqFontsPickerPatched = true;
    return true;
  }

  function injectIfReady() {
    patchNotificationCenter();
    var manifest = readManifest();
    if (!manifest) return;

    var app = window.PE || window.DE || window.SSE || window.PDFE || window.VE;
    if (!app || typeof app.getController !== "function") return;

    var ctrl = app.getController("Common.Controllers.Fonts");
    if (!ctrl || typeof ctrl.getCollection !== "function") return;

    var col = ctrl.getCollection("Common.Collections.Fonts");
    if (!col || !col.length) return;

    var added = appendCustomFonts(col);
    if (added > 0 && Common.NotificationCenter) {
      Common.NotificationCenter.trigger("fonts:load", col);
      try {
        Common.NotificationCenter.trigger("statiq:fonts-sprite-ready");
      } catch (e) {}
    }
  }

  // Cache manifest early (same pattern as asc-desktop-fonts.js).
  try {
    var cached = localStorage.getItem(MANIFEST_KEY);
    if (cached) window.__statiqFontManifestRaw = cached;
  } catch (e) {}

  var tries = 0;
  var timer = setInterval(function () {
    tries += 1;
    if (patchNotificationCenter()) {
      injectIfReady();
    }
    if (tries > 160) clearInterval(timer);
  }, 200);
})();
