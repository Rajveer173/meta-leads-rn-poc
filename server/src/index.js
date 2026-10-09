// Entry point: one HTTP server that serves both the REST routes (Express)
// and the WebSocket endpoint (/ws) the mobile app listens on.
import http from 'node:http';
import express from 'express';
import { webhookRouter } from './webhook.js';
import { listLeads } from './store.js';
import { attachWebSocket } from './realtime.js';

const PORT = Number(process.env.PORT) || 3000;

const app = express();

// Keep the exact bytes Meta sent: the HMAC signature is computed over the
// raw body, so we can't verify it against re-serialised JSON.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

// Health check - handy to confirm the public tunnel URL reaches us.
app.get('/', (_req, res) => res.send('meta-leads-server OK'));

// Meta requires a privacy policy URL on the lead form and to publish the app.
app.get('/privacy', (_req, res) =>
  res.send(
    '<h1>Privacy policy</h1><p>This is a test app for a Lead Ads proof of concept. ' +
      'Test leads are stored only on the developer\'s machine and are never shared.</p>',
  ),
);

// Meta webhook: GET = verification handshake, POST = lead notifications.
app.use('/webhook', webhookRouter);

// All stored leads, newest first. The app calls this on start-up and after
// every reconnect so it never misses a lead that arrived while offline.
app.get('/leads', (_req, res) => {
  res.set('Access-Control-Allow-Origin', '*'); // lets Expo web call it too
  res.json(listLeads());
});

const server = http.createServer(app);
attachWebSocket(server); // same port, path /ws

server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] webhook: /webhook   leads: /leads   websocket: /ws`);
  if (!process.env.APP_SECRET) {
    console.warn('[server] !!! APP_SECRET not set - webhook signatures will NOT be checked !!!');
  }
  if (process.env.MOCK_GRAPH === '1') {
    console.warn('[server] MOCK_GRAPH=1 - lead details are faked, Graph API is not called');
  }
});
