// End-to-end flow in jsdom against a fake backend that mirrors the real rules:
// public read, organizer-only write (passcode checked against a salted SHA-256), versioned rows.
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert');

const PUB = path.join(__dirname, '../public');
const order = ['scheduler', 'backend', 'stats', 'games', 'admin', 'app'];
let html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8')
  .replace(/<link[^>]*fonts[^>]*>/g, '')
  .replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, f) => '<style>' + fs.readFileSync(path.join(PUB, f), 'utf8') + '</style>');
order.forEach(f => {
  html = html.replace(`<script src="${f}.js"></script>`, () => '<script>' + fs.readFileSync(path.join(PUB, f + '.js'), 'utf8') + '</script>');
});

const PASS = 'test-pass-1234', SALT = 'salt-for-tests';
const hash = p => crypto.createHash('sha256').update(SALT + p).digest('hex');
const srv = { row: { id: 'main', data: null, version: 0 } };
const fakeFetch = (url, opts = {}) => {
  const res = (status, body) => Promise.resolve({ ok: status < 300, status, json: async () => body });
  if (url.includes('/rest/v1/tournament')) return res(200, [JSON.parse(JSON.stringify(srv.row))]);
  const b = JSON.parse(opts.body);
  if (hash((b.passcode || '').trim().toLowerCase()) !== hash(PASS)) return res(401, { ok: false, error: 'bad passcode' });
  if (b.action === 'verify') return res(200, { ok: true });
  srv.row = { id: 'main', data: b.data, version: srv.row.version + 1 };
  return res(200, { ok: true, version: srv.row.version });
};
const open = () => new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.test/',
  beforeParse(w) { w.fetch = fakeFetch; w.scrollTo = () => {}; }
});
const wait = ms => new Promise(r => setTimeout(r, ms));
const text = d => d.getElementById('app').textContent;

(async () => {
  const errs = [];
  const V = open(); V.window.addEventListener('error', e => errs.push(e.message));
  const A = open(); A.window.addEventListener('error', e => errs.push(e.message));
  const w = A.window, d = w.document, vw = V.window, vd = vw.document;
  const click = (win, el) => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const input = (win, el, v) => { el.value = v; el.dispatchEvent(new win.Event('input', { bubbles: true })); };
  await wait(150);

  assert.ok(/עוד לא הוגדר/.test(text(vd)), 'viewer should see the "not set up" message');

  // wrong passcode is rejected, right one (typed in upper case) is accepted
  click(w, d.querySelector('[data-action="login-open"]'));
  input(w, d.getElementById('login-code'), 'wrong-code');
  click(w, d.querySelector('[data-action="login-submit"]')); await wait(100);
  assert.ok(!/הגדרת טורניר/.test(text(d)), 'wrong passcode must not open setup');
  input(w, d.getElementById('login-code'), PASS.toUpperCase());
  click(w, d.querySelector('[data-action="login-submit"]')); await wait(100);
  assert.ok(/הגדרת טורניר/.test(text(d)), 'organizer should see setup');

  // create a tournament: 4 boys + 6 girls, 12 games
  const names = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6'];
  names.forEach((n, i) => {
    input(w, d.getElementById('s-name-' + i), n);
    click(w, d.getElementById(`s-g-${i}-${i < 4 ? 'm' : 'f'}`));
  });
  input(w, d.getElementById('s-games'), '12');
  click(w, d.querySelector('[data-action="setup-create"]')); await wait(3500);
  assert.strictEqual(d.querySelectorAll('article.game').length, 12);
  [...d.querySelectorAll('article.game')[0].querySelectorAll('.half')].forEach(h => {
    assert.strictEqual(h.querySelectorAll('.chip').length, 5);
    assert.strictEqual(h.querySelectorAll('.chip.m').length, 2);
    assert.strictEqual(h.querySelector('.front').children.length, 3, 'front row has 3');
    assert.strictEqual(h.querySelector('.back').children.length, 2, 'back row has 2');
  });

  // scoring: 25-20 in game 1, tie rejected, 18-25 in game 2
  const setScore = (i, a, b) => {
    input(w, d.getElementById('sa-' + i), a);
    input(w, d.getElementById('sb-' + i), b);
    click(w, d.querySelector(`[data-action="save-score"][data-i="${i}"]`));
  };
  setScore(0, 25, 20); await wait(100);
  setScore(1, 18, 25); await wait(100);
  setScore(2, 21, 21); await wait(50);
  assert.ok(/אין תיקו/.test(text(d)), 'a tie must be rejected');
  assert.strictEqual(srv.row.data.games[2].sa, null);

  // standings equal a manual calculation (points, wins, losses, scored/conceded, differential)
  click(w, d.querySelector('[data-action="tab"][data-tab="ranking"]'));
  const st = srv.row.data, exp = {};
  st.players.forEach(p => { exp[p.name] = { pts: 0, w: 0, l: 0, pf: 0, pa: 0, diff: 0 }; });
  const nm = new Map(st.players.map(p => [p.id, p.name]));
  [st.games[0], st.games[1]].forEach(g => {
    g.a.forEach(i => { const e = exp[nm.get(i)]; e.pf += g.sa; e.pa += g.sb; e.diff += g.sa - g.sb; if (g.sa > g.sb) { e.pts++; e.w++; } else e.l++; });
    g.b.forEach(i => { const e = exp[nm.get(i)]; e.pf += g.sb; e.pa += g.sa; e.diff += g.sb - g.sa; if (g.sb > g.sa) { e.pts++; e.w++; } else e.l++; });
  });
  const rows = [...d.querySelectorAll('table.board tbody tr')];
  assert.strictEqual(rows.length, 10);
  rows.forEach(r => {
    const c = [...r.children].map(x => x.textContent.trim());
    const e = exp[c[1]];
    assert.strictEqual(+c[2], e.pts, c[1] + ' points');
    assert.strictEqual(+c[3], e.w, c[1] + ' wins');
    assert.strictEqual(+c[4], e.l, c[1] + ' losses');
    assert.strictEqual(c[5].replace(/\s/g, ''), `${e.pf}–${e.pa}`, c[1] + ' scored–conceded');
    assert.strictEqual(c[6].replace('−', '-'), (e.diff > 0 ? '+' : '') + e.diff, c[1] + ' differential');
  });
  const pts = rows.map(r => +r.children[2].textContent);
  const dif = rows.map(r => +r.children[6].textContent.replace('−', '-'));
  for (let i = 1; i < rows.length; i++) {
    assert.ok(pts[i - 1] > pts[i] || (pts[i - 1] === pts[i] && dif[i - 1] >= dif[i]), 'ranking order: points, then differential');
  }

  // viewer: read-only and live
  vd.dispatchEvent(new vw.Event('visibilitychange')); await wait(300);
  assert.strictEqual(vd.querySelectorAll('input[type=number]').length, 0, 'viewer has no inputs');
  assert.ok(![...vd.querySelectorAll('.tabs button')].some(b => b.textContent === 'ניהול'), 'viewer has no admin tab');
  click(vw, vd.querySelector('[data-action="tab"][data-tab="games"]'));
  assert.strictEqual([...vd.querySelectorAll('.tag')].filter(t => t.textContent === 'הסתיים').length, 2);
  click(w, d.querySelector('[data-action="tab"][data-tab="games"]'));
  setScore(3, 25, 10); await wait(4600);
  assert.strictEqual([...vd.querySelectorAll('.tag')].filter(t => t.textContent === 'הסתיים').length, 3, 'viewer polls automatically');

  // security: unauthorized save fails; names are escaped
  const bad = await fakeFetch('x/functions/v1/tournament-save', { body: JSON.stringify({ action: 'save', passcode: 'nope', data: { players: [], games: [] } }) });
  assert.strictEqual(bad.status, 401);
  click(w, d.querySelector('[data-action="tab"][data-tab="admin"]'));
  const rn = d.querySelector('input[data-pid="p1"]');
  rn.value = '<img src=x onerror=alert(1)>'; rn.dispatchEvent(new w.Event('change', { bubbles: true })); await wait(150);
  vd.dispatchEvent(new vw.Event('visibilitychange')); await wait(300);
  assert.strictEqual(vd.querySelectorAll('img').length, 0, 'names must be rendered as text');

  // adding games keeps scored ones; reset clears for everyone
  const scoredBefore = JSON.stringify(srv.row.data.games.filter(g => g.sa != null));
  d.getElementById('total').value = '20';
  click(w, d.querySelector('[data-action="set-total"]')); await wait(3000);
  assert.strictEqual(srv.row.data.games.length, 20);
  assert.strictEqual(JSON.stringify(srv.row.data.games.filter(g => g.sa != null)), scoredBefore);
  click(w, d.querySelector('[data-action="reset"]')); click(w, d.querySelector('[data-action="reset"]')); await wait(150);
  vd.dispatchEvent(new vw.Event('visibilitychange')); await wait(300);
  assert.ok(/הגדרת טורניר/.test(text(d)) && /עוד לא הוגדר/.test(text(vd)));

  assert.deepStrictEqual(errs, [], 'no JS errors');
  console.log('e2e tests passed');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
