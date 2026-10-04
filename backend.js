'use strict';
/* ---------- backend (Supabase): public read, organizer-only write ---------- */
const CFG = {
  url: 'https://zbhyqqrnjsayklzkjoxb.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiaHlxcXJuanNheWtsemtqb3hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMjczODksImV4cCI6MjEwNjcwMzM4OX0.kNLE3K2fcMKsx5w0IVEwlq2vvjg71vA1ChFOeycKOC4',
  fn: 'https://zbhyqqrnjsayklzkjoxb.supabase.co/functions/v1/tournament-save'
};
let passcode = '', version = 0, loginOpen = false, loginBusy = false, loginErr = '', loginVal = '';
try { passcode = localStorage.getItem('vb_pass') || ''; } catch (e) {}

async function fetchRow() {
  const r = await fetch(CFG.url + '/rest/v1/tournament?id=eq.main&select=data,version', {
    headers: { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key }, cache: 'no-store'
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const rows = await r.json();
  return rows[0] || { data: null, version: 0 };
}
function onNewState() {
  if (state && tab === null) tab = state.games.some(g => g.sa != null) ? 'ranking' : 'games';
  if (state && !state.players.some(p => p.id === selectedPlayer)) selectedPlayer = state.players[0] && state.players[0].id;
  if (!state) tab = null;
}
async function poll() {
  try {
    const row = await fetchRow();
    if (status !== 'ready' || row.version > version) {
      version = row.version; state = row.data; status = 'ready'; onNewState(); render();
    }
  } catch (e) { if (status === 'loading') { status = 'error'; render(); } }
}
async function callFn(payload) {
  const r = await fetch(CFG.fn, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: CFG.key },
    body: JSON.stringify(payload)
  });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) { const err = new Error(j.error || ('HTTP ' + r.status)); err.status = r.status; throw err; }
  return j;
}
function logout() { passcode = ''; isAdmin = false; try { localStorage.removeItem('vb_pass'); } catch (e) {} }
async function login(code) {
  const c = String(code || '').trim().toLowerCase();
  if (!c) { loginErr = 'הקלידו את סיסמת המארגן.'; render(); return; }
  loginBusy = true; loginErr = ''; render();
  try {
    await callFn({ action: 'verify', passcode: c });
    passcode = c; isAdmin = true; loginOpen = false; loginVal = '';
    try { localStorage.setItem('vb_pass', c); } catch (e) {}
  } catch (e) { loginErr = e.status === 401 ? 'הסיסמה שגויה.' : 'לא הצלחנו להתחבר. נסו שוב.'; }
  loginBusy = false; render();
}
async function resetTournament() {
  try {
    const res = await callFn({ action: 'save', passcode, data: null });
    state = null; version = Math.max(version, res.version); tab = null; render();
  } catch (err) { adminMsg = 'המחיקה נכשלה: ' + ((err && err.message) || err); render(); }
}

let queue = Promise.resolve();
function commit(fn) {
  if (!isAdmin) return Promise.resolve();
  queue = queue.then(async () => {
    const cur = state ? JSON.parse(JSON.stringify(state)) : null;
    const next = fn(cur);
    if (!next) return;
    state = next; render();                                   // optimistic update
    const res = await callFn({ action: 'save', passcode, data: next });
    version = Math.max(version, res.version);
  }).catch(async err => {
    if (err && err.status === 401) { logout(); loginErr = 'הסיסמה כבר לא תקפה. היכנסו שוב.'; loginOpen = true; }
    else adminMsg = 'השמירה נכשלה: ' + ((err && err.message) || err);
    version = -1; await poll();                                // resync from the server
    render();
  });
  return queue;
}

function footer() {
  if (isAdmin) return `<div class="foot"><span class="muted small">מחובר/ת כמארגן/ת</span><button class="linkbtn" data-action="logout">יציאה</button></div>`;
  if (!loginOpen) return `<div class="foot"><button class="linkbtn" data-action="login-open">כניסת מארגן</button></div>`;
  return `<div class="foot"><div class="login">
    <input id="login-code" type="password" autocomplete="off" placeholder="סיסמת מארגן" value="${esc(loginVal)}" aria-label="סיסמת מארגן">
    <button class="btn small" data-action="login-submit" ${loginBusy ? 'disabled' : ''}>${loginBusy ? 'בודק…' : 'כניסה'}</button>
    <button class="linkbtn" data-action="login-cancel">ביטול</button>
    ${loginErr ? `<span class="err" role="alert">${esc(loginErr)}</span>` : ''}</div></div>`;
}

function init() {
  render();
  poll();
  setInterval(() => { if (!document.hidden) poll(); }, 4000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  if (passcode) {
    callFn({ action: 'verify', passcode }).then(() => { isAdmin = true; render(); })
      .catch(e => { if (e && e.status === 401) { logout(); render(); } });
  }
}
