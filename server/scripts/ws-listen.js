// Minimal WebSocket client - prints every message the server pushes.
// Lets you check the realtime channel without the phone.
//
//   npm run listen
//   npm run listen -- wss://xyz.trycloudflare.com/ws
import WebSocket from 'ws';

const url = process.argv[2] ?? `ws://localhost:${process.env.PORT || 3000}/ws`;
const ws = new WebSocket(url);

ws.on('open', () => console.log(`[listen] connected to ${url} - waiting for leads...`));
ws.on('message', (data) => console.log('[listen] received:', data.toString()));
ws.on('close', () => console.log('[listen] closed'));
ws.on('error', (err) => console.error('[listen] error:', err.message || err.code));
