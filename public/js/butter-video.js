/**
 * Gazing at Butter — real-video renderer (skeleton)
 *
 * Drop-in replacement for butter.js.
 * Same export: initButterSketch(containerEl) → cleanup handle
 *
 * To activate: in main.js change
 *   import { initButterSketch } from './butter.js';
 * to
 *   import { initButterSketch } from './butter-video.js';
 *
 * ─── VIDEO FILE ──────────────────────────────────────────────────────────────
 *   Place your video at:  public/assets/video/butter.mp4
 *   Keep a WebM fallback: public/assets/video/butter.webm
 *
 *   Recommended format:
 *     Container : MP4 (H.264, AAC — muted is fine)
 *     Resolution: 1080 × 1920  (9:16 portrait)
 *     Frame rate: 30 fps (24 fps also works)
 *     Bitrate   : 8–12 Mbps for good quality on web
 *     Duration  : aim for 60–120 seconds total (see heat mapping below)
 *     Audio     : not required — the video is always muted
 *
 *   Quick export from iPhone / Mac:
 *     - Keep original .mov, then convert with ffmpeg:
 *         ffmpeg -i butter.mov -vf "scale=1080:1920" -c:v libx264 -crf 22
 *                -preset slow -an -movflags +faststart butter.mp4
 *     - WebM fallback:
 *         ffmpeg -i butter.mov -vf "scale=1080:1920" -c:v libvpx-vp9
 *                -crf 30 -b:v 0 -an butter.webm
 *
 * ─── HEAT → TIMESTAMP MAPPING ────────────────────────────────────────────────
 *   The video is a single continuous take of butter going from cold to burnt.
 *   We never let it play — we seek to a position based on the current heat.
 *
 *   Record the footage in these phases (adjust VIDEO_HEAT_MAP below to match):
 *
 *     Phase          Heat   Suggested video time  What to show
 *     ─────────────────────────────────────────────────────────
 *     SOLID          0–15   0:00 – 0:15           Cold butter block, pan lukewarm
 *     MELTING       15–35   0:15 – 0:40           Edges softening, first pool
 *     BROWNING      35–60   0:40 – 1:10           Pool spreading, colour shift
 *     BURNING       60–85   1:10 – 1:45           Smoke, strong browning/sizzle
 *     BURNT         85–100  1:45 – 2:00           Black char, minimal movement
 *
 *   VIDEO_HEAT_MAP maps heat (0–100) to video seconds.
 *   Edit these timestamps after you've recorded and reviewed the footage.
 *
 * ─── FRAMING ─────────────────────────────────────────────────────────────────
 *   The canvas container in the current UI is square.
 *   A 9:16 portrait video will be fitted with object-fit: cover so the
 *   centre crop fills the square (pillarboxing avoided, some top/bottom cropped).
 *   Frame the butter in the vertical centre of the shot so the crop looks good.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { worldState } from './socket.js';

// ── Heat → video timestamp control points ────────────────────────────────────
// Format: [heat, seconds]  — must be monotonically increasing on both axes.
// Edit the seconds column after reviewing your recorded footage.
const VIDEO_HEAT_MAP = [
  [  0,   0 ],   // heat   0 → 0:00  (start — solid, cold)
  [ 15,  15 ],   // heat  15 → 0:15  (MELTING begins)
  [ 35,  40 ],   // heat  35 → 0:40  (BROWNING begins)
  [ 60,  70 ],   // heat  60 → 1:10  (BURNING begins)
  [ 85, 105 ],   // heat  85 → 1:45  (BURNT begins)
  [100, 120 ],   // heat 100 → 2:00  (end of footage)
];

// ── Interpolate heat (0–100) to a video timestamp (seconds) ─────────────────
function heatToSeconds(heat) {
  const clamped = Math.max(0, Math.min(100, heat));
  for (let i = 1; i < VIDEO_HEAT_MAP.length; i++) {
    const [h0, t0] = VIDEO_HEAT_MAP[i - 1];
    const [h1, t1] = VIDEO_HEAT_MAP[i];
    if (clamped <= h1) {
      const ratio = (clamped - h0) / (h1 - h0);
      return t0 + ratio * (t1 - t0);
    }
  }
  return VIDEO_HEAT_MAP[VIDEO_HEAT_MAP.length - 1][1];
}

// ── Public init — same signature as butter.js ─────────────────────────────────
export function initButterSketch(containerEl) {
  // ── Video element ──────────────────────────────────────────────────────────
  const video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.setAttribute('muted', '');
  video.preload    = 'auto';
  video.loop       = false;   // we seek manually — no auto-play
  video.style.cssText = [
    'width: 100%',
    'height: 100%',
    'object-fit: cover',      // centre-crop portrait video into square container
    'display: block',
    'background: #1a0e04',    // dark fallback while video loads
  ].join(';');

  // MP4 + WebM sources — browser picks what it can decode
  const srcMp4  = document.createElement('source');
  srcMp4.src    = 'assets/video/butter.mp4';
  srcMp4.type   = 'video/mp4';
  const srcWebM = document.createElement('source');
  srcWebM.src   = 'assets/video/butter.webm';
  srcWebM.type  = 'video/webm';
  video.appendChild(srcMp4);
  video.appendChild(srcWebM);

  // ── Canvas overlay for post-process effects ────────────────────────────────
  // Preserves: vignette, film grain, exposure flicker from the original butter.js
  const canvas  = document.createElement('canvas');
  canvas.style.cssText = [
    'position: absolute',
    'inset: 0',
    'width: 100%',
    'height: 100%',
    'pointer-events: none',   // pass clicks through to controls beneath
  ].join(';');
  const ctx = canvas.getContext('2d');

  // Container needs relative positioning so the canvas overlays correctly
  const prevPosition = containerEl.style.position;
  containerEl.style.position = 'relative';
  containerEl.appendChild(video);
  containerEl.appendChild(canvas);

  // ── State ──────────────────────────────────────────────────────────────────
  let displayHeat  = 0;       // smoothly interpolated toward worldState.butterHeat
  let focusT       = Math.random() * 1000; // noise cursor for exposure flicker
  let animId       = null;

  // ── Heat seeking ───────────────────────────────────────────────────────────
  // Seeks the video when the interpolated heat moves by more than a threshold.
  // We do NOT call video.play() — seeking a paused video renders a single frame.
  let lastSeekedHeat = -999;
  const SEEK_THRESHOLD = 0.25; // heat units — lower = smoother, higher = cheaper

  function maybeSeek() {
    if (!video.readyState) return; // video not loaded yet
    if (Math.abs(displayHeat - lastSeekedHeat) < SEEK_THRESHOLD) return;
    lastSeekedHeat = displayHeat;
    const t = heatToSeconds(displayHeat);
    if (Math.abs(video.currentTime - t) > 0.05) {
      video.currentTime = t;
    }
  }

  // ── Post-process canvas effects ────────────────────────────────────────────
  function drawOverlay() {
    const w = containerEl.offsetWidth;
    const h = containerEl.offsetHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);

    // Vignette
    const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    // Film grain — ~0.25% of pixels
    const grainCount = Math.floor(w * h * 0.0025);
    for (let i = 0; i < grainCount; i++) {
      const gx = Math.random() * w;
      const gy = Math.random() * h;
      const v  = Math.random() > 0.5 ? 255 : 0;
      ctx.fillStyle = `rgba(${v},${v},${v},0.06)`;
      ctx.fillRect(gx, gy, 1, 1);
    }

    // Exposure flicker — subtle brightness pulse
    focusT += 0.003;
    // Simple 1D noise approximation using sin (no p5.js available here)
    const noise = (Math.sin(focusT * 7.3) + Math.sin(focusT * 3.7)) / 2; // −1 to 1
    const flickerAlpha = noise * 0.02; // ±0.02 opacity
    if (flickerAlpha > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flickerAlpha})`;
    } else {
      ctx.fillStyle = `rgba(0,0,0,${-flickerAlpha})`;
    }
    ctx.fillRect(0, 0, w, h);
  }

  // ── Animation loop ─────────────────────────────────────────────────────────
  function tick() {
    const targetHeat = worldState.butterHeat ?? 0;
    // Same lerp factor as butter.js (0.04) — keeps visual feel identical
    displayHeat += (targetHeat - displayHeat) * 0.04;

    maybeSeek();
    drawOverlay();

    animId = requestAnimationFrame(tick);
  }

  // Start loop once video metadata is available (so .duration is known)
  video.addEventListener('loadedmetadata', () => {
    tick();
  }, { once: true });

  // Fallback: start loop after 3s even if video hasn't loaded
  // (overlay effects still run; video shows placeholder background)
  const fallbackTimer = setTimeout(tick, 3000);
  video.addEventListener('loadedmetadata', () => clearTimeout(fallbackTimer), { once: true });

  // ── Cleanup handle (mirrors butter.js return convention) ───────────────────
  return {
    remove() {
      if (animId) cancelAnimationFrame(animId);
      containerEl.style.position = prevPosition;
      video.remove();
      canvas.remove();
    },
  };
}
