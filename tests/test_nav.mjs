// Local only: node tests/test_nav.mjs http://localhost:8895/ /tmp/claude-501/codex_tasks/shots
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
const [base = 'http://localhost:8895/', out = '/tmp/claude-501/codex_tasks/shots'] = process.argv.slice(2);
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'local server required');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
let ws;
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route('https://boardgame.leisurecat.cloud/api/reviews**', r => r.fulfill({ json: { ok: true } }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  async function layout(label) {
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.locator('.back-pill').isVisible(), label);
    const issues = await page.locator('.back-pill').evaluate(el => {
      const a = el.getBoundingClientRect(), problems = [];
      if (a.height < 36 || a.left < 0 || a.right > innerWidth || a.top < 0 || a.bottom > innerHeight) problems.push('bounds');
      if (document.documentElement.scrollWidth > innerWidth) problems.push('overflow');
      for (const other of document.querySelectorAll('a,button,input,select,textarea,summary,[role="button"],.ttl,.conn,h1,.hz')) {
        if (other === el || other.contains(el)) continue;
        const b = other.getBoundingClientRect();
        if (b.width && b.height && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) problems.push(other.outerHTML.slice(0, 100));
      }
      return problems;
    });
    assert.deepEqual(issues, [], label);
    console.log('PASS', label, 'visible, 36px target, no overlap/overflow');
  }
  await page.goto(base);
  assert.equal(await page.locator('.back-pill').textContent(), '‹ 全部游戏');
  assert.equal(await page.locator('.back-pill').getAttribute('href'), 'https://boardgame.leisurecat.cloud');
  await layout('landing');
  await page.screenshot({ path: `${out}/nav_botc_landing.png` });
  await page.click('[data-act="create"]');
  await page.waitForSelector('.who-tag.mm');
  const code = new URL(page.url()).searchParams.get('r');
  await page.click('[data-act="ed"][data-ed="tb"]');
  await page.waitForSelector('.cts');
  await layout('setup');
  await page.screenshot({ path: `${out}/nav_botc_room.png` });
  await page.locator('.back-pill').click();
  await page.waitForSelector('[data-act="create"]');
  await page.click(`[data-act="rejoin"][data-code="${code}"]`);
  await page.waitForSelector('[data-ed="tb"].on');
  assert.equal(await page.locator('.cnt .n').textContent(), '7');
  console.log('PASS setup and storyteller key survive leaving and rejoining');
  const key = await page.evaluate(c => JSON.parse(localStorage.getItem('botc-mine')).find(r => r.code === c).key, code);
  ws = new WebSocket(new URL(`/api/room/${code}/ws`, base).href.replace(/^http/, 'ws'));
  let state;
  ws.onmessage = e => { if (e.data !== 'pong') { const m = JSON.parse(e.data); if (m.type === 'state') state = m.state; } };
  await new Promise(r => ws.onopen = r);
  async function until(fn) {
    for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 50)); }
    throw new Error('Timed out waiting for room state');
  }
  ws.send(JSON.stringify({ auth: key }));
  await until(() => state?.bag);
  async function action(a) { const v = state.v; ws.send(JSON.stringify({ action: a })); await until(() => state.v > v); }
  await action({ t: 'setup', ed: 'tb', n: 5 });
  const bag = ['washerwoman', 'empath', 'chef', 'poisoner', 'imp'];
  await action({ t: 'bag', ids: bag });
  for (const [i, role] of bag.entries()) await action({ t: 'seat', i, role, name: `导航玩家${i}` });
  await action({ t: 'start' });
  for (const stage of ['night', 'day', 'over']) {
    if (stage === 'day') await action({ t: 'dawn' });
    if (stage === 'over') await action({ t: 'end', win: 'good', why: '导航测试' });
    const saved = JSON.stringify(state);
    for (const publicView of [false, true]) {
      await page.goto(new URL(`/?r=${code}${publicView ? '&v=1' : ''}`, base).href);
      await page.waitForSelector('.who-tag');
      assert.equal(await page.locator('.back-pill').textContent(), '‹ 首页');
      await layout(`${stage} ${publicView ? 'public' : 'storyteller'}`);
      assert.equal(await page.locator('#shot .back-pill').count(), 0);
      await page.locator('.back-pill').click();
      await page.waitForSelector('[data-act="create"]');
      await page.fill('#joinCode', code);
      await page.click('[data-act="join"]');
      await page.waitForSelector('.who-tag.mm');
      assert.equal(JSON.stringify(state), saved, 'leaving must not mutate room');
      if (stage !== 'over') await page.click('[data-act="tab"][data-tab="grim"]');
      await page.waitForFunction(() => document.querySelector('#app').textContent.includes('导航玩家0'));
    }
    console.log('PASS', stage, 'room state preserved after return and code rejoin');
  }
  for (const name of ['guide', 'roles', 'history']) {
    await page.goto(new URL(`/${name}.html`, base).href);
    assert.equal(await page.locator('.back-pill').textContent(), '‹ 返回');
    assert.equal(await page.locator('.back-pill').getAttribute('href'), '/');
    await layout(name);
    if (name === 'guide') await page.screenshot({ path: `${out}/nav_botc_guide.png` });
    await page.locator('.back-pill').click();
    await page.waitForSelector('[data-act="create"]');
  }
  assert.deepEqual(errors, []);
  console.log('ALL PASS');
} finally { ws?.close(); await browser.close(); }
