/**
 * UI updates — calm, lifestyle-brand copy in English.
 * The more you read, the stranger it gets.
 */

const stateEl    = document.getElementById('state-label');
const totalEl    = document.getElementById('total-counter');
const gazeEl     = document.getElementById('gaze-counter');
const heatBarEl  = document.getElementById('heat-bar');
const heatValEl  = document.getElementById('heat-value');
const recEl      = document.getElementById('recommendation');
const connDot    = document.getElementById('conn-dot');
const connLabel  = document.getElementById('conn-label');

const STATE_LABELS = {
  SOLID:    'Stable',
  MELTING:  'Melting',
  BROWNING: 'Browning',
  BURNING:  'Burning',
  BURNT:    'Irreversible',
};

const RECOMMENDATIONS = {
  SOLID:    'Butter condition is stable. Collective observation is functioning as intended.',
  MELTING:  'Gaze ratio is declining. Sustained collective attention is required to reverse thermal progression.',
  BROWNING: 'Observer threshold not met. Thermal degradation is in progress.',
  BURNING:  'Observer count is critically insufficient. Irreversible damage is imminent.',
  BURNT:    'Condition is irreversible. Session data will not be retained.',
};

export function updateUI(worldState) {
  const { butterState, gazeCount, totalUsers, butterHeat, connected } = worldState;

  // Connection indicator
  if (connDot)   connDot.className = 'indicator-dot' + (connected ? ' connected' : '');
  if (connLabel) connLabel.textContent = connected ? 'Connected' : 'Reconnecting';

  // Butter status label
  if (stateEl) {
    stateEl.textContent = STATE_LABELS[butterState] || '—';
    stateEl.className   = 'panel-value';
    if (butterState === 'BROWNING' || butterState === 'BURNING') stateEl.classList.add('warning');
    if (butterState === 'BURNT')                                  stateEl.classList.add('danger');
  }

  // Participant counts
  if (totalEl) totalEl.textContent = totalUsers ?? '—';
  if (gazeEl)  gazeEl.textContent  = gazeCount  ?? '—';

  // Heat bar
  if (heatBarEl) {
    heatBarEl.style.width = `${butterHeat ?? 0}%`;
    heatBarEl.className   = 'heat-fill';
    if (butterHeat > 35)  heatBarEl.classList.add('warm');
    if (butterHeat > 60)  heatBarEl.classList.remove('warm');
    if (butterHeat > 60)  heatBarEl.classList.add('burning');
  }
  if (heatValEl) heatValEl.textContent = Math.round(butterHeat ?? 0);

  // Recommendation text
  if (recEl) recEl.textContent = RECOMMENDATIONS[butterState] || '—';
}

export function setConnected(isConnected) {
  if (connDot)   connDot.className = 'indicator-dot' + (isConnected ? ' connected' : '');
  if (connLabel) connLabel.textContent = isConnected ? 'Connected' : 'Reconnecting';
}
