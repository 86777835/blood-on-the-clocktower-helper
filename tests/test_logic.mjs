// Data checks and rule unit tests (no server needed). Usage: node tests/test_logic.mjs
import { initialState, reduce, publicView, setupCheck, threshold, onBlock, nightList, gameRecord, nameAction,
  EDITIONS, CHARS, STEPS, COUNTS } from '../public/logic.js';
import { autoInfo, pickInfo, warnings, standing, poisonedByNoDashii } from '../public/info.js';

let fails = 0;
const ok = (name, cond, extra = '') => { if (!cond) fails++; console.log(cond ? 'PASS' : 'FAIL', name, cond ? '' : extra); };
const run = (S, ...acts) => { for (const a of acts) { const n = reduce(S, a); if (!n) throw new Error('rejected: ' + JSON.stringify(a)); S = n; } return S; };

/* ---------- data ---------- */
const want = { tb: [13, 4, 4, 1], bmr: [13, 4, 4, 4], snv: [13, 4, 4, 4] };
for (const [ed, e] of Object.entries(EDITIONS)) {
  const n = ['townsfolk', 'outsider', 'minion', 'demon'].map(t => e.chars.filter(id => CHARS[id].team === t).length);
  ok(`${ed} character counts ${n.join('/')}`, JSON.stringify(n) === JSON.stringify(want[ed]));
}
ok('72 characters, each in one edition', Object.keys(CHARS).length === 72 && Object.values(EDITIONS).flatMap(e => e.chars).length === 72);
ok('every character has a Chinese name, a summary and a team', Object.values(CHARS).every(c => c.zh && c.gist && c.gist.length <= 60 && ['townsfolk', 'outsider', 'minion', 'demon'].includes(c.team)));
ok('a character that wakes has a Storyteller tip', Object.values(CHARS).every(c => (!c.fn || c.stF) && (!c.on || c.stO)));
ok('night order numbers are unique per night', ['fn', 'on'].every(k => {
  const xs = [...Object.values(CHARS), ...Object.values(STEPS)].map(c => c[k]).filter(Boolean); return new Set(xs).size === xs.length; }));
ok('dusk first, dawn last', ['fn', 'on'].every(k => { const xs = Object.values(CHARS).map(c => c[k]).filter(Boolean);
  return STEPS.dusk[k] < Math.min(...xs) && STEPS.dawn[k] > Math.max(...xs); }));
ok('minion info before demon info on the first night', STEPS.minioninfo.fn < STEPS.demoninfo.fn && !STEPS.minioninfo.on && !STEPS.demoninfo.on);
ok('setup table: 5–15 players, sum matches', Object.entries(COUNTS).every(([n, c]) => c.reduce((a, b) => a + b) === +n) && Object.keys(COUNTS).length === 11);
ok('Outsider changes: Baron +2, Godfather ±1, Fang Gu +1, Vigormortis −1',
  JSON.stringify([CHARS.baron.om, CHARS.godfather.om, CHARS.fanggu.om, CHARS.vigormortis.om]) === '[[2],[-1,1],[1],[-1]]');
ok('reminders have no duplicates', Object.values(CHARS).every(c => new Set(c.rem).size === c.rem.length));

/* ---------- setup check ---------- */
{
  const c = setupCheck('tb', 7, ['washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'poisoner', 'imp']);
  ok('7 players: 5/0/1/1 is right', c.ok && c.options.length === 1);
  const b = setupCheck('tb', 7, ['washerwoman', 'librarian', 'investigator', 'drunk', 'recluse', 'baron', 'imp']);
  ok('Baron: 3 Townsfolk + 2 Outsiders at 7 players', b.ok, JSON.stringify(b));
  const w = setupCheck('tb', 7, ['washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'baron', 'imp']);
  ok('Baron without the extra Outsiders is flagged', !w.ok);
  const g = setupCheck('bmr', 8, ['grandmother', 'sailor', 'chambermaid', 'exorcist', 'innkeeper', 'gambler', 'godfather', 'zombuul']);
  ok('Godfather −1 Outsider at 8 players (6/0/1/1)', g.ok && g.options.length === 2, JSON.stringify(g));
  const g2 = setupCheck('bmr', 8, ['grandmother', 'sailor', 'chambermaid', 'exorcist', 'tinker', 'moonchild', 'godfather', 'zombuul']);
  ok('Godfather +1 Outsider at 8 players (4/2/1/1)', g2.ok);
  ok('incomplete bag is not ok', !setupCheck('tb', 7, ['imp']).ok);
}

/* ---------- a game ---------- */
let S = initialState();
ok('setup rejects a bad edition / count', !reduce(S, { t: 'setup', ed: 'xx', n: 7 }) && !reduce(S, { t: 'setup', ed: 'tb', n: 4 }) && !reduce(S, { t: 'setup', ed: 'tb', n: 16 }));
const bag = ['washerwoman', 'empath', 'fortuneteller', 'monk', 'ravenkeeper', 'drunk', 'butler', 'poisoner', 'imp'];
S = run(S, { t: 'setup', ed: 'tb', n: 9 }, { t: 'bag', ids: bag });
ok('9-player bag with 5/2/1/1 is ok', setupCheck('tb', 9, S.bag).ok);
ok('bag rejects characters of another edition', !reduce(S, { t: 'bag', ids: ['grandmother'] }));
ok('bag rejects duplicates', !reduce(S, { t: 'bag', ids: ['imp', 'imp'] }));
bag.forEach((id, i) => { S = run(S, { t: 'seat', i, role: id, name: `玩家${i + 1}` }); });
ok('a character can only be held by one seat', !reduce(S, { t: 'seat', i: 0, role: 'imp' }));
ok('only characters from the bag during setup', !reduce(S, { t: 'seat', i: 0, role: 'chef' }));
ok('the Drunk believes a Townsfolk only', !reduce(S, { t: 'seat', i: 5, bel: 'butler' }) && !!reduce(S, { t: 'seat', i: 5, bel: 'chef' }));
S = run(S, { t: 'seat', i: 5, bel: 'chef' }, { t: 'bluffs', ids: ['librarian', 'investigator', 'saint'] });
ok('bluffs must be good characters', !reduce(S, { t: 'bluffs', ids: ['baron'] }));
ok('names are cleaned and capped', reduce(S, { t: 'seat', i: 0, name: 'a\u0000b'.padEnd(40, 'x') }).seats[0].name.length === 12);
S = run(S, { t: 'start' });
ok('start: first night, everyone alive', S.stage === 'play' && S.ph.k === 'night' && S.ph.n === 1 && S.seats.every(x => !x.dead && x.ghost));

// night list
let L = nightList(S);
ok('first night: minion and demon info at 9 players', L.some(x => x.k === 'minioninfo') && L.some(x => x.k === 'demoninfo'));
ok('first night lists only characters in play', L.filter(x => x.char).every(x => S.seats.some(s => s.role === x.char || s.bel === x.char)));
ok('first night: the Drunk wakes as the Chef (fake)', L.some(x => x.char === 'chef' && x.fake && x.seat === 5));
ok('list is in night order', L.every((x, i) => !i || L[i - 1].order <= x.order));
ok('first night: Monk does not wake', !L.some(x => x.char === 'monk'));
ok('a 6-player game has no evil info', !nightList({ ...S, n: 6 }).some(x => x.k === 'minioninfo' || x.k === 'demoninfo'));

// night actions and the town square
S = run(S, { t: 'step', k: 'washerwoman@0', on: true }, { t: 'log', k: 'washerwoman@0', x: '指了 2号 3号，亮共情者' },
  { t: 'mark', i: 1, c: 'poisoner', x: '中毒', on: true });
ok('marks must be the character’s own reminders', !reduce(S, { t: 'mark', i: 1, c: 'poisoner', x: '随便', on: true }));
S = run(S, { t: 'dawn' }, { t: 'dusk' });
ok('second night: Monk wakes, Washerwoman does not', nightList(S).some(x => x.char === 'monk') && !nightList(S).some(x => x.char === 'washerwoman'));
ok('a new night clears the ticks', Object.keys(S.done).length === 0);
S = run(S, { t: 'dead', i: 4, dead: true });
ok('the Storyteller sees the night death', S.seats[4].dead && S.seats[4].ghost);
let P = publicView(S);
ok('the town square does not show a night death before dawn', !P.seats[4].dead);
ok('dead players stay in the night list, flagged', nightList(S).some(x => x.seat === 4 && x.dead));
S = run(S, { t: 'dawn' });
P = publicView(S);
ok('the death shows at dawn', P.seats[4].dead && P.seats[4].ghost);

// nominations and votes (8 alive → 4 votes needed)
ok('threshold: half the living, rounded up', threshold(S) === 4);
ok('the dead can not nominate', !reduce(S, { t: 'nom', by: 4, on: 0, votes: [] }));
S = run(S, { t: 'nom', by: 0, on: 7, votes: [0, 1, 2, 4] });
ok('a dead voter uses up the ghost vote', S.seats[4].ghost === false && S.noms[0].n === 4 && S.noms[0].need === 4);
ok('a dead player without a ghost vote can not vote', !reduce(S, { t: 'nom', by: 1, on: 2, votes: [4] }));
ok('one nomination a day per nominator', !reduce(S, { t: 'nom', by: 0, on: 3, votes: [] }));
ok('one nomination a day per nominee', !reduce(S, { t: 'nom', by: 1, on: 7, votes: [] }));
ok('on the block: 8号 with 4', onBlock(S)?.seat === 7 && onBlock(S).n === 4);
S = run(S, { t: 'nom', by: 1, on: 8, votes: [0, 1, 2, 3] });
ok('a tie means nobody is on the block', onBlock(S)?.tie?.length === 2);
S = run(S, { t: 'nom', by: 2, on: 3, votes: [1] });
ok('below the threshold does not count', onBlock(S)?.tie?.length === 2);
P = publicView(S);
ok('players see who voted', JSON.stringify(P.noms[0].votes) === '[0,1,2,4]' && P.seats[4].ghost === false);
S = run(S, { t: 'exec', seat: null });
ok('one execution decision a day', !reduce(S, { t: 'exec', seat: 7 }));
ok('no nominations after the execution', !reduce(S, { t: 'nom', by: 3, on: 0, votes: [] }));
S = run(S, { t: 'dusk' }, { t: 'dawn' });
S = run(S, { t: 'nom', by: 0, on: 8, votes: [0, 1, 2, 3, 5] }, { t: 'exec', seat: 8 });
ok('execution kills and gives a ghost vote', S.seats[8].dead && S.seats[8].ghost && publicView(S).seats[8].dead);
S = run(S, { t: 'end', win: 'good', why: '处决了小恶魔' });

/* ---------- what players see ---------- */
const S2 = run(initialState(), { t: 'setup', ed: 'tb', n: 9 }, { t: 'bag', ids: bag }, ...bag.map((id, i) => ({ t: 'seat', i, role: id })),
  { t: 'seat', i: 5, bel: 'chef' }, { t: 'bluffs', ids: ['librarian', 'investigator', 'saint'] });
const S3 = run(S2, { t: 'start' }, { t: 'log', k: 'note', x: '说书人秘密笔记' }, { t: 'mark', i: 1, c: 'poisoner', x: '中毒', on: true });
const names = Object.values(CHARS).flatMap(c => [c.zh]), ids = Object.keys(CHARS);
for (const [label, st] of [['setup', S2], ['play', S3]]) {
  const txt = JSON.stringify(publicView(st));
  ok(`public view (${label}) has no character ids or names`, !ids.some(id => txt.includes(`"${id}"`)) && !names.some(n => txt.includes(n)), txt);
  ok(`public view (${label}) has no notes, reminders, bluffs or bag`, !/秘密笔记|中毒|"bag"|"bluffs"|"marks"|"log"|"done"|"role"|"bel"/.test(txt), txt);
}
const over = publicView(S);
ok('after the end everyone sees the grimoire, bluffs and log', over.seats.every(x => x.role) && over.bluffs.length === 3 && over.log.length > 0 && over.result === 'good');
ok('record for the archive', gameRecord(S)?.seats.length === 9 && gameRecord(S).log.some(x => x.startsWith('首夜 [洗衣妇·1号]')));
ok('players may only send their own name', nameAction({ t: 'seat', i: 0, name: 'x' }) && !nameAction({ t: 'seat', i: 0, name: 'x', role: 'imp' }) && !nameAction({ t: 'dead', i: 0 }));
ok('reset keeps edition, count and names', (() => { const r = reduce(S, { t: 'reset' }); return r.stage === 'setup' && r.ed === 'tb' && r.n === 9 && r.seats[0].name === '玩家1' && !r.seats[0].role; })());

/* ---------- what characters would truly learn (info.js) ---------- */
const game = (ed, roles, extra = []) => run(initialState(), { t: 'setup', ed, n: roles.length }, { t: 'bag', ids: roles }, ...roles.map((id, i) => ({ t: 'seat', i, role: id })), ...extra, { t: 'start' });
const info = (G, char, seat) => autoInfo(G, { char, seat });
{
  // seats 1–7 in a circle: 洗衣妇 共情者 占卜师 酒鬼(以为是厨师) 管家 男爵 小恶魔
  const G = game('tb', ['washerwoman', 'empath', 'fortuneteller', 'drunk', 'butler', 'baron', 'imp'], [{ t: 'seat', i: 3, bel: 'chef' }]);
  ok('chef: Baron and Imp sit together → 1 pair', info(G, 'chef', 3) === '相邻的邪恶玩家：1 对', info(G, 'chef', 3));
  ok('empath: neighbours 1号 3号, none evil', info(G, 'empath', 1) === '两侧存活邻座 1号、3号，其中邪恶：0', info(G, 'empath', 1));
  ok('the Drunk is flagged', warnings(G, 3, 'chef').some(w => w.includes('酒鬼')));
  ok('empath at seat 7 side: Imp neighbours seat 1 and the Baron', info(G, 'empath', 0) === '两侧存活邻座 2号、7号，其中邪恶：1', info(G, 'empath', 0));
  // the dead are skipped by the Empath
  let D = run(G, { t: 'dead', i: 2, dead: true });
  ok('empath skips the dead', info(D, 'empath', 1) === '两侧存活邻座 1号、4号，其中邪恶：0', info(D, 'empath', 1));
  ok('washerwoman: the Townsfolk in play', info(G, 'washerwoman', 0) === '在场的镇民：2号 共情者、3号 占卜师');
  ok('librarian: the Outsiders in play (the Drunk shows as the Drunk)', info(G, 'librarian', 0) === '在场的外来者：4号 酒鬼、5号 管家');
  // fortune teller with a red herring
  const F = run(G, { t: 'mark', i: 0, c: 'fortuneteller', x: '干扰项', on: true });
  ok('fortune teller: Demon among the two → yes', pickInfo(F, { char: 'fortuneteller', seat: 2 }, [6, 4]).startsWith('其中有恶魔吗：是'));
  ok('fortune teller: red herring → yes', pickInfo(F, { char: 'fortuneteller', seat: 2 }, [0, 1]).startsWith('其中有恶魔吗：是'));
  ok('fortune teller: two good → no', pickInfo(F, { char: 'fortuneteller', seat: 2 }, [1, 4]) === '其中有恶魔吗：否');
  ok('ravenkeeper: the character', pickInfo(F, { char: 'ravenkeeper', seat: 2 }, [5]) === '6号 的角色：男爵');
  ok('a pick needs the right number of players', pickInfo(F, { char: 'fortuneteller', seat: 2 }, [1]) === null);
  // undertaker after an execution that killed, and one that didn't
  let U = run(G, { t: 'dawn' }, { t: 'nom', by: 0, on: 3, votes: [0, 1, 2, 4] }, { t: 'exec', seat: 3 }, { t: 'dusk' });
  ok('undertaker: the Drunk is shown as the Drunk', info(U, 'undertaker', 0) === '今天被处决而死的 4号 是：酒鬼');
  U = run(G, { t: 'dawn' }, { t: 'exec', seat: 3, died: false }, { t: 'dusk' });
  ok('undertaker: executed but not dead → nothing', info(U, 'undertaker', 0).startsWith('今天没有人被处决而死'));
}
{
  // the Recluse sitting next to the Imp: the Chef may get 0 or 1
  const R = game('tb', ['washerwoman', 'empath', 'recluse', 'imp', 'chef', 'poisoner', 'monk']);
  ok('chef with the Recluse next to the Imp: 0～1', info(R, 'chef', 4).startsWith('相邻的邪恶玩家：0～1'), info(R, 'chef', 4));
  ok('empath next to the Recluse: 0～1', info(R, 'empath', 1).includes('其中邪恶：0～1'), info(R, 'empath', 1));
  ok('investigator: the Recluse may show as a Minion', info(R, 'investigator', 0).includes('3号 陌客（可能被当作爪牙）'));
  const P = run(R, { t: 'mark', i: 1, c: 'poisoner', x: '中毒', on: true });
  ok('poisoned player flagged', warnings(P, 1, 'empath').some(w => w.includes('投毒者·中毒')));
}
{
  // 梦殒春宵: 1 钟表匠 2 城镇公告员 3 卖花女孩 4 诺-达鲺 5 心上人 6 女巫 7 数学家 8 神谕者 9 茶艺师? (not in S&V) → 艺术家
  const V = game('snv', ['clockmaker', 'towncrier', 'flowergirl', 'nodashii', 'sweetheart', 'witch', 'mathematician', 'oracle', 'artist', 'mutant']);
  ok('clockmaker: Demon (4号) to nearest Minion (6号) = 2 steps', info(V, 'clockmaker', 0) === '恶魔到最近的爪牙：2 步', info(V, 'clockmaker', 0));
  ok('No Dashii poisons the closest Townsfolk both ways, skipping the Outsider', JSON.stringify(poisonedByNoDashii(V).sort()) === '[2,6]', JSON.stringify(poisonedByNoDashii(V)));
  ok('standing effects list the No Dashii poison', standing(V).some(t => t.includes('3号') && t.includes('7号')));
  ok('the poisoned Mathematician is warned', warnings(V, 6, 'mathematician').some(w => w.includes('诺-达鲺')));
  let W = run(V, { t: 'dawn' }, { t: 'nom', by: 5, on: 0, votes: [3, 1] }, { t: 'nom', by: 1, on: 2, votes: [] }, { t: 'exec', seat: null }, { t: 'dusk' });
  ok('town crier: a Minion (the Witch) nominated → yes', info(W, 'towncrier', 1) === '今天有爪牙提名过吗：是');
  ok('flowergirl: the Demon voted → yes', info(W, 'flowergirl', 2) === '今天恶魔投过票吗：是');
  W = run(V, { t: 'dawn' }, { t: 'nom', by: 1, on: 2, votes: [0] }, { t: 'exec', seat: null }, { t: 'dusk' });
  ok('town crier: no Minion nominated → no', info(W, 'towncrier', 1) === '今天有爪牙提名过吗：否');
  ok('flowergirl: the Demon did not vote → no', info(W, 'flowergirl', 2) === '今天恶魔投过票吗：否');
  W = run(W, { t: 'dead', i: 5, dead: true }, { t: 'dead', i: 4, dead: true });
  ok('oracle: dead evil players', info(W, 'oracle', 7) === '死亡玩家里邪恶的：1 名');
  W = run(W, { t: 'mark', i: 1, c: 'mathematician', x: '未正常生效', on: true }, { t: 'mark', i: 2, c: 'mathematician', x: '未正常生效', on: true });
  ok('mathematician: counts the 未正常生效 reminders', info(W, 'mathematician', 6).startsWith('标了「未正常生效」的：2 人（2号、3号）'));
  ok('seamstress: same alignment?', pickInfo(W, { char: 'seamstress', seat: 0 }, [3, 5]) === '同一阵营吗：是' && pickInfo(W, { char: 'seamstress', seat: 0 }, [3, 1]) === '同一阵营吗：否');
  ok('juggler: counts right guesses', pickInfo(W, { char: 'juggler', seat: 0 }, [3, 5, 1], { 3: 'nodashii', 5: 'witch', 1: 'oracle' }) === '猜中：2 个');
}
{
  // Tea Lady (黯月初升): both alive neighbours good → they can't die
  const T = game('bmr', ['tealady', 'grandmother', 'sailor', 'chambermaid', 'zombuul', 'godfather', 'exorcist']);
  ok('tea lady protects good neighbours', standing(T).some(t => t.includes('2号、7号') && t.includes('不会死亡')), JSON.stringify(standing(T)));
  ok('godfather: no Outsiders in play', info(T, 'godfather', 5) === '在场的外来者：场上没有外来者');
  const C = run(T, { t: 'step', k: 'sailor@2', on: true }, { t: 'step', k: 'exorcist@6', on: true });
  ok('chambermaid: counts ticked players among the two', pickInfo(C, { char: 'chambermaid', seat: 3 }, [2, 1]).startsWith('今晚因自己能力醒来的：1 人'));
}

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
