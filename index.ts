import { createClient } from 'npm:@supabase/supabase-js@2';

// Custom auth: the organizer passcode is checked against a salted SHA-256 hash
// stored in a table that the public API cannot read. Everyone else is read-only.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const sha256 = async (s: string) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
};
const safeEq = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: sec, error: secErr } = await sb.from('organizer_secret').select('salt,hash').eq('id', 1).single();
  if (secErr || !sec) return json({ error: 'server error' }, 500);

  const pass = typeof body.passcode === 'string' ? body.passcode.trim().toLowerCase() : '';
  const ok = pass.length > 0 && pass.length < 100 && safeEq(await sha256(sec.salt + pass), sec.hash);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return json({ ok: false, error: 'bad passcode' }, 401);
  }

  if (body.action === 'verify') return json({ ok: true });

  if (body.action === 'save') {
    const d = body.data;
    if (d !== null) {
      const valid = d && typeof d === 'object' && Array.isArray(d.players) && Array.isArray(d.games)
        && d.players.length <= 60 && d.games.length <= 200 && JSON.stringify(d).length < 400000;
      if (!valid) return json({ error: 'invalid tournament data' }, 400);
    }
    const { data: cur } = await sb.from('tournament').select('version').eq('id', 'main').maybeSingle();
    const version = ((cur && cur.version) || 0) + 1;
    const { error } = await sb.from('tournament').upsert({
      id: 'main', data: d, version, updated_at: new Date().toISOString(),
    });
    if (error) return json({ error: 'write failed' }, 500);
    return json({ ok: true, version });
  }

  return json({ error: 'unknown action' }, 400);
});
