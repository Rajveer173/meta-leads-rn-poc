// All the "live data" logic for the screen lives in this hook:
//   1. load existing leads over HTTP (GET /leads)
//   2. open a WebSocket to /ws and add each pushed lead to state
//   3. if the socket drops, reconnect with backoff and re-fetch /leads so
//      nothing that arrived while we were offline is missed
import { useEffect, useState } from 'react';

// Same shape the server stores (see server/src/webhook.js).
export type Lead = {
  id: string; // Meta leadgen_id
  formId: string;
  pageId: string;
  adId: string | null;
  createdTime: string; // ISO string
  receivedAt: string; // ISO string
  fields: Record<string, string>; // flattened Graph API field_data
  error: string | null; // set if the Graph API fetch failed
};

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting';

// e.g. https://abc.trycloudflare.com  or  http://192.168.1.20:3000
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
// http -> ws, https -> wss
const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws';

// Add incoming leads to the list: dedupe by id, newest first.
function mergeLeads(current: Lead[], incoming: Lead[]): Lead[] {
  const byId = new Map(current.map((l) => [l.id, l]));
  for (const lead of incoming) byId.set(lead.id, lead);
  return [...byId.values()].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export function useLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  // ids that arrived live over the socket -> the UI highlights these
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!API_URL) return;

    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false; // set on unmount so we stop reconnecting

    async function loadLeads() {
      try {
        const res = await fetch(`${API_URL}/leads`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: Lead[] = await res.json();
        setLeads((current) => mergeLeads(current, data));
      } catch (err) {
        console.warn('GET /leads failed', err);
      }
    }

    function connect() {
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        attempt = 0;
        setStatus('connected');
        // Backfill: covers leads that arrived before the socket was open
        // (first connect) or while it was down (reconnect).
        loadLeads();
      };

      socket.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return; // ignore anything that isn't JSON
        }
        if (msg.type === 'lead') {
          setLeads((current) => mergeLeads(current, [msg.lead]));
          setLiveIds((ids) => new Set(ids).add(msg.lead.id));
        }
      };

      socket.onclose = () => {
        if (stopped) return;
        setStatus('reconnecting');
        // Exponential backoff: 1s, 2s, 4s, 8s ... capped at 15s.
        const delay = Math.min(1000 * 2 ** attempt, 15000);
        attempt += 1;
        retryTimer = setTimeout(connect, delay);
      };

      // An error is always followed by close, which handles the retry.
      socket.onerror = () => {};
    }

    loadLeads(); // show existing leads straight away
    connect();

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      socket?.close();
    };
  }, []);

  return { leads, status, liveIds };
}
