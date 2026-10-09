// Tiny persistence layer: leads live in memory and are mirrored to a JSON
// file so they survive a server restart. Plenty for a single-page PoC;
// a real system would use a database with a unique index on the lead id.
import fs from 'node:fs';
import path from 'node:path';

const FILE = path.resolve(import.meta.dirname, '../data/leads.json');

// Map keyed by leadgen_id -> gives us dedupe for free.
const leads = new Map();

// Load whatever was saved last time.
try {
  for (const lead of JSON.parse(fs.readFileSync(FILE, 'utf8'))) leads.set(lead.id, lead);
  console.log(`[store] loaded ${leads.size} lead(s) from ${FILE}`);
} catch {
  // No file yet (first run) - start empty.
}

export function hasLead(id) {
  return leads.has(id);
}

export function addLead(lead) {
  leads.set(lead.id, lead);
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify([...leads.values()], null, 2));
}

// Newest first.
export function listLeads() {
  return [...leads.values()].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}
