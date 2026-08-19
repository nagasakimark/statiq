(function () {
  "use strict";

  function editorResourcesTarget(contextPath) {
    var path = contextPath || window.location.pathname || "";
    if (path.indexOf("/presentationeditor/") >= 0 || /\/editor\/slide(?:\/|$|\?)/.test(path)) {
      return "/web-apps/apps/presentationeditor/main/resources/";
    }
    if (path.indexOf("/spreadsheeteditor/") >= 0 || /\/editor\/cell(?:\/|$|\?)/.test(path)) {
      return "/web-apps/apps/spreadsheeteditor/main/resources/";
    }
    if (path.indexOf("/documenteditor/") >= 0 || /\/editor\/word(?:\/|$|\?)/.test(path)) {
      return "/web-apps/apps/documenteditor/main/resources/";
    }
    if (path.indexOf("/pdfeditor/") >= 0 || /\/editor\/pdf(?:\/|$|\?)/.test(path)) {
      return "/web-apps/apps/pdfeditor/main/resources/";
    }
    return "/web-apps/apps/common/main/resources/";
  }

  var ALIASES = [
    ["/editor/word/", "/web-apps/apps/documenteditor/main/"],
    ["/editor/cell/", "/web-apps/apps/spreadsheeteditor/main/"],
    ["/editor/slide/", "/web-apps/apps/presentationeditor/main/"],
    ["/editor/pdf/", "/web-apps/apps/pdfeditor/main/"],
    ["/editor/visio/", "/web-apps/apps/visioeditor/main/"],
  ];

  function isAppEditorPath(path) {
    return (
      path === "/editor" ||
      path === "/editor/" ||
      /^\/editor\/(?:word|cell|slide|pdf)\/?(?:index\.(?:html|txt))?$/.test(path)
    );
  }

  var OFFICE_ROOT_PREFIXES = [
    "/web-apps/",
    "/sdkjs-plugins/",
    "/sdkjs/",
    "/fonts/",
    "/x2t/",
    "/office-shims/",
    "/common/main/",
    "/plugins.json",
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

  // ONLYOFFICE attempts to register its document worker at the repository
  // root, which would replace the PWA worker controlling the whole app.
  if (navigator.serviceWorker && !navigator.serviceWorker.__statiqRegisterPatched) {
    var nativeRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = function (scriptURL, options) {
      if (String(scriptURL).indexOf("document_editor_service_worker.js") >= 0) {
        var scope = withBase("/");
        return navigator.serviceWorker.getRegistration(scope).then(function (registration) {
          return registration || nativeRegister(withBase("/sw.js"), { scope: scope });
        });
      }
      return nativeRegister(scriptURL, options);
    };
    navigator.serviceWorker.__statiqRegisterPatched = true;
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

      if (path === "/themes.json") {
        resolved.pathname = withBase("/web-apps/apps/common/main/resources/themes/themes.json");
        return resolved.href;
      }
      if (path.indexOf("/editor/resources/") === 0) {
        resolved.pathname = withBase(editorResourcesTarget(window.location.pathname) + path.slice("/editor/resources/".length));
        return resolved.href;
      }
      if (!path.startsWith("/")) path = "/" + path;

      if (isAppEditorPath(path)) return url;

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
