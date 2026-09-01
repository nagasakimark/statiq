/**
 * Web-native asc_AddVideo / asc_AddAudio for local-only presentations.
 * Video insert: slide.Tg.U9d (poster image) + blip.Fha(video path), matching stock Qfd/U9d.
 */
(function () {
  "use strict";

  var IMAGE_OK = 2;

  function getApi() {
    return (window.Asc && window.Asc.editor) || window.editor;
  }

  function waitForApi(callback, attempts) {
    attempts = attempts || 0;
    var api = getApi();
    if (api) {
      callback(api);
      return;
    }
    if (attempts > 400) {
      console.warn("statiq-web-media: Asc.editor not ready");
      return;
    }
    setTimeout(function () {
      waitForApi(callback, attempts + 1);
    }, 50);
  }

  function readFileAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  function arrayBufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = "";
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function extractVideoPoster(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.src = url;

      video.onloadeddata = function () {
        video.currentTime = Math.min(1, video.duration / 2 || 0);
      };

      video.onseeked = function () {
        try {
          var canvas = document.createElement("canvas");
          canvas.width = video.videoWidth || 320;
          canvas.height = video.videoHeight || 240;
          var ctx = canvas.getContext("2d");
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            function (blob) {
              URL.revokeObjectURL(url);
              if (!blob) {
                reject(new Error("Failed to create poster"));
                return;
              }
              var reader = new FileReader();
              reader.onload = function () {
                resolve(reader.result);
              };
              reader.readAsArrayBuffer(blob);
            },
            "image/jpeg",
            0.85,
          );
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(e);
        }
      };

      video.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load video for poster"));
      };
    });
  }

  function pickFile(accept) {
    return new Promise(function (resolve) {
      var input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.style.display = "none";
      document.body.appendChild(input);
      input.onchange = function () {
        var file = input.files && input.files[0];
        document.body.removeChild(input);
        resolve(file || null);
      };
      input.click();
    });
  }

  function writeFile(path, base64) {
    if (typeof window.asc_writeFile === "function") {
      window.asc_writeFile(path, base64);
      return;
    }
    var api = getApi();
    if (api && typeof api.asc_writeFile === "function") {
      api.asc_writeFile(path, base64);
    }
  }

  function resolvePosterUrl(localPath) {
    var normalized = localPath.startsWith("media/") ? localPath : "media/" + localPath.replace(/^\/+/, "");
    if (window.AscCommon && window.AscCommon.py) {
      var py = window.AscCommon.py;
      if (typeof py.HMc === "function") {
        var mapped = py.HMc(normalized);
        if (mapped) return mapped;
      }
    }
    if (window.AscDesktopEditor && window.AscDesktopEditor.LocalFileGetImageUrl) {
      var fragment = window.AscDesktopEditor.LocalFileGetImageUrl(normalized);
      if (fragment && window.AscCommon && window.AscCommon.py && typeof window.AscCommon.py.M3 === "function") {
        var viaM3 = window.AscCommon.py.M3(fragment);
        if (viaM3) return viaM3;
      }
    }
    return null;
  }

  function waitForPosterUrl(localPath, attempts) {
    attempts = attempts || 0;
    var url = resolvePosterUrl(localPath);
    if (url) return Promise.resolve(url);
    if (attempts >= 60) {
      return Promise.reject(new Error("Poster URL not registered: " + localPath));
    }
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve(waitForPosterUrl(localPath, attempts + 1));
      }, 50);
    });
  }

  function cacheKeyForUrl(url) {
    if (window.AscCommon && typeof window.AscCommon.uJ === "function") {
      return window.AscCommon.uJ(url);
    }
    return url;
  }

  function preloadImage(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error("Failed to load poster image"));
      };
      img.src = url;
    });
  }

  function seedImageLoader(api, posterPath, posterUrl, image) {
    if (!api || !api.Oq) return;
    var lta = window.AscFonts && window.AscFonts.lta;
    var fragment = posterPath.replace(/^media\//, "");
    var mediaKey = posterPath.startsWith("media/") ? posterPath : "media/" + fragment;
    var entry = {
      Image: image,
      mz: lta ? lta.aka : IMAGE_OK,
      src: posterUrl,
    };
    var keys = [
      posterUrl,
      cacheKeyForUrl(posterUrl),
      fragment,
      mediaKey,
      cacheKeyForUrl(fragment),
      cacheKeyForUrl(mediaKey),
    ];
    for (var i = 0; i < keys.length; i++) {
      if (keys[i]) api.Oq.wM[keys[i]] = entry;
    }
  }

  function getBlipFill(shape) {
    if (!shape || !shape.fill) return null;
    return shape.fill.fill || shape.fill;
  }

  function fixBlipVideoPath(blipFill, posterUrl, mediaPath) {
    if (!blipFill) return;
    if (typeof blipFill.lej === "function") {
      blipFill.lej(posterUrl, mediaPath);
      return;
    }
    blipFill.url = posterUrl;
    blipFill.Yi = posterUrl;
    blipFill.Qfa = mediaPath;
  }

  function getMediaExtension(mediaPath) {
    if (!mediaPath) return "mp4";
    if (window.AscCommon && typeof window.AscCommon.puc === "function") {
      var fromMask = window.AscCommon.puc(mediaPath);
      if (fromMask) return fromMask;
    }
    var base = mediaPath.replace(/^media\//, "").split("/").pop() || mediaPath;
    var dot = base.lastIndexOf(".");
    return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "mp4";
  }

  /** Ensure nvPr (zz) + nvPr ext (it) exist on a picture shape. */
  function ensureNvPrIt(shape) {
    if (!shape || !window.AscFormat) return null;
    if (!shape.zz && typeof shape.Zy === "function" && window.AscFormat.ST) {
      shape.Zy(new AscFormat.ST());
    }
    if (shape.zz && !shape.zz.it && typeof shape.zz.vWe === "function" && window.AscFormat.cof) {
      shape.zz.vWe(new AscFormat.cof());
    }
    return shape.zz && shape.zz.it ? shape.zz.it : null;
  }

  /** Stock MYb path: stretch fill + rect geometry for video shapes. */
  function applyVideoStretchFill(shape) {
    if (!shape || !shape.bk || !window.AscFormat) return;
    var blip = typeof shape.bk.Ha === "function" ? shape.bk.Ha() : shape.bk;
    if (!blip) return;
    blip.Op = null;
    if (window.AscFormat.Z0b) {
      blip.stretch = new AscFormat.Z0b();
    }
    blip.Dm = null;
    if (typeof shape.kY === "function") shape.kY(blip);
  }

  /**
   * Mark shape as video/audio via zz.it.qY (type 7/8, maskFile.ext).
   * Required for HSb(), wkb(), and slideshow click → MediaStart.
   */
  function attachVideoMetadata(shape, mediaPath, isAudio) {
    if (!shape || !window.AscFormat || !window.AscFormat.TCc) return;
    var ext = getMediaExtension(mediaPath);
    var nvIt = ensureNvPrIt(shape);
    if (!nvIt || typeof nvIt.SZb !== "function") return;

    var qY = new AscFormat.TCc();
    qY.type = isAudio ? 8 : 7;
    qY.media = "maskFile." + ext;
    nvIt.SZb(qY);

    applyVideoStretchFill(shape);
    if (typeof shape.iMe === "function" && shape.iMe() && typeof shape.bQb === "function") {
      shape.bQb("rect");
    }
    if (typeof shape.xZb === "function") shape.xZb(true);
  }

  function shapeDimensions(image) {
    var emu = (window.AscCommon && window.AscCommon.We) || 36000;
    var pxW = (image && (image.naturalWidth || image.width)) || 320;
    var pxH = (image && (image.naturalHeight || image.height)) || 240;
    return {
      w: Math.max(Math.round(pxW * emu), emu),
      dc: Math.max(Math.round(pxH * emu), emu),
    };
  }

  function buildVideoShape(posterUrl, mediaPath, image) {
    if (!window.Asc || !window.Asc.yFc) {
      throw new Error("Asc.yFc unavailable");
    }
    var shape = new Asc.yFc();
    shape.Odc(posterUrl, mediaPath);
    fixBlipVideoPath(getBlipFill(shape), posterUrl, mediaPath);
    var size = shapeDimensions(image);
    shape.w = size.w;
    shape.dc = size.dc;
    return shape;
  }

  function getSlideController(api) {
    var pres = api.ra && api.ra.Ea;
    if (!pres || typeof pres.xj !== "function") return null;
    var slide = pres.xj();
    if (!slide || !slide.Tg) return null;
    return { pres: pres, slide: slide, ctrl: slide.Tg };
  }

  function attachVideoToShape(shape, posterUrl, mediaPath, isAudio) {
    if (!shape || !shape.bk) return;
    var blip = shape.bk.Ha && shape.bk.Ha();
    if (!blip) return;
    fixBlipVideoPath(blip, posterUrl, mediaPath);
    if (typeof blip.Fha === "function") {
      blip.Fha(mediaPath);
    } else {
      blip.Qfa = mediaPath;
    }
    attachVideoMetadata(shape, mediaPath, isAudio);
    if (typeof shape.Ke === "function") shape.Ke();
    if (typeof shape.wG === "function") shape.wG();
  }

  function mediaKey(path) {
    if (!path) return path;
    return path.replace(/^media\//, "");
  }

  /** Prefer selected shape after insert; fall back to poster Yi match. */
  function findInsertedShape(ctrl, slide, posterKey) {
    if (ctrl && ctrl.ye && ctrl.ye.length) {
      for (var i = 0; i < ctrl.ye.length; i++) {
        var selected = ctrl.ye[i];
        if (!selected || !selected.bk) continue;
        var yi = selected.bk.Yi;
        if (yi === posterKey || yi === "media/" + posterKey) return selected;
      }
      return ctrl.ye[0];
    }
    if (!slide || !slide.fc || !slide.fc.Fb) return null;
    var shapes = slide.fc.Fb;
    for (var j = 0; j < shapes.length; j++) {
      var shape = shapes[j];
      if (shape && shape.bk && (shape.bk.Yi === posterKey || shape.bk.Yi === "media/" + posterKey)) {
        return shape;
      }
    }
    return shapes.length ? shapes[shapes.length - 1] : null;
  }

  function finalizeSlideInsert(api, pres, ctrl) {
    if (ctrl && typeof ctrl.IH === "function") ctrl.IH();
    if (pres && typeof pres.Cd === "function") pres.Cd();
    if (pres && typeof pres.Me === "function") pres.Me();
    if (api.zc && typeof api.zc.fDa === "function") api.zc.fDa(true);
  }

  /** Stock new-image path: slide.Tg.U9d (R0/oZf with video paths), then blip video path. */
  function insertViaU9d(api, ctx, posterPath, posterUrl, mediaPath, image, isAudio) {
    var ctrl = ctx.ctrl;
    var pres = ctx.pres;
    var slide = ctx.slide;
    if (typeof ctrl.U9d !== "function") {
      throw new Error("Slide U9d unavailable");
    }

    var pxW = (image && (image.naturalWidth || image.width)) || 320;
    var pxH = (image && (image.naturalHeight || image.height)) || 240;
    var posterKey = mediaKey(posterPath);
    var videoKey = mediaKey(mediaPath);

    if (window.AscCommon && window.AscCommon.History && typeof window.AscCommon.History.Gk === "function") {
      var zqd = window.AscDFH && window.AscDFH.zqd;
      window.AscCommon.History.Gk(zqd !== undefined ? zqd : 0);
    }
    if (typeof ctrl.$g === "function") ctrl.$g();
    if (typeof pres.$f === "function" && window.AscDFH && window.AscDFH.zqd !== undefined) {
      pres.$f(window.AscDFH.zqd);
    }

    // U9d → R0 → oZf: args 4/5 set zz.it.qY (type 7/8) required for HSb() / slideshow.
    if (isAudio) {
      ctrl.U9d(posterKey, pxW, pxH, undefined, videoKey);
    } else {
      ctrl.U9d(posterKey, pxW, pxH, videoKey, undefined);
    }

    attachVideoToShape(findInsertedShape(ctrl, slide, posterKey), posterUrl, videoKey, !!isAudio);
    finalizeSlideInsert(api, pres, ctrl);
  }

  /** UI delegate path used by stock Insert Video (GXj → dDa → controller.dDa → Fug). */
  function insertViaDelegateDDa(api, posterPath, posterUrl, mediaPath, image, isAudio) {
    var view = api.zc && api.zc.vq && api.zc.vq().N9;
    if (!view || typeof view.dDa !== "function" || !window.Asc || !window.Asc.yFc || !window.Asc.O8) {
      return false;
    }

    var posterKey = mediaKey(posterPath);
    var videoKey = mediaKey(mediaPath);
    var size = shapeDimensions(image);
    var yFc = new Asc.yFc();
    yFc.Odc(posterKey, videoKey);
    yFc.MYb = true;
    yFc.w = size.w;
    yFc.dc = size.dc;

    var props = new Asc.O8();
    props.mX = yFc;
    props.MYb = true;
    props.qd = size.w;
    props.$c = size.dc;
    props.dm = posterKey;

    view.dDa(props);

    var pres = api.ra && api.ra.Ea;
    var slide = pres && typeof pres.xj === "function" ? pres.xj() : null;
    var ctrl = slide && slide.Tg ? slide.Tg : view.controller;
    attachVideoToShape(findInsertedShape(ctrl, slide, posterKey), posterUrl, videoKey, !!isAudio);

    if (typeof view.dF === "function") view.dF();
    finalizeSlideInsert(api, pres, view.controller);
    return true;
  }

  function insertVideoOnSlide(api, posterPath, posterUrl, mediaPath, image, isAudio) {
    var ctx = getSlideController(api);
    if (ctx) {
      try {
        insertViaU9d(api, ctx, posterPath, posterUrl, mediaPath, image, isAudio);
        return;
      } catch (u9dErr) {
        console.warn("statiq-web-media: U9d insert failed, trying dDa", u9dErr);
      }
    }
    if (insertViaDelegateDDa(api, posterPath, posterUrl, mediaPath, image, isAudio)) return;

    if (typeof api.AddImageUrlAction === "function") {
      var fragment = posterPath.replace(/^media\//, "");
      var opts = isAudio ? { qgg: true, Fnb: mediaPath } : { jMe: true, Fnb: mediaPath };
      api.AddImageUrlAction(fragment, undefined, opts);
      finalizeSlideInsert(api, api.ra && api.ra.Ea, null);
      return;
    }

    throw new Error("Presentation video insert API unavailable");
  }

  function insertVideoShape(api, posterPath, mediaPath) {
    return waitForPosterUrl(posterPath)
      .then(function (posterUrl) {
        return preloadImage(posterUrl).then(function (image) {
          seedImageLoader(api, posterPath, posterUrl, image);
          insertVideoOnSlide(api, posterPath, posterUrl, mediaPath, image);
        });
      })
      .catch(function (err) {
        console.error("statiq-web-media: video insert failed", err);
        throw err;
      });
  }

  function insertAudioShape(api, iconPath, audioPath) {
    return waitForPosterUrl(iconPath)
      .then(function (iconUrl) {
        return preloadImage(iconUrl).then(function (image) {
          seedImageLoader(api, iconPath, iconUrl, image);
          insertVideoOnSlide(api, iconPath, iconUrl, audioPath, image, true);
        });
      })
      .catch(function (err) {
        console.error("statiq-web-media: audio insert failed", err);
        throw err;
      });
  }

  function patchApi(api) {
    if (api.__statiqMediaPatched) return;
    api.__statiqMediaPatched = true;

    api.asc_AddVideoCallback = function (posterPath, videoPath) {
      return insertVideoShape(api, posterPath, videoPath);
    };

    api.asc_AddAudioCallback = function (iconPath, audioPath) {
      return insertAudioShape(api, iconPath, audioPath);
    };

    api.asc_AddVideo = function () {
      pickFile("video/*").then(function (file) {
        if (!file) return;

        var ts = Date.now();
        var base = "display8image-" + ts;
        var ext = (file.name.split(".").pop() || "mp4").toLowerCase();
        var posterPath = "media/" + base + ".jpg";
        var videoPath = "media/" + base + "." + ext;

        Promise.all([extractVideoPoster(file), readFileAsArrayBuffer(file)])
          .then(function (results) {
            writeFile(posterPath, arrayBufferToBase64(results[0]));
            writeFile(videoPath, arrayBufferToBase64(results[1]));
            return waitForPosterUrl(posterPath);
          })
          .then(function () {
            api.asc_AddVideoCallback(posterPath, videoPath);
          })
          .catch(function (err) {
            console.error("asc_AddVideo failed", err);
          });
      });
    };

    api.asc_AddAudio = function () {
      pickFile("audio/*").then(function (file) {
        if (!file) return;

        var ts = Date.now();
        var base = "display8image-" + ts;
        var iconPath = "media/" + base + ".png";
        var audioPath = "media/" + base + "." + (file.name.split(".").pop() || "mp3").toLowerCase();
        var pngBase64 =
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

        readFileAsArrayBuffer(file)
          .then(function (audioBuffer) {
            writeFile(iconPath, pngBase64);
            writeFile(audioPath, arrayBufferToBase64(audioBuffer));
            return waitForPosterUrl(iconPath);
          })
          .then(function () {
            api.asc_AddAudioCallback(iconPath, audioPath);
          })
          .catch(function (err) {
            console.error("asc_AddAudio failed", err);
          });
      });
    };
  }

  function ensurePatched() {
    var api = getApi();
    if (api) patchApi(api);
    return api;
  }

  waitForApi(patchApi);
  setInterval(ensurePatched, 1000);
})();
