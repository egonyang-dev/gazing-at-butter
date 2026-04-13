/**
 * 注視奶油 — 伺服器端狀態機
 * 奶油熱度由集體注視比例決定，每 500ms tick 一次
 *
 * ─── Session lifecycle ────────────────────────────────────────────────────────
 *   Heat is never reset on disconnect.
 *   A new session begins only when:
 *     (a) the room was empty (all users had left), AND
 *     (b) a new user enters.
 *   Until then, burnt state persists — including across disconnections.
 *
 * ─── Presence vs observation ─────────────────────────────────────────────────
 *   "Observe only" users are counted as present (totalUsers) but not as
 *   gazing (gazeCount). Their presence dilutes the gazing ratio without
 *   contributing to stabilisation — this is intentional.
 *   Active observation is system-determined: the client's gaze detection
 *   (FaceMesh + Eye Aspect Ratio) must confirm sustained eye contact.
 *   It is neither simple face presence nor full eye-tracking.
 */

const TICK_MS = 500;

// Heat delta per tick (500ms), indexed by number of active gazers.
// Positive = heating, negative = cooling.
// Index 5 applies to 5 or more gazers.
//
//   0 gazers  →  burns in ~60s   from heat 0
//   1 gazer   →  burns in ~2 min from heat 0  (buying time, not safe)
//   2 gazers  →  burns in ~11 min             (still heating, not safe)
//   3 gazers  →  stable threshold             (zero net change)
//   4 gazers  →  actively cooling
//   5+ gazers →  strong cooling
const GAZE_HEAT_DELTA = [
   0.85,  // 0 gazers — burns in ~60s
   0.42,  // 1 gazer  — burns in ~2 min
   0.15,  // 2 gazers — still heating, not safe
   0.00,  // 3 gazers — stable threshold
  -0.60,  // 4 gazers — actively cooling
  -1.50,  // 5+ gazers — strong cooling
];

function netHeatDelta(gazingCount) {
  const idx = Math.min(gazingCount, GAZE_HEAT_DELTA.length - 1);
  return GAZE_HEAT_DELTA[idx];
}

const STATES = {
  SOLID:    { min: 0,  max: 15,  label: '固態',  labelEn: 'solid' },
  MELTING:  { min: 15, max: 35,  label: '融化中', labelEn: 'melting' },
  BROWNING: { min: 35, max: 60,  label: '焦化中', labelEn: 'browning' },
  BURNING:  { min: 60, max: 85,  label: '燃燒中', labelEn: 'burning' },
  BURNT:    { min: 85, max: 100, label: '燒焦',  labelEn: 'burnt' },
};

function deriveState(heat) {
  for (const [key, s] of Object.entries(STATES)) {
    if (heat >= s.min && heat < s.max) return { key, ...s };
  }
  return { key: 'BURNT', ...STATES.BURNT };
}

class GazeState {
  constructor(io) {
    this.io = io;
    this.users = new Map(); // socketId → boolean (isGazing)
    this.heat = 0;
    this.burntResidueSeeds = null; // locked once burnt, cleared only on new session
    this.tickInterval = null;
    this._wasEmpty = true; // true on server start → first user begins a fresh session
  }

  start() {
    this.tickInterval = setInterval(() => this._tick(), TICK_MS);
  }

  stop() {
    clearInterval(this.tickInterval);
  }

  addUser(socketId) {
    // New session: first user to enter after the room was completely empty.
    if (this.users.size === 0 && this._wasEmpty) {
      this.heat = 0;
      this.burntResidueSeeds = null;
      this._wasEmpty = false;
    }
    this.users.set(socketId, false);
  }

  removeUser(socketId) {
    this.users.delete(socketId);
    if (this.users.size === 0) {
      // Room is now empty — mark it so the next arrival starts a new session.
      // Heat is intentionally NOT reset here; burnt state persists.
      this._wasEmpty = true;
    }
  }

  setGaze(socketId, isGazing) {
    if (this.users.has(socketId)) {
      this.users.set(socketId, isGazing);
    }
  }

  _tick() {
    const total = this.users.size;
    if (total === 0) return;

    const gazing = [...this.users.values()].filter(Boolean).length;
    const delta  = netHeatDelta(gazing);
    this.heat    = Math.max(0, Math.min(100, this.heat + delta));

    const state = deriveState(this.heat);

    // Lock in the burnt residue seed — never changes once set.
    if (state.key === 'BURNT' && this.burntResidueSeeds === null) {
      this.burntResidueSeeds = Math.floor(Math.random() * 10000);
    }

    this.io.emit('state:broadcast', {
      gazeCount: gazing,
      totalUsers: total,
      butterHeat: Math.round(this.heat * 10) / 10,
      butterState: state.key,
      stateLabel: state.label,
      burntSeed: this.burntResidueSeeds,
    });
  }

  getSnapshot() {
    const total = this.users.size;
    const gazing = [...this.users.values()].filter(Boolean).length;
    const state = deriveState(this.heat);
    return {
      gazeCount: gazing,
      totalUsers: total,
      butterHeat: Math.round(this.heat * 10) / 10,
      butterState: state.key,
      stateLabel: state.label,
      burntSeed: this.burntResidueSeeds,
    };
  }
}

module.exports = GazeState;
