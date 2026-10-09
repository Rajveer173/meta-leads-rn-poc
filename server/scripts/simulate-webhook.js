// Sends a fake, correctly signed "leadgen" webhook to the server - exactly the
// shape Meta sends - so the pipeline can be tested without Meta.
//
//   npm run simulate                       # new random lead
//   npm run simulate -- --id 123456        # fixed id (run twice to test dedupe)
//   npm run simulate -- --bad-signature    # should be rejected with 403
//   npm run simulate -- --url https://xyz.trycloudflare.com/webhook
//
// Start the server with MOCK_GRAPH=1 so it returns fake form answers instead
// of calling the Graph API with an id that doesn't exist.
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

const url = arg('--url') ?? `http://localhost:${process.env.PORT || 3000}/webhook`;
const leadId = arg('--id') ?? String(Date.now()); // unique-ish id
const badSignature = args.includes('--bad-signature');

const payload = {
  object: 'page',
  entry: [
    {
      id: '1234567890',
      time: Math.floor(Date.now() / 1000),
      changes: [
        {
          field: 'leadgen',
          value: {
            leadgen_id: leadId,
            form_id: '444444444444',
            page_id: '1234567890',
            ad_id: '0',
            created_time: Math.floor(Date.now() / 1000),
          },
        },
      ],
    },
  ],
};

const body = JSON.stringify(payload);
const secret = badSignature ? 'wrong-secret' : process.env.APP_SECRET ?? '';
const signature = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature },
  body,
});
console.log(`POST ${url}  leadgen_id=${leadId}  ->  HTTP ${res.status} ${await res.text()}`);
