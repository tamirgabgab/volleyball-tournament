'use strict';
function computeStats(s) {
  const m = new Map(s.players.map(p => [p.id, { id: p.id, name: p.name, g: p.g, games: 0, wins: 0, losses: 0, points: 0, diff: 0, pf: 0, pa: 0 }]));
  s.games.forEach(gm => {
    if (gm.sa == null || gm.sb == null) return;
    const d = gm.sa - gm.sb;
    gm.a.forEach(id => { const x = m.get(id); if (!x) return; x.games++; x.pf += gm.sa; x.pa += gm.sb; x.diff += d; if (d > 0) { x.wins++; x.points++; } else x.losses++; });
    gm.b.forEach(id => { const x = m.get(id); if (!x) return; x.games++; x.pf += gm.sb; x.pa += gm.sa; x.diff -= d; if (d < 0) { x.wins++; x.points++; } else x.losses++; });
  });
  const list = [...m.values()].sort((x, y) => y.points - x.points || y.diff - x.diff || x.name.localeCompare(y.name, 'he'));
  list.forEach((x, i) => { x.rank = (i > 0 && list[i - 1].points === x.points && list[i - 1].diff === x.diff) ? list[i - 1].rank : i + 1; });
  return { list, map: m, anyPlayed: list.some(x => x.games > 0) };
}

function rankingView() {
  const st = computeStats(state);
  const rows = st.list.map(x => `
    <tr class="row ${x.rank === 1 && st.anyPlayed ? 'lead' : ''}" data-action="open-player" data-id="${esc(x.id)}">
      <td class="rank">${st.anyPlayed ? x.rank : '–'}</td>
      <td class="who"><button class="namebtn" data-action="open-player" data-id="${esc(x.id)}">${mk(x.g)}<bdi>${esc(x.name)}</bdi></button></td>
      <td class="pts">${x.points}</td>
      <td class="n">${x.wins}</td>
      <td class="n">${x.losses}</td>
      <td class="n gp"><span class="pfpa" dir="rtl">${x.pf}–${x.pa}</span></td>
      <td class="n">${sgnH(x.diff)}</td>
    </tr>`).join('');
  return `<div class="tablewrap"><table class="board">
    <thead><tr>
      <th>מקום</th><th class="who">שחקן</th><th>נקודות</th>
      <th><span class="full">ניצחונות</span><span class="short">נצ׳</span></th>
      <th><span class="full">הפסדים</span><span class="short">הפס׳</span></th>
      <th><span class="full">נקודות משחק</span><span class="short">נק׳ משחק</span><small>הוכנסו–נכבשו</small></th>
      <th>הפרש</th>
    </tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="muted small">הדירוג לפי נקודות (נקודה לכל ניצחון). בשוויון נקודות מכריע ההפרש המצטבר בין הנקודות שנכבשו לנקודות שהוכנסו. לחיצה על שחקן פותחת את הטבלה האישית שלו.${st.anyPlayed ? '' : ' הדירוג יתחיל להתעדכן אחרי המשחק הראשון.'}</p>`;
}

function playerView() {
  const st = computeStats(state), pm = pmap();
  const me = st.map.get(selectedPlayer) || st.list[0];
  const names = ids => ids.map(id => pm.get(id)).filter(Boolean).map(p => `<span class="chip mini ${p.g}" dir="auto">${esc(p.name)}</span>`).join('');
  const rows = state.games.map((g, i) => {
    const inA = g.a.includes(me.id), inB = g.b.includes(me.id);
    if (!inA && !inB) return `<tr class="benchrow"><td>${i + 1}</td><td colspan="5">מנוחה</td></tr>`;
    const mates = (inA ? g.a : g.b).filter(id => id !== me.id), opps = inA ? g.b : g.a;
    const done = g.sa != null && g.sb != null;
    const own = inA ? g.sa : g.sb, oth = inA ? g.sb : g.sa;
    const won = done && own > oth, diff = done ? own - oth : 0;
    return `<tr><td>${i + 1}</td><td>${names(mates)}</td><td>${names(opps)}</td>
      <td>${done ? `<span class="num"><b>${own}</b>:${oth}</span>` : '<span class="muted">—</span>'}</td>
      <td>${done ? (won ? '1' : '0') : '<span class="muted">—</span>'}</td>
      <td>${done ? sgnH(diff) : '<span class="muted">—</span>'}</td></tr>`;
  }).join('');
  return `<div class="pickers">${st.list.slice().sort((a, b) => a.name.localeCompare(b.name, 'he')).map(p =>
      `<button class="pick" aria-pressed="${p.id === me.id}" data-action="pick-player" data-id="${esc(p.id)}">${mk(p.g)}<bdi>${esc(p.name)}</bdi></button>`).join('')}</div>
    <div class="summary">
      <h2><bdi>${esc(me.name)}</bdi></h2>
      <div class="stat"><b>${st.anyPlayed ? me.rank : '–'}</b><span>מקום</span></div>
      <div class="stat"><b>${me.points}</b><span>נקודות</span></div>
      <div class="stat"><b>${sgnH(me.diff)}</b><span>הפרש מצטבר</span></div>
      <div class="stat"><b><span class="num">${me.wins}–${me.losses}</span></b><span>ניצחונות–הפסדים</span></div>
    </div>
    <div class="tablewrap"><table><thead><tr><th>משחק</th><th>עם מי</th><th>נגד מי</th><th>תוצאה (קבוצתי : יריב)</th><th>נק׳</th><th>הפרש</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
