'use strict';
const $app = document.getElementById('app');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let isAdmin = false, state = null, status = 'loading';
let tab = null, filter = 'all', selectedPlayer = null, heatMode = 'tm';
let adminMsg = '', confirmReset = false, busy = false;
const drafts = {}, scoreErr = {};
const setup = { title: 'טורניר כדורעף', rows: Array.from({ length: 10 }, () => ({ name: '', g: '' })), k: 5, kTouched: false, games: 10, error: '' };

const sgn = n => n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0';
const sgnH = n => `<span class="num ${n > 0 ? 'pos' : n < 0 ? 'neg' : ''}">${sgn(n)}</span>`;
const mk = g => `<span class="mk ${g}" aria-hidden="true"></span>`;
const pmap = () => new Map(state.players.map(p => [p.id, p]));
const cnt = (n, g) => g === 'm' ? (n === 1 ? 'בן אחד' : n + ' בנים') : (n === 1 ? 'בת אחת' : n + ' בנות');

function render() {
  const ae = document.activeElement; const fid = ae && ae.id; let sel = null;
  try { if (ae && ae.selectionStart != null) sel = [ae.selectionStart, ae.selectionEnd]; } catch (e) {}
  const y = window.scrollY;
  $app.innerHTML = view();
  if (fid) { const el = document.getElementById(fid); if (el) { el.focus({ preventScroll: true }); try { if (sel) el.setSelectionRange(sel[0], sel[1]); } catch (e) {} } }
  window.scrollTo(0, y);
}

function view() { return viewMain() + footer(); }

function viewMain() {
  if (status === 'loading') return head('טורניר כדורעף') + `<p class="muted">טוען…</p>`;
  if (status === 'nodb') return head('טורניר כדורעף') + `<div class="notice"><b>הדירוג החי דורש התחברות.</b><br>הדף מתעדכן דרך חשבון Claude. התחברו לחשבון ופתחו שוב את הקישור.</div>`;
  if (status === 'error') return head('טורניר כדורעף') + `<div class="notice">הנתונים לא נטענו. נסו לרענן את הדף.</div>`;
  if (!state) return isAdmin ? setupView() : head('טורניר כדורעף') + `<div class="notice">הטורניר עוד לא הוגדר. הדירוג יופיע כאן ברגע שהמארגן/ת ייצרו את לוח המשחקים.</div>`;
  return tournamentView();
}

function head(title, extra) {
  return `<div class="top"><h1>${esc(title)}</h1>${extra || ''}</div>`;
}

function tournamentView() {
  const total = state.games.length, done = state.games.filter(g => g.sa != null).length;
  const tabs = [['ranking', 'דירוג'], ['games', 'משחקים'], ['players', 'שחקנים']];
  if (isAdmin) tabs.push(['admin', 'ניהול']);
  if (!tabs.some(t => t[0] === tab)) tab = 'ranking';
  const body = tab === 'ranking' ? rankingView() : tab === 'games' ? gamesView() : tab === 'players' ? playerView() : adminView();
  return head(state.title, `<div class="meta"><span>${done} מתוך ${total} משחקים שוחקו</span><span class="live">מתעדכן בלייב</span></div>`) +
    `<div class="tabs" role="tablist">${tabs.map(t => `<button role="tab" aria-selected="${tab === t[0]}" data-action="tab" data-tab="${t[0]}">${t[1]}</button>`).join('')}</div>` + body;
}

/* ---------- actions ---------- */
function saveScore(i) {
  const g = state.games[i];
  const dr = drafts[i];
  const rawA = document.getElementById('sa-' + i).value, rawB = document.getElementById('sb-' + i).value;
  const a = Number(rawA), b = Number(rawB);
  if (rawA === '' || rawB === '' || !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 300 || b > 300) { scoreErr[i] = 'הזינו תוצאה של שתי הקבוצות (מספרים שלמים).'; render(); return; }
  if (a === b) { scoreErr[i] = 'אין תיקו בכדורעף. הזינו תוצאה עם מנצחת.'; render(); return; }
  delete scoreErr[i]; delete drafts[i];
  commit(s => { s.games[i].sa = a; s.games[i].sb = b; return s; });
  render();
}

function applyTotal(total) {
  commit(s => {
    if (total < s.games.length) s.games = s.games.slice(0, total);
    else if (total > s.games.length) s.games = buildSchedule(s.players, s.k, total, s.games, () => true);
    else return null;
    return s;
  });
}

$app.addEventListener('click', e => {
  const t = e.target.closest('[data-action]'); if (!t) return;
  const a = t.dataset.action;
  if (a === 'tab') { tab = t.dataset.tab; adminMsg = ''; confirmReset = false; render(); }
  else if (a === 'filter') { filter = t.dataset.f; render(); }
  else if (a === 'open-player') { selectedPlayer = t.dataset.id; tab = 'players'; render(); window.scrollTo(0, 0); }
  else if (a === 'pick-player') { selectedPlayer = t.dataset.id; render(); }
  else if (a === 'heat') { heatMode = t.dataset.m; render(); }
  else if (a === 'login-open') { loginOpen = true; loginErr = ''; render(); const el = document.getElementById('login-code'); if (el) el.focus(); }
  else if (a === 'login-cancel') { loginOpen = false; loginErr = ''; loginVal = ''; render(); }
  else if (a === 'login-submit') { const el = document.getElementById('login-code'); login(el ? el.value : loginVal); }
  else if (a === 'logout') { logout(); render(); }
  else if (a === 'save-score') saveScore(+t.dataset.i);
  else if (a === 'clear-score') { const i = +t.dataset.i; delete drafts[i]; delete scoreErr[i]; commit(s => { s.games[i].sa = null; s.games[i].sb = null; return s; }); render(); }
  else if (a === 'setup-gender') { setup.rows[+t.dataset.i].g = t.dataset.g; render(); }
  else if (a === 'setup-add') { setup.rows.push({ name: '', g: '' }); render(); const el = document.getElementById('s-name-' + (setup.rows.length - 1)); if (el) el.focus(); }
  else if (a === 'setup-remove') { setup.rows.splice(+t.dataset.i, 1); render(); }
  else if (a === 'setup-create') createTournament();
  else if (a === 'set-total') {
    const total = parseInt(document.getElementById('total').value, 10);
    const lastScored = state.games.reduce((m, g, i) => g.sa != null ? i : m, -1);
    if (!(total >= 1 && total <= 120)) adminMsg = 'מספר המשחקים חייב להיות בין 1 ל-120.';
    else if (total < lastScored + 1) adminMsg = `אי אפשר לרדת מתחת ל-${lastScored + 1} משחקים, כי כבר יש תוצאות.`;
    else { adminMsg = ''; applyTotal(total); }
    render();
  }
  else if (a === 'shuffle') {
    adminMsg = ''; busy = true; render();
    setTimeout(() => { commit(s => { s.games = buildSchedule(s.players, s.k, s.games.length, s.games, g => g.sa != null); return s; }).then(() => { busy = false; render(); }); }, 30);
  }
  else if (a === 'reset') {
    if (!confirmReset) { confirmReset = true; render(); setTimeout(() => { if (confirmReset) { confirmReset = false; render(); } }, 5000); }
    else { confirmReset = false; Object.keys(drafts).forEach(k => delete drafts[k]); resetTournament(); }
  }
});

$app.addEventListener('input', e => {
  const id = e.target.id || '';
  let m;
  if ((m = id.match(/^s-name-(\d+)$/))) { setup.rows[+m[1]].name = e.target.value; const el = document.getElementById('s-summary'); if (el) el.innerHTML = setupSummaryHTML(); }
  else if (id === 's-title') setup.title = e.target.value;
  else if (id === 's-k') { setup.k = e.target.value; setup.kTouched = true; const el = document.getElementById('s-summary'); if (el) el.innerHTML = setupSummaryHTML(); }
  else if (id === 's-games') setup.games = e.target.value;
  else if (id === 'login-code') loginVal = e.target.value;
  else if ((m = id.match(/^s([ab])-(\d+)$/))) {
    const i = +m[2], g = state.games[i];
    drafts[i] = drafts[i] || { a: g.sa == null ? '' : g.sa, b: g.sb == null ? '' : g.sb };
    drafts[i][m[1]] = e.target.value;
  }
});

$app.addEventListener('change', e => {
  const id = e.target.id || '';
  if (id === 'ttl') { const v = e.target.value.trim(); if (v) commit(s => { s.title = v; return s; }); }
  else if (e.target.dataset && e.target.dataset.pid) {
    const pid = e.target.dataset.pid, v = e.target.value.trim();
    if (!v) { adminMsg = 'שם לא יכול להיות ריק.'; render(); return; }
    if (state.players.some(p => p.id !== pid && p.name.toLowerCase() === v.toLowerCase())) { adminMsg = 'כבר יש שחקן בשם הזה.'; render(); return; }
    adminMsg = ''; commit(s => { s.players.find(p => p.id === pid).name = v; return s; });
  }
});

$app.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'login-code') { e.preventDefault(); login(e.target.value); return; }
  const id = e.target.id || '', m = id.match(/^s([ab])-(\d+)$/);
  if (m) { e.preventDefault(); saveScore(+m[2]); return; }
  const n = id.match(/^s-name-(\d+)$/);
  if (n) {
    e.preventDefault(); const i = +n[1];
    if (i === setup.rows.length - 1) { setup.rows.push({ name: '', g: '' }); render(); }
    const el = document.getElementById('s-name-' + (i + 1)); if (el) el.focus();
  }
});

init();
