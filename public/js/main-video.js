/**
 * Gazing at Butter — entry point (real-video version)
 * Identical to main.js except uses butter-video.js instead of butter.js.
 * Served at /video/ via public/video/index.html
 */

import { initSocket, disconnectSocket } from './socket.js';
import { startGazeDetection, stopGazeDetection } from './gaze.js';
import { initButterSketch } from './butter-video.js';
import { updateUI } from './ui.js';
import { startEndingSequence, resetEndingOverlay } from './ending.js';

const entryScreen = document.getElementById('entry-screen');
const mainScreen  = document.getElementById('main-screen');
const enterBtn    = document.getElementById('enter-btn');
const watchBtn    = document.getElementById('watch-btn');
const webcamEl    = document.getElementById('webcam');
const container   = document.getElementById('canvas-container');
const overlayEl   = document.getElementById('ending-overlay');

const ENDING_HOLD_MS = 60_000;

let butterSketch  = null;
let endingStarted = false;

function triggerEnding() {
  if (endingStarted) return;
  endingStarted = true;

  stopGazeDetection();
  disconnectSocket();

  setTimeout(() => {
    startEndingSequence(overlayEl, returnToEntry);
  }, ENDING_HOLD_MS);
}

function returnToEntry() {
  resetEndingOverlay(overlayEl);

  if (butterSketch) { butterSketch.remove(); butterSketch = null; }

  // Stop camera stream
  if (webcamEl.srcObject) {
    webcamEl.srcObject.getTracks().forEach(t => t.stop());
    webcamEl.srcObject = null;
  }
  webcamEl.hidden = false;

  mainScreen.hidden  = true;
  entryScreen.hidden = false;

  enterBtn.disabled    = false;
  enterBtn.textContent = 'Participate';
  endingStarted = false;
}

function showMainScreen() {
  entryScreen.hidden = true;
  mainScreen.hidden  = false;
  if (!butterSketch) {
    butterSketch = initButterSketch(container, { onBurnt: triggerEnding });
  }
}

function connectSocket() {
  initSocket((state) => {
    updateUI(state);
    // Video version detects BURNT via onBurnt callback in butter-video.js;
    // this covers the edge case where the server state arrives first.
    if (state.butterState === 'BURNT') triggerEnding();
  });
}

// ——— Participate (with camera) ———
enterBtn.addEventListener('click', async () => {
  enterBtn.disabled    = true;
  enterBtn.textContent = 'Loading…';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    webcamEl.srcObject = stream;
    await new Promise(resolve => webcamEl.addEventListener('loadeddata', resolve, { once: true }));

    connectSocket();
    showMainScreen();

    startGazeDetection(webcamEl);
  } catch (err) {
    console.warn('Camera unavailable, switching to observe mode:', err);
    observeMode();
  }
});

// ——— Observe only (no camera) ———
watchBtn.addEventListener('click', observeMode);

function observeMode() {
  webcamEl.hidden = true;
  connectSocket();
  showMainScreen();
}
