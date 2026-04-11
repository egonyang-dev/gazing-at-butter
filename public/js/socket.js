/**
 * Socket.io client — shared worldState + connection notifications
 */

export const worldState = {
  gazeCount:   0,
  totalUsers:  0,
  butterHeat:  0,
  butterState: 'SOLID',
  stateLabel:  'Stable',
  burntSeed:   null,
  connected:   false,
};

let socket       = null;
let lastGazing   = null;
let keepalive    = null;
let _onUpdate    = null;

export function initSocket(onStateUpdate) {
  _onUpdate = onStateUpdate;
  socket = io({ reconnection: true, reconnectionDelay: 1000 });

  socket.on('connect', () => {
    worldState.connected = true;
    _onUpdate?.(worldState);
    // Re-send current gaze after reconnect
    if (lastGazing !== null) socket.emit('gaze:update', { gazing: lastGazing });
  });

  socket.on('disconnect', () => {
    worldState.connected = false;
    _onUpdate?.(worldState);
  });

  socket.on('state:broadcast', (data) => {
    Object.assign(worldState, data);
    _onUpdate?.(worldState);
  });

  // Playwright / test hook — call window.__socketOnState(data) to inject state
  window.__socketOnState = (data) => {
    Object.assign(worldState, data);
    _onUpdate?.(worldState);
  };
}

export function sendGaze(isGazing) {
  if (!socket) return;
  if (isGazing === lastGazing) return;
  lastGazing = isGazing;
  socket.emit('gaze:update', { gazing: isGazing });

  // Keepalive — re-emit every 2s so server doesn't assume stale
  clearInterval(keepalive);
  keepalive = setInterval(() => {
    if (socket?.connected) socket.emit('gaze:update', { gazing: lastGazing });
  }, 2000);
}
