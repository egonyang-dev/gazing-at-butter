const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const GazeState = require('./gazeState');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 10000,
  pingInterval: 5000,
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '../public')));

const gazeState = new GazeState(io);
gazeState.start();

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} 連線 (共 ${io.engine.clientsCount} 人)`);
  gazeState.addUser(socket.id);

  // 新用戶立即收到當前狀態
  socket.emit('state:broadcast', gazeState.getSnapshot());

  socket.on('gaze:update', ({ gazing }) => {
    gazeState.setGaze(socket.id, Boolean(gazing));
  });

  socket.on('disconnect', () => {
    gazeState.removeUser(socket.id);
    console.log(`[-] ${socket.id} 離線 (共 ${io.engine.clientsCount} 人)`);
  });
});

server.listen(PORT, () => {
  console.log(`注視奶油 伺服器啟動於 http://localhost:${PORT}`);
});
