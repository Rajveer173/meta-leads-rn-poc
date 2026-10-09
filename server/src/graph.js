// Fetches the full lead (the form answers) from the Graph API.
// Docs: https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving
//
// Graph returns: { id, created_time, field_data: [{ name: 'email', values: ['a@b.com'] }, ...] }
// We flatten field_data into { email: 'a@b.com', full_name: '...', ... }.

export async function fetchLead(leadgenId) {
  if (process.env.MOCK_GRAPH === '1') return mockFields(leadgenId);

  const token = process.env.PAGE_ACCESS_TOKEN;
  if (!token) throw new Error('PAGE_ACCESS_TOKEN not set');

  const version = process.env.GRAPH_VERSION || 'v25.0';
  const url =
    `https://graph.facebook.com/${version}/${encodeURIComponent(leadgenId)}` +
    `?fields=field_data,created_time,form_id&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || body.error) {
    throw new Error(body.error?.message ?? `Graph API HTTP ${res.status}`);
  }

  const fields = {};
  for (const f of body.field_data ?? []) {
    fields[f.name] = (f.values ?? []).join(', ');
  }
  return fields;
}

// Fake answers so the whole pipeline can be tested without Meta.
function mockFields(leadgenId) {
  const n = String(leadgenId).slice(-4);
  return {
    full_name: `Test User ${n}`,
    email: `test${n}@example.com`,
    phone_number: `+91 98765 ${n.padStart(5, '0')}`,
  };
}
