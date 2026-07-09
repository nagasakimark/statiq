(function () {
  "use strict";

  var ALIASES = [
    ["/editor/word/", "/web-apps/apps/documenteditor/main/"],
    ["/editor/cell/", "/web-apps/apps/spreadsheeteditor/main/"],
    ["/editor/slide/", "/web-apps/apps/presentationeditor/main/"],
    ["/editor/pdf/", "/web-apps/apps/pdfeditor/main/"],
    ["/editor/visio/", "/web-apps/apps/visioeditor/main/"],
    ["/editor/resources/", "/web-apps/apps/pdfeditor/main/resources/"],
  ];

  var APP_ROUTES = {
    "/editor/word": true,
    "/editor/word/": true,
    "/editor/cell": true,
    "/editor/cell/": true,
    "/editor/slide": true,
    "/editor/slide/": true,
    "/editor/pdf": true,
    "/editor/pdf/": true,
  };

  var OFFICE_ROOT_PREFIXES = [
    "/web-apps/",
    "/sdkjs/",
    "/fonts/",
    "/x2t/",
    "/statiq/",
    "/common/main/",
  ];

  function basePath() {
    return window.__STATIQ_BASE_PATH__ || "";
  }

  function stripBase(path) {
    var base = basePath();
    if (base && path.indexOf(base) === 0) {
      path = path.slice(base.length);
      if (!path) path = "/";
      if (path.charAt(0) !== "/") path = "/" + path;
    }
    return path;
  }

  function withBase(path) {
    var base = basePath();
    if (!path) return base || "/";
    if (path.charAt(0) !== "/") path = "/" + path;
    if (!base) return path;
    if (path === base || path.indexOf(base + "/") === 0) return path;
    return base + path;
  }

  function isDocumentRelativeUrl(url) {
    if (!url || typeof url !== "string") return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return false;
    if (url.indexOf("//") === 0) return false;
    return url.charAt(0) !== "/";
  }

  function needsBasePrefix(path) {
    if (!basePath()) return false;
    if (path === basePath() || path.indexOf(basePath() + "/") === 0) return false;
    for (var i = 0; i < OFFICE_ROOT_PREFIXES.length; i++) {
      if (path.indexOf(OFFICE_ROOT_PREFIXES[i]) === 0) return true;
    }
    return false;
  }

  function rewriteUrl(url) {
    if (isDocumentRelativeUrl(url)) return url;

    try {
      var resolved = new URL(url, window.location.href);
      var path = stripBase(resolved.pathname);
      if (!path.startsWith("/")) path = "/" + path;

      if (APP_ROUTES[path]) return url;

      for (var i = 0; i < ALIASES.length; i++) {
        var from = ALIASES[i][0];
        var to = ALIASES[i][1];
        if (path.indexOf(from) === 0) {
          resolved.pathname = withBase(to + path.slice(from.length));
          return resolved.href;
        }
        var fromBare = from.slice(0, -1);
        if (path.indexOf(fromBare + "/") === 0) {
          resolved.pathname = withBase(to + path.slice(fromBare.length + 1));
          return resolved.href;
        }
      }

      if (path.indexOf("/common/main/") === 0) {
        resolved.pathname = withBase("/web-apps/apps/common/main/" + path.slice("/common/main/".length));
        return resolved.href;
      }

      if (needsBasePrefix(path)) {
        resolved.pathname = withBase(path);
        return resolved.href;
      }

      return url;
    } catch (e) {
      return url;
    }
  }

  var nativeFetch = window.fetch && window.fetch.bind(window);
  if (nativeFetch && !window.__statiqFetchPatched) {
    window.__statiqFetchPatched = true;
    window.fetch = function (input, init) {
      if (typeof input === "string") {
        input = rewriteUrl(input);
      } else if (input instanceof Request) {
        var next = rewriteUrl(input.url);
        if (next !== input.url) input = new Request(next, input);
      } else if (input && input.href) {
        input = rewriteUrl(input.href);
      }
      return nativeFetch(input, init);
    };
  }

  var xhrProto = XMLHttpRequest.prototype;
  if (!xhrProto.__statiqOpenPatched) {
    xhrProto.__statiqOpenPatched = true;
    var nativeOpen = xhrProto.open;
    xhrProto.open = function (method, url) {
      var args = Array.prototype.slice.call(arguments);
      args[1] = rewriteUrl(String(url));
      return nativeOpen.apply(this, args);
    };
  }
})();
