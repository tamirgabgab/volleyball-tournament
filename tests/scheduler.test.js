// Scheduler quality tests: gender-balanced teams, fair bench, locked games, dispersion targets.
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '../public/scheduler.js'), 'utf8');
const { buildSchedule, pairStats } = new Function(src + ';return {buildSchedule,pairStats};')();

const mkPlayers = (b, g) => {
  const p = [];
  for (let i = 0; i < b; i++) p.push({ id: 'p' + (p.length + 1), name: 'B' + i, g: 'm' });
  for (let i = 0; i < g; i++) p.push({ id: 'p' + (p.length + 1), name: 'G' + i, g: 'f' });
  return p.sort(() => Math.random() - 0.5);
};

function build(b, g, k, G) {
  const players = mkPlayers(b, g);
  const games = buildSchedule(players, k, G, [], () => false);
  return { players, games, ps: pairStats({ players, games, k }) };
}

// 1) composition rules hold for several shapes
for (const [b, g, k, G] of [[4, 6, 5, 10], [4, 6, 5, 30], [5, 5, 5, 12], [4, 8, 5, 12], [7, 7, 5, 14]]) {
  const { players, games } = build(b, g, k, G);
  const gender = new Map(players.map(p => [p.id, p.g]));
  const played = {};
  assert.strictEqual(games.length, G);
  games.forEach(x => {
    assert.strictEqual(x.a.length, k);
    assert.strictEqual(x.b.length, k);
    assert.strictEqual(new Set([...x.a, ...x.b]).size, 2 * k, 'a player appears twice in one game');
    const ba = x.a.filter(i => gender.get(i) === 'm').length, bb = x.b.filter(i => gender.get(i) === 'm').length;
    assert.ok(Math.abs(ba - bb) <= 1, `boys split ${ba}/${bb}`);
    [...x.a, ...x.b].forEach(i => { played[i] = (played[i] || 0) + 1; });
  });
  const counts = players.map(p => played[p.id] || 0);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, 'bench rotation is not fair');
}

// 2) 4 boys + 6 girls, 5v5: always 2B+3G per team, no repeated lineups, near-minimum consecutive overlap,
//    and teammate counts spread evenly inside each pair class (boy-boy, girl-girl, boy-girl)
for (const G of [10, 30, 60]) {
  const { games, players, ps } = build(4, 6, 5, G);
  const gender = new Map(players.map(p => [p.id, p.g]));
  games.forEach(x => [x.a, x.b].forEach(t => assert.strictEqual(t.filter(i => gender.get(i) === 'm').length, 2)));
  assert.strictEqual(ps.dupTeams, 0, `G=${G}: identical team repeated`);
  // exactly the mathematical minimum up to 30 games; at 60 games one extra transition is tolerated
  assert.ok(ps.consec - ps.minConsec <= (G >= 60 ? 8 : 0), `G=${G}: consecutive overlap ${ps.consec} vs minimum ${ps.minConsec}`);
  const cls = { bb: [], gg: [], bg: [] };
  for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
    const a = players[i].g, b = players[j].g;
    cls[a === 'm' && b === 'm' ? 'bb' : a === 'f' && b === 'f' ? 'gg' : 'bg'].push(ps.tm[i][j]);
  }
  Object.entries(cls).forEach(([k, v]) => assert.ok(Math.max(...v) - Math.min(...v) <= 2, `G=${G}: ${k} teammate counts uneven (${v})`));
}

// 3) locked (already scored) games never change
{
  const players = mkPlayers(4, 6);
  const games = buildSchedule(players, 5, 8, [], () => false);
  games[0].sa = 25; games[0].sb = 20; games[1].sa = 21; games[1].sb = 25;
  const before = JSON.stringify(games.slice(0, 2));
  const grown = buildSchedule(players, 5, 12, games, g => g.sa != null);
  assert.strictEqual(JSON.stringify(grown.slice(0, 2)), before);
  assert.strictEqual(grown.length, 12);
  const kept = buildSchedule(players, 5, 12, grown, () => true);
  assert.strictEqual(JSON.stringify(kept), JSON.stringify(grown));
}
console.log('scheduler tests passed');
