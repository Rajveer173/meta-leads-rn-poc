// WebSocket push channel. Every connected app gets new leads instantly.
import { WebSocketServer, WebSocket } from 'ws';

let wss;

export function attachWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket, req) => {
    console.log(`[ws] client connected (${wss.clients.size} total) from ${req.socket.remoteAddress}`);
    socket.isAlive = true;
    socket.on('pong', () => (socket.isAlive = true));
    socket.on('close', () => console.log(`[ws] client disconnected (${wss.clients.size} total)`));
  });

  // Heartbeat: ping every 30s and drop sockets that didn't answer the last
  // ping. Also keeps tunnels/proxies from closing an idle connection.
  const timer = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.isAlive) {
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30_000);
  wss.on('close', () => clearInterval(timer));
}

export function broadcast(message) {
  const data = JSON.stringify(message);
  for (const socket of wss?.clients ?? []) {
    if (socket.readyState === WebSocket.OPEN) socket.send(data);
  }
}
