/**
 * Intentionally a no-op.
 *
 * Group click-triggered animations are fixed by text patches applied to
 * sdkjs/slide/sdk-all.js (see scripts/patch-sdkjs-group-anim.mjs):
 * the animation player's onSpClick walks the group chain and the slideshow
 * hit-test consults the player for grouped shapes.
 *
 * An earlier version of this file patched shape.HSb() to always report
 * shapes as interactive, which made non-interactive shapes swallow clicks
 * and show a pointer cursor during slideshows. Do not reintroduce that.
 */
(function () {
  "use strict";
})();
