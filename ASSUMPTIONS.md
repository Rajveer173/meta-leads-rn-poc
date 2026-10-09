# Assumptions

What this Proof of Concept assumes, and what it deliberately leaves out.

## Scope

1. **Single tenant, single Page.** One Meta app, one Facebook Page, one Page access token
   (from env). Leads from any form on that Page are shown.
2. **One screen, already open.** The requirement is "appears live on an already-open screen",
   so the app uses a foreground WebSocket. There are **no push notifications** and no background
   delivery while the app is closed. When the app reconnects it re-fetches `/leads`, so nothing is lost.
3. **Test leads via the Lead Ads Testing Tool.** Running real ads is out of scope. The tool
   triggers the exact same `leadgen` webhook that a real submission does.

## Technical choices

4. **Expo** (SDK 57) is used as the React Native toolchain. The app runs in Expo Go with no native
   build needed (the Expo Go version on the phone must support SDK 57), and the same screen also
   runs in a browser with `npx expo start --web`.
5. **Lead details come from the Graph API.** The webhook only carries IDs (`leadgen_id`,
   `form_id`, `page_id`, `ad_id`, `created_time`). The server fetches `field_data` with the Page token.
   If that fetch fails (including when no token is configured), the lead is still stored and
   broadcast with an `error`, and the app shows it as `Lead <leadgen_id>` with the error text, so it's
   never dropped silently. `MOCK_GRAPH=1` replaces the Graph call with fake answers for local testing.
6. **Fields are shown generically.** `field_data` is flattened to `{name: value}`. The UI shows
   `full_name` (or `first_name` + `last_name`), `email` and `phone_number` when present.
7. **Storage is a JSON file** (`server/data/leads.json`), kept in memory and rewritten on each new
   lead. That's fine for demo volumes and avoids native modules on Windows. It's not safe for
   concurrent writers or large volumes.
8. **Dedupe on `leadgen_id`.** Meta retries webhooks (for up to 36 hours) until it gets a 200. The server
   replies 200 straight away, ignores ids it has already stored or is still fetching, and the app
   dedupes too.
9. **HTTPS via a tunnel.** Meta only calls HTTPS endpoints with a valid certificate. For the demo the
   local server is exposed with a Cloudflare quick tunnel (or ngrok / Render).
10. **Security is kept to a PoC level.** The webhook **is** verified (`X-Hub-Signature-256`
    HMAC with the App Secret, constant-time compare). The check is skipped only when `APP_SECRET` is unset,
    with a loud warning. The app-facing API (`/leads`, `/ws`) has **no authentication** and CORS
    is open. Anyone who knows the URL can read the leads, which is acceptable for test data only.
11. **Token handling is manual.** The Page access token is pasted into `.env`. There's no OAuth
    flow, no token refresh and no secret manager.
12. **The app's server URL is a build-time env var** (`EXPO_PUBLIC_API_URL`), not a settings screen.

## What would change for production

- Put webhook processing on a **queue** (SQS, BullMQ, etc.) so retries and Graph back-off are handled
  durably and the webhook only has to verify + enqueue.
- Use a real **database** (Postgres) with a unique constraint on `leadgen_id`.
- Add **auth** for the app API and the WebSocket (user login, per-tenant scoping), and lock down CORS.
- Support **multiple Pages and tenants**: an OAuth (Facebook Login for Business) flow per customer,
  encrypted token storage, a `subscribed_apps` call per Page, token health checks and re-auth prompts.
- **Scale out** the WebSocket layer (Redis pub/sub or a managed realtime service), and add
  **push notifications** for when the app is closed.
- Add monitoring and alerts on webhook failures and Graph errors, plus a periodic reconciliation job
  (`GET /{form-id}/leads`) to catch anything that was missed.
