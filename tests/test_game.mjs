// Two phones play a 7-player 暗流涌动 end to end. Usage: node tests/test_game.mjs <base-url> <shots-dir>
// Storyteller phone: new room → script, players, bag (Baron + Drunk) → who drew what → bluffs → first night list
// → a night death → dawn → nomination and votes → execution → end → results, long image, history.
// Player phone: joins by room code, takes seat 2 and writes a name, keeps notes, and never sees a character until the end.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { CHARS } from '../public/data.js';
const [base, out = './shots'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
let fails = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
const yes = (name, v) => eq(name, !!v, true);

const b = await chromium.launch({ channel: 'chrome' });
const phone = { viewport: { width: 375, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const st = await (await b.newContext(phone)).newPage(), pl = await (await b.newContext(phone)).newPage();
for (const p of [st, pl]) p.on('pageerror', e => { fails++; console.log('FAIL page error', e.message); });
const shot = (p, n, full = false) => p.screenshot({ path: `${out}/${n}.png`, fullPage: full });
const settle = () => new Promise(r => setTimeout(r, 350));
const cast = ['washerwoman', 'empath', 'fortuneteller', 'drunk', 'butler', 'baron', 'imp'];
const castNames = cast.map(id => CHARS[id].zh).concat(CHARS.chef.zh);
// the player's town square must never show a character in play before the end
const plText = () => pl.evaluate(() => { const c = document.querySelector('#app').cloneNode(true); c.querySelectorAll('details.ref,.ref-sec').forEach(d => d.remove()); return c.textContent; });
const leaks = async () => (await plText()).match(new RegExp(castNames.join('|'), 'g')) || [];

// landing
await st.goto(base);
await shot(st, '01-landing');
yes('landing: create button', await st.isVisible('text=我当说书人：创建房间'));
yes('landing: official cover', await st.isVisible('.hero-box img'));
await st.click('[data-act="create"]');
await st.waitForSelector('text=说书人视图');
const code = new URL(st.url()).searchParams.get('r');
yes('room code in url', /^[A-Z0-9]{4}$/.test(code));

// script and player count
await st.click('[data-act="ed"][data-ed="tb"]'); await st.waitForSelector('.cts');
eq('default 7 players', await st.textContent('.cnt .n'), '7');
await st.click('[data-act="n"][data-d="1"]'); await settle();
eq('player count up', await st.textContent('.cnt .n'), '8');
await st.click('[data-act="n"][data-d="-1"]'); await settle();

// the player joins and takes seat 2
await pl.goto(base);
await pl.fill('#joinCode', code.toLowerCase()); await pl.click('[data-act="join"]');
await pl.waitForSelector('text=说书人正在准备');
await pl.click('[data-act="me"]'); await pl.click('[data-act="sit"][data-i="1"]');
await pl.fill('#myName', '小明'); await pl.click('[data-act="myname"]'); await settle();
eq('player sees their seat', (await pl.textContent('.mebar')).includes('2号'), true);
await st.waitForFunction(() => document.querySelector('[data-name="1"]')?.value === '小明');
yes('Storyteller sees the name the player wrote', true);

// the bag: Baron means 3 Townsfolk + 2 Outsiders
for (const id of cast) await st.click(`[data-act="bag"][data-id="${id}"]`), await settle();
eq('bag counts match the Baron setup', await st.$$eval('.ct.ok', l => l.length), 4);
yes('Baron setup note shown', await st.isVisible('.note.secret >> text=男爵'));
for (const [i, n] of ['阿一', null, '阿三', '阿四', '阿五', '阿六', '阿七'].entries()) if (n) { await st.fill(`[data-name="${i}"]`, n); await st.press(`[data-name="${i}"]`, 'Enter'); }
await settle();
// who drew what
for (const [i, id] of cast.entries()) {
  await st.click(`[data-act="pickrole"][data-i="${i}"]`);
  await st.click(`.sheet [data-act="setrole"][data-id="${id}"]`); await settle();
  if (id === 'drunk') { await st.click('.sheet [data-act="setbel"][data-id="chef"]'); await settle(); await st.click('.sheet .btn[data-act="close"]'); }
}
await settle();
yes('the Drunk shows who they think they are', (await st.textContent('[data-k="sr-3"]')).includes('以为是厨师'));
await st.click('[data-act="bluffs"]');
for (const id of ['librarian', 'investigator', 'saint']) await st.click(`.sheet [data-act="bluff"][data-id="${id}"]`), await settle();
await st.click('.sheet .btn[data-act="close"]');
await shot(st, '02-setup', true);
eq('player sees no characters during setup', await leaks(), []);
await st.click('[data-act="start"]');
await st.waitForSelector('.nlist');

// first night
const steps = await st.$$eval('.ns-b > b', l => l.map(x => x.textContent));
yes('first night: minion info and demon info (7 players)', steps.some(s => s.includes('爪牙信息')) && steps.some(s => s.includes('恶魔信息')));
yes('first night: the Drunk wakes as the Chef', steps.some(s => s.includes('厨师') && s.includes('4号')) && await st.isVisible('.fake'));
yes('first night: the Washerwoman wakes', steps.some(s => s.includes('洗衣妇')));
yes('demon info shows the bluffs', (await st.textContent('[data-k="ns-demoninfo"]')).includes('图书管理员'));
const wk = '[data-k="ns-washerwoman@0"]';
await st.click(`${wk} .ns-ck`); await settle();
yes('ticked', await st.isVisible(`${wk}.done`));
await st.fill(`${wk} .ns-in`, '指了 2号 3号，亮共情者'); await st.press(`${wk} .ns-in`, 'Enter'); await settle();
await shot(st, '03-night');
await pl.waitForSelector('text=请闭上眼睛');
await shot(pl, '04-player-night');
// a night death (on the grimoire tab) stays hidden from players until dawn
await st.click('[data-act="tab"][data-tab="grim"]');
await st.click('[data-act="seat"][data-i="4"]'); await st.click('.sheet [data-act="dead"]'); await settle();
await st.click('.sheet .btn[data-act="close"]');
await shot(st, '05-grimoire');
await settle();
eq('player: night death not shown yet', await pl.$$eval('.tw.dead', l => l.length), 0);
await st.click('[data-act="tab"][data-tab="game"]');
await st.click('[data-act="dawn"]'); await st.waitForSelector('text=确定天亮');
await st.click('[data-act="dawnok"]'); await st.waitForSelector('text=第 1 天');
await pl.waitForSelector('.tw.dead');
eq('player: the death shows at dawn', await pl.$$eval('.tw.dead b', l => l.map(x => x.textContent)), ['阿五']);

// a nomination: 1号 nominates 7号; 1, 2, 3, 5 (dead, ghost vote) and 6 raise their hands
await st.click('[data-act="nom"]');
await st.click('.sheet [data-act="nompick"][data-key="by"][data-i="0"]');
await st.click('.sheet [data-act="nompick"][data-key="on"][data-i="6"]');
for (const i of [0, 1, 2, 4, 5]) await st.click(`.sheet [data-act="vote"][data-i="${i}"]`);
eq('vote count and threshold', (await st.textContent('.sheet .lbl:has(.vc)')).replace(/\s+/g, ''), '谁举手了5票·需要3票');
await shot(st, '06-vote');
await st.click('.sheet [data-act="nomok"]'); await settle();
yes('on the block', (await st.textContent('.block')).includes('7号'));
await pl.waitForSelector('.nom');
eq('player sees who voted', await pl.$$eval('.nom-v i', l => l.map(x => x.textContent)), ['1', '2', '3', '5', '6']);
yes('player: the dead voter used the ghost vote', await pl.isVisible('[data-k="tw-4"] .gv.used'));
await shot(pl, '07-player-day');
await st.click('[data-act="exec"][data-seat="6"]'); await st.click('[data-act="execok"]'); await settle();
yes('execution recorded', (await st.textContent('.banner')).includes('7号'));
eq('player: still no characters before the end', await leaks(), []);

// player notes, kept on the server under this phone's token
await pl.click('[data-act="ptab"][data-tab="notes"]');
await pl.fill('[data-note="0"]', '说自己是洗衣妇'); await pl.fill('[data-note="free"]', '7号很可疑');
await new Promise(r => setTimeout(r, 1200));
await pl.reload(); await pl.click('[data-act="ptab"][data-tab="notes"]');
await pl.waitForFunction(() => document.querySelector('[data-note="free"]')?.value === '7号很可疑');
eq('notes survive a reload', await pl.inputValue('[data-note="0"]'), '说自己是洗衣妇');
await shot(pl, '08-notes');
await pl.click('[data-act="ptab"][data-tab="roles"]');
yes('player: the script’s character list', await pl.isVisible('text=首夜顺序'));

// the end
await st.click('[data-act="end"]'); await st.fill('#endWhy', '第 1 天处决了小恶魔');
await st.click('[data-act="endok"][data-win="good"]');
await st.waitForSelector('text=善良阵营获胜');
await pl.waitForSelector('text=善良阵营获胜');
const fin = await pl.textContent('#shot');
yes('player sees the grimoire after the end', ['小恶魔', '男爵', '以为自己是厨师', '指了 2号 3号，亮共情者', '图书管理员'].every(w => fin.includes(w)));
await shot(pl, '09-results', true);
await st.click('[data-act="save"]'); await st.waitForSelector('.shotv img', { timeout: 15000 });
yes('long image made', (await st.getAttribute('.shotv img', 'src')).startsWith('data:image/jpeg'));
await st.click('.shotv button');
await st.goto(new URL('/history', base).href); await st.waitForSelector('.fq summary');
yes('history lists the game', (await st.textContent('#games')).includes('善良阵营获胜'));
await shot(st, '10-history');

await b.close();
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
