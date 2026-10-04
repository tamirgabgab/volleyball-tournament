'use strict';

/* <scheduler> */
const WT2 = 1, WO2 = 0.3;              // quadratic penalty: teammates / opponents repeated overall
const WT = [0, 6, 2.5, 1];             // teammates again within 1/2/3 games
const WO = [0, 1.5, 0.5];              // opponents again within 1/2 games
const WTEAM = 10, WGRP = 6;            // identical whole team / identical 3+ same-gender group repeated

function buildSchedule(players, k, total, existing, isLocked) {
  const N = players.length, NN = N * N, G = total;
  const pid = players.map(p => p.id), pidx = new Map(pid.map((id, i) => [id, i]));
  const gen = players.map(p => p.g === 'm' ? 0 : 1);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const locked = new Array(G).fill(false);
  const base = new Int8Array(G * N).fill(-1);
  for (let g = 0; g < G; g++) {
    const ex = existing[g];
    if (ex && isLocked(ex)) {
      locked[g] = true;
      ex.a.forEach(id => { base[g * N + pidx.get(id)] = 0; });
      ex.b.forEach(id => { base[g * N + pidx.get(id)] = 1; });
    }
  }
  const unlocked = [];
  for (let g = 0; g < G; g++) if (!locked[g]) unlocked.push(g);
  if (!unlocked.length) return existing.slice(0, G);

  const key = (i, j) => i < j ? i * N + j : j * N + i;
  let bestTeam = null, bestCost = Infinity;
  const ITERS = 45000, RESTARTS = 6;

  for (let rs = 0; rs < RESTARTS; rs++) {
    const team = base.slice();
    const played = new Array(N).fill(0), last = new Array(N).fill(-1);
    // initial lineups: who plays (fair rotation if bench), then gender-balanced split
    for (let g = 0; g < G; g++) {
      if (!locked[g]) {
        const order = [...Array(N).keys()].map(i => ({ i, p: played[i], l: last[i], r: Math.random() }))
          .sort((x, y) => x.p - y.p || x.l - y.l || x.r - y.r);
        const chosen = order.slice(0, 2 * k).map(o => o.i);
        const boys = shuffle(chosen.filter(i => gen[i] === 0)), girls = shuffle(chosen.filter(i => gen[i] === 1));
        const b = boys.length;
        const bA = b % 2 === 0 ? b / 2 : (Math.random() < .5 ? (b - 1) / 2 : (b + 1) / 2);
        boys.slice(0, bA).concat(girls.slice(0, k - bA)).forEach(i => { team[g * N + i] = 0; });
        boys.slice(bA).concat(girls.slice(k - bA)).forEach(i => { team[g * N + i] = 1; });
      }
      for (let i = 0; i < N; i++) if (team[g * N + i] >= 0) { played[i]++; last[i] = g; }
    }
    const LA = [], LB = [];
    for (const g of unlocked) {
      const a = [], b = [];
      for (let i = 0; i < N; i++) { const t = team[g * N + i]; if (t === 0) a.push(i); else if (t === 1) b.push(i); }
      LA[g] = a; LB[g] = b;
    }
    const rel = new Int8Array(G * NN), tm = new Int16Array(NN), op = new Int16Array(NN);
    for (let g = 0; g < G; g++) for (let i = 0; i < N; i++) {
      const ti = team[g * N + i]; if (ti < 0) continue;
      for (let j = i + 1; j < N; j++) {
        const tj = team[g * N + j]; if (tj < 0) continue;
        const kk = i * N + j;
        if (ti === tj) { rel[g * NN + kk] = 1; tm[kk]++; } else { rel[g * NN + kk] = 2; op[kk]++; }
      }
    }
    const localRec = (kk, g, r) => {
      let c = 0;
      if (r === 1) { for (let d = 1; d <= 3; d++) { if (g - d >= 0 && rel[(g - d) * NN + kk] === 1) c += WT[d]; if (g + d < G && rel[(g + d) * NN + kk] === 1) c += WT[d]; } }
      else if (r === 2) { for (let d = 1; d <= 2; d++) { if (g - d >= 0 && rel[(g - d) * NN + kk] === 2) c += WO[d]; if (g + d < G && rel[(g + d) * NN + kk] === 2) c += WO[d]; } }
      return c;
    };
    const pairDelta = (i, j, g, r0, r1) => {
      const kk = key(i, j), t = tm[kk], o = op[kk];
      const t1 = t - (r0 === 1 ? 1 : 0) + (r1 === 1 ? 1 : 0), o1 = o - (r0 === 2 ? 1 : 0) + (r1 === 2 ? 1 : 0);
      return (t1 * t1 - t * t) * WT2 + (o1 * o1 - o * o) * WO2 + localRec(kk, g, r1) - localRec(kk, g, r0);
    };
    const applyPair = (i, j, g, r0, r1) => {
      const kk = key(i, j); rel[g * NN + kk] = r1;
      if (r0 === 1) tm[kk]--; else op[kk]--;
      if (r1 === 1) tm[kk]++; else op[kk]++;
    };
    let cur = 0;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const kk = i * N + j;
      cur += tm[kk] * tm[kk] * WT2 + op[kk] * op[kk] * WO2;
      for (let g = 0; g < G; g++) {
        const r = rel[g * NN + kk];
        if (r === 1) { for (let d = 1; d <= 3 && g + d < G; d++) if (rel[(g + d) * NN + kk] === 1) cur += WT[d]; }
        else if (r === 2) { for (let d = 1; d <= 2 && g + d < G; d++) if (rel[(g + d) * NN + kk] === 2) cur += WO[d]; }
      }
    }
    // set-identity hashes: whole teams and same-gender groups (3+ players) that repeat
    const z = Array.from({ length: N }, () => (Math.random() * 4294967296) | 0);
    const HT = new Int32Array(G * 2), HB = new Int32Array(G * 2), HF = new Int32Array(G * 2);
    const SB = new Uint8Array(G * 2), SF = new Uint8Array(G * 2);
    const cT = new Map(), cB = new Map(), cF = new Map();
    const bump = (mp, kk, dir, w) => {
      const c = mp.get(kk) || 0;
      if (dir > 0) { mp.set(kk, c + 1); return c * w; }
      if (c <= 1) mp.delete(kk); else mp.set(kk, c - 1);
      return -(c - 1) * w;
    };
    for (let g = 0; g < G; g++) for (let i = 0; i < N; i++) {
      const t = team[g * N + i]; if (t < 0) continue;
      const q = g * 2 + t; HT[q] ^= z[i];
      if (gen[i] === 0) { HB[q] ^= z[i]; SB[q]++; } else { HF[q] ^= z[i]; SF[q]++; }
    }
    for (let q = 0; q < G * 2; q++) {
      if (SB[q] + SF[q] === 0) continue;
      cur += bump(cT, HT[q] >>> 0, 1, WTEAM);
      if (SB[q] >= 3) cur += bump(cB, HB[q] >>> 0, 1, WGRP);
      if (SF[q] >= 3) cur += bump(cF, HF[q] >>> 0, 1, WGRP);
    }
    let bestLocal = cur, snap = team.slice();
    const T0 = 2.5, T1 = 0.03;
    for (let it = 0; it < ITERS; it++) {
      const T = T0 * Math.pow(T1 / T0, it / ITERS);
      const g = unlocked[(Math.random() * unlocked.length) | 0];
      const la = LA[g], lb = LB[g];
      let ia, ib, a, b, tries = 0;
      do { ia = (Math.random() * la.length) | 0; ib = (Math.random() * lb.length) | 0; a = la[ia]; b = lb[ib]; tries++; }
      while (gen[a] !== gen[b] && tries < 12);
      if (gen[a] !== gen[b]) continue;
      let delta = 0;
      for (const m of la) { if (m === a) continue; delta += pairDelta(a, m, g, 1, 2) + pairDelta(b, m, g, 2, 1); }
      for (const m of lb) { if (m === b) continue; delta += pairDelta(a, m, g, 2, 1) + pairDelta(b, m, g, 1, 2); }
      const x = z[a] ^ z[b], i0 = g * 2, i1 = g * 2 + 1;
      const gh = gen[a] === 0 ? HB : HF, gs = gen[a] === 0 ? SB : SF, gm = gen[a] === 0 ? cB : cF;
      let dg = bump(cT, HT[i0] >>> 0, -1, WTEAM) + bump(cT, HT[i1] >>> 0, -1, WTEAM)
             + bump(cT, (HT[i0] ^ x) >>> 0, 1, WTEAM) + bump(cT, (HT[i1] ^ x) >>> 0, 1, WTEAM);
      if (gs[i0] >= 3) dg += bump(gm, gh[i0] >>> 0, -1, WGRP) + bump(gm, (gh[i0] ^ x) >>> 0, 1, WGRP);
      if (gs[i1] >= 3) dg += bump(gm, gh[i1] >>> 0, -1, WGRP) + bump(gm, (gh[i1] ^ x) >>> 0, 1, WGRP);
      const dAll = delta + dg;
      if (dAll <= 0 || Math.random() < Math.exp(-dAll / T)) {
        for (const m of la) { if (m === a) continue; applyPair(a, m, g, 1, 2); applyPair(b, m, g, 2, 1); }
        for (const m of lb) { if (m === b) continue; applyPair(a, m, g, 2, 1); applyPair(b, m, g, 1, 2); }
        la[ia] = b; lb[ib] = a; team[g * N + a] = 1; team[g * N + b] = 0;
        HT[i0] ^= x; HT[i1] ^= x; gh[i0] ^= x; gh[i1] ^= x;
        cur += dAll;
        if (cur < bestLocal - 1e-9) { bestLocal = cur; snap.set(team); }
      } else {
        bump(cT, (HT[i0] ^ x) >>> 0, -1, 0); bump(cT, (HT[i1] ^ x) >>> 0, -1, 0);
        bump(cT, HT[i0] >>> 0, 1, 0); bump(cT, HT[i1] >>> 0, 1, 0);
        if (gs[i0] >= 3) { bump(gm, (gh[i0] ^ x) >>> 0, -1, 0); bump(gm, gh[i0] >>> 0, 1, 0); }
        if (gs[i1] >= 3) { bump(gm, (gh[i1] ^ x) >>> 0, -1, 0); bump(gm, gh[i1] >>> 0, 1, 0); }
      }
    }
    if (bestLocal < bestCost) { bestCost = bestLocal; bestTeam = snap; }
  }
  const out = [];
  for (let g = 0; g < G; g++) {
    if (locked[g]) { out.push(existing[g]); continue; }
    const a = [], b = [];
    for (let i = 0; i < N; i++) { const t = bestTeam[g * N + i]; if (t === 0) a.push(pid[i]); else if (t === 1) b.push(pid[i]); }
    out.push({ a, b, sa: null, sb: null });
  }
  return out;
}

function pairStats(s) {
  const N = s.players.length, idx = new Map(s.players.map((p, i) => [p.id, i]));
  const tm = Array.from({ length: N }, () => new Array(N).fill(0));
  const op = Array.from({ length: N }, () => new Array(N).fill(0));
  let consec = 0, prev = null;
  s.games.forEach(g => {
    const cur = new Set();
    [g.a, g.b].forEach(team => {
      for (let x = 0; x < team.length; x++) for (let y = x + 1; y < team.length; y++) {
        const i = idx.get(team[x]), j = idx.get(team[y]);
        tm[i][j]++; tm[j][i]++; cur.add(Math.min(i, j) + '-' + Math.max(i, j));
      }
    });
    g.a.forEach(x => g.b.forEach(y => { const i = idx.get(x), j = idx.get(y); op[i][j]++; op[j][i]++; }));
    if (prev) cur.forEach(k => { if (prev.has(k)) consec++; });
    prev = cur;
  });
  let maxT = 0, sum = 0, cnt = 0;
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { maxT = Math.max(maxT, tm[i][j]); sum += tm[i][j]; cnt++; }
  // exact repeats of a whole team, and of 3+ same-gender players together
  const gmap = new Map(s.players.map(p => [p.id, p.g]));
  const cTeam = new Map(), cGrp = new Map();
  s.games.forEach(g => [g.a, g.b].forEach(team => {
    const kt = team.slice().sort().join(','); cTeam.set(kt, (cTeam.get(kt) || 0) + 1);
    ['m', 'f'].forEach(gd => {
      const grp = team.filter(id => gmap.get(id) === gd);
      if (grp.length >= 3) { const kg = gd + ':' + grp.slice().sort().join(','); cGrp.set(kg, (cGrp.get(kg) || 0) + 1); }
    });
  }));
  const dups = mp => { let d = 0; mp.forEach(c => { d += c * (c - 1) / 2; }); return d; };
  const k = s.k, minConsec = N === 2 * k ? (s.games.length - 1) * 2 * ((Math.floor(k / 2) * (Math.floor(k / 2) - 1)) / 2 + (Math.ceil(k / 2) * (Math.ceil(k / 2) - 1)) / 2) : null;
  return { tm, op, consec, minConsec, dupTeams: dups(cTeam), dupGroups: dups(cGrp), maxT, avgT: cnt ? sum / cnt : 0 };
}
/* </scheduler> */

/* ---------- state ---------- */
