/**
 * 注視奶油 — 伺服器端狀態機
 * 奶油熱度由集體注視比例決定，每 500ms tick 一次
 */

const TICK_MS = 500;
const THRESHOLD = 0.6;   // 需要 60% 以上的人注視才能降溫
const HEAT_RATE = 2.5;   // 無人注視時每 tick 升溫
const COOL_RATE = 1.5;   // 注視時每 tick 降溫
const MIN_USERS = 1;     // 錄影 demo 時設為 1；正式部署改為 2

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
    const gazeRatio = gazing / total;
    const hasEnoughUsers = total >= MIN_USERS;

    if (hasEnoughUsers && gazeRatio >= THRESHOLD) {
      this.heat = Math.max(0, this.heat - COOL_RATE);
    } else {
      this.heat = Math.min(100, this.heat + HEAT_RATE);
    }

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
