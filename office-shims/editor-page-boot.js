/**
 * Runs before React hydrates the editor route. Starts DocsAPI so mount()
 * does not wait on api.js. Compile warmup belongs on the home screen —
 * starting it here would compete with the real editor iframe.
 */
(function () {
  var match = location.pathname.match(/\/editor\/(word|cell|slide|pdf)/);
  if (!match) return;
  if (window.DocsAPI) return;

  var base =
    typeof window.__STATIQ_BASE_PATH__ === "string" ? window.__STATIQ_BASE_PATH__ : "";
  var api = document.createElement("script");
  api.src = base + "/web-apps/apps/api/documents/api.js";
  api.async = true;
  document.head.appendChild(api);
})();
