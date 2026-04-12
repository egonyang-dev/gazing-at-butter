/**
 * 注視奶油 — 伺服器端狀態機
 * 奶油熱度由集體注視比例決定，每 500ms tick 一次
 */

const TICK_MS = 500;

// Heat delta per tick (500ms), indexed by number of active gazers.
// Positive = heating, negative = cooling.
// Index 5 applies to 5 or more gazers.
const GAZE_HEAT_DELTA = [
   2.5,  // 0 gazers — rapid burning
   1.0,  // 1 gazer  — slow degradation
   0.3,  // 2 gazers — slight degradation
  -0.3,  // 3 gazers — mostly stable
  -1.0,  // 4 gazers — slight cooling
  -2.0,  // 5+ gazers — fully stable
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
    this.burntResidueSeeds = null; // 燒焦後的殘跡種子，斷線前不重置
    this.tickInterval = null;
  }

  start() {
    this.tickInterval = setInterval(() => this._tick(), TICK_MS);
  }

  stop() {
    clearInterval(this.tickInterval);
  }

  addUser(socketId) {
    this.users.set(socketId, false);
  }

  removeUser(socketId) {
    this.users.delete(socketId);
    if (this.users.size === 0) {
      // 所有人離線 → 重置狀態
      this.heat = 0;
      this.burntResidueSeeds = null;
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

    // 記錄燒焦殘跡種子（一旦到 BURNT 就鎖定）
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
