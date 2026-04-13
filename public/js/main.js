/**
 * Gazing at Butter — entry point
 * Coordinates: entry flow, camera, socket, canvas, UI
 */

import { initSocket, disconnectSocket } from './socket.js';
import { startGazeDetection, stopGazeDetection } from './gaze.js';
import { initButterSketch } from './butter.js';
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
  if (!butterSketch) butterSketch = initButterSketch(container);
}

function connectSocket() {
  initSocket((state) => {
    updateUI(state);
    if (state.butterHeat >= 100) triggerEnding();
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

    // TF.js model loads in background — gaze starts sending once ready
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
