// Rules assistant. Usage: node tests/test_chat.mjs <base-url> <shots-dir> [--mock-upstream | --mock-web | --live | --live-web]
//   --mock-upstream  local `wrangler dev --port 8851 --test-scheduled --var DEEPSEEK_API_KEY:fake --var DEEPSEEK_BASE:http://127.0.0.1:8852 --var CHAT_CF_MODEL:@cf/none/missing`
//                    (DeepSeek is a mock on 8852; the Cloudflare model points at a missing one so it always fails fast)
//                    checks: request validation, that the prompt knows the rules but nothing about any game being played,
//                    model fallback, stalls, no model name on the page, and the hourly check.
//   --mock-web       same wrangler dev flags: web search when the site's notes don't cover a question (official wiki first,
//                    then BGG and the whole web), and that nothing from a game in progress reaches the search.
//                    Run it at least a minute apart from --mock-upstream (8 questions a minute per IP).
//   --live           the deployed site with a real key: one real question.
//   --live-web       the deployed site: one question the notes don't cover (searches the web for real).
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

if (mode === '--live-web') {
  const page = await (await ctx()).newPage();
  await page.goto(base); await page.click('.cfab');
  const t0 = Date.now();
  await page.fill('.cin textarea', '麻脸巫婆把一名玩家变成恶魔后，原来的恶魔会怎样？'); await page.press('.cin textarea', 'Enter');
  await page.waitForFunction(() => !document.querySelector('.cin button').disabled, null, { timeout: 90000 });
  const a = await page.$$eval('.cm.a', l => ({ label: !!l.at(-1).querySelector('.cweb'), text: l.at(-1).textContent, src: [...l.at(-1).querySelectorAll('.csrc a')].map(x => x.href) }));
  console.log('took', Date.now() - t0, 'ms\nanswer:', a.text, '\nsources:', a.src.join(' '));
  eq('real answer, no error', await page.$('.cm.err'), null);
  await page.screenshot({ path: out + '/chat_web_live.png' });
  await b.close(); process.exit(fails ? 1 : 0);
}

if (mode === '--mock-web') {
  // The mock model asks to search for questions containing 「网上」; the mock search API answers per `search`.
  let search = 'ok', asked = [], origs = [], systems = [];   // search: 'ok' | 'empty' | 'fail'
  const sse = text => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
  const srv = createServer((req, res) => {
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => {
      const j = JSON.parse(body);
      if (req.url === '/v1/tools/search') {
        asked.push(j.query); origs.push(j.ori_question);
        if (search === 'fail') { res.writeHead(500); return res.end('{}'); }
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ results: search === 'empty' ? [] : [
          { title: 'Pit-Hag <b>', url: 'https://wiki.bloodontheclocktower.com/Pit-Hag', site_name: 'Blood on the Clocktower Wiki', summary: 'If the Pit-Hag creates a Demon, deaths tonight are arbitrary.' },
          { title: '麻脸巫婆讨论', url: 'https://example.cn/a', site_name: null, snippet: '网友说原恶魔还在。' }] }));
      }
      const sys = j.messages[0].content, q = j.messages.at(-1).content;
      systems.push(sys);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      if (sys.includes('联网搜索到的网页摘要')) return res.end(sse(`依据网上说法：会 [1]（摘要条数 ${(sys.match(/^\[\d\] /gm) || []).length}）`));
      if (q.includes('先解释')) {   // the model explains first and asks to search at the end
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '资料里没有提到这一点。' } }] })}\n\n`);
        return setTimeout(() => res.end(sse('\n\n【需联网】Blood on the Clocktower Barber')), 300);
      }
      if (q.includes('网上')) {   // the marker arrives split over two chunks, like a real stream
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '【需' } }] })}\n\n`);
        return setTimeout(() => res.end(sse('联网】Blood on the Clocktower Pit-Hag Demon')), 200);
      }
      res.end(sse(q.includes('无关') ? '我只解答血染钟楼规则。' : '资料里的回答'));
    });
  }).listen(8852);

  // a game in progress whose secrets must never reach a search
  const { code, key } = await (await fetch(api('/api/room'), { method: 'POST' })).json();
  {
    const ws = new WebSocket(api(`/api/room/${code}/ws`).replace(/^http/, 'ws'));
    await new Promise(r => ws.onopen = r);
    const send = async a => { ws.send(JSON.stringify(a)); await wait(120); };
    await send({ auth: key });
    await send({ action: { t: 'setup', ed: 'snv', n: 5 } });
    const bag = ['clockmaker', 'dreamer', 'sweetheart', 'pithag', 'vortox'];
    await send({ action: { t: 'bag', ids: bag } });
    for (const [i, id] of bag.entries()) await send({ action: { t: 'seat', i, role: id, name: `秘名${i}` } });
    await send({ action: { t: 'start' } });
    await send({ action: { t: 'log', k: 'note', x: '说书人秘密ZQX' } });
    ws.close();
  }

  const page = await (await ctx()).newPage();
  page.on('pageerror', e => { fails++; console.log('FAIL page error', e.message); });
  const bodies = []; page.on('request', r => r.url().endsWith('/api/chat') && bodies.push(JSON.parse(r.postData())));
  await page.goto(api(`/?r=${code}`)); await page.waitForSelector('text=玩家'); await page.click('.cfab');
  eq('panel says it searches when the notes lack an answer', (await page.textContent('.chd')).includes('查不到会联网找'), true);
  const askOnce = async (q, s) => {
    search = s; asked = []; origs = [];
    await page.fill('.cin textarea', q); await page.press('.cin textarea', 'Enter');
    await page.waitForFunction(() => !document.querySelector('.cin button').disabled, null, { timeout: 40000 });
    return page.$$eval('.cm.a', l => { const a = l.at(-1); return { err: a.className.includes('err'), label: !!a.querySelector('.cweb'),
      text: [...a.childNodes].filter(n => !n.classList?.contains('cweb') && !n.classList?.contains('csrc')).map(n => n.textContent).join(''),
      src: [...a.querySelectorAll('.csrc a')].map(x => [x.textContent, x.getAttribute('href'), x.target]) }; });
  };
  const SRC = [['[1] Pit-Hag <b>Blood on the Clocktower Wiki', 'https://wiki.bloodontheclocktower.com/Pit-Hag', '_blank'], ['[2] 麻脸巫婆讨论example.cn', 'https://example.cn/a', '_blank']];
  const order = a => [a[0], ...a.slice(1).sort()];   // wiki first; BGG and the whole web go out together
  eq('covered by the notes: answered directly, no search', [await askOnce('死人还能投票吗？', 'ok'), asked],
    [{ err: false, label: false, text: '资料里的回答', src: [] }, []]);
  const t0 = Date.now();
  eq('not covered: official wiki first, then BGG and the web; labelled, sources listed', [await askOnce('网上怎么说麻脸巫婆？', 'ok'), order(asked)],
    [{ err: false, label: true, text: '依据网上说法：会 [1]（摘要条数 2）', src: SRC },
     ['Blood on the Clocktower Pit-Hag Demon site:wiki.bloodontheclocktower.com', 'Blood on the Clocktower Pit-Hag Demon', 'Blood on the Clocktower Pit-Hag Demon site:boardgamegeek.com']]);
  console.log('  took', Date.now() - t0, 'ms');
  await page.screenshot({ path: out + '/chat_web.png' });
  eq('the search request never reaches the page as text', (await page.$$eval('.cm.a', l => l.map(x => x.textContent).join(''))).includes('需联网'), false);
  eq('nothing from the game in progress reaches the search', ['秘名', '说书人秘密ZQX', code, key].filter(w => JSON.stringify([asked, origs]).includes(w)), []);
  eq('the search prompt names characters the Chinese way', systems.some(x => x.includes('Pit-Hag=麻脸巫婆')), true);
  eq('nothing found: says so, no label, nothing made up', [await askOnce('网上还有啥？', 'empty'), asked.length],
    [{ err: false, label: false, text: '本站资料里没有这一条，网上也没找到可靠的说法。建议翻一下官方 Wiki，或者问问本局说书人。', src: [] }, 3]);
  eq('web answer goes back as plain history (no label, no sources)', bodies.at(-1).messages.slice(-3).map(m => m.content),
    ['网上怎么说麻脸巫婆？', '依据网上说法：会 [1]（摘要条数 2）', '网上还有啥？']);
  eq('search API down: says so', (await askOnce('网上第三问？', 'fail')).text, '本站资料里没有这一条，联网查找也失败了，请过一会儿再问，或者翻一下规则书。');
  eq('off-topic: no search', [(await askOnce('无关的问题', 'ok')).text, asked], ['我只解答血染钟楼规则。', []]);
  eq('search asked for at the end of an explanation: explanation dropped, searched', [await askOnce('先解释再查', 'ok'), order(asked)],
    [{ err: false, label: true, text: '依据网上说法：会 [1]（摘要条数 2）', src: SRC },
     ['Blood on the Clocktower Barber site:wiki.bloodontheclocktower.com', 'Blood on the Clocktower Barber', 'Blood on the Clocktower Barber site:boardgamegeek.com']]);
  eq('the rules prompt: search words are the rules question only', systems.find(x => x.includes('# 规则讲解'))?.includes('搜索词只能是规则问题本身'), true);
  await b.close(); srv.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
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
