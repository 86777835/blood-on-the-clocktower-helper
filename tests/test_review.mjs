// Rating card on the results screen, for the Storyteller and for a player.
// Usage: node tests/test_review.mjs <base-url> <shots-dir>   (local `wrangler dev`; the hub endpoint is intercepted, nothing is posted for real)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const [base, out = './shots'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const api = p => new URL(p, base).href;
const wait = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const eq = (n, g, w) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : `got ${JSON.stringify(g)} want ${JSON.stringify(w)}`); };

// a finished 5-player game
const { code, key } = await (await fetch(api('/api/room'), { method: 'POST' })).json();
const ws = new WebSocket(api(`/api/room/${code}/ws`).replace(/^http/, 'ws'));
let S = null; ws.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'state') S = m.state; };
await new Promise(r => ws.onopen = r);
const send = async o => { const v = S?.v ?? -1; ws.send(JSON.stringify(o)); for (let i = 0; i < 100 && !(S && S.v > v); i++) await wait(30); };
await wait(300);
ws.send(JSON.stringify({ auth: key })); await wait(300);
const bag = ['washerwoman', 'empath', 'chef', 'poisoner', 'imp'];
await send({ action: { t: 'setup', ed: 'tb', n: 5 } });
await send({ action: { t: 'bag', ids: bag } });
for (const [i, id] of bag.entries()) await send({ action: { t: 'seat', i, role: id, name: ['甲', '乙', '丙', '丁', '戊'][i] } });
await send({ action: { t: 'start' } });
await send({ action: { t: 'end', win: 'evil', why: '只剩两人' } });
eq('game over', [S.stage, S.result], ['over', 'evil']);

const b = await chromium.launch({ channel: 'chrome' });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const errs = [], posted = [];
const mock = async page => {
  page.on('pageerror', e => errs.push(e.message));
  await page.route('https://boardgame.leisurecat.cloud/api/reviews', async r => {
    posted.push(JSON.parse(r.request().postData()));
    await r.fulfill({ json: { ok: true, avg: 4, count: posted.length, dist: [0, 0, 0, 1, 0] }, headers: { 'access-control-allow-origin': '*' } });
  });
};

// Storyteller
const st = await (await b.newContext(phone)).newPage();
await mock(st);
await st.goto(base);
await st.evaluate(([c, k]) => localStorage.setItem('botc-mine', JSON.stringify([{ code: c, key: k, t: Date.now() }])), [code, key]);
await st.goto(api(`/?r=${code}`)); await st.waitForSelector('.rv');
eq('Storyteller: card outside the long-image area', await st.$('#shot .rv'), null);
eq('Storyteller: "我是" is 说书人, already chosen', await st.$$eval('.rv-who button', l => l.map(x => [x.textContent, x.classList.contains('on')])), [['说书人', true]]);
eq('send disabled until stars', await st.isDisabled('[data-act="rv-send"]'), true);
await st.click('[data-act="rv-star"][data-n="4"]');
eq('4 stars lit, label', [await st.$$eval('.rv-st button.on', l => l.length), await st.textContent('.rv-st span')], [4, '好玩']);
await st.fill('[data-rv="text"]', '说书人轻松多了');
await st.click('[data-act="rv-star"][data-n="5"]');   // a re-render must keep the typed text
eq('text kept across re-render', await st.inputValue('[data-rv="text"]'), '说书人轻松多了');
await st.screenshot({ path: `${out}/review_st.png`, fullPage: true });
await st.click('[data-act="rv-send"]'); await st.waitForSelector('.rv-done');
eq('posted to the hub', [posted.length, posted[0].game, posted[0].stars, posted[0].name, posted[0].text, posted[0].room], [1, 'botc', 5, '说书人', '说书人轻松多了', code]);
eq('request fields', Object.keys(posted[0]).sort(), ['game', 'name', 'room', 'stars', 'text']);
eq('request carries no characters', ['小恶魔', '投毒者', 'imp', 'poisoner'].filter(w => JSON.stringify(posted[0]).includes(w)), []);
eq('thanks shown', (await st.textContent('.rv p')).includes('谢谢 说书人'), true);
eq('link to everyone\'s reviews', await st.getAttribute('.rv a', 'href'), 'https://boardgame.leisurecat.cloud');
await st.reload(); await st.waitForSelector('.rv');
eq('sent state remembered after reload', !!(await st.$('.rv-done')), true);
await st.click('[data-act="rv-edit"]');
eq('edit restores the form', [await st.$$eval('.rv-st button.on', l => l.length), await st.inputValue('[data-rv="text"]')], [5, '说书人轻松多了']);

// a player who sits in seat 3
const pl = await (await b.newContext(phone)).newPage();
await mock(pl);
await pl.goto(base);
await pl.evaluate(c => localStorage.setItem(`botc-seat-${c}`, '2'), code);
await pl.goto(api(`/?r=${code}`)); await pl.waitForSelector('.rv');
eq('player: "我是" is 玩家', await pl.$$eval('.rv-who button', l => l.map(x => [x.textContent, x.classList.contains('on')])), [['玩家', true]]);
await pl.click('[data-act="rv-star"][data-n="3"]');
await pl.click('[data-act="rv-send"]'); await pl.waitForSelector('.rv-done');
eq('no name typed → the seat’s name', [posted.at(-1).game, posted.at(-1).stars, posted.at(-1).name], ['botc', 3, '丙']);
await pl.click('[data-act="rv-edit"]'); await pl.fill('[data-rv="name"]', '小明'); await pl.click('[data-act="rv-star"][data-n="4"]');
eq('name kept across re-render', await pl.inputValue('[data-rv="name"]'), '小明');
await pl.click('[data-act="rv-send"]'); await pl.waitForSelector('.rv-done');
eq('typed name posted', [posted.at(-1).name, posted.at(-1).stars, posted.at(-1).room], ['小明', 4, code]);
await pl.screenshot({ path: `${out}/review_player.png`, fullPage: true });

// hub refuses → the reason is shown
await pl.unroute('https://boardgame.leisurecat.cloud/api/reviews');
await pl.route('https://boardgame.leisurecat.cloud/api/reviews', r => r.fulfill({ status: 429, json: { error: '评价太频繁，请稍后再试' }, headers: { 'access-control-allow-origin': '*' } }));
await pl.click('[data-act="rv-edit"]'); await pl.click('[data-act="rv-send"]'); await pl.waitForSelector('.rv .err');
eq('hub error shown', await pl.textContent('.rv .err'), '评价太频繁，请稍后再试');

eq('no page errors', errs, []);
ws.close(); await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
