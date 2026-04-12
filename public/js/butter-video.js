/**
 * Gazing at Butter — real-video renderer
 *
 * Drop-in replacement for butter.js.
 * Same export: initButterSketch(containerEl) → cleanup handle
 *
 * ─── CONCEPT ─────────────────────────────────────────────────────────────────
 *   The video always plays forward. It never jumps, never rewinds.
 *   Collective observation does not reverse the melting — it only slows it.
 *   More viewers → slower playback rate → the same real event, dilated in time.
 *
 *   Playback speed is driven by gazeCount from the server.
 *   butterHeat and butterState are still shown in the status panel (unchanged)
 *   but do not affect video position.
 *
 * ─── SPEED MAPPING ───────────────────────────────────────────────────────────
 *   Viewers  Rate    Real sec / video sec   Burns in (248s of footage)
 *   ───────────────────────────────────────────────────────────────────
 *   0        1.000×       1s               ~4 min
 *   1        0.500×       2s               ~8 min
 *   2        0.250×       4s               ~16 min
 *   3        0.100×      10s               ~41 min
 *   4        0.030×      33s               ~2.3 hours
 *   5+       0.010×     100s               ~7 hours
 *
 * ─── BURNT ENDING ────────────────────────────────────────────────────────────
 *   Video stops advancing when currentTime reaches BURNT_HOLD_SECS.
 *   It holds on that single frame permanently — irreversible, intentional.
 *   The last ~32s of footage (248→279s) are never touched; end-of-file on a
 *   paused video looks like a playback error, so we stay clear of it.
 *   If the hold frame looks wrong, adjust BURNT_HOLD_SECS to a nearby value
 *   and reload — scrub your footage to ~4:08 to verify the frame is calm.
 *
 * ─── WHY NOT playbackRate ────────────────────────────────────────────────────
 *   Chrome floors playbackRate at 0.0625× (1/16). Rates for 3+ viewers would
 *   be silently clamped. Instead the video is always paused; each RAF tick
 *   advances currentTime by (elapsed × rate). Rewind-proof, rate-accurate,
 *   works at all speeds including 1.0×.
 *
 * ─── VIDEO FILE ──────────────────────────────────────────────────────────────
 *   Primary:  public/assets/video/butter.mp4
 *   Fallback: public/assets/video/butter.webm  (optional)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { worldState } from './socket.js';

// ── Video source ─────────────────────────────────────────────────────────────
// Replace this URL with your externally hosted MP4 before deploying.
const VIDEO_URL = 'REPLACE_WITH_VIDEO_URL';

// ── Playback speed per viewer count ──────────────────────────────────────────
// Index = gazeCount clamped to [0, 5].
// Rate = video-seconds advanced per real-second of wall time.
const GAZE_RATES = [
  1.000,  // 0 viewers — normal speed
  0.500,  // 1 viewer  — half speed
  0.250,  // 2 viewers — quarter speed
  0.100,  // 3 viewers — very slow
  0.030,  // 4 viewers — extremely slow
  0.010,  // 5+ viewers — ~1 frame every 3.3s at 30 fps
];

// ── Burnt hold ────────────────────────────────────────────────────────────────
// Once currentTime reaches this, advancing stops permanently.
// Adjust to a visually stable frame inside the burnt section (~4:08).
const BURNT_HOLD_SECS = 248;

// ── Rate lookup ───────────────────────────────────────────────────────────────
function getRate() {
  const count = Math.min(worldState.gazeCount ?? 0, GAZE_RATES.length - 1);
  return GAZE_RATES[count];
}

// ── Public init — same signature as butter.js ─────────────────────────────────
export function initButterSketch(containerEl) {

  // ── Video element ──────────────────────────────────────────────────────────
  const video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.preload = 'auto';
  video.style.cssText = [
    'width: 100%',
    'height: 100%',
    'object-fit: cover',    // centre-crop portrait video into square container
    'object-position: center 65%',  // show lower portion of video to center butter
    'display: block',
    'background: #1a0e04',  // dark fallback while video loads
  ].join(';');

  // MP4 source — loaded from VIDEO_URL defined at the top of this file
  const srcMp4 = document.createElement('source');
  srcMp4.src  = VIDEO_URL;
  srcMp4.type = 'video/mp4';
  video.appendChild(srcMp4);

  // ── Canvas overlay for post-process effects ────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.style.cssText = [
    'position: absolute',
    'inset: 0',
    'width: 100%',
    'height: 100%',
    'pointer-events: none',
  ].join(';');
  const ctx = canvas.getContext('2d');

  const prevPosition = containerEl.style.position;
  containerEl.style.position = 'relative';
  containerEl.appendChild(video);
  containerEl.appendChild(canvas);

  // ── Playback state ─────────────────────────────────────────────────────────
  let lastTimestamp = null;   // DOMHighResTimeStamp from previous RAF tick
  let animId        = null;
  let burnt         = false;  // latched true once hold frame is reached

  // ── Post-process overlay ───────────────────────────────────────────────────
  function drawOverlay() {
    const w = containerEl.offsetWidth;
    const h = containerEl.offsetHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);

    // Film grain — ~0.25% of pixels
    const grainCount = Math.floor(w * h * 0.0025);
    for (let i = 0; i < grainCount; i++) {
      const gx = Math.random() * w;
      const gy = Math.random() * h;
      const v  = Math.random() > 0.5 ? 255 : 0;
      ctx.fillStyle = `rgba(${v},${v},${v},0.06)`;
      ctx.fillRect(gx, gy, 1, 1);
    }

  }

  // ── Animation loop ─────────────────────────────────────────────────────────
  function tick(timestamp) {
    animId = requestAnimationFrame(tick);

    // Compute real elapsed time since last frame (cap at 200ms to survive
    // tab-switch or display sleep without a time-jump on resume)
    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
      drawOverlay();
      return;
    }
    const elapsed = Math.min((timestamp - lastTimestamp) / 1000, 0.2);
    lastTimestamp = timestamp;

    // Advance video — only if loaded and not yet burnt
    if (!burnt && video.readyState >= 2) {
      const rate    = getRate();
      const nextTime = video.currentTime + elapsed * rate;

      if (nextTime >= BURNT_HOLD_SECS) {
        // Arrived at the hold frame — lock permanently
        video.currentTime = BURNT_HOLD_SECS;
        burnt = true;
      } else {
        video.currentTime = nextTime;
      }
    }

    drawOverlay();
  }

  // ── Start ──────────────────────────────────────────────────────────────────
  // Video stays paused throughout — currentTime is advanced manually above.
  video.addEventListener('loadedmetadata', () => {
    video.currentTime = 0;
    animId = requestAnimationFrame(tick);
  }, { once: true });

  // Fallback: begin loop after 3s even if video fails to load
  // (overlay effects run; video shows the #1a0e04 background)
  const fallbackTimer = setTimeout(() => {
    if (!animId) animId = requestAnimationFrame(tick);
  }, 3000);
  video.addEventListener('loadedmetadata', () => clearTimeout(fallbackTimer), { once: true });

  // ── Cleanup ────────────────────────────────────────────────────────────────
  return {
    remove() {
      if (animId) cancelAnimationFrame(animId);
      containerEl.style.position = prevPosition;
      video.remove();
      canvas.remove();
    },
  };
}
