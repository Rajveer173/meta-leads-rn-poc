// Meta webhook endpoint for the Page "leadgen" field.
// Docs: https://developers.facebook.com/docs/graph-api/webhooks/getting-started
import crypto from 'node:crypto';
import { Router } from 'express';
import { fetchLead } from './graph.js';
import { hasLead, addLead } from './store.js';
import { broadcast } from './realtime.js';

export const webhookRouter = Router();

// 1) Verification handshake. When you save the callback URL in the App
//    Dashboard, Meta calls GET /webhook?hub.mode=subscribe&hub.verify_token=..&hub.challenge=..
//    We must echo hub.challenge back, but only if the token is ours.
webhookRouter.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token && token === process.env.VERIFY_TOKEN) {
    console.log('[webhook] verification OK');
    return res.status(200).send(challenge);
  }
  console.warn('[webhook] verification FAILED (wrong verify token?)');
  return res.sendStatus(403);
});

// 2) Event notifications. Meta POSTs a JSON body like:
//    { object: 'page', entry: [{ changes: [{ field: 'leadgen',
//      value: { leadgen_id, form_id, page_id, ad_id, created_time } }] }] }
//    Note: it carries only IDs - the actual answers are fetched from Graph API.
webhookRouter.post('/', (req, res) => {
  if (!isSignatureValid(req)) {
    console.warn('[webhook] rejected: bad X-Hub-Signature-256');
    return res.sendStatus(403);
  }

  // Acknowledge straight away. Meta expects a fast 200 and will retry
  // (for up to 36h) if we are slow or fail - which is why we dedupe below.
  res.sendStatus(200);

  for (const entry of req.body?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === 'leadgen' && change.value?.leadgen_id) {
        handleLead(change.value).catch((err) => console.error('[webhook] handleLead crashed', err));
      }
    }
  }
});

// IDs we are currently fetching, so a fast Meta retry doesn't fetch twice.
const inFlight = new Set();

async function handleLead(value) {
  const id = String(value.leadgen_id);
  if (hasLead(id) || inFlight.has(id)) {
    console.log(`[webhook] duplicate lead ${id} ignored`);
    return;
  }
  inFlight.add(id);

  try {
    const lead = {
      id,
      formId: String(value.form_id ?? ''),
      pageId: String(value.page_id ?? ''),
      adId: value.ad_id ? String(value.ad_id) : null,
      // created_time is a unix timestamp in seconds
      createdTime: value.created_time
        ? new Date(Number(value.created_time) * 1000).toISOString()
        : new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      fields: {},
      error: null,
    };

    // Fetch the form answers. If this fails (bad token, missing permission,
    // dashboard "test" payload with a fake id...) we still show the lead
    // with its IDs and an error, rather than silently dropping it.
    try {
      lead.fields = await fetchLead(id);
    } catch (err) {
      lead.error = err.message;
      console.error(`[webhook] Graph fetch failed for ${id}: ${err.message}`);
    }

    addLead(lead);
    broadcast({ type: 'lead', lead });
    console.log(`[webhook] new lead ${id} stored + broadcast`, lead.fields);
  } finally {
    inFlight.delete(id);
  }
}

// X-Hub-Signature-256: "sha256=<hex HMAC-SHA256 of raw body, keyed with App Secret>"
function isSignatureValid(req) {
  const secret = process.env.APP_SECRET;
  if (!secret) {
    console.warn('[webhook] !!! APP_SECRET not set - skipping signature check !!!');
    return true;
  }
  const header = req.get('x-hub-signature-256') ?? '';
  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody ?? '').digest('hex');

  // timingSafeEqual throws on different lengths, so check that first.
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
