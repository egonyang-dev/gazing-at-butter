/**
 * Gazing at Butter — ending sequence
 * Shared by both the animation and video versions.
 *
 * Call startEndingSequence(overlayEl, onComplete) after the 60s burnt hold.
 * Sequence: dialogue lines fade in → 1s black → onComplete()
 */

const LINES = [
  { speaker: 'Ａ', text: 'oh no I forgot to watch my butter' },
  { speaker: 'Ｂ', text: 'I told ya, u never listen' },
  { speaker: 'Ａ', text: 'I just gone like 1 min, you know wut, It is what it is. i do again' },
];

// ms after dialogue starts that each line appears
const LINE_DELAYS    = [0, 3500, 8000];
// ms after the last line before blackout
const AFTER_LAST_MS  = 5000;
// ms of solid black before calling onComplete
const BLACK_MS       = 1000;

export function startEndingSequence(overlayEl, onComplete) {
  const container = overlayEl.querySelector('.ending-dialogue');
  container.innerHTML = '';

  overlayEl.removeAttribute('hidden');
  requestAnimationFrame(() => overlayEl.classList.add('visible'));

  const lineEls = LINES.map(({ speaker, text }) => {
    const p = document.createElement('p');
    p.className = 'ending-line';
    p.innerHTML = `<span class="ending-speaker">${speaker}</span>${text}`;
    container.appendChild(p);
    return p;
  });

  LINE_DELAYS.forEach((delay, i) => {
    setTimeout(() => lineEls[i].classList.add('show'), delay);
  });

  const blackAt = LINE_DELAYS[LINE_DELAYS.length - 1] + AFTER_LAST_MS;
  setTimeout(() => {
    overlayEl.classList.add('black');
    setTimeout(onComplete, BLACK_MS);
  }, blackAt);
}

export function resetEndingOverlay(overlayEl) {
  overlayEl.classList.remove('visible', 'black');
  overlayEl.querySelector('.ending-dialogue').innerHTML = '';
  overlayEl.setAttribute('hidden', '');
}
