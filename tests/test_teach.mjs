// Teach page: entry on the landing page, every term opens its note (with the official picture when there is one),
// the 「问」 buttons ask the rules assistant that exact question, 注意事项, the picture guide, phone width, and that the
// page never touches a room. /api/chat is mocked, so this never asks a real model.
// Usage: node tests/test_teach.mjs <base-url> <shots-dir>   (safe against the live site too: it writes nothing)
import { chromium } from 'playwright-core';
const [base, out = './shots'] = process.argv.slice(2);
let fails = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };

const b = await chromium.launch({ channel: 'chrome' });
const page = await (await b.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
const sockets = []; page.on('websocket', w => sockets.push(w.url()));
const asked = [];
await page.route('**/api/chat', async r => {
  const q = JSON.parse(r.request().postData()).messages.at(-1).content; asked.push(q);
  await r.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: { content: `答：${q}` } }] })}\n\ndata: [DONE]\n\n` });
});

await page.goto(base); await page.waitForSelector('.teachgo');
const entry = await page.textContent('.teachgo b');
await page.click('.teachgo'); await page.waitForSelector('.tpart');
eq('teach page opened', new URL(page.url()).pathname, '/teach');
const title = await page.textContent('h1');
eq('landing entry names the same minutes as the page title', entry, `第一次玩？${title}`);
eq('six parts plus 注意事项', await page.$$eval('.tpart h2', l => l.map(h => h.querySelector('span').textContent.replace(/^\S+?(?=[一-龥])/, ''))),
  ['怎么赢', '角色和角色表', '夜晚', '白天和提名', '处决和死亡', '信息不一定是真的', '注意事项']);
const read = await page.$$eval('.tline', l => l.map(p => p.textContent).join(''));
const mins = +title.match(/\d+/)[0];
console.log(`  script: ${read.length} characters to read aloud, title says ${mins} minutes`);
eq('script length fits the title (about 250 characters a minute)', Math.abs(read.length / 250 - mins) <= 1, true);
// every important element is at least named
for (const w of ['善良阵营', '邪恶阵营', '镇民', '外来者', '爪牙', '恶魔', '说书人', '魔典', '角色表', '角色标记', '伪装', '提名', '投票', '处决', '生命标记', '投票标记', '醉酒', '中毒'])
  if (!read.includes(w)) { fails++; console.log('FAIL script mentions', w); }
await page.screenshot({ path: out + '/teach_top.png' });

// every term in the script and in the guide opens a note with a name and both texts; the picture loads when there is one
const ids = await page.$$eval('[data-t]', l => [...new Set(l.map(x => x.dataset.t))]);
const bad = []; let pictured = 0;
for (const id of ids) {
  await page.evaluate(id => document.querySelector(`[data-t="${id}"]`).click(), id);
  await page.evaluate(() => Promise.all([...document.querySelectorAll('.tshd img')].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))));
  const n = await page.$eval('.tsheet', s => ({ open: !s.classList.contains('hidden'), name: s.querySelector('.tshd b')?.textContent, img: s.querySelector('.tshd img') ? s.querySelector('.tshd img').naturalWidth > 0 : null, ps: [...s.querySelectorAll('p')].map(p => p.textContent.length) }));
  if (n.img) pictured++;
  if (!n.open || !n.name || n.img === false || n.ps.length !== 2 || n.ps.some(x => x < 8)) bad.push([id, n]);
  await page.click('.tsx');
}
console.log(`  ${ids.length} terms checked, ${pictured} with an official picture`);
eq('every term opens a note; every picture loads', bad, []);
eq('the note closes', await page.$eval('.tsheet', s => s.classList.contains('hidden')), true);
const term = page.locator('.tpart .term').nth(1);
await term.scrollIntoViewIfNeeded(); await term.click();
await page.screenshot({ path: out + '/teach_note.png' });

// asking from a note: closes the note, opens the assistant, sends the question
const nm = await page.textContent('.tshd b');
await page.click('.tsask'); await page.waitForSelector('.cm.a:not(:has(.cdots))');
eq('note → assistant asked about that term', [asked.at(-1), await page.isVisible('.cpanel'), await page.$eval('.tsheet', s => s.classList.contains('hidden'))],
  [`「${nm}」是什么，怎么用？`, true, true]);
await page.click('.cx');

// a 「问」 button sends exactly its question and the answer shows
const q = await page.$eval('#p4 .tq', x => x.dataset.q);
await page.locator('#p4 .tq').first().click(); await page.waitForFunction(n => document.querySelectorAll('.cm.a').length > n && !document.querySelector('.cm.a:last-child .cdots'), 1);
eq('「问」 sends its question', [asked.at(-1), await page.$$eval('.cm.a', l => l.at(-1).textContent)], [q, `答：${q}`]);
await page.click('.cx');
eq('no button inside a button', await page.$$eval('button button', l => l.length), 0);

// 注意事项: every note has a title and a written answer, starts closed, opens on tap, and its button asks about it
const notes = await page.$$eval('.tni', l => l.map(d => ({ t: d.querySelector('summary').textContent, a: d.querySelector('p').textContent.length, q: d.querySelector('.tq').dataset.q, open: d.open })));
console.log(`  ${notes.length} notes`);
eq('15 to 20 notes, each with an answer, all closed at first', [notes.length >= 15 && notes.length <= 20, notes.filter(n => n.a < 15 || !n.q || n.open)], [true, []]);
const n1 = page.locator('.tni').first();
await n1.locator('summary').click();
eq('a note opens on tap', await n1.evaluate(d => d.open && d.querySelector('p').offsetHeight > 0), true);
await page.screenshot({ path: out + '/teach_notes.png' });
await n1.locator('.tq').click(); await page.waitForFunction(() => !document.querySelector('.cm.a:last-child .cdots'));
eq('a note\'s button asks its question', asked.at(-1), notes[0].q);
await page.click('.cx');

// picture guide: every picture loads and has a name
await page.evaluate(() => Promise.all([...document.querySelectorAll('.tic img')].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))));
const tiles = await page.$$eval('.tic', l => l.map(t => [t.dataset.t, t.querySelector('img')?.naturalWidth > 0, t.textContent.trim().length > 0]));
eq('picture guide: every picture loads', tiles.filter(t => !t[1] || !t[2]), []);
console.log(`  picture guide: ${tiles.length} pictures`);
await page.locator('#icons').scrollIntoViewIfNeeded(); await page.screenshot({ path: out + '/teach_icons.png' });

eq('no sideways scrolling at 375 px', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
eq('「去建房间」 goes to the landing page', await page.getAttribute('.tgo', 'href'), '/');
eq('credits the official resources', (await page.textContent('footer')).includes('The Pandemonium Institute'), true);
eq('the teach page never opens a room connection', sockets.filter(u => /\/api\/room\//.test(u)), []);
eq('no page errors', errs, []);
await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
