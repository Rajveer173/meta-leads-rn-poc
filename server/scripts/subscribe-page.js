// Subscribes this app to the Page's `leadgen` webhook field (README step 6).
// Uses PAGE_ACCESS_TOKEN from .env - `/me` on a Page token is the Page itself.
// Usage: npm run subscribe
const token = process.env.PAGE_ACCESS_TOKEN;
const version = process.env.GRAPH_VERSION || 'v25.0';
if (!token) {
  console.error('PAGE_ACCESS_TOKEN is not set in server/.env');
  process.exit(1);
}

const base = `https://graph.facebook.com/${version}/me`;

const page = await fetch(`${base}?fields=id,name&access_token=${token}`).then((r) => r.json());
if (page.error) {
  console.error('Token check failed:', page.error.message);
  process.exit(1);
}
console.log(`Page: ${page.name} (${page.id})`);

const sub = await fetch(`${base}/subscribed_apps?subscribed_fields=leadgen&access_token=${token}`, {
  method: 'POST',
}).then((r) => r.json());
console.log('Subscribe result:', sub);

const list = await fetch(`${base}/subscribed_apps?access_token=${token}`).then((r) => r.json());
console.log('Apps now subscribed to this Page:', JSON.stringify(list.data ?? list, null, 2));
