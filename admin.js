'use strict';
function adminView() {
  const lastScored = state.games.reduce((m, g, i) => g.sa != null ? i : m, -1);
  const ps = pairStats(state), N = state.players.length;
  const maxCell = Math.max(1, ...ps[heatMode].flat());
  const short = n => n.length > 4 ? n.slice(0, 4) + '…' : n;
  const heat = `<div class="tablewrap"><table class="heat"><thead><tr><th></th>${state.players.map(p => `<th title="${esc(p.name)}"><bdi>${esc(short(p.name))}</bdi></th>`).join('')}</tr></thead><tbody>
    ${state.players.map((p, i) => `<tr><th><bdi>${esc(short(p.name))}</bdi></th>${state.players.map((q, j) => i === j ? '<td class="dg"></td>' :
      `<td style="background:rgba(29,92,142,${(0.08 + 0.52 * ps[heatMode][i][j] / maxCell).toFixed(2)})">${ps[heatMode][i][j]}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>`;
  return `
  ${adminMsg ? `<div class="panel err" role="alert">${esc(adminMsg)}</div>` : ''}
  <section class="panel"><h2>שם הטורניר</h2>
    <div class="field"><input id="ttl" type="text" maxlength="40" value="${esc(state.title)}" aria-label="שם הטורניר"></div></section>
  <section class="panel"><h2>שחקנים</h2>
    <div class="rename-grid">${state.players.map(p => `<label class="rn">${mk(p.g)}<input id="rn-${esc(p.id)}" data-pid="${esc(p.id)}" type="text" maxlength="30" value="${esc(p.name)}" aria-label="שם השחקן"></label>`).join('')}</div>
    <p class="muted small">אפשר לתקן שמות. מגדר אי אפשר לשנות אחרי יצירת הלוח; אם צריך, אפסו וצרו מחדש.</p></section>
  <section class="panel"><h2>לוח המשחקים</h2>
    <div class="inline"><label for="total" class="lbl">מספר משחקים</label>
      <input id="total" type="number" min="${lastScored + 1}" max="120" value="${state.games.length}" style="width:90px">
      <button class="btn small" data-action="set-total">עדכן</button>
      <button class="btn small ghost" data-action="shuffle">ערבב מחדש משחקים שטרם שוחקו</button></div>
    <p class="muted small">הגדלה מוסיפה משחקים בסוף. משחקים שכבר יש להם תוצאה לא משתנים לעולם.</p></section>
  <section class="panel"><h2>בדיקת פיזור</h2>
    <ul class="stats-list">
      <li>המקסימום שזוג שחקנים היה באותה קבוצה: <b>${ps.maxT}</b> (ממוצע ${ps.avgT.toFixed(1)})</li>
      <li>קבוצות שחזרו בדיוק באותו הרכב: <b>${ps.dupTeams}</b></li>
      <li>אותן 3 בנות או יותר (או בנים) שחזרו יחד: <b>${ps.dupGroups}</b></li>
      <li>זוגות שחזרו להיות שותפים במשחקים רצופים: <b>${ps.consec}</b>${ps.minConsec != null ? ` (המינימום המתמטי להרכב כזה: ${ps.minConsec})` : ''}</li>
    </ul>
    <div class="filters"><button class="pill" aria-pressed="${heatMode === 'tm'}" data-action="heat" data-m="tm">שותפים</button><button class="pill" aria-pressed="${heatMode === 'op'}" data-action="heat" data-m="op">יריבים</button></div>
    ${heat}</section>
  <section class="panel"><h2>איפוס</h2>
    <p class="muted small">מוחק את כל הטורניר, כולל התוצאות, עבור כל הצופים.</p>
    <button class="btn danger" data-action="reset">${confirmReset ? 'לחצו שוב למחיקה סופית' : 'אפס את הטורניר'}</button></section>`;
}

function setupInfo() {
  const named = setup.rows.filter(r => r.name.trim());
  const b = named.filter(r => r.g === 'm').length, g = named.filter(r => r.g === 'f').length;
  if (!setup.kTouched) setup.k = Math.max(1, Math.floor(named.length / 2));
  return { n: named.length, b, g, unset: named.filter(r => !r.g).length };
}

function compText(inf, k) {
  const N = inf.n;
  if (N < 2 * k) return `לקבוצות של ${k} צריך לפחות ${2 * k} שחקנים.`;
  if (N > 2 * k) return `בכל משחק משחקים ${2 * k} מתוך ${N}; השאר נחים בסבב הוגן, והקבוצות מאוזנות מגדרית ככל האפשר.`;
  const bA = Math.floor(inf.b / 2), bB = inf.b - bA;
  if (inf.b % 2 === 0) return `בכל קבוצה: ${cnt(bA, 'm')} ו-${cnt(k - bA, 'f')}.`;
  return `קבוצה אחת עם ${cnt(bA, 'm')} ו-${cnt(k - bA, 'f')}, והשנייה עם ${cnt(bB, 'm')} ו-${cnt(k - bB, 'f')}.`;
}

function setupSummaryHTML() {
  const inf = setupInfo();
  return `${inf.n} שחקנים: ${cnt(inf.b, 'm')} · ${cnt(inf.g, 'f')}${inf.unset ? ` · ${inf.unset} בלי מגדר` : ''}<br>${inf.n ? esc(compText(inf, setup.k)) : ''}`;
}

function setupView() {
  setupInfo();
  return head('הגדרת טורניר') + `<p class="muted">מקלידים שמות, מסמנים בן או בת, והמערכת בונה לוח משחקים עם פיזור מקסימלי של שותפים ויריבים.</p>
  <section class="panel"><div class="field"><label for="s-title">שם הטורניר</label><input id="s-title" type="text" maxlength="40" value="${esc(setup.title)}"></div></section>
  <section class="panel"><h2>שחקנים</h2>
    ${setup.rows.map((r, i) => `<div class="prow">
      <input id="s-name-${i}" type="text" maxlength="30" placeholder="שם שחקן ${i + 1}" value="${esc(r.name)}" aria-label="שם שחקן ${i + 1}">
      <div class="seg" role="group" aria-label="מגדר">
        <button class="m" id="s-g-${i}-m" aria-pressed="${r.g === 'm'}" data-action="setup-gender" data-i="${i}" data-g="m">בן</button>
        <button class="f" id="s-g-${i}-f" aria-pressed="${r.g === 'f'}" data-action="setup-gender" data-i="${i}" data-g="f">בת</button>
      </div>
      <button class="x" data-action="setup-remove" data-i="${i}" aria-label="הסר שחקן ${i + 1}">×</button></div>`).join('')}
    <button class="btn small ghost" data-action="setup-add">הוסף שחקן</button>
    <p class="muted" id="s-summary" style="margin-top:14px">${setupSummaryHTML()}</p></section>
  <section class="panel"><h2>המשחקים</h2>
    <div class="row2">
      <div class="field"><label for="s-k">שחקנים בכל קבוצה</label><input id="s-k" type="number" min="1" max="20" value="${setup.k}"></div>
      <div class="field"><label for="s-games">מספר משחקים</label><input id="s-games" type="number" min="1" max="120" value="${setup.games}"></div>
    </div>
    ${setup.error ? `<p class="err" role="alert">${esc(setup.error)}</p>` : ''}
    <button class="btn" data-action="setup-create" ${busy ? 'disabled' : ''}>${busy ? 'בונה לוח משחקים…' : 'צור לוח משחקים'}</button></section>`;
}

function createTournament() {
  const named = setup.rows.filter(r => r.name.trim()).map(r => ({ name: r.name.trim(), g: r.g }));
  const k = parseInt(setup.k, 10), G = parseInt(setup.games, 10);
  const lower = named.map(r => r.name.toLowerCase());
  let err = '';
  if (named.length < 2) err = 'הוסיפו לפחות שני שחקנים.';
  else if (named.some(r => !r.g)) err = 'סמנו בן או בת לכל שחקן.';
  else if (new Set(lower).size !== lower.length) err = 'יש שמות כפולים. שנו שם אחד.';
  else if (!(k >= 1)) err = 'מספר השחקנים בקבוצה חייב להיות לפחות 1.';
  else if (named.length < 2 * k) err = `לקבוצות של ${k} צריך לפחות ${2 * k} שחקנים. יש ${named.length}.`;
  else if (!(G >= 1 && G <= 120)) err = 'מספר המשחקים חייב להיות בין 1 ל-120.';
  setup.error = err;
  if (err) { render(); return; }
  busy = true; render();
  setTimeout(async () => {
    try {
      const players = named.map((r, i) => ({ id: 'p' + (i + 1), name: r.name, g: r.g }));
      const games = buildSchedule(players, k, G, [], () => false);
      const doc = { title: setup.title.trim() || 'טורניר כדורעף', k, players, games, v: 1, createdAt: new Date().toISOString() };
      const res = await callFn({ action: 'save', passcode, data: doc });
      state = doc; version = Math.max(version, res.version); tab = null; onNewState();
    } catch (e) { setup.error = 'היצירה נכשלה: ' + ((e && e.message) || e); }
    busy = false; render();
  }, 40);
}
