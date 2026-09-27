/*
 * Statiq Office — x2t conversion worker.
 *
 * Runs the ONLYOFFICE x2t WASM build in a dedicated worker instead of the page:
 *  - conversions no longer freeze the UI (big PPTX/DOCX on a Chromebook);
 *  - a WASM trap ("memory access out of bounds", "null function"...) only kills
 *    this worker. The page terminates it and starts a clean one. Re-injecting
 *    x2t.js into the same window is impossible (top-level `class ExitStatus`
 *    throws "Identifier has already been declared"), which is why the old
 *    in-page "reload and retry" path always hung for 60s and then failed.
 *
 * Protocol (all messages carry `id`):
 *   → { type: "init", jsUrl, wasmUrl, wasmModule? }
 *   ← { type: "ready", wasmModule? }            (module is sent back once for reuse)
 *   → { type: "run", files, fonts, params, output, readMedia, clearMedia }
 *   ← { type: "result", code, output, media, heapBytes }
 *   ← { type: "error", message, fatal }
 */
// Everything lives in this closure: x2t.js is loaded with importScripts into
// the worker's global scope and declares globals of its own (run, FS, ...).
(function () {
"use strict";

var WORKING_DIRS = ["/working", "/working/media", "/working/fonts", "/working/themes"];
var FONT_CACHE_FILES = ["font_selection.bin", "AllFonts.js"];

var readyPromise = null;
var broken = false;
var lastErrors = [];

function remember(line) {
  lastErrors.push(String(line));
  if (lastErrors.length > 20) lastErrors.shift();
}

function M() {
  return self.Module;
}

function isRuntimeReady() {
  var mod = M();
  return Boolean(mod && mod.calledRun && mod.FS && typeof mod._main1 === "function" && !mod.ABORT);
}

async function compileWasm(url) {
  var response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error("x2t.wasm HTTP " + response.status);
  var type = (response.headers.get("content-type") || "").toLowerCase();
  if (typeof WebAssembly.compileStreaming === "function" && type.indexOf("application/wasm") !== -1) {
    try {
      return await WebAssembly.compileStreaming(response.clone());
    } catch (error) {
      remember("compileStreaming failed, falling back: " + error);
    }
  }
  return WebAssembly.compile(await response.arrayBuffer());
}

function init(msg) {
  if (readyPromise) return readyPromise;
  readyPromise = new Promise(function (resolve, reject) {
    var settled = false;
    var compiledForReply = null;

    function done(error) {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(compiledForReply);
    }

    self.Module = {
      noInitialRun: true,
      noExitRuntime: true,
      print: function () {},
      printErr: function (text) {
        remember(text);
      },
      onAbort: function (what) {
        broken = true;
        remember("abort: " + what);
        done(new Error("x2t aborted during start-up: " + what));
      },
      instantiateWasm: function (imports, success) {
        (async function () {
          var module = msg.wasmModule instanceof WebAssembly.Module ? msg.wasmModule : null;
          if (!module) {
            module = await compileWasm(msg.wasmUrl);
            compiledForReply = module;
          }
          var instance = await WebAssembly.instantiate(module, imports);
          success(instance, module);
        })().catch(function (error) {
          broken = true;
          done(error instanceof Error ? error : new Error(String(error)));
        });
        return {};
      },
    };

    try {
      importScripts(msg.jsUrl);
    } catch (error) {
      done(new Error("Failed to load x2t.js: " + (error && error.message ? error.message : error)));
      return;
    }

    var started = Date.now();
    (function poll() {
      if (settled) return;
      if (isRuntimeReady()) {
        for (var i = 0; i < WORKING_DIRS.length; i++) {
          try {
            M().FS.mkdir(WORKING_DIRS[i]);
          } catch (e) {
            /* exists */
          }
        }
        done(null);
        return;
      }
      if (Date.now() - started > (msg.timeoutMs || 120000)) {
        done(new Error("x2t init timeout"));
        return;
      }
      setTimeout(poll, 15);
    })();
  });
  return readyPromise;
}

function mkdirp(FS, path) {
  var parts = path.split("/").filter(Boolean);
  var current = "";
  for (var i = 0; i < parts.length - 1; i++) {
    current += "/" + parts[i];
    try {
      FS.mkdir(current);
    } catch (e) {
      /* exists */
    }
  }
}

function unlinkQuiet(FS, path) {
  try {
    FS.unlink(path);
  } catch (e) {
    /* missing */
  }
}

function listDir(FS, dir) {
  try {
    return FS.readdir(dir).filter(function (name) {
      return name !== "." && name !== "..";
    });
  } catch (e) {
    return [];
  }
}

function clearDir(FS, dir) {
  var names = listDir(FS, dir);
  for (var i = 0; i < names.length; i++) unlinkQuiet(FS, dir + "/" + names[i]);
}

/** FS.readFile returns a fresh Uint8Array; make sure it owns its buffer before transfer. */
function ownedBytes(data) {
  if (typeof data === "string") {
    var out = new Uint8Array(data.length);
    for (var i = 0; i < data.length; i++) out[i] = data.charCodeAt(i) & 0xff;
    return out;
  }
  if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) return data;
  return data.slice();
}

function heapBytes() {
  try {
    var mem = M().wasmMemory || (M().HEAPU8 && M().HEAPU8.buffer);
    if (mem && mem.buffer) return mem.buffer.byteLength;
    if (mem && typeof mem.byteLength === "number") return mem.byteLength;
  } catch (e) {
    /* ignore */
  }
  return 0;
}

function run(msg) {
  var FS = M().FS;
  var written = [];

  if (msg.clearMedia) clearDir(FS, "/working/media");

  var fontsAdded = false;
  var fonts = msg.fonts || [];
  for (var f = 0; f < fonts.length; f++) {
    try {
      FS.writeFile("/working/fonts/" + fonts[f][0], fonts[f][1]);
      fontsAdded = true;
    } catch (error) {
      remember("font write failed " + fonts[f][0] + ": " + error);
    }
  }
  if (fontsAdded) {
    // x2t rebuilds its font list from the folder when the caches are missing.
    for (var c = 0; c < FONT_CACHE_FILES.length; c++) {
      unlinkQuiet(FS, "/working/fonts/" + FONT_CACHE_FILES[c]);
    }
  }

  try {
    return runJob(FS, msg, written);
  } finally {
    // Leave nothing behind: MEMFS data lives in this worker's memory.
    if (!broken) {
      for (var w = 0; w < written.length; w++) unlinkQuiet(FS, written[w]);
      if (msg.output) unlinkQuiet(FS, msg.output);
      clearDir(FS, "/working/media");
    }
  }
}

function runJob(FS, msg, written) {
  var files = msg.files || [];
  var reader = null;
  for (var i = 0; i < files.length; i++) {
    var path = files[i][0];
    var data = files[i][1];
    // Audio/video arrive as Blobs (shared, not copied, by postMessage).
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      reader = reader || new FileReaderSync();
      data = new Uint8Array(reader.readAsArrayBuffer(data));
    }
    mkdirp(FS, path);
    // Every buffer here is this worker's own copy: let MEMFS keep it as-is
    // instead of copying it again.
    FS.writeFile(path, data, { canOwn: true });
    written.push(path);
  }
  FS.writeFile("/working/params.xml", msg.params);
  written.push("/working/params.xml");

  lastErrors = [];
  var code;
  try {
    code = M().ccall("main1", "number", ["string"], ["/working/params.xml"]);
  } catch (error) {
    broken = true;
    throw error;
  }

  var output = null;
  if (msg.output) {
    try {
      output = ownedBytes(FS.readFile(msg.output));
    } catch (e) {
      output = null;
    }
  }

  var media = [];
  var transfer = [];
  if (output) transfer.push(output.buffer);
  if (msg.readMedia) {
    var names = listDir(FS, "/working/media");
    for (var m = 0; m < names.length; m++) {
      try {
        var bytes = ownedBytes(FS.readFile("/working/media/" + names[m]));
        media.push([names[m], bytes]);
        transfer.push(bytes.buffer);
      } catch (error) {
        remember("media read failed " + names[m] + ": " + error);
      }
    }
  }

  return {
    reply: {
      type: "result",
      code: code,
      output: output,
      media: media,
      heapBytes: heapBytes(),
      log: code === 0 ? [] : lastErrors.slice(-8),
    },
    transfer: transfer,
  };
}

self.onmessage = function (event) {
  var msg = event.data || {};
  var id = msg.id;

  if (msg.type === "init") {
    init(msg).then(
      function (compiled) {
        var reply = { type: "ready", id: id };
        if (compiled) reply.wasmModule = compiled;
        self.postMessage(reply);
      },
      function (error) {
        self.postMessage({ type: "error", id: id, fatal: true, message: String(error && error.message ? error.message : error), log: lastErrors.slice(-8) });
      },
    );
    return;
  }

  if (msg.type === "run") {
    if (broken || !isRuntimeReady()) {
      self.postMessage({ type: "error", id: id, fatal: true, message: "x2t runtime is not usable" });
      return;
    }
    try {
      var result = run(msg);
      result.reply.id = id;
      self.postMessage(result.reply, result.transfer);
    } catch (error) {
      var message = error && error.message ? error.message : String(error);
      var isTrap = typeof WebAssembly !== "undefined" && error instanceof WebAssembly.RuntimeError;
      if (isTrap || typeof error === "number") broken = true;
      self.postMessage({ type: "error", id: id, fatal: broken, message: message, log: lastErrors.slice(-8) });
    }
  }
};
})();
