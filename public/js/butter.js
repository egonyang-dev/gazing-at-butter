/**
 * Gazing at Butter — canvas rendering
 *
 * Aesthetic: casual kitchen handheld footage.
 * Bright, neutral, realistic. Subtly wrong.
 *
 * State machine: SOLID → MELTING → BROWNING → BURNING → BURNT
 * Driven entirely by worldState from the server.
 */

import { worldState } from './socket.js';

// State → visual properties (warm, natural kitchen tones)
const STATE_CFG = {
  SOLID: {
    butterTop:  [252, 228, 150],
    butterEdge: [235, 205, 118],
    poolRGBA:   [242, 210, 122, 0],
    smokeRGB:   [248, 244, 238],
    maxSmoke: 0,
  },
  MELTING: {
    butterTop:  [248, 212, 96],
    butterEdge: [228, 188, 68],
    poolRGBA:   [240, 198, 88, 85],
    smokeRGB:   [238, 232, 222],
    maxSmoke: 4,
  },
  BROWNING: {
    butterTop:  [208, 138, 55],
    butterEdge: [178, 108, 34],
    poolRGBA:   [198, 118, 48, 125],
    smokeRGB:   [215, 200, 180],
    maxSmoke: 10,
  },
  BURNING: {
    butterTop:  [148, 72, 22],
    butterEdge: [112, 50, 14],
    poolRGBA:   [132, 58, 16, 158],
    smokeRGB:   [178, 162, 142],
    maxSmoke: 18,
  },
  BURNT: {
    butterTop:  [52, 26, 8],
    butterEdge: [38, 18, 5],
    poolRGBA:   [42, 20, 6, 182],
    smokeRGB:   [135, 118, 100],
    maxSmoke: 6,
  },
};

export function initButterSketch(containerEl) {
  return new p5((p) => {
    let displayHeat = 0;
    let particles   = [];
    let burntMarks  = [];
    let lastBurntSeed = null;

    // Perlin noise time cursors — randomised so each session looks slightly different
    let camT    = p.random(0, 1000);   // camera shake
    let butterT = p.random(2000, 3000); // butter drift
    let focusT  = p.random(4000, 5000); // focus / exposure flicker

    p.setup = () => {
      const sz = getSize();
      const cnv = p.createCanvas(sz, sz);
      cnv.parent(containerEl);
      p.noStroke();
      p.colorMode(p.RGB, 255, 255, 255, 255);
      generateBurntMarks(42);
    };

    p.windowResized = () => {
      p.resizeCanvas(getSize(), getSize());
    };

    function getSize() {
      return Math.min(containerEl.offsetWidth, containerEl.offsetHeight, 700);
    }

    // ——— Main draw ———
    p.draw = () => {
      const state      = worldState.butterState || 'SOLID';
      const targetHeat = worldState.butterHeat  ?? 0;
      displayHeat = p.lerp(displayHeat, targetHeat, 0.04);

      // Burnt seed
      const seed = worldState.burntSeed;
      if (seed !== null && seed !== lastBurntSeed) {
        lastBurntSeed = seed;
        generateBurntMarks(seed);
      }

      // Advance noise cursors
      // ↑ faster = movement completes in fewer frames → visible in screenshots
      camT    += 0.006;
      butterT += 0.006;
      focusT  += 0.003;

      // Camera shake — handheld feel (±11px on 600px canvas)
      const camX = (p.noise(camT)       - 0.5) * 22;
      const camY = (p.noise(camT + 50)  - 0.5) * 22;

      // Butter drift — low heat (viewers watching) = gentle float
      //               high heat (no viewers)       = restless drift
      // Range raised from (1.2, 4.0) → (5, 18) so movement is visible
      const drift = p.map(displayHeat, 0, 100, 5, 18, true);
      const bdX   = (p.noise(butterT)       - 0.5) * 2 * drift;
      const bdY   = (p.noise(butterT + 300) - 0.5) * 2 * drift;

      const cfg  = STATE_CFG[state] || STATE_CFG.SOLID;
      const cx   = p.width  / 2 + camX;
      const cy   = p.height / 2 + camY;
      const panR = p.width  * 0.42;
      const bw   = panR * 0.40;
      const bh   = bw   * 0.52;
      const bcx  = cx + bdX;
      const bcy  = cy + bdY;

      // Scene layers (back → front)
      drawSurface();
      drawPanShadow(cx, cy, panR);
      drawPan(cx, cy, panR, displayHeat);
      if (displayHeat > 8)  drawMeltPool(bcx, bcy, bw, bh, cfg, displayHeat);
      if (displayHeat > 32) drawBurntMarks(cx, cy, panR, displayHeat);
      drawButter(bcx, bcy, bw, bh, cfg, displayHeat);
      tickParticles(bcx, bcy, bw, bh, cfg, displayHeat);
      drawParticles();

      // Post-process (on top of everything, no translate)
      drawVignette();
      drawFilmGrain();

      // Very subtle exposure flicker (simulate auto-exposure)
      const flicker = (p.noise(focusT) - 0.5) * 0.04;
      if (Math.abs(flicker) > 0.005) {
        const bright = flicker > 0 ? 255 : 0;
        p.fill(bright, bright, bright, Math.abs(flicker) * 255);
        p.rect(0, 0, p.width, p.height);
      }
    };

    // ——— Kitchen counter surface ———
    function drawSurface() {
      const g = p.drawingContext.createLinearGradient(0, 0, p.width, p.height);
      g.addColorStop(0, '#f2ede6');
      g.addColorStop(1, '#e9e4dc');
      p.drawingContext.fillStyle = g;
      p.drawingContext.fillRect(0, 0, p.width, p.height);
    }

    // ——— Pan drop-shadow ———
    function drawPanShadow(cx, cy, r) {
      const g = p.drawingContext.createRadialGradient(
        cx + r * 0.1, cy + r * 0.1, r * 0.05,
        cx + r * 0.1, cy + r * 0.1, r * 1.25
      );
      g.addColorStop(0, 'rgba(0,0,0,0.20)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      p.drawingContext.fillStyle = g;
      p.drawingContext.beginPath();
      p.drawingContext.ellipse(cx + r * 0.1, cy + r * 0.1, r * 1.18, r * 1.12, 0, 0, Math.PI * 2);
      p.drawingContext.fill();
    }

    // ——— Pan body ———
    function drawPan(cx, cy, r, heat) {
      const hot = p.map(heat, 0, 100, 0, 1, true);

      // Iron colour warms as it heats
      const iR = Math.round(p.lerp(52, 74, hot));
      const iG = Math.round(p.lerp(46, 40, hot));
      const iB = Math.round(p.lerp(40, 26, hot));

      // Radial gradient — light from top-left
      const panG = p.drawingContext.createRadialGradient(
        cx - r * 0.28, cy - r * 0.28, 0,
        cx, cy, r
      );
      panG.addColorStop(0,   `rgb(${iR + 24},${iG + 18},${iB + 14})`);
      panG.addColorStop(0.5, `rgb(${iR},${iG},${iB})`);
      panG.addColorStop(1,   `rgb(${iR - 16},${iG - 12},${iB - 10})`);
      p.drawingContext.fillStyle = panG;
      p.drawingContext.beginPath();
      p.drawingContext.arc(cx, cy, r, 0, Math.PI * 2);
      p.drawingContext.fill();

      // Rim highlight (top-left arc)
      const rimG = p.drawingContext.createLinearGradient(cx - r, cy - r, cx + r * 0.5, cy + r * 0.5);
      rimG.addColorStop(0,   'rgba(150,135,118,0.45)');
      rimG.addColorStop(0.45,'rgba(100,90,78,0.10)');
      rimG.addColorStop(1,   'rgba(20,15,10,0)');
      p.drawingContext.strokeStyle = rimG;
      p.drawingContext.lineWidth   = 3.5;
      p.drawingContext.beginPath();
      p.drawingContext.arc(cx, cy, r - 1.8, 0, Math.PI * 2);
      p.drawingContext.stroke();

      // Inner concave sheen
      const innerG = p.drawingContext.createRadialGradient(
        cx - r * 0.22, cy - r * 0.22, 0,
        cx, cy, r * 0.88
      );
      innerG.addColorStop(0,   'rgba(255,255,255,0.05)');
      innerG.addColorStop(0.55,'rgba(255,255,255,0)');
      innerG.addColorStop(1,   'rgba(0,0,0,0.07)');
      p.drawingContext.fillStyle = innerG;
      p.drawingContext.beginPath();
      p.drawingContext.arc(cx, cy, r * 0.93, 0, Math.PI * 2);
      p.drawingContext.fill();
    }

    // ——— Melt pool ———
    function drawMeltPool(cx, cy, bw, bh, cfg, heat) {
      const [r, g, b, a] = cfg.poolRGBA;
      const spread = p.map(heat, 8, 100, 1.0, 2.9, true);
      const alpha  = p.map(heat, 8, 100, 0.22, 0.92, true);

      const poolG = p.drawingContext.createRadialGradient(cx, cy, 0, cx, cy, bw * spread * 1.4);
      poolG.addColorStop(0,   `rgba(${r},${g},${b},${a * alpha})`);
      poolG.addColorStop(0.55,`rgba(${r},${g},${b},${a * alpha * 0.55})`);
      poolG.addColorStop(1,   `rgba(${r},${g},${b},0)`);
      p.drawingContext.fillStyle = poolG;
      p.drawingContext.beginPath();
      p.drawingContext.ellipse(cx, cy, bw * spread * 1.9, bh * spread * 1.45, 0, 0, Math.PI * 2);
      p.drawingContext.fill();
    }

    // ——— Burnt marks ———
    function generateBurntMarks(seed) {
      burntMarks = [];
      const rng = mulberry32(seed);
      for (let i = 0; i < 18; i++) {
        burntMarks.push({
          x:  (rng() - 0.5) * 0.78,
          y:  (rng() - 0.5) * 0.78,
          rx: rng() * 0.21 + 0.05,
          ry: rng() * 0.09 + 0.03,
          a:  rng() * Math.PI,
        });
      }
    }

    function drawBurntMarks(cx, cy, panR, heat) {
      const alpha = p.map(heat, 32, 100, 0, 0.42, true);
      p.drawingContext.save();
      p.drawingContext.globalAlpha = alpha;
      p.drawingContext.fillStyle = '#1c0a02';
      for (const m of burntMarks) {
        p.drawingContext.save();
        p.drawingContext.translate(cx + m.x * panR, cy + m.y * panR);
        p.drawingContext.rotate(m.a);
        p.drawingContext.beginPath();
        p.drawingContext.ellipse(0, 0, m.rx * panR, m.ry * panR, 0, 0, Math.PI * 2);
        p.drawingContext.fill();
        p.drawingContext.restore();
      }
      p.drawingContext.restore();
    }

    // ——— Butter block ———
    function drawButter(cx, cy, bw, bh, cfg, heat) {
      const [tr, tg, tb] = cfg.butterTop;
      const [er, eg, eb] = cfg.butterEdge;

      const shrink  = p.map(heat, 0, 100, 1.0, 0.46, true);
      const w       = bw * shrink;
      const h       = bh * shrink;
      const corner  = p.map(heat, 0, 72, 4, w * 0.5, true);

      // Drop shadow
      p.drawingContext.save();
      p.drawingContext.shadowColor     = 'rgba(0,0,0,0.28)';
      p.drawingContext.shadowBlur      = 14;
      p.drawingContext.shadowOffsetX   = 3;
      p.drawingContext.shadowOffsetY   = 5;

      // Body gradient: lit top-left → dark bottom-right
      const bodyG = p.drawingContext.createLinearGradient(cx - w, cy - h, cx + w, cy + h);
      bodyG.addColorStop(0,    `rgb(${tr + 10},${tg + 8},${tb + 5})`);
      bodyG.addColorStop(0.42, `rgb(${tr},${tg},${tb})`);
      bodyG.addColorStop(1,    `rgb(${er},${eg},${eb})`);
      p.drawingContext.fillStyle = bodyG;
      roundRect(p.drawingContext, cx - w, cy - h, w * 2, h * 2, corner);
      p.drawingContext.fill();
      p.drawingContext.restore();

      // Specular highlight — soft, top-left, fades as butter burns
      if (heat < 78) {
        const ga = p.map(heat, 0, 78, 0.30, 0, true);
        const specG = p.drawingContext.createRadialGradient(
          cx - w * 0.42, cy - h * 0.42, 0,
          cx - w * 0.42, cy - h * 0.42, w * 0.85
        );
        specG.addColorStop(0, `rgba(255,252,236,${ga})`);
        specG.addColorStop(1, 'rgba(255,252,236,0)');
        p.drawingContext.fillStyle = specG;
        roundRect(p.drawingContext, cx - w, cy - h, w * 2, h * 2, corner);
        p.drawingContext.fill();
      }

      // Subtle edge line when solid (gives sense of a solid block)
      if (heat < 35) {
        const edgeA = p.map(heat, 0, 35, 0.14, 0, true);
        p.drawingContext.strokeStyle = `rgba(${er - 18},${eg - 15},${eb - 12},${edgeA})`;
        p.drawingContext.lineWidth   = 1.5;
        roundRect(p.drawingContext, cx - w, cy - h, w * 2, h * 2, corner);
        p.drawingContext.stroke();
      }
    }

    // ——— Particles (steam / smoke) ———
    function tickParticles(cx, cy, bw, bh, cfg, heat) {
      const [r, g, b] = cfg.smokeRGB;
      const maxN  = cfg.maxSmoke;
      const shrk  = p.map(heat, 0, 100, 1.0, 0.48, true);
      const speed = p.map(heat, 0, 100, 0.5, 2.4, true);

      // Spawn
      if (particles.length < maxN && Math.random() < 0.32) {
        particles.push({
          x:     cx + (Math.random() - 0.5) * bw * shrk * 1.8,
          y:     cy - bh * shrk * 0.65,
          vx:    (Math.random() - 0.5) * speed * 0.45,
          vy:    -(Math.random() * speed + 0.35),
          life:  1.0,
          decay: 0.007 + Math.random() * 0.009,
          size:  3 + Math.random() * 5,
          r, g, b,
        });
      }

      // Update
      particles = particles.filter(pt => pt.life > 0.04);
      for (const pt of particles) {
        pt.x  += pt.vx + (Math.random() - 0.5) * 0.22;
        pt.y  += pt.vy;
        pt.vy *= 0.99;
        pt.vx += (Math.random() - 0.5) * 0.04;
        pt.life -= pt.decay;
        pt.size += 0.1;
      }
    }

    function drawParticles() {
      for (const pt of particles) {
        const alpha = pt.life * 0.26;
        p.drawingContext.fillStyle = `rgba(${pt.r},${pt.g},${pt.b},${alpha})`;
        p.drawingContext.beginPath();
        p.drawingContext.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        p.drawingContext.fill();
      }
    }

    // ——— Post-process: lens vignette ———
    function drawVignette() {
      const vg = p.drawingContext.createRadialGradient(
        p.width / 2, p.height / 2, p.width * 0.32,
        p.width / 2, p.height / 2, p.width * 0.76
      );
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.10)');
      p.drawingContext.fillStyle = vg;
      p.drawingContext.fillRect(0, 0, p.width, p.height);
    }

    // ——— Post-process: film grain (sensor noise) ———
    function drawFilmGrain() {
      // Scatter ~0.25% of pixels with tiny noise flecks
      const count = Math.floor(p.width * p.height * 0.0025);
      for (let i = 0; i < count; i++) {
        const x  = Math.random() * p.width;
        const y  = Math.random() * p.height;
        const lv = Math.random() > 0.5 ? 255 : 0;
        const a  = Math.random() * 0.055;
        p.drawingContext.fillStyle = `rgba(${lv},${lv},${lv},${a})`;
        p.drawingContext.fillRect(x, y, 1.3, 1.3);
      }
    }

    // ——— Utilities ———
    function roundRect(ctx, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    // Deterministic RNG (Mulberry32)
    function mulberry32(seed) {
      return () => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
  });
}
