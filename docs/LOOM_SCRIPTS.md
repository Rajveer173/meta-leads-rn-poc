# Loom scripts

## Video 1: Demo (at most 5 minutes)

**Set up before you hit record** (see "Before every recording take" in `README.md`):

- Server running with the real `.env` (`APP_SECRET`, `PAGE_ACCESS_TOKEN`, `MOCK_GRAPH=0`).
- `cloudflared` running, and its current URL saved as the Meta callback URL and in `app/.env`.
- Previous test lead **deleted** in the Lead Ads Testing Tool, with the Page and form already selected.
- App open on the phone showing **Connected**. Mirror the phone next to the browser
  (`scrcpy`, or the phone held up to a webcam).

| Time | What to show | What to say |
|---|---|---|
| 0:00–0:30 | Phone + browser side by side | "When someone submits a Meta Lead Ad form, the lead appears live on this React Native screen, which is already open. I won't touch the phone." |
| 0:30–1:00 | The app: existing list and green **Connected** pill. Then the server and tunnel terminals | "The app holds a WebSocket to my Node server. The server is public through a Cloudflare tunnel, and that URL is registered as the webhook in my Meta app." |
| 1:00–2:00 | Testing tool: **Preview form**, type a name/email/phone you'll recognise, submit (or **Create lead**) | "This is Meta's Lead Ads Testing Tool. It fires the same `leadgen` webhook a real ad submission does." Keep your hands visibly off the phone. |
| 2:00–2:45 | The card appears at the top with a yellow highlight and **NEW** badge. Then the server log | "There it is, no refresh. The server log shows the signed webhook arrived, the details were fetched from the Graph API, and the lead was broadcast." |
| 2:45–3:15 | **Track status** in the tool shows **success** | "Meta also confirms the delivery to my webhook succeeded." |
| 3:15–4:15 | *Optional.* Stop the server (Ctrl+C): pill turns **Reconnecting…**. Start it again: back to **Connected** | "If the connection drops, the app reconnects with backoff and re-fetches the list, so it doesn't miss leads that came in while it was offline." |
| 4:15–4:45 | Wrap up | "So: Meta webhook, signature check, Graph fetch, store, WebSocket push to the app. The second video walks through the code." |

If a take fails, delete the test lead in the tool before trying again (only one test lead per form is allowed).

## Video 2: Code and architecture walkthrough (about 5–7 minutes)

Have VS Code open on the repo with the README rendered. Scroll to each function as you mention it.

1. **(0:00–0:45) Architecture: `README.md` → "How it works".**
   Two parts: `server/` (Node, Express, `ws`) and `app/` (Expo). The key fact is that the Meta webhook
   only carries IDs (`leadgen_id`, `form_id`, `page_id`), so the server has to fetch the answers from
   the Graph API with a Page token before it pushes anything to the app. I chose a WebSocket because the
   requirement is an *already-open* screen. Push notifications would be for a closed app.

2. **(0:45–1:15) `server/src/index.js`.**
   - `express.json({ verify })` keeps `req.rawBody`. The signature is computed over the exact bytes
     Meta sent, so re-serialised JSON can't be used.
   - Routes: `GET /` health check, `/webhook`, and `GET /leads` (with an open CORS header for Expo web).
   - `http.createServer(app)` plus `attachWebSocket(server)`: HTTP and WebSocket share one port,
     so one tunnel covers both.

3. **(1:15–2:45) `server/src/webhook.js`. This is the core.**
   - `webhookRouter.get('/')`: the verification handshake. Echo `hub.challenge` only when `hub.mode`
     is `subscribe` and `hub.verify_token` matches `VERIFY_TOKEN`. Otherwise return 403.
   - `webhookRouter.post('/')`: first `isSignatureValid`, then `res.sendStatus(200)` **before** any
     work, because Meta retries slow or failed deliveries. Then loop over `entry[].changes[]` and
     handle each `leadgen` change.
   - `isSignatureValid`: HMAC-SHA256 of the raw body keyed with `APP_SECRET`, compared with
     `X-Hub-Signature-256` using `crypto.timingSafeEqual` (length check first, because it throws on
     different lengths). With no `APP_SECRET` it skips the check and logs a loud warning (local testing only).
   - `handleLead`: dedupe with `hasLead` plus the `inFlight` set (Meta can retry while we're still
     fetching). Build the lead object, call `fetchLead`, and on failure keep the lead with `error`
     set instead of dropping it. Then `addLead` and `broadcast({ type: 'lead', lead })`.

4. **(2:45–3:15) `server/src/graph.js`.**
   `fetchLead`: one `fetch` to `/{leadgen_id}?fields=field_data,created_time,form_id` with the Page
   token. It flattens `field_data` (`[{ name, values: [] }]`) into `{ name: value }`. With
   `MOCK_GRAPH=1`, `mockFields` returns fake answers so everything can be tested without Meta.
   With no token it throws, and `handleLead` turns that into the lead's `error`.

5. **(3:15–3:35) `server/src/store.js`.**
   A `Map` keyed by `leadgen_id` (that's what makes dedupe trivial), mirrored to `data/leads.json` so a
   restart keeps the list. `listLeads` sorts newest first. In production this would be Postgres with a
   unique constraint.

6. **(3:35–4:00) `server/src/realtime.js`.**
   `attachWebSocket` mounts a `WebSocketServer` on `/ws`. A heartbeat pings every 30 seconds and
   terminates sockets that didn't answer the previous ping, which also stops tunnels from closing idle
   connections. `broadcast` JSON-encodes the message once and sends it to every open socket.

7. **(4:00–5:15) `app/src/useLeads.ts`. The only stateful code in the app.**
   - `API_URL` comes from `EXPO_PUBLIC_API_URL`. `WS_URL` swaps `http` for `ws` (and `https` for `wss`) and adds `/ws`.
   - `loadLeads` does `GET /leads`. It runs on mount **and** on every `onopen`, so leads that arrived
     before the first connect, or while the socket was down, are backfilled.
   - `onmessage` parses `{ type: 'lead' }`, merges it with `mergeLeads` (dedupe by id, newest first)
     and adds the id to `liveIds` so the card is highlighted.
   - `onclose` sets the status to `reconnecting` and retries with exponential backoff
     (1s, 2s, 4s… capped at 15s). `onopen` resets the attempt counter.
   - The effect's cleanup sets `stopped`, clears the timer and closes the socket, so nothing reconnects after unmount.

8. **(5:15–5:45) `app/App.tsx` and `app/src/LeadCard.tsx`.**
   `App.tsx` shows the header with a count and the status pill (`STATUS_STYLE`), a `FlatList` with
   an empty state ("No leads yet…"), and a message if `EXPO_PUBLIC_API_URL` isn't set.
   `LeadCard` shows name/email/phone (or `Lead <id>` plus the error when the details couldn't be fetched),
   and for live leads animates the background from yellow to white over 4 seconds.

9. **(5:45–6:15) Testing without Meta: `server/scripts/`.**
   `simulate-webhook.js` sends a webhook in exactly Meta's shape, signed with the same HMAC
   (`--id` to test dedupe, `--bad-signature` to see the 403). `ws-listen.js` is a terminal WebSocket client.

10. **(6:15–7:00) Assumptions and production changes: `ASSUMPTIONS.md`.**
    Single Page and token from `.env`; no auth on `/leads` and `/ws`; JSON file storage. For production:
    a queue between the webhook and processing, Postgres, auth and per-tenant scoping, OAuth per Page
    with refreshed tokens, Redis pub/sub to scale WebSockets, push notifications for a closed app, and
    a reconciliation job using `GET /{form-id}/leads`.
