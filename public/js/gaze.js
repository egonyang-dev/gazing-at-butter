/**
 * Gaze detection — TF.js MediaPipe FaceMesh, Eye Aspect Ratio (EAR)
 *
 * Fix vs original:
 *   - EAR_THRESHOLD lowered 0.18 → 0.14 (was causing false negatives)
 *   - Rolling 4-frame majority vote to reduce flickering
 */

import { sendGaze } from './socket.js';

// MediaPipe FaceMesh landmark indices for each eye
const LEFT_EYE  = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

const EAR_THRESHOLD    = 0.14;  // below this → eye closed / not gazing
const INFERENCE_FPS    = 10;
const INFERENCE_INTERVAL = 1000 / INFERENCE_FPS;
const HISTORY_LEN      = 4;     // frames for majority vote

let detector          = null;
let videoEl           = null;
let animFrameId       = null;
let lastInferenceTime = 0;
let isRunning         = false;
let gazeHistory       = [];     // rolling boolean history

function dist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function calcEAR(kp, indices) {
  const [p1, p2, p3, p4, p5, p6] = indices.map(i => kp[i]);
  const vertical   = (dist(p2, p6) + dist(p3, p5)) / 2;
  const horizontal = dist(p1, p4);
  return horizontal > 0 ? vertical / horizontal : 0;
}

async function loadModel() {
  await tf.setBackend('webgl');
  await tf.ready();
  detector = await faceLandmarksDetection.createDetector(
    faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
    { runtime: 'tfjs', refineLandmarks: false, maxFaces: 1 }
  );
}

async function inferenceLoop(timestamp) {
  if (!isRunning) return;
  animFrameId = requestAnimationFrame(inferenceLoop);

  if (timestamp - lastInferenceTime < INFERENCE_INTERVAL) return;
  lastInferenceTime = timestamp;

  if (!detector || !videoEl || videoEl.readyState < 2) return;

  try {
    const faces = await detector.estimateFaces(videoEl, { flipHorizontal: false });

    let gazing = false;
    if (faces.length > 0) {
      const kp      = faces[0].keypoints;
      const leftEAR  = calcEAR(kp, LEFT_EYE);
      const rightEAR = calcEAR(kp, RIGHT_EYE);
      gazing = (leftEAR + rightEAR) / 2 > EAR_THRESHOLD;
    }

    // Rolling majority vote — smooths out single-frame drops
    gazeHistory.push(gazing);
    if (gazeHistory.length > HISTORY_LEN) gazeHistory.shift();
    const gazingNow = gazeHistory.filter(Boolean).length > HISTORY_LEN / 2;

    sendGaze(gazingNow);
  } catch {
    // Inference failure — silent, next frame will retry
  }
}

export async function startGazeDetection(videoElement) {
  videoEl   = videoElement;
  isRunning = true;
  await loadModel();
  requestAnimationFrame(inferenceLoop);
}

export function stopGazeDetection() {
  isRunning = false;
  cancelAnimationFrame(animFrameId);
  sendGaze(false);
}
