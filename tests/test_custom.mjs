// Local regression: node tests/test_custom.mjs [--unit | http://localhost:8895/] [shots-dir]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { parseScript, exportScript, copyEdition, publicScript, MAX_SCRIPT_BYTES } from '../public/custom.js';
import { initialState, reduce, nightList, publicView, gameRecord, setupCheck, poolCheck, EDITIONS, CHARS } from '../public/logic.js';
import { autoInfo, pickInfo, standing, warnings, poisonedByNoDashii } from '../public/info.js';
import { charList } from '../public/views.js';
const pass = label => console.log('PASS', label);
const hb = { id: 'hbtest', name: '守灯人', team: 'townsfolk', ability: '<img src="https://evil.invalid/a" onerror="window.pwned=1"> 每夜选择一人', firstNight: CHARS.empath.fn - .5, otherNight: CHARS.empath.on + .5,
  firstNightReminder: '私密提示YX', otherNightReminder: '私密提示YX', reminders: ['秘密标记YX'], setup: true, jinxes: [{ id: 'empath', reason: '与共情者同场时由说书人裁定' }] };
const definition = [{ id: '_meta', name: '灯火测试', author: '测试作者' }, 'empath', 'chef', 'poisoner', 'imp', hb, 'washerwoman'];
const script = parseScript(definition);
assert.deepEqual(exportScript(parseScript(exportScript(script))), exportScript(script));
assert.equal(parseScript([{ id: '_meta', name: '旧格式' }, { id: 'chef' }]).chars[0], 'chef');
for (const [input, error] of [
  [[{ id: '_meta', name: 'X' }, 'unknown', 'steward'], /unknown、steward/],
  [[{ id: '_meta', name: 'X' }, 'chef', 'chef'], /重复 id/],
  [[{ id: '_meta', name: 'X' }, { ...hb, id: 'chef' }], /冲突/],
  [[{ id: '_meta', name: 'X' }, { ...hb, id: '__proto__' }], /非法/],
  [[{ id: '_meta', name: 'X' }, 'fortune_teller'], /中文格式/],
  [[{ id: '_meta', name: 'X' }, { ...hb, image: 'https://evil.invalid/a' }], /image/],
  [[{ id: '_meta', name: 'X' }, { ...hb, special: [] }], /special/],
  [[{ id: '_meta', name: 'X' }, { ...hb, firstNight: undefined }], /firstNight/],
  ['[broken', /JSON 格式错误/], [' '.repeat(MAX_SCRIPT_BYTES + 1), /128 KiB/]
]) assert.throws(() => parseScript(input), error);
pass('JSON 往返、旧 id 对象、未知列表、重复、冲突、危险 id、格式、大小和 URL/special 校验');
for (const ed of Object.keys(EDITIONS)) {
  const before = JSON.stringify(EDITIONS[ed]);
  assert.equal(reduce(initialState(), { t: 'setup', ed, n: 5, script: definition }), null);
  let s = reduce(initialState(), { t: 'setup', ed, n: 5 });
  assert.equal(reduce(s, { t: 'bag', ids: ['hbtest'] }), null);
  const copied = copyEdition(ed); copied.push({ ...hb, jinxes: [] });
  assert.ok(reduce(s, { t: 'setup', ed: 'custom', n: 5, script: copied }));
  assert.equal(JSON.stringify(EDITIONS[ed]), before);
}
assert.equal(poolCheck({ ed: 'custom', script: parseScript([{ id: '_meta', name: '男爵' }, 'chef', 'empath', 'soldier', 'drunk', 'saint', 'baron', 'imp']) }, 7).ok, true);
let S = reduce(initialState(), { t: 'setup', ed: 'custom', n: 5, script: definition });
assert.equal(setupCheck('custom', 5, ['empath', 'chef', 'hbtest', 'poisoner', 'imp'], S).ok, true);
S = reduce(S, { t: 'bag', ids: ['empath', 'chef', 'hbtest', 'poisoner', 'imp'] });
for (const [i, role] of S.bag.entries()) S = reduce(S, { t: 'seat', i, role });
S = reduce(S, { t: 'start' });
assert.equal(reduce(S, { t: 'setup', ed: 'custom', n: 5, script: definition }), null);
assert.ok(nightList(S).findIndex(x => x.char === 'hbtest') < nightList(S).findIndex(x => x.char === 'empath'));
for (const id of ['empath', 'chef', 'hbtest']) assert.equal(autoInfo(S, { char: id, seat: 0 }), null);
assert.equal(pickInfo(S, { char: 'fortuneteller' }, [0, 1]), null);
assert.deepEqual(standing(S), []); assert.deepEqual(warnings(S, 0, 'empath'), []); assert.deepEqual(poisonedByNoDashii(S), []);
S = reduce(S, { t: 'mark', i: 0, c: 'hbtest', x: '秘密标记YX', on: true });
assert.equal(S.seats[0].marks.length, 1);
const pub = publicView(S);
assert.deepEqual(pub.script, publicScript(script));
assert.ok(!JSON.stringify(pub).includes('秘密标记YX')); assert.ok(!JSON.stringify(pub).includes('私密提示YX'));
const html = charList('custom', pub);
assert.ok(html.includes('&lt;img')); assert.ok(!html.includes('<img src="https:'));
S = reduce(S, { t: 'end', win: 'good' });
const record = gameRecord(S), old = JSON.stringify(record);
const changed = structuredClone(definition); changed[0].name = '后来改名'; changed.find(x => x.id === 'hbtest').name = '新的守灯人';
let next = reduce(S, { t: 'reset' }); next = reduce(next, { t: 'setup', ed: 'custom', n: 5, script: changed });
assert.equal(JSON.stringify(record), old); assert.equal(next.script.name, '后来改名');
const exported = JSON.stringify(exportScript(S.script));
for (const k of ['seats', 'bag', 'bluffs', 'log', 'done', 'key', 'notes']) assert.ok(!exported.includes(`"${k}":`));
pass('内置保护、独立快照、夜序、标记、人工信息模式、公开过滤、纯文本、归档和纯定义导出');
if (process.argv[2] === '--unit') process.exit(0);
const base = process.argv[2] || 'http://localhost:8895/', out = process.argv[3] || '/tmp/claude-501/codex_tasks/shots';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname)); mkdirSync(out, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
function socket(code) {
  const ws = new WebSocket(new URL(`/api/room/${code}/ws`, base).href.replace(/^http/, 'ws')), frames = [], inbox = [];
  ws.onmessage = e => { if (e.data !== 'pong') { const m = JSON.parse(e.data); frames.push(m); inbox.push(m); } };
  const next = async () => { const end = Date.now() + 10000; while (!inbox.length) { if (Date.now() > end) throw new Error('socket timeout'); await wait(10); } return inbox.shift(); };
  return { ws, frames, next };
}
const room = await (await fetch(new URL('/api/room', base), { method: 'POST' })).json();
const host = socket(room.code), players = [socket(room.code), socket(room.code), socket(room.code)];
const sockets = [host, ...players];
let browser;
try {
  for (const s of sockets) await s.next();
  host.ws.send(JSON.stringify({ auth: room.key })); await host.next();
  const act = async action => { host.ws.send(JSON.stringify({ action })); return (await host.next()).state; };
  for (const ed of Object.keys(EDITIONS)) {
    const good = await act({ t: 'setup', ed, n: 5 });
    const bad = await act({ t: 'setup', ed, n: 5, script: definition });
    assert.deepEqual(bad, good);
  }
  let state = await act({ t: 'setup', ed: 'custom', n: 5, script: definition });
  await act({ t: 'bag', ids: ['empath', 'chef', 'hbtest', 'poisoner', 'imp'] });
  for (const [i, role] of ['empath', 'chef', 'hbtest', 'poisoner', 'imp'].entries()) await act({ t: 'seat', i, role });
  state = await act({ t: 'start' });
  assert.deepEqual(await act({ t: 'setup', ed: 'custom', n: 5, script: changed }), state);
  await wait(100);
  const counts = players.map(p => p.frames.length);
  await act({ t: 'mark', i: 0, c: 'hbtest', x: '秘密标记YX', on: true });
  await act({ t: 'log', k: 'hbtest@2', x: '说书人秘密YX' });
  await act({ t: 'step', k: 'hbtest@2', on: true });
  await act({ t: 'dead', i: 1, dead: true });
  await wait(150);
  assert.deepEqual(players.map(p => p.frames.length), counts);
  for (const p of players) for (const m of p.frames) {
    assert.equal(m.role, 'view');
    const s = m.state;
    assert.ok(Object.keys(s).every(k => ['stage', 'ed', 'n', 'ph', 'seats', 'noms', 'execs', 'script'].includes(k)));
    for (const seat of s.seats) assert.deepEqual(Object.keys(seat).sort(), ['dead', 'ghost', 'name']);
    if (s.script) assert.deepEqual(s.script, publicScript(script));
    for (const secret of ['秘密标记YX', '私密提示YX', '说书人秘密YX']) assert.ok(!JSON.stringify(m).includes(secret));
  }
  pass(`WebSocket: 三个内置剧本伪造请求拒绝；两名玩家和旁观者 ${players.reduce((n,p)=>n+p.frames.length,0)} 帧白名单，无夜间秘密流量`);
  const { chromium } = await import('playwright-core');
  browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(), errors = [], badRequests = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (r.url().includes('evil.invalid')) badRequests.push(r.url()); });
  const shot = async name => {
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '390px no overflow');
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  };
  await page.goto(`${base}?r=${room.code}#k=${room.key}`); await page.waitForSelector('.nlist');
  assert.equal(await page.locator('.ns-info-r').count(), 0); assert.ok((await page.locator('.nlist').innerText()).includes('手动记录'));
  await shot('botc_custom_night');
  const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const player = await pc.newPage(); player.on('pageerror', e => errors.push(e.message)); player.on('request', r => { if (r.url().includes('evil.invalid')) badRequests.push(r.url()); });
  await player.goto(`${base}?r=${room.code}`); await player.click('[data-act="ptab"][data-tab="roles"]');
  await player.waitForSelector('.custom-letter');
  assert.ok((await player.locator('.ref-sec').innerText()).includes(hb.ability));
  assert.ok(!(await player.locator('body').innerText()).includes('私密提示YX'));
  assert.ok(await player.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await player.evaluate(() => window.scrollTo(0, 0));
  await player.screenshot({ path: `${out}/botc_custom_player.png`, fullPage: true });
  assert.deepEqual(badRequests, []); assert.equal(await player.evaluate(() => window.pwned), undefined);
  await act({ t: 'end', win: 'good' });
  const archive = async () => (await (await fetch(new URL(`/api/room/${room.code}/games`, base), { method: 'POST', body: JSON.stringify({ key: room.key }) })).json());
  const oldArchive = await archive(); assert.equal(oldArchive.length, 1);
  await act({ t: 'reset' }); await act({ t: 'setup', ed: 'custom', n: 5, script: changed });
  assert.deepEqual(await archive(), oldArchive);
  await page.goto(new URL('/history', base).href); await page.waitForSelector('#games details'); await page.locator('#games details').first().click();
  assert.ok((await page.locator('#games').innerText()).includes('守灯人')); assert.ok(!(await page.locator('#games').innerText()).includes('新的守灯人'));
  pass('自定义夜晚、玩家纯文本及相克显示、无 URL 请求、旧局归档独立快照');
  await page.goto(`${base}?r=${room.code}`); await page.waitForSelector('[data-act="custom-edit"]');
  for (const ed of Object.keys(EDITIONS)) {
    await page.click(`[data-act="ed"][data-ed="${ed}"]`); await page.waitForSelector('[data-act="custom-copy"]');
    assert.equal(await page.locator('[data-act="custom-role-new"]').count(), 0);
    assert.equal(await page.locator('[data-act="custom-edit"]').count(), 0);
    await page.click('[data-act="custom-copy"]'); await page.waitForSelector('#customName');
    assert.ok((await page.inputValue('#customName')).includes(EDITIONS[ed].zh));
    await page.click('[data-act="custom-cancel"]');
  }
  await page.click('[data-act="custom-new"]'); await page.fill('#customName', '我的夜航');
  for (const id of ['empath', 'chef', 'poisoner', 'imp']) await page.click(`[data-act="custom-toggle"][data-id="${id}"]`);
  await page.click('[data-act="custom-role-new"]');
  await page.fill('#customRoleName', '守灯人'); await page.fill('[data-role-field="ability"]', '每晚选择一人，记录他的回答');
  const beforeEmpath = await page.locator('[data-role-field="firstNight"] option').allTextContents(); assert.ok(beforeEmpath.includes('共情者之前'));
  await page.selectOption('[data-role-field="firstNight"]', { label: '共情者之前' });
  await page.fill('[data-role-field="marks"]', '灯火\n已用'); await page.check('[data-role-field="setup"]');
  await shot('botc_custom_role');
  await page.click('[data-act="custom-role-save"]'); await page.waitForSelector('#customSearch');
  assert.equal(await page.locator('.cts .ct').count(), 4); await shot('botc_custom_editor');
  const madeDownload = page.waitForEvent('download'); await page.click('[data-act="custom-export"]');
  const { readFile: readMade } = await import('node:fs/promises');
  const made = JSON.parse(await readMade(await (await madeDownload).path(), 'utf8'));
  const madeId = made.find(r => r.name === '守灯人').id;
  assert.ok(made[0].firstNight.indexOf(madeId) < made[0].firstNight.indexOf('empath'));
  assert.ok(parseScript(made).characters[madeId].custom);
  // Reopening the role and changing its position must update the exported order.
  await page.click('[data-act="custom-role-edit"]');
  await page.selectOption('[data-role-field="firstNight"]', { label: '共情者之后' });
  await page.click('[data-act="custom-role-save"]'); await page.waitForSelector('#customSearch');
  const editDownload = page.waitForEvent('download'); await page.click('[data-act="custom-export"]');
  const edited = JSON.parse(await readMade(await (await editDownload).path(), 'utf8'));
  assert.ok(edited[0].firstNight.indexOf(madeId) > edited[0].firstNight.indexOf('empath'));
  await page.fill('#customSearch', '共情');
  assert.deepEqual(errors, []);
  await page.waitForSelector('[data-act="custom-toggle"][data-id="empath"]'); assert.equal(await page.locator('[data-act="custom-toggle"]').count(), 1); await page.fill('#customSearch', '');
  await page.click('[data-act="custom-show-import"]');
  await page.fill('#customJSON', JSON.stringify([{ id: '_meta', name: '未知角色' }, 'steward', 'unknown'])); await page.click('[data-act="custom-parse"]');
  await page.waitForSelector('[role="alert"]'); assert.ok((await page.locator('[role="alert"]').innerText()).includes('steward、unknown')); await shot('botc_custom_import_err');
  // Import file, download pure definition, save, reopen and reuse local data.
  await page.setInputFiles('#customFile', { name: 'script.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(definition)) });
  await page.waitForFunction(() => document.querySelector('#customJSON').value.includes('灯火测试'));
  await page.click('[data-act="custom-parse"]'); assert.equal(await page.inputValue('#customName'), '灯火测试');
  const download = page.waitForEvent('download'); await page.click('[data-act="custom-export"]');
  const file = await download; const { readFile } = await import('node:fs/promises');
  assert.deepEqual(JSON.parse(await readFile(await file.path(), 'utf8')), exportScript(script));
  await page.click('[data-act="custom-use"]'); await page.waitForSelector('[data-act="custom-edit"]');
  await page.click('[data-act="custom-import"]'); assert.ok(await page.locator('[data-act="custom-recent"]').count());
  await page.click('[data-act="custom-recent"]'); assert.equal(await page.inputValue('#customName'), '灯火测试');
  assert.deepEqual(errors, []); pass('UI 三内置不可编辑、复制、手动创建、搜索计数、夜序表单、文件导入、下载与最近复用；五张手机截图');
} finally {
  for (const s of sockets) s.ws.close();
  if (browser) await browser.close();
}

process.exit(0);
