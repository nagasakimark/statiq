(function () {
  "use strict";

  if (window.__statiqDocShimInstalled) return;
  window.__statiqDocShimInstalled = true;

  function normalizePath(pathname) {
    return pathname.replace(/\/+$/, "") || "/";
  }

  function isDocumentServerPath(pathname) {
    var path = normalizePath(pathname);
    if (/\/downloadfile\/[^/]+$/i.test(path)) return true;
    if (/\/downloadas\/[^/]+$/i.test(path)) return true;
    if (/\/upload\/[^/]+$/i.test(path)) return true;
    if (/^\/[0-9a-z]{6,16}$/i.test(path)) return true;
    return false;
  }

  function getBridge() {
    try {
      if (window.parent && window.parent !== window && window.parent.__statiqBridge) {
        return window.parent.__statiqBridge;
      }
    } catch (e) {
      /* cross-origin */
    }
    return window.__statiqBridge || null;
  }

  function mockXhrResponse(xhr, response) {
    return response.text().then(function (text) {
      Object.defineProperty(xhr, "status", { value: response.status, configurable: true });
      Object.defineProperty(xhr, "statusText", { value: response.statusText, configurable: true });
      Object.defineProperty(xhr, "response", { value: text, configurable: true });
      Object.defineProperty(xhr, "responseText", { value: text, configurable: true });
      Object.defineProperty(xhr, "responseURL", { value: response.url, configurable: true });
      Object.defineProperty(xhr, "readyState", { value: 4, configurable: true });
      xhr.dispatchEvent(new Event("readystatechange"));
      xhr.dispatchEvent(new ProgressEvent("load"));
      xhr.dispatchEvent(new ProgressEvent("loadend"));
    });
  }

  var NativeXHR = window.XMLHttpRequest;
  var nativeOpen = NativeXHR.prototype.open;
  var nativeSend = NativeXHR.prototype.send;
  var nativeSetHeader = NativeXHR.prototype.setRequestHeader;

  NativeXHR.prototype.open = function (method, url, async, username, password) {
    this._soMethod = method;
    this._soUrl = String(url);
    this._soAsync = async !== false;
    this._soHeaders = {};
    this._soMocked = false;
    return nativeOpen.apply(this, arguments);
  };

  NativeXHR.prototype.setRequestHeader = function (name, value) {
    this._soHeaders = this._soHeaders || {};
    this._soHeaders[name] = value;
    if (!this._soMocked) return nativeSetHeader.apply(this, arguments);
  };

  NativeXHR.prototype.send = function (body) {
    var xhr = this;
    if (!xhr._soAsync || !xhr._soUrl) {
      return nativeSend.call(xhr, body);
    }

    var pathname = "";
    try {
      pathname = new URL(xhr._soUrl, window.location.origin).pathname;
    } catch (e) {
      return nativeSend.call(xhr, body);
    }

    if (!isDocumentServerPath(pathname)) {
      return nativeSend.call(xhr, body);
    }

    var bridge = getBridge();
    if (!bridge || typeof bridge.handleDocumentRequest !== "function") {
      return nativeSend.call(xhr, body);
    }

    var headers = new Headers(xhr._soHeaders || {});
    var req = new Request(xhr._soUrl, {
      method: xhr._soMethod || "GET",
      headers: headers,
      body: body || undefined,
    });

    void bridge.handleDocumentRequest(req).then(function (response) {
      if (!response) {
        nativeSend.call(xhr, body);
        return;
      }
      xhr._soMocked = true;
      return mockXhrResponse(xhr, response);
    }).catch(function () {
      nativeSend.call(xhr, body);
    });
  };
})();
