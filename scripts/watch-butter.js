/**
 * watch-butter.js — Playwright visual test for Gazing at Butter
 *
 * Two scenarios in sequence:
 *   1. STABLE  — inject 3 observers watching → butter holds / cools
 *   2. BURNING — inject 0 observers watching → real server heat climbs → burns
 *
 * Usage:
 *   node scripts/watch-butter.js
 *
 * Output:
 *   screenshots/stable-N.png   (5 frames, 2s apart)
 *   screenshots/burning-N.png  (10 frames, 2s apart)
 */

const { chromium } = require('playwright');
const fs           = require('fs');
const path         = require('path');

const SERVER_URL  = 'http://localhost:3000';
const SHOT_DIR    = path.join(__dirname, '..', 'screenshots');
const STABLE_HEAT = 5;    // butterHeat value injected for "stable" scenario
const BURN_WAIT   = 22000; // ms to wait for server heat to reach BURNING naturally

// ─── helpers ──────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Inject worldState directly into the running page.
 * Requires window.__socketOnState to be registered in socket.js.
 */
async function injectState(page, data) {
  await page.evaluate((d) => {
    if (typeof window.__socketOnState === 'function') {
      window.__socketOnState(d);
    } else {
      console.warn('[test] __socketOnState not available yet');
    }
  }, data);
}

async function captureFrames(page, prefix, count, intervalMs) {
  for (let i = 0; i < count; i++) {
    const file = path.join(SHOT_DIR, `${prefix}-${i}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log(`  📸  ${path.relative(process.cwd(), file)}`);
    if (i < count - 1) await page.waitForTimeout(intervalMs);
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

(async () => {
  ensureDir(SHOT_DIR);

  const browser = await chromium.launch({
    headless: false,  // set true to run silently
    slowMo:   30,
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  // Wire up error logging before navigation
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('  ❌ console:', msg.text());
  });
  page.on('pageerror', err => {
    console.error('  ❌ page error:', err.message);
  });
  page.on('requestfailed', req => {
    // ignore fonts / CDN 404s that don't affect functionality
    if (!req.url().includes('fonts.googleapis')) {
      console.error('  ❌ request failed:', req.url());
    }
  });

  console.log(`\n🌐  Opening ${SERVER_URL} …`);
  await page.goto(SERVER_URL);
  await page.waitForTimeout(1500);

  // Enter "Observe only" — no camera needed
  await page.click('#watch-btn');
  console.log('👁   Clicked "Observe only"');

  // Wait for main screen to appear (hidden attr removed)
  await page.waitForSelector('#main-screen:not([hidden])', { timeout: 8000 });

  // Wait for socket + test hook to initialise
  await page.waitForFunction(() => typeof window.__socketOnState === 'function', { timeout: 8000 });

  // Wait for p5 canvas to be created
  await page.waitForSelector('#canvas-container canvas', { timeout: 8000 });
  await page.waitForTimeout(1000);

  // ══════════════════════════════════════════════════════════════════════════
  // SCENARIO 1 — STABLE
  // Inject: 3 participants, all 3 observing → butter holds in SOLID state
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── Scenario 1: STABLE ──────────────────────────────────────');

  await injectState(page, {
    gazeCount:   3,
    totalUsers:  3,
    butterHeat:  STABLE_HEAT,
    butterState: 'SOLID',
    stateLabel:  'Stable',
    burntSeed:   null,
    connected:   true,
  });

  console.log('  State injected: 3/3 observing, heat = 5');
  await page.waitForTimeout(500);

  // Re-inject each frame to stop server heat from climbing during capture
  console.log('  Capturing 5 frames (2s apart)…');
  for (let i = 0; i < 5; i++) {
    await injectState(page, {
      gazeCount: 3, totalUsers: 3,
      butterHeat: STABLE_HEAT, butterState: 'SOLID',
      stateLabel: 'Stable', burntSeed: null, connected: true,
    });
    const file = path.join(SHOT_DIR, `stable-${i}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log(`  📸  screenshots/stable-${i}.png`);
    if (i < 4) await page.waitForTimeout(2000);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCENARIO 2 — BURNING
  // Stop injecting stable state → server heat climbs naturally (no gaze in
  // Playwright) → heat reaches BURNING in ~12s, BURNT in ~17s.
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n── Scenario 2: BURNING (no observers) ──────────────────────');

  // Inject: 1 participant connected, 0 gazing → server now controls heat
  await injectState(page, {
    gazeCount: 0, totalUsers: 1,
    butterHeat: 0, butterState: 'SOLID',
    stateLabel: 'Stable', burntSeed: null, connected: true,
  });

  console.log(`  Waiting ${BURN_WAIT / 1000}s for butter to burn…`);
  console.log('  (server raises heat 2.5 / 500ms → BURNING in ~12s, BURNT in ~17s)');

  // Screenshot every 2s while heat climbs
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(2000);
    const file   = path.join(SHOT_DIR, `burning-${i}.png`);
    const state  = await page.evaluate(() => window.__socketOnState
      ? document.getElementById('state-label')?.textContent
      : '?'
    );
    await page.screenshot({ path: file, fullPage: false });
    console.log(`  📸  screenshots/burning-${i}.png  [${state}]`);
  }

  await browser.close();
  console.log(`\n✅  Done. Screenshots saved to screenshots/\n`);
})();
