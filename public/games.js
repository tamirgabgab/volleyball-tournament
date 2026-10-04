'use strict';
function gamesView() {
  const nextIdx = state.games.findIndex(g => g.sa == null);
  const f = [['all', 'הכל'], ['pending', 'ממתינים'], ['done', 'הסתיימו']];
  const list = state.games.map((g, i) => ({ g, i })).filter(({ g }) => filter === 'all' || (filter === 'done' ? g.sa != null : g.sa == null));
  return `<div class="filters">${f.map(x => `<button class="pill" aria-pressed="${filter === x[0]}" data-action="filter" data-f="${x[0]}">${x[1]}</button>`).join('')}</div>` +
    (list.length ? list.map(({ g, i }) => gameCard(g, i, i === nextIdx)).join('') : `<p class="muted">אין משחקים להצגה בסינון הזה.</p>`);
}

function formation(ids, pm, gi) {
  // 3 players in the front row (at the net), the rest behind the attack line; genders mixed in each row,
  // rotated by game number so the same people do not always stand in the same spot
  const ps = ids.map(id => pm.get(id)).filter(Boolean).sort((x, y) => x.name.localeCompare(y.name, 'he'));
  const boys = ps.filter(p => p.g === 'm'), girls = ps.filter(p => p.g !== 'm');
  const first = girls.length >= boys.length ? girls : boys, second = first === girls ? boys : girls;
  const mixed = [];
  for (let i = 0; i < Math.max(first.length, second.length); i++) { if (first[i]) mixed.push(first[i]); if (second[i]) mixed.push(second[i]); }
  const r = mixed.length ? gi % mixed.length : 0;
  const rot = mixed.slice(r).concat(mixed.slice(0, r));
  const nFront = Math.min(3, Math.ceil(rot.length / 2));
  return { front: rot.slice(0, nFront), back: rot.slice(nFront) };
}

function gameCard(g, i, isNext) {
  const done = g.sa != null && g.sb != null, pm = pmap();
  const d = done ? g.sa - g.sb : 0, aw = done && d > 0, bw = done && d < 0;
  const chip = p => `<span class="chip ${p.g}" title="${p.g === 'm' ? 'בן' : 'בת'}" dir="auto">${esc(p.name)}</span>`;
  const frow = (cls, arr) => arr.length ? `<div class="frow ${cls}">${arr.map(chip).join('')}</div>` : '';
  const res = (won, diff) => done ? `<span class="res ${won ? '' : 'lose'}">${won ? '+1 נק׳' : '0 נק׳'} · הפרש <span class="num">${sgn(diff)}</span></span>` : '';
  const half = (side, ids, lost, labelHTML) => {
    const f = formation(ids, pm, i);
    const label = `<div class="tlabel">${labelHTML}</div>`;
    return `<div class="half ${side} ${lost ? 'lost' : ''}">` +
      (side === 'a' ? label + frow('back', f.back) + frow('front', f.front) : frow('front', f.front) + frow('back', f.back) + label) + `</div>`;
  };
  const playing = new Set([...g.a, ...g.b]);
  const bench = state.players.filter(p => !playing.has(p.id));
  const dr = drafts[i], va = dr ? dr.a : (g.sa == null ? '' : g.sa), vb = dr ? dr.b : (g.sb == null ? '' : g.sb);
  const mid = isAdmin ? `
      <div class="score-row">
        <input id="sa-${i}" type="number" inputmode="numeric" min="0" value="${esc(va)}" aria-label="נקודות קבוצה א׳ במשחק ${i + 1}">
        <span class="colon">:</span>
        <input id="sb-${i}" type="number" inputmode="numeric" min="0" value="${esc(vb)}" aria-label="נקודות קבוצה ב׳ במשחק ${i + 1}">
      </div>
      <div class="score-actions">
        <button class="btn small" data-action="save-score" data-i="${i}">${done ? 'עדכן' : 'שמור תוצאה'}</button>
        ${done ? `<button class="btn small ghost" data-action="clear-score" data-i="${i}">נקה</button>` : ''}
      </div>
      ${scoreErr[i] ? `<div class="err" role="alert">${esc(scoreErr[i])}</div>` : ''}`
    : done ? `<div class="score-row"><span class="big">${g.sa}</span><span class="colon">:</span><span class="big">${g.sb}</span></div>` : `<div class="vs">נגד</div>`;
  return `<article class="game">
    <div class="game-head"><h3>משחק ${i + 1}</h3>${done ? '<span class="tag">הסתיים</span>' : isNext ? '<span class="tag next">המשחק הבא</span>' : '<span class="tag">ממתין</span>'}</div>
    <div class="court"><div class="surface">
      ${half('a', g.a, bw, `קבוצה א׳ ${res(aw, d)}`)}
      <div class="netcol"><div class="scorebox">${mid}</div></div>
      ${half('b', g.b, aw, `קבוצה ב׳ ${res(bw, -d)}`)}
    </div></div>
    ${bench.length ? `<div class="bench">נחים: ${bench.map(p => esc(p.name)).join('، ')}</div>` : ''}
  </article>`;
}
