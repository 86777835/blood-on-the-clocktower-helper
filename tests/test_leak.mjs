// Hidden information never reaches anyone but the Storyteller. Usage: node tests/test_leak.mjs <base-url>
// For each script, several randomized games: the Storyteller's socket plays (bag, characters, bluffs, night ticks and notes,
// reminders, deaths, nominations, executions) while two player sockets and a bystander record every frame. Until the game
// is over, every frame they get must:
//  - have only whitelisted fields,
//  - contain no character, reminder, bluff, bag or Storyteller note,
//  - show night deaths only after dawn, and not arrive at all while the night goes on (no activity signal).
// Also: players' notes stay with their own token; players can only write their names; a wrong key is refused; the archive needs the key.
import { EDITIONS, CHARS } from '../public/data.js';
import { BELIEVE, isGood } from '../public/logic.js';

const base = process.argv[2] || 'http://localhost:8851/';
const wsUrl = c => new URL(`/api/room/${c}/ws`, base).href.replace(/^http/, 'ws');
let fails = 0, checks = 0;
const ok = (name, cond, extra = '') => { if (!cond) fails++; if (!cond || !ok.quiet) console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : extra); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const hex = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
function rng(seed) { return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }; }

function open(code) {
  const ws = new WebSocket(wsUrl(code)), frames = [], inbox = [];
  let last = null, waiter = null;
  ws.onmessage = e => {
    if (e.data === 'pong') return;
    frames.push(e.data); const m = JSON.parse(e.data); if (m.type === 'state') last = m;
    if (waiter) { const w = waiter; waiter = null; w(m); } else inbox.push(m);
  };
  const ready = new Promise(r => ws.onopen = r);
  const next = () => inbox.length ? Promise.resolve(inbox.shift()) : new Promise((r, no) => { waiter = r; setTimeout(() => no(new Error('no reply in 10 s')), 10000); });
  // the next message (skipping older broadcasts) that matches pred
  const until = async pred => { for (;;) { const m = await next(); if (pred(m)) return m; } };
  return { ws, frames, ready, next, until, get last() { return last; } };
}

const PUB_KEYS = ['stage', 'ed', 'n', 'ph', 'seats', 'noms', 'execs'];
const SEAT_KEYS = ['name', 'dead', 'ghost'];
const charNames = Object.values(CHARS).map(c => c.zh), charIds = Object.keys(CHARS);
const remNames = [...new Set(Object.values(CHARS).flatMap(c => c.rem))].filter(t => t.length >= 2);
const SECRET = '说书人密记QX';

async function playGame(ed, rnd, round) {
  const { code, key } = await (await fetch(new URL('/api/room', base), { method: 'POST' })).json();
  const st = open(code), p1 = open(code), p2 = open(code), by = open(code), p1b = open(code), bad = open(code);
  await Promise.all([st, p1, p2, by, p1b, bad].map(s => s.ready));
  for (const s of [st, p1, p2, by, p1b, bad]) await s.next();   // initial public state
  const t1 = hex(), t2 = hex();
  st.ws.send(JSON.stringify({ auth: key })); await st.next();
  ok(`${ed}#${round} Storyteller socket gets the full state`, st.last.role === 'st' && Array.isArray(st.last.state.bag));
  p1.ws.send(JSON.stringify({ pt: t1 })); p1b.ws.send(JSON.stringify({ pt: t1 })); p2.ws.send(JSON.stringify({ pt: t2 }));
  const n1 = await p1.next(), n2 = await p2.next(); await p1b.next();
  ok(`${ed}#${round} new player tokens start with empty notes`, n1.type === 'notes' && JSON.stringify(n1.notes) === '{}' && JSON.stringify(n2.notes) === '{}');
  bad.ws.send(JSON.stringify({ auth: key.replace(/./, c => c === 'a' ? 'b' : 'a') }));
  const r = await bad.next();
  ok(`${ed}#${round} wrong key refused`, r.type === 'error' && r.error === 'badkey');
  bad.ws.send(JSON.stringify({ action: { t: 'setup', ed, n: 7 } }));
  const vo = await bad.next();
  ok(`${ed}#${round} players can't run the game`, vo.type === 'error' && vo.error === 'viewonly');

  const act = async a => { st.ws.send(JSON.stringify({ action: a })); await st.next(); return st.last.state; };
  const n = 5 + Math.floor(rnd() * 11);
  let S = await act({ t: 'setup', ed, n });
  // a player writes their name; trying to slip in a character is refused
  p2.ws.send(JSON.stringify({ action: { t: 'seat', i: 1, name: '小二' } })); await st.next(); S = st.last.state;
  ok(`${ed}#${round} a player can write their name`, S.seats[1].name === '小二');
  p2.ws.send(JSON.stringify({ action: { t: 'seat', i: 1, name: 'x', role: EDITIONS[ed].chars[0] } }));
  ok(`${ed}#${round} a player can't set a character`, (await p2.until(m => m.type === 'error')).error === 'viewonly');

  const pool = EDITIONS[ed].chars.slice().sort(() => rnd() - .5);
  const bag = [pool.find(id => CHARS[id].team === 'demon'), ...pool.filter(id => CHARS[id].team !== 'demon')].slice(0, n);
  S = await act({ t: 'bag', ids: bag });
  for (let i = 0; i < n; i++) {
    S = await act({ t: 'seat', i, role: bag[i], ...(i === 1 ? {} : { name: `P${i + 1}` }) });
    if (BELIEVE[bag[i]]) {
      const opts = EDITIONS[ed].chars.filter(id => BELIEVE[bag[i]].includes(CHARS[id].team) && id !== bag[i]);
      S = await act({ t: 'seat', i, bel: opts[Math.floor(rnd() * opts.length)] });
    }
  }
  S = await act({ t: 'bluffs', ids: EDITIONS[ed].chars.filter(id => isGood(id) && !bag.includes(id)).slice(0, 3) });
  S = await act({ t: 'start' });
  ok(`${ed}#${round} game started`, S.stage === 'play');

  // player notes: p1 writes, the other socket with the same token gets them, nobody else does
  p1.ws.send(JSON.stringify({ notes: { seats: { 0: '他说自己是厨师NOTE1' }, free: '我的私密笔记NOTE1' } }));
  const echo = await p1b.until(m => m.type === 'notes');
  ok(`${ed}#${round} notes reach the same player's other phone`, echo.type === 'notes' && echo.notes.free === '我的私密笔记NOTE1');
  p2.ws.send(JSON.stringify({ notes: { free: 'x'.repeat(5000) } }));
  ok(`${ed}#${round} oversized notes refused`, (await p2.until(m => m.type === 'error')).error === 'notes');

  let day = 0;
  while (S.stage === 'play' && S.ph.n < 6) {
    // night: everything the Storyteller does stays private; players get no frames at all
    await wait(80);   // let the frame announcing the night (sent at dusk/start) arrive first
    const before = [p1, p2, by].map(s => s.frames.length);
    for (const x of S.seats.map((_, i) => i)) if (rnd() < .4) S = await act({ t: 'step', k: `${S.seats[x].role}@${x}`, on: true });
    S = await act({ t: 'log', k: `${S.seats[0].role}@0`, x: `${SECRET} 给了 ${S.seats[1].name} 数字 ${Math.floor(rnd() * 3)}` });
    S = await act({ t: 'log', k: 'note', x: `${SECRET} 备注` });
    const withRem = S.seats.map((x, i) => [x, i]).filter(([x]) => CHARS[x.role].rem.length);
    if (withRem.length) { const [x] = withRem[0], i = Math.floor(rnd() * n); S = await act({ t: 'mark', i, c: x.role, x: CHARS[x.role].rem[0], on: !S.seats[i].marks.some(m => m.c === x.role && m.t === CHARS[x.role].rem[0]) }); }
    const alive = S.seats.map((x, i) => [x, i]).filter(([x]) => !x.dead);
    let killed = null;
    if (alive.length > 3 && rnd() < .7) { killed = alive[Math.floor(rnd() * alive.length)][1]; S = await act({ t: 'dead', i: killed, dead: true }); }
    await wait(60);
    ok(`${ed}#${round} night ${S.ph.n}: players get no frames during the night`, [p1, p2, by].every((s, k) => s.frames.length === before[k]),
      [p1, p2, by].map((s, k) => s.frames.length - before[k]).join(','));
    S = await act({ t: 'dawn' });
    await wait(60);
    if (killed !== null) ok(`${ed}#${round} the night death shows at dawn`, p1.last.state.seats[killed].dead === true);
    // day
    day = S.ph.n;
    const nominators = S.seats.map((x, i) => i).filter(i => !S.seats[i].dead).sort(() => rnd() - .5);
    const nominees = S.seats.map((x, i) => i).sort(() => rnd() - .5);
    for (let k = 0; k < Math.min(3, nominators.length); k++) {
      const votes = S.seats.map((x, i) => i).filter(i => (!S.seats[i].dead || S.seats[i].ghost) && rnd() < .55);
      S = await act({ t: 'nom', by: nominators[k], on: nominees[k], votes });
    }
    const blk = S.noms.filter(x => x.d === day && x.n >= x.need).sort((a, b) => b.n - a.n);
    S = await act({ t: 'exec', seat: blk.length && (blk.length === 1 || blk[0].n > blk[1].n) ? blk[0].on : null });
    if (S.seats.filter(x => !x.dead).length <= 2 || rnd() < .15) break;
    S = await act({ t: 'dusk' });
  }

  // everything players received before the end
  for (const [name, s] of [['player 1', p1], ['player 2', p2], ['bystander', by]]) {
    let bad = '';
    for (const raw of s.frames) {
      const m = JSON.parse(raw);
      if (m.type === 'notes') { if (s !== p1 && raw.includes('NOTE1')) bad = 'someone else’s notes: ' + raw; continue; }
      if (m.type !== 'state') continue;
      const v = m.state;
      if (m.role !== 'view') { bad = 'not a public frame'; break; }
      if (Object.keys(v).some(k => !PUB_KEYS.includes(k))) { bad = 'extra field: ' + Object.keys(v).join(','); break; }
      if (v.seats.some(x => Object.keys(x).some(k => !SEAT_KEYS.includes(k)))) { bad = 'extra seat field'; break; }
      const body = JSON.stringify(v);
      const hit = charIds.find(id => body.includes(`"${id}"`)) || charNames.find(z => body.includes(z)) || remNames.find(z => body.includes(z)) || (body.includes(SECRET) && SECRET);
      if (hit) { bad = `leaked "${hit}"`; break; }
    }
    ok(`${ed}#${round} ${name}: ${s.frames.length} frames, nothing hidden`, !bad, bad);
    if (s !== p1) ok(`${ed}#${round} ${name} never got player 1's notes`, !s.frames.some(f => f.includes('NOTE1')));
  }
  ok(`${ed}#${round} the Storyteller never got player notes`, !st.frames.some(f => f.includes('NOTE1')));

  // the end: now everyone sees the grimoire
  S = await act({ t: 'end', win: rnd() < .5 ? 'good' : 'evil', why: '测试' });
  await wait(80);
  const fin = by.last.state;
  ok(`${ed}#${round} after the end everyone sees every character`, fin.stage === 'over' && fin.seats.every((x, i) => x.role === S.seats[i].role) && fin.log.length > 0);
  // a player reconnecting with the same token gets the notes back
  const again = open(code); await again.ready; await again.next();
  again.ws.send(JSON.stringify({ pt: t1 }));
  ok(`${ed}#${round} notes come back after reconnecting`, (await again.until(m => m.type === 'notes')).notes?.free === '我的私密笔记NOTE1');
  // the archive needs the key
  const g1 = await fetch(new URL(`/api/room/${code}/games`, base), { method: 'POST', body: JSON.stringify({ key: 'x' }) });
  const g2 = await fetch(new URL(`/api/room/${code}/games`, base), { method: 'POST', body: JSON.stringify({ key }) });
  const games = g2.ok ? await g2.json() : [];
  ok(`${ed}#${round} archive: wrong key refused, right key gets the record`, g1.status === 403 && games.length === 1 && games[0].seats.length === n);
  for (const s of [st, p1, p2, by, p1b, bad, again]) s.ws.close();
}

for (const ed of Object.keys(EDITIONS)) for (let round = 1; round <= 3; round++) await playGame(ed, rng(round * 977 + ed.length * 31), round);
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
