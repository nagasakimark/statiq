/**
 * Runs before React. Chrome holds PWA "Open with" files until setConsumer.
 * Persist the FileSystemFileHandle (tiny) then go to /editor/{type}/?id= so a later
 * service-worker reload cannot drop an in-memory pending Map.
 */
(function () {
  var BASE = window.__STATIQ_BASE_PATH__ || "";
  var DB_NAME = "statiq-launches";
  var STORE = "pending";
  var PENDING_KEY = "statiq-pwa-pending";

  window.__STATIQ_LAUNCH_CONSUMER = true;

  function documentTypeFromName(name) {
    var ext = String(name || "").split(".").pop().toLowerCase();
    var map = {
      docx: "word",
      doc: "word",
      odt: "word",
      rtf: "word",
      txt: "word",
      epub: "word",
      xlsx: "cell",
      xls: "cell",
      ods: "cell",
      csv: "cell",
      pptx: "slide",
      ppt: "slide",
      odp: "slide",
      pdf: "pdf",
    };
    return map[ext];
  }

  function editorUrl(id, type) {
    var encoded = encodeURIComponent(id);
    if (type) return BASE + "/editor/" + type + "/?id=" + encoded;
    return BASE + "/editor/?id=" + encoded;
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  function putPending(record) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(record);
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  function navigateTo(id, type) {
    if (typeof window.__STATIQ_PWA_NAVIGATE === "function") {
      window.__STATIQ_PWA_NAVIGATE(id);
      return;
    }
    var dest = editorUrl(id, type);
    var here = location.pathname + location.search;
    if (here !== dest && here !== dest.replace(/\/\?/, "?")) {
      location.replace(dest);
    }
  }

  async function consume(handles) {
    if (!handles || !handles.length) return;
    var ids = [];
    for (var i = 0; i < handles.length; i++) {
      var handle = handles[i];
      var id =
        crypto.randomUUID ? crypto.randomUUID() : "launch-" + Date.now() + "-" + i;
      var record = {
        id: id,
        name: handle.name || "Untitled",
        handle: handle,
        createdAt: Date.now(),
      };
      try {
        await putPending(record);
        sessionStorage.setItem(PENDING_KEY, id);
      } catch (error) {
        console.warn("PWA launch persist failed", error);
        try {
          sessionStorage.setItem(PENDING_KEY, id);
        } catch (e) {
          /* private mode */
        }
      }
      ids.push(id);
      navigateTo(id, documentTypeFromName(handle.name));
    }
    try {
      if (ids.length > 1) sessionStorage.setItem("statiq-pwa-pending-ids", JSON.stringify(ids));
    } catch (e) {
      /* private mode */
    }
  }

  if (!("launchQueue" in window) || !window.launchQueue) return;
  window.launchQueue.setConsumer(function (params) {
    consume(params.files || []).catch(function (error) {
      console.error("PWA file launch failed", error);
    });
  });
})();
