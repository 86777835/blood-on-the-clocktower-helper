// What some characters would truly learn, worked out from the grimoire (seats in a circle, characters, deaths,
// reminders, nominations). Only for the Storyteller, and only as a reference: a drunk or poisoned player, or anyone
// while the Vortox is in play, may (or must) get false information instead, and the Recluse and the Spy may register
// as the other alignment or another character. Those cases are flagged, never decided here.
// Ability wording follows the official wiki (Summary / How to Run of each character).
import { CHARS } from './data.js';

const team = s => CHARS[s?.role]?.team;
const evil = s => team(s) === 'minion' || team(s) === 'demon';
const name = id => CHARS[id]?.zh || '';
const no = i => `${i + 1}号`;
// How a seat may register: 1 = yes, 0 = no, 0.5 = maybe (Recluse may register as evil, a Minion or a Demon;
// the Spy may register as good, a Townsfolk or an Outsider).
const regEvil = s => s.role === 'recluse' ? 0.5 : s.role === 'spy' ? 0.5 : evil(s) ? 1 : 0;
const regTeam = (s, t) => {
  if (s.role === 'recluse' && (t === 'minion' || t === 'demon')) return 0.5;
  if (s.role === 'spy' && t === 'minion') return 0.5;
  if (s.role === 'spy' && (t === 'townsfolk' || t === 'outsider')) return 0.5;
  return team(s) === t ? 1 : 0;
};
// a count where some terms are "maybe": the lowest and the highest it can be
const range = xs => ({ min: xs.filter(x => x === 1).length, max: xs.filter(x => x > 0).length });
const showRange = r => r.min === r.max ? `${r.min}` : `${r.min}～${r.max}（陌客/间谍可能被当作另一阵营）`;
const yesNo = xs => xs.some(x => x === 1) ? '是' : xs.some(x => x > 0) ? '否，但陌客/间谍可能被当作“是”' : '否';

// Seats around the table: i's nearest neighbours one way and the other, skipping those that don't match.
function around(S, i, ok) {
  const n = S.seats.length, out = [];
  for (const dir of [1, -1]) for (let k = 1; k < n; k++) { const j = (i + dir * k + n) % n; if (ok(S.seats[j], j)) { out.push(j); break; } }
  return [...new Set(out)];
}
export const dist = (S, a, b) => { const n = S.seats.length, d = Math.abs(a - b); return Math.min(d, n - d); };

// Is this player's information likely to be false? (drunk, poisoned, the Drunk thinking they're someone, the Vortox)
export function warnings(S, i, asChar) {
  const s = S.seats[i], w = [];
  if (s.role === 'drunk' || (s.bel && s.bel === asChar)) w.push(`这位其实是${name(s.role)}：能力无效，可以给错误信息`);
  const bad = s.marks.filter(m => /中毒|醉酒/.test(m.t));
  if (bad.length) w.push(`身上有「${bad.map(m => `${name(m.c)}·${m.t}`).join('、')}」：可以给错误信息`);
  if (poisonedByNoDashii(S).includes(i)) w.push('诺-达鲺的镇民邻座：中毒，可以给错误信息');
  if (S.seats.some(o => o.role === 'vortox' && !o.dead) && CHARS[asChar]?.team === 'townsfolk') w.push('涡流在场：镇民得到的信息必须是错误的');
  return w;
}

// The No Dashii's closest Townsfolk neighbours both ways, alive or dead (official wiki), while the No Dashii is alive.
export function poisonedByNoDashii(S) {
  return S.seats.flatMap((s, i) => s.role === 'nodashii' && !s.dead ? around(S, i, o => team(o) === 'townsfolk') : []);
}
// Tea Lady: if both alive neighbours are good, they can't die.
function teaLady(S) {
  return S.seats.flatMap((s, i) => {
    if (s.role !== 'tealady' || s.dead) return [];
    const nb = around(S, i, o => !o.dead);
    const good = nb.map(j => 1 - regEvil(S.seats[j]));
    if (good.every(x => x === 1)) return [`茶艺师（${no(i)}）两侧存活邻座 ${nb.map(no).join('、')} 都是善良：他们不会死亡`];
    if (good.every(x => x > 0)) return [`茶艺师（${no(i)}）两侧存活邻座 ${nb.map(no).join('、')}：有陌客/间谍，是否受保护由你决定`];
    return [];
  });
}
// Standing effects to keep in mind tonight.
export function standing(S) {
  const out = [...teaLady(S)];
  const nd = poisonedByNoDashii(S);
  if (nd.length) out.push(`诺-达鲺的镇民邻座中毒：${nd.map(j => `${no(j)}（${name(S.seats[j].role)}）`).join('、')}`);
  if (S.seats.some(o => o.role === 'vortox' && !o.dead)) out.push('涡流在场：今晚所有镇民得到的信息都必须是错误的');
  return out;
}

// What a character in tonight's list would truly learn without choosing anyone. null = nothing to work out.
export function autoInfo(S, it) {
  if (!it.char || it.dead) return null;
  const c = it.char, i = it.seat, n = S.seats.length, d = S.ph.n - 1;   // d: the day that just ended
  const list = (t, label) => {
    const xs = S.seats.map((s, j) => [j, regTeam(s, t)]).filter(([j, r]) => r && j !== i);
    if (!xs.length) return `场上没有${label}`;
    return xs.map(([j, r]) => `${no(j)} ${name(S.seats[j].role)}${r < 1 ? '（可能被当作' + label + '）' : ''}`).join('、');
  };
  switch (c) {
    case 'chef': return `相邻的邪恶玩家：${showRange(range(S.seats.map((s, j) => Math.min(regEvil(s), regEvil(S.seats[(j + 1) % n])))))} 对`;
    case 'empath': {
      const nb = around(S, i, o => !o.dead);
      return `两侧存活邻座 ${nb.slice().sort((x, y) => x - y).map(no).join('、')}，其中邪恶：${showRange(range(nb.map(j => regEvil(S.seats[j]))))}`;
    }
    case 'clockmaker': {
      const vals = new Set();
      for (const rec of ['none', 'minion', 'demon']) for (const spy of [true, false]) {
        const D = S.seats.map((s, j) => j).filter(j => team(S.seats[j]) === 'demon' || (rec === 'demon' && S.seats[j].role === 'recluse'));
        const M = S.seats.map((s, j) => j).filter(j => (team(S.seats[j]) === 'minion' && (S.seats[j].role !== 'spy' || spy)) || (rec === 'minion' && S.seats[j].role === 'recluse'));
        if (D.length && M.length) vals.add(Math.min(...D.flatMap(a => M.map(b => dist(S, a, b)))));
      }
      const v = [...vals].sort((a, b) => a - b), base = (() => {
        const D = S.seats.map((s, j) => j).filter(j => team(S.seats[j]) === 'demon'), M = S.seats.map((s, j) => j).filter(j => team(S.seats[j]) === 'minion');
        return D.length && M.length ? Math.min(...D.flatMap(a => M.map(b => dist(S, a, b)))) : null;
      })();
      if (base === null) return '场上没有爪牙或恶魔，按说书人决定';
      return `恶魔到最近的爪牙：${base} 步${v.length > 1 ? `（陌客/间谍可能被当作别的角色，可能的取值 ${v.join('、')}）` : ''}`;
    }
    case 'oracle': return `死亡玩家里邪恶的：${showRange(range(S.seats.filter(s => s.dead).map(regEvil)))} 名`;
    case 'flowergirl': {
      const votes = S.noms.filter(x => x.d === d).flatMap(x => x.votes);
      return `今天恶魔投过票吗：${yesNo([...new Set(votes)].map(j => regTeam(S.seats[j], 'demon')))}`;
    }
    case 'towncrier': {
      const by = S.noms.filter(x => x.d === d).map(x => x.by);
      return `今天有爪牙提名过吗：${yesNo(by.map(j => regTeam(S.seats[j], 'minion')))}`;
    }
    case 'undertaker': {
      const ex = S.execs.find(x => x.d === d);
      if (!ex || ex.seat === null || !ex.died) return '今天没有人被处决而死：不叫醒，或叫醒但不给信息';
      const s = S.seats[ex.seat];
      return `今天被处决而死的 ${no(ex.seat)} 是：${name(s.role)}${s.role === 'recluse' || s.role === 'spy' ? `（${name(s.role)}可能被当作别的角色）` : ''}`;
    }
    case 'mathematician': {
      const ab = S.seats.map((s, j) => [s, j]).filter(([s, j]) => j !== i && s.marks.some(m => m.c === 'mathematician' && m.t === '未正常生效'));
      return `标了「未正常生效」的：${ab.length} 人${ab.length ? `（${ab.map(([, j]) => no(j)).join('、')}）` : ''}。给完信息后清掉这些标记`;
    }
    case 'washerwoman': return `在场的镇民：${list('townsfolk', '镇民')}`;
    case 'librarian': return `在场的外来者：${list('outsider', '外来者')}`;
    case 'investigator': return `在场的爪牙：${list('minion', '爪牙')}`;
    case 'godfather': return `在场的外来者：${list('outsider', '外来者')}`;
  }
  return null;
}

// Characters that choose players: how many to pick, and what they would truly learn.
export const PICKS = {
  fortuneteller: { k: 2, tip: '点他选的两名玩家' },
  ravenkeeper: { k: 1, tip: '点他选的一名玩家' },
  seamstress: { k: 2, tip: '点他选的两名玩家（每局一次）' },
  chambermaid: { k: 2, tip: '点他选的两名存活玩家（不能选自己）' },
  juggler: { k: 5, tip: '点他白天猜的玩家，再为每人选猜的角色' }
};
export function pickInfo(S, it, picks, guesses = {}) {
  const c = it.char, P = PICKS[c];
  if (!P || picks.length !== (c === 'juggler' ? picks.length : P.k) || !picks.length) return null;
  const ss = picks.map(j => S.seats[j]);
  switch (c) {
    case 'fortuneteller': {
      const r = ss.map(s => s.marks.some(m => m.c === 'fortuneteller' && m.t === '干扰项') ? 1 : regTeam(s, 'demon'));
      return `其中有恶魔吗：${yesNo(r)}${ss.some(s => s.marks.some(m => m.c === 'fortuneteller')) ? '（含干扰项）' : ''}`;
    }
    case 'ravenkeeper': return `${no(picks[0])} 的角色：${name(ss[0].role)}${['recluse', 'spy'].includes(ss[0].role) ? `（${name(ss[0].role)}可能被当作别的角色）` : ''}`;
    case 'seamstress': {
      const [a, b] = ss.map(regEvil);
      return `同一阵营吗：${a === 0.5 || b === 0.5 ? `${a === b ? '是' : '否'}，但陌客/间谍可能被当作另一阵营` : a === b ? '是' : '否'}`;
    }
    case 'chambermaid': {
      // woke tonight because of their own ability = a ticked step of their own (not Minion/Demon info)
      const woke = picks.map(j => {
        const steps = Object.keys(S.done).filter(k => k.endsWith(`@${j}`));
        if (!steps.length) return 0;
        return steps.some(k => k.split('@')[0] === S.seats[j].role) ? 1 : 0.5;   // only woke as who they think they are
      });
      return `今晚因自己能力醒来的：${showRange(range(woke)).replace('（陌客/间谍可能被当作另一阵营）', '（有人按以为的角色被叫醒，算不算由你决定）')} 人（按已打勾的步骤数，排在侍女后面的也要算上）`;
    }
    case 'juggler': {
      const hit = picks.filter(j => guesses[j] && guesses[j] === S.seats[j].role).length;
      const maybe = picks.filter(j => guesses[j] && guesses[j] !== S.seats[j].role && ['recluse', 'spy'].includes(S.seats[j].role)).length;
      return `猜中：${hit}${maybe ? `～${hit + maybe}（陌客/间谍可能被当作别的角色）` : ''} 个`;
    }
  }
  return null;
}
