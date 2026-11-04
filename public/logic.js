// Game state and rules, shared by the pages and the server (the server runs reduce() and is the authority).
// The Storyteller's phone gets the whole state; every other phone gets publicView(), built field by field.
import { EDITIONS, CHARS, STEPS, COUNTS, TEAM_ZH } from './data.js';

import { parseScript, charactersOf, publicScript } from './custom.js';

const clone = o => JSON.parse(JSON.stringify(o));
const cleanText = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
export const MIN_PLAYERS = 5, MAX_PLAYERS = 15;
const MAX_LOG = 400, MAX_NOMS = 200;

export function initialState() {
  return {
    v: 0, stage: 'setup', gid: null,
    ed: null, n: 0,
    bag: [],              // setup: the characters the Storyteller puts in the bag (the Drunk counts as an Outsider here)
    seats: [],            // [{ name, role, bel, dead, ghost, marks: [{ c, t }] }]; bel = who the Drunk/Lunatic/Marionette thinks they are
    bluffs: [],           // the Demon's 3 bluffs
    ph: null,             // { k: 'night' | 'day', n }; night 1 is the first night
    done: {},             // this night's steps the Storyteller ticked off: { stepKey: true }
    log: [],              // the Storyteller's notes: { at: 'N1' | 'D1', k: stepKey | 'note', x }
    noms: [],             // { d, by, on, votes: [seat…], n }
    execs: [],            // { d, seat (null = nobody executed), died }
    pub: null,            // what the town square shows: { dead: [], ghost: [] }; frozen during the night
    result: null, why: ''
  };
}

/* ---------- helpers ---------- */
export const edChars = (ed, S) => ed === 'custom' ? S?.script?.chars || [] : EDITIONS[ed]?.chars || [];
export const teamOf = (id, S) => charactersOf(S)[id]?.team;
export const isGood = (id, S) => ['townsfolk', 'outsider'].includes(teamOf(id, S));
const alive = S => S.seats.filter(s => !s.dead).length;
export const phaseName = ph => !ph ? '' : ph.k === 'night' ? (ph.n === 1 ? '首夜' : `第 ${ph.n} 夜`) : `第 ${ph.n} 天`;
const at = S => (S.ph.k === 'night' ? 'N' : 'D') + S.ph.n;
// Who can believe they are someone else, and from which team that someone must come.
export const BELIEVE = { drunk: ['townsfolk'], lunatic: ['demon'], marionette: ['townsfolk', 'outsider'] };

// Setup counts for n players: { townsfolk, outsider, minion, demon }, with the Outsider changes the bag allows.
export function setupCheck(ed, n, bag, S) {
  const CHARS = charactersOf(S);
  const base = COUNTS[n];
  if (!base) return null;
  const have = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
  for (const id of bag) if (have[teamOf(id, S)] !== undefined) have[teamOf(id, S)]++;
  // Every Outsider change the bag allows (e.g. Godfather −1 or +1, Baron +2); they add up.
  let mods = [0];
  for (const id of bag) { const om = CHARS[id]?.om || [0]; if (om.some(x => x)) mods = mods.flatMap(m => om.map(x => m + x)); }
  mods = [...new Set(mods)].sort((a, b) => a - b);
  const options = mods.map(m => ({ townsfolk: base[0] - m, outsider: base[1] + m, minion: base[2], demon: base[3] }))
    .filter(o => o.townsfolk >= 0 && o.outsider >= 0);
  const ok = bag.length === n && options.some(o => Object.keys(o).every(k => o[k] === have[k]));
  return { base: { townsfolk: base[0], outsider: base[1], minion: base[2], demon: base[3] }, options, have, ok };
}

// Can this whole script supply a legal bag? Modifier characters are optional until selected.
export function poolCheck(S, n) {
  const chars = edChars(S.ed, S), dict = charactersOf(S);
  const modifiers = chars.filter(id => dict[id].om?.some(x => x));
  const subsets = modifiers.reduce((xs, id) => [...xs, ...xs.map(x => [...x, id])], [[]]);
  const options = [];
  for (const included of subsets) {
    const available = chars.filter(id => !modifiers.includes(id) || included.includes(id));
    const check = setupCheck(S.ed, n, included, S);
    for (const want of check?.options || []) {
      if (Object.keys(want).every(t => want[t] >= check.have[t] && want[t] <= available.filter(id => dict[id].team === t).length)) options.push(want);
    }
  }
  return { ok: options.length > 0, options };
}

// Votes needed to put someone on the block: half the living players, rounded up.
export const threshold = S => Math.ceil(alive(S) / 2);
// Who is about to die today: the highest vote count that reaches the threshold; a tie means nobody.
export function onBlock(S, d = S.ph?.n) {
  const today = S.noms.filter(x => x.d === d && x.n >= (x.need ?? 0));
  if (!today.length) return null;
  const top = Math.max(...today.map(x => x.n)), best = today.filter(x => x.n === top);
  return best.length === 1 ? { seat: best[0].on, n: top } : { tie: best.map(x => x.on), n: top };
}

// This night's wake list for the Storyteller: characters in play, in the official night order.
// Dead players stay in the list (some abilities work on the night they die) but are flagged.
export function nightList(S) {
  if (!S.ph || S.ph.k !== 'night') return [];
  const CHARS = charactersOf(S), steps = S.ed === 'custom' ? S.script.steps : STEPS;
  const first = S.ph.n === 1, key = first ? 'fn' : 'on', out = [];
  for (const [id, st] of Object.entries(steps)) {
    if (!st[key]) continue;
    if ((id === 'minioninfo' || id === 'demoninfo') && (!first || S.n < 7)) continue;   // 5–6 players: no evil info
    out.push({ k: id, order: st[key], step: id, zh: st.zh, tip: first ? st.stF : st.stO });
  }
  S.seats.forEach((s, i) => {
    const add = (id, fake) => {
      const c = CHARS[id];
      if (!c || !c[key]) return;
      out.push({ k: `${id}@${i}`, order: c[key], char: id, seat: i, fake, dead: s.dead, zh: c.zh, tip: first ? c.stF : c.stO });
    };
    if (s.role) add(s.role, false);
    if (s.bel && s.bel !== s.role) add(s.bel, true);
  });
  const order = S.script?.[first ? 'firstNight' : 'otherNight'];
  if (order) for (const x of out) x.order = order.indexOf(x.char || x.step) + 1;
  return out.sort((a, b) => a.order - b.order || (a.seat ?? -1) - (b.seat ?? -1));
}

// The town square: names, deaths and ghost votes as last seen in daylight.
function syncPub(S) { S.pub = { dead: S.seats.map(s => s.dead), ghost: S.seats.map(s => s.ghost) }; }

/* ---------- actions ---------- */
export function reduce(s, a) {
  if (!a || typeof a !== 'object') return null;
  const S = clone(s);
  const CHARS = charactersOf(S);
  const done = () => { if (S.ph?.k === 'day' || S.stage !== 'play') syncPub(S); S.v = s.v + 1; return S; };
  const setup = S.stage === 'setup', play = S.stage === 'play';
  const seatOk = i => isInt(i, 0, S.seats.length - 1);
  const charOk = id => typeof id === 'string' && Object.hasOwn(CHARS, id) && edChars(S.ed, S).includes(id);

  switch (a.t) {
    case 'setup': {   // edition and player count; changing either clears the bag and the characters
      if (!setup || !isInt(a.n, MIN_PLAYERS, MAX_PLAYERS) || Object.keys(a).some(k => !['t', 'ed', 'n', 'script'].includes(k))) return null;
      if (a.ed === 'custom') {
        if (a.script !== undefined) { try { S.script = parseScript(a.script); } catch { return null; } }
        else if (S.ed !== 'custom' || !S.script) return null;
      } else {
        if (!Object.hasOwn(EDITIONS, a.ed) || a.script !== undefined || a.characters !== undefined) return null;
        delete S.script;
      }
      const names = S.seats.map(x => x.name);
      if (a.ed !== S.ed || a.script !== undefined) { S.bag = []; S.bluffs = []; }
      S.ed = a.ed; S.n = a.n;
      if (S.bag.length > a.n) S.bag = S.bag.slice(0, a.n);
      S.seats = Array.from({ length: a.n }, (_, i) => newSeat(names[i] || ''));
      return done();
    }

    case 'bag': {
      if (!setup || !S.ed || !Array.isArray(a.ids) || a.ids.length > S.n || !a.ids.every(charOk) || new Set(a.ids).size !== a.ids.length) return null;
      S.bag = a.ids.slice();
      for (const st of S.seats) if (st.role && !S.bag.includes(st.role)) { st.role = null; st.bel = null; }
      return done();
    }

    case 'seat': {   // name, character, who they think they are
      if (S.stage === 'over' || !seatOk(a.i)) return null;
      const st = S.seats[a.i];
      if (a.name !== undefined) st.name = cleanText(a.name, 12);
      if (a.role !== undefined) {
        if (a.role === null) { if (!setup) return null; st.role = null; st.bel = null; }
        else {
          if (!charOk(a.role)) return null;
          // during setup, a character comes out of the bag and only one player can hold it
          if (setup && (!S.bag.includes(a.role) || S.seats.some((o, j) => j !== a.i && o.role === a.role))) return null;
          if (play && st.role !== a.role) S.log.push({ at: at(S), k: 'note', x: `${a.i + 1}号 角色改为${CHARS[a.role].zh}（原为${CHARS[st.role]?.zh || '无'}）` });
          st.role = a.role;
          if (!BELIEVE[a.role]) st.bel = null;
        }
      }
      if (a.bel !== undefined) {
        if (a.bel === null) st.bel = null;
        else if (!BELIEVE[st.role] || !charOk(a.bel) || !BELIEVE[st.role].includes(teamOf(a.bel, S)) || a.bel === st.role) return null;
        else st.bel = a.bel;
      }
      return done();
    }

    case 'bluffs':
      if (S.stage === 'over' || !S.ed || !Array.isArray(a.ids) || a.ids.length > 3 || !a.ids.every(id => charOk(id) && isGood(id, S)) || new Set(a.ids).size !== a.ids.length) return null;
      S.bluffs = a.ids.slice();
      return done();

    case 'start': {
      if (!setup || !S.ed || S.seats.some(x => !x.role)) return null;
      S.seats.forEach((x, i) => { if (!x.name) x.name = `${i + 1}号`; });
      Object.assign(S, { stage: 'play', gid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        ph: { k: 'night', n: 1 }, done: {}, log: [], noms: [], execs: [], result: null, why: '' });
      syncPub(S);   // the town square starts with everyone alive
      S.v = s.v + 1;
      return S;
    }

    case 'step':   // tick off a step of tonight's list
      if (!play || S.ph.k !== 'night' || typeof a.k !== 'string' || a.k.length > 64 || typeof a.on !== 'boolean') return null;
      if (a.on) S.done[a.k] = true; else delete S.done[a.k];
      return done();

    case 'log': {   // what the Storyteller did at a step (one line per step and phase; empty removes it)
      if (!play || typeof a.k !== 'string' || a.k.length > 64) return null;
      const x = cleanText(a.x, 120), here = at(S);
      if (a.k === 'note') { if (!x) return null; S.log.push({ at: here, k: 'note', x }); }
      else {
        const old = S.log.findIndex(e => e.at === here && e.k === a.k);
        if (old >= 0) { if (x) S.log[old].x = x; else S.log.splice(old, 1); }
        else if (x) S.log.push({ at: here, k: a.k, x });
      }
      if (S.log.length > MAX_LOG) return null;
      return done();
    }

    case 'dead': {
      if (!play || !seatOk(a.i) || typeof a.dead !== 'boolean') return null;
      const st = S.seats[a.i];
      if (st.dead === a.dead) return null;
      st.dead = a.dead;
      if (a.dead) st.ghost = true;   // a dead player gets one ghost vote
      S.log.push({ at: at(S), k: 'death', x: `${a.i + 1}号 ${st.name} ${a.dead ? '死亡' : '复活'}` });
      return done();
    }

    case 'ghost':
      if (!play || !seatOk(a.i) || typeof a.on !== 'boolean' || !S.seats[a.i].dead) return null;
      S.seats[a.i].ghost = a.on;
      return done();

    case 'mark': {   // a reminder token on a player
      if (!play || !seatOk(a.i) || !charOk(a.c) || typeof a.on !== 'boolean') return null;
      const t = S.ed === 'custom' ? (typeof a.x === 'string' && a.x.length <= 30 ? a.x : '') : cleanText(a.x, 12), m = S.seats[a.i].marks;
      if (!t || !(CHARS[a.c].rem || []).includes(t)) return null;
      const k = m.findIndex(x => x.c === a.c && x.t === t);
      if (a.on && k < 0) { if (m.length >= 12) return null; m.push({ c: a.c, t }); }
      else if (!a.on && k >= 0) m.splice(k, 1);
      else return null;
      return done();
    }

    case 'dawn':
      if (!play || S.ph.k !== 'night') return null;
      S.ph = { k: 'day', n: S.ph.n };
      return done();

    case 'dusk':
      if (!play || S.ph.k !== 'day') return null;
      S.ph = { k: 'night', n: S.ph.n + 1 }; S.done = {};
      S.v = s.v + 1;   // the town square keeps showing the end of the day
      syncPub(S);
      return S;

    case 'nom': {   // a nomination and the hands raised for it
      if (!play || S.ph.k !== 'day' || !seatOk(a.by) || !seatOk(a.on) || !Array.isArray(a.votes) || S.noms.length >= MAX_NOMS) return null;
      const d = S.ph.n, today = S.noms.filter(x => x.d === d);
      if (S.execs.some(x => x.d === d)) return null;                       // nominations close with the execution
      if (S.seats[a.by].dead || today.some(x => x.by === a.by)) return null;   // the dead can't nominate; one nomination a day
      if (today.some(x => x.on === a.on)) return null;                     // each player can be nominated once a day
      const votes = [...new Set(a.votes)];
      if (votes.length !== a.votes.length || !votes.every(seatOk)) return null;
      if (votes.some(i => S.seats[i].dead && !S.seats[i].ghost)) return null;   // a dead player without a ghost vote can't vote
      for (const i of votes) if (S.seats[i].dead) S.seats[i].ghost = false;
      S.noms.push({ d, by: a.by, on: a.on, votes: votes.sort((x, y) => x - y), n: votes.length, need: threshold(S) });
      return done();
    }

    case 'exec': {   // end of the day's nominations: who is executed (null = nobody), and whether they died
      if (!play || S.ph.k !== 'day' || S.execs.some(x => x.d === S.ph.n)) return null;
      if (a.seat !== null && !seatOk(a.seat)) return null;
      const died = a.seat !== null && a.died !== false && !S.seats[a.seat].dead;
      S.execs.push({ d: S.ph.n, seat: a.seat, died });
      if (died) { S.seats[a.seat].dead = true; S.seats[a.seat].ghost = true; }
      S.log.push({ at: at(S), k: 'exec', x: a.seat === null ? '今天没有处决' : `处决 ${a.seat + 1}号 ${S.seats[a.seat].name}${died ? '' : '（没有死亡）'}` });
      return done();
    }

    case 'end':
      if (!play || !['good', 'evil'].includes(a.win)) return null;
      S.stage = 'over'; S.result = a.win; S.why = cleanText(a.why, 60);
      return done();

    case 'reset': {   // a new game in the same room: keeps the edition, player count and names
      if (S.stage !== 'over') return null;
      const keep = { script: S.script, ed: S.ed, n: S.n, names: S.seats.map(x => x.name) };
      Object.assign(S, initialState(), { v: S.v, ed: keep.ed, n: keep.n, seats: keep.names.map(newSeat) });
      if (keep.script) S.script = keep.script;
      return done();
    }
  }
  return null;
}
const newSeat = name => ({ name, role: null, bel: null, dead: false, ghost: true, marks: [] });

// Players may write their own name on their seat (and nothing else).
export function nameAction(a) { return a && a.t === 'seat' && Object.keys(a).every(k => ['t', 'i', 'name'].includes(k)) && typeof a.name === 'string'; }

/* ---------- what every other phone sees ---------- */
// Built field by field. Until the game is over: no characters, reminders, bluffs, bag, night list or notes,
// and deaths only as the town square showed them at the end of the last day.
export function publicView(s) {
  const v = { stage: s.stage, ed: s.ed, n: s.n, ph: s.ph ? { k: s.ph.k, n: s.ph.n } : null };
  if (s.ed === 'custom' && s.script) v.script = publicScript(s.script);
  const pub = s.pub || { dead: s.seats.map(() => false), ghost: s.seats.map(() => true) };
  v.seats = s.seats.map((x, i) => ({ name: x.name, dead: !!pub.dead[i], ghost: pub.ghost[i] !== false }));
  v.noms = s.noms.map(x => ({ d: x.d, by: x.by, on: x.on, votes: x.votes.slice(), n: x.n, need: x.need }));
  v.execs = s.execs.map(x => ({ d: x.d, seat: x.seat, died: x.died }));
  if (s.stage === 'over') {
    v.result = s.result; v.why = s.why;
    v.seats = s.seats.map(x => ({ name: x.name, dead: x.dead, ghost: x.ghost, role: x.role, bel: x.bel, marks: x.marks.map(m => ({ c: m.c, t: m.t })) }));
    v.bluffs = s.bluffs.slice();
    v.log = s.log.map(e => ({ at: e.at, k: e.k, x: e.x }));
  }
  return v;
}

// The record kept in the room's archive.
export function gameRecord(S) {
  if (S.stage !== 'over' || !S.gid) return null;
  return { ...(S.script ? { script: clone(S.script) } : {}), gid: S.gid, ed: S.ed, n: S.n, result: S.result, why: S.why, days: S.ph?.n || 0,
    seats: S.seats.map(x => ({ name: x.name, role: x.role, bel: x.bel, dead: x.dead })), bluffs: S.bluffs.slice(),
    noms: S.noms.length, execs: S.execs.map(x => ({ d: x.d, seat: x.seat, died: x.died })),
    log: S.log.map(e => `${e.at.replace(/^N1$/, '首夜').replace(/^N(\d+)/, '第$1夜').replace(/^D(\d+)/, '第$1天')} ${stepLabel(e.k, S)}${e.x}`) };
}
export function stepLabel(k, S) {
  const CHARS = charactersOf(S);
  const steps = S?.ed === 'custom' ? S.script.steps : STEPS;
  if (steps[k]) return `[${steps[k].zh}] `;
  const m = /^([a-z0-9_]+)@(\d+)$/.exec(k);
  return m && CHARS[m[1]] ? `[${CHARS[m[1]].zh}·${+m[2] + 1}号] ` : '';
}

export { EDITIONS, CHARS, STEPS, COUNTS, TEAM_ZH };
