/**
 * Gazing at Butter — entry point
 * Coordinates: entry flow, camera, socket, canvas, UI
 */

import { initSocket } from './socket.js';
import { startGazeDetection } from './gaze.js';
import { initButterSketch } from './butter.js';
import { updateUI } from './ui.js';

const entryScreen = document.getElementById('entry-screen');
const mainScreen  = document.getElementById('main-screen');
const enterBtn    = document.getElementById('enter-btn');
const watchBtn    = document.getElementById('watch-btn');
const webcamEl    = document.getElementById('webcam');
const container   = document.getElementById('canvas-container');

let butterSketch = null;

function showMainScreen() {
  entryScreen.hidden = true;
  mainScreen.hidden  = false;
  if (!butterSketch) butterSketch = initButterSketch(container);
}

function connectSocket() {
  initSocket((state) => updateUI(state));
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
  connectSocket();      // socket connected, gaze stays false (server default)
  showMainScreen();
}
