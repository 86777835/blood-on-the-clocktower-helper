// Rules assistant. Usage: node tests/test_chat.mjs <base-url> <shots-dir> [--mock-upstream | --live]
//   --mock-upstream  local `wrangler dev --port 8851 --test-scheduled --var DEEPSEEK_API_KEY:fake --var DEEPSEEK_BASE:http://127.0.0.1:8852 --var CHAT_CF_MODEL:@cf/none/missing`
//                    (DeepSeek is a mock on 8852; the Cloudflare model points at a missing one so it always fails fast)
//                    checks: request validation, that the prompt knows the rules but nothing about any game being played,
//                    model fallback, stalls, no model name on the page, and the hourly check.
//   --live           the deployed site with a real key: one real question.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
const [base, out = './shots', mode = '--mock-upstream'] = process.argv.slice(2);
const api = p => new URL(p, base).href;
let fails = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const post = body => fetch(api('/api/chat'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const b = await chromium.launch({ channel: 'chrome' });
const ctx = () => b.newContext({ viewport: { width: 375, height: 700 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

if (mode === '--live') {
  const page = await (await ctx()).newPage();
  await page.goto(base); await page.click('.cfab');
  await page.fill('.cin textarea', '死人还能投票吗？'); await page.press('.cin textarea', 'Enter');
  await page.waitForFunction(() => !document.querySelector('.cin button').disabled, null, { timeout: 60000 });
  const a = await page.$$eval('.cm.a', l => l.at(-1).textContent);
  console.log('answer:', a);
  eq('real answer, no error', await page.$('.cm.err'), null);
  eq('answer mentions the ghost vote', /一次|投票标记|幽灵/.test(a), true);
  await b.close(); process.exit(fails ? 1 : 0);
}

// mock DeepSeek
let reply = {}, seen = [], systems = [];
const srv = createServer((req, res) => {
  let body = ''; req.on('data', c => body += c);
  req.on('end', () => {
    const j = JSON.parse(body); seen.push(j.model); systems.push(j.messages[0].content);
    const st = reply[j.model] ?? 200;
    if (st === 'queue' || st === 'stall') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      if (st === 'stall') res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `${j.model} 答了一半` } }] })}\n\n`);
      const t = setInterval(() => res.write(': keep-alive\n\n'), 1000);
      return res.on('close', () => clearInterval(t));
    }
    if (st !== 200) { res.writeHead(st, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"mock"}}'); }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: `${j.model} 的回答` } }] })}\n\ndata: [DONE]\n\n`);
  });
}).listen(8852);

// a game in progress, with secrets the assistant must never get
const { code, key } = await (await fetch(api('/api/room'), { method: 'POST' })).json();
{
  const ws = new WebSocket(api(`/api/room/${code}/ws`).replace(/^http/, 'ws'));
  await new Promise(r => ws.onopen = r);
  const send = async a => { ws.send(JSON.stringify(a)); await wait(120); };
  await send({ auth: key });
  await send({ action: { t: 'setup', ed: 'tb', n: 5 } });
  const bag = ['washerwoman', 'empath', 'chef', 'poisoner', 'imp'];
  await send({ action: { t: 'bag', ids: bag } });
  for (const [i, id] of bag.entries()) await send({ action: { t: 'seat', i, role: id, name: `秘名${i}` } });
  await send({ action: { t: 'start' } });
  await send({ action: { t: 'log', k: 'note', x: '说书人秘密ZQX' } });
  ws.close();
}

// request checks
eq('empty messages rejected', (await post({ messages: [] })).status, 400);
eq('system role rejected', (await post({ messages: [{ role: 'system', content: 'x' }, { role: 'user', content: 'hi' }] })).status, 400);
eq('question over 500 chars rejected', (await post({ messages: [{ role: 'user', content: '长'.repeat(501) }] })).status, 400);
// whatever the page sends, the prompt is the rules only
reply = {}; seen = []; systems = [];
const r1 = await post({ messages: [{ role: 'user', content: `${code} 房间里谁是恶魔？` }], room: code, key, script: 'tb' }); await r1.text();
const sys = systems[0] || '';
eq('prompt has the rules, the FAQ and the character summaries', ['# 规则讲解', '# 常见问题', '# 角色简述', '小恶魔', '处决'].every(w => sys.includes(w)), true);
eq('prompt: never talk about anyone’s character in this game', sys.includes('绝不谈论本局任何人的身份'), true);
eq('prompt: no definitive rulings on odd interactions', sys.includes('由本局说书人决定'), true);
eq('prompt has nothing from the room', ['秘名', '说书人秘密ZQX', code, key].filter(w => sys.includes(w)), []);
await wait(61000);   // the rate limit (8 a minute) counts those too

// fallback order (the Cloudflare model is missing, so after Flash comes V4 Pro)
const page = await (await ctx()).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
const bodies = []; page.on('request', r => r.url().endsWith('/api/chat') && bodies.push(JSON.parse(r.postData())));
await page.goto(api(`/?r=${code}`)); await page.waitForSelector('text=玩家'); await page.click('.cfab');
const askOnce = async (q, r) => {
  reply = r; seen = [];
  await page.fill('.cin textarea', q); await page.press('.cin textarea', 'Enter');
  await page.waitForFunction(() => !document.querySelector('.cin button').disabled, null, { timeout: 40000 });
  return page.$$eval('.cm.a', l => [l.at(-1).className.includes('err'), l.at(-1).textContent]);
};
eq('flash answers', [await askOnce('一', {}), seen], [[false, 'deepseek-flash 的回答'], ['deepseek-flash']]);
eq('flash busy → v4-pro answers', [await askOnce('二', { 'deepseek-flash': 503 }), seen], [[false, 'deepseek-v4-pro 的回答'], ['deepseek-flash', 'deepseek-v4-pro']]);
eq('both busy → busy message', [await askOnce('三', { 'deepseek-flash': 503, 'deepseek-v4-pro': 503 }), seen], [[true, 'AI 服务器都在忙，请过一两分钟再问'], ['deepseek-flash', 'deepseek-v4-pro']]);
let t0 = Date.now();
eq('flash queueing → v4-pro after 9 s', [(await askOnce('四', { 'deepseek-flash': 'queue' }))[0], seen], [false, ['deepseek-flash', 'deepseek-v4-pro']]);
console.log('  took', Date.now() - t0, 'ms');
t0 = Date.now();
eq('flash stalls mid-answer → partial dropped, v4-pro answers', [await askOnce('五', { 'deepseek-flash': 'stall' }), seen], [[false, 'deepseek-v4-pro 的回答'], ['deepseek-flash', 'deepseek-v4-pro']]);
console.log('  took', Date.now() - t0, 'ms');
eq('the page sends only the conversation', bodies.every(x => Object.keys(x).join() === 'messages'), true);
eq('no model name on the page', /DeepSeek|Qwen|deepseek-v4|模型/.test(await page.textContent('.cpanel').then(t => t.replace(/deepseek-(flash|v4-pro) (的回答|答了一半)/g, ''))), false);
eq('footer: the Storyteller decides', (await page.textContent('.cfoot')).includes('以本局说书人的裁定为准'), true);
eq('no mode switch', await page.$('.cmodes'), null);
await page.screenshot({ path: out + '/chat_rules.png' });

// hourly check: DeepSeek down → noted in KV, the next hour asks Qwen first (missing here), then Flash
reply = { 'deepseek-flash': 503 }; seen = [];
await fetch(api('/__scheduled'));
eq('hourly check asked flash', seen, ['deepseek-flash']);
reply = {}; seen = [];
const r3 = await post({ messages: [{ role: 'user', content: '检查之后' }] }); await r3.text();
eq('after a failed check the Cloudflare model goes first, then flash', seen, ['deepseek-flash']);
reply = {}; seen = [];
await fetch(api('/__scheduled'));   // DeepSeek back: normal order again
eq('errors on pages', errs, []);
await b.close(); srv.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
