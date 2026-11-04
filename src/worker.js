import { DurableObject } from 'cloudflare:workers';
import { initialState, reduce, publicView, gameRecord, nameAction } from '../public/logic.js';
import { EDITIONS, CHARS, TEAM_ZH } from '../public/data.js';
import GUIDE from '../tools/讲解稿.md';
import FAQ from '../tools/faq.json';

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const newCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const newKey = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // A new room. The key makes its holder the Storyteller; everyone else with the code only gets the public view.
    if (url.pathname === '/api/room' && req.method === 'POST') {
      for (let i = 0; i < 6; i++) {
        const code = newCode(), key = newKey();
        const res = await env.ROOM.get(env.ROOM.idFromName(code)).fetch('https://room/init', { method: 'POST', body: JSON.stringify({ code, key }) });
        if (res.ok) return Response.json({ code, key });
      }
      return Response.json({ error: '暂时无法创建房间，请重试' }, { status: 503 });
    }

    if (url.pathname === '/api/chat' && req.method === 'POST') return chat(req, env);
    if (url.pathname === '/api/chat-log' && req.method === 'POST') {   // a reply the page lost mid-way (see chat.js)
      console.log('chat client error', (await req.text()).slice(0, 300), req.headers.get('user-agent')?.slice(-60), req.cf?.colo);
      return new Response(null, { status: 204 });
    }

    // Finished games of one room, for the Storyteller's history page (needs the room key).
    const rec = url.pathname.match(/^\/api\/room\/([A-Z0-9]{4})\/games$/);
    if (rec && req.method === 'POST') return env.ROOM.get(env.ROOM.idFromName(rec[1])).fetch('https://room/games', { method: 'POST', body: await req.text() });

    const m = url.pathname.match(/^\/api\/room\/([A-Z0-9]{4})\/ws$/);
    if (m) {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('需要 WebSocket 连接', { status: 426 });
      return env.ROOM.get(env.ROOM.idFromName(m[1])).fetch(req);
    }

    return new Response('Not found', { status: 404 });
  },

  async scheduled(event, env) { await checkDeepSeek(env); }
};

// Rules assistant. Same model order and fallback as the Pittsburgh helper:
// the next model answers when the one before is overloaded, queueing, erroring, unreachable or stalls mid-answer.
const CHAT_MODELS = [
  { id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash' },
  { id: '@cf/qwen/qwen3.8-27b', name: 'Qwen3.8 27B (Cloudflare)' },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' }
];
const FIRST_DATA_MS = 9000;   // three models × 9 s stays under the page's 30 s wait
const STALL_MS = 8000;        // an answer that pauses this long mid-way is dropped and asked again of the next model
// Hourly check (cron): when DeepSeek doesn't answer, Qwen goes first until the next check.
const DEEPSEEK_DOWN = 'deepseek-down';   // KV key; expires on its own a little after the next hourly check
const ORDER = { normal: [0, 1, 2], deepseekDown: [1, 0, 2] };   // indexes into CHAT_MODELS

async function checkDeepSeek(env) {
  const fails = [];
  const o = await openModel(0, env, [{ role: 'user', content: '你好' }], fails);
  if (o) {
    o.reader.cancel().catch(() => {});
    await env.CHAT_STATE.delete(DEEPSEEK_DOWN);
    console.log('deepseek check: ok');
  } else {
    await env.CHAT_STATE.put(DEEPSEEK_DOWN, JSON.stringify({ at: new Date().toISOString(), fails }), { expirationTtl: 3900 });
    console.log('deepseek check: down, Qwen first for the next hour', fails.join('/'));
  }
}

const RULES_SYSTEM = `你是「血染钟楼规则助手」，解答桌游《血染钟楼》（Blood on the Clocktower，中文版《染·钟楼谜团》）的规则问题，也可以解释本网站「血染钟楼助手」怎么用。

回答要求：
- 只依据下面的「规则讲解」「常见问题」和「角色简述」作答，它们是本站依据官方 Wiki 和集石钟楼百科自己整理的。资料里没有的内容，直接说资料里没有、建议问本局说书人，不要编造规则。
- 你可能正被任何一名玩家使用。你不知道、也绝不谈论本局任何人的身份、阵营、中毒醉酒状态或夜里得到的信息；被问“谁是恶魔”“X 号是不是好人”这类问题，就说规则助手不知道本局的任何身份，也不帮忙推理。
- 角色之间少见或有歧义的互动，不要下定论：说明资料里的通用规则，然后说明具体怎么判由本局说书人决定。
- 与本游戏无关的问题，礼貌说明你只解答血染钟楼规则。
- 用简体中文，简短直接：先给结论，再补一两句理由或例子。可以用短列表，不要用表格和标题。

本网站怎么用：说书人用手机建房间，选剧本和人数、选角色放进袋子，玩家线下抽实体角色标记后，说书人按座位录入。夜里看夜晚清单逐项打勾、记下给了谁什么信息；白天记提名、点选举手的人，自动算票数和处决门槛；终局后所有人都能看到完整魔典和记录，可以保存复盘长图。玩家扫码进房间，只能看到公开信息（谁死了、幽灵票、提名票型）、本剧本的角色表和自己的笔记。

# 规则讲解
${GUIDE}

# 常见问题
${FAQ.map(f => `【${f.cat}】问：${f.q}\n答：${f.a}`).join('\n\n')}

# 角色简述（本站自写，按剧本）
${Object.entries(EDITIONS).map(([ed, e]) => `## ${e.zh}（${e.en}）\n` + e.chars.map(id => `${CHARS[id].zh}（${TEAM_ZH[CHARS[id].team]}）：${CHARS[id].gist}`).join('\n')).join('\n\n')}`;

async function chat(req, env) {
  if (!env.DEEPSEEK_API_KEY) return Response.json({ error: '规则助手还没有配置好，请稍后再试' }, { status: 503 });
  const { success } = await env.CHAT_LIMIT.limit({ key: req.headers.get('cf-connecting-ip') || 'local' });
  if (!success) return Response.json({ error: '问得有点快，请过一分钟再问' }, { status: 429 });
  let body;
  try { body = await req.json(); } catch { body = null; }
  const msgs = body?.messages;
  const valid = Array.isArray(msgs) && msgs.length > 0 && msgs.length <= 20 && msgs.at(-1).role === 'user' && msgs.at(-1).content?.length <= 500
    && msgs.every(m => ['user', 'assistant'].includes(m?.role) && typeof m.content === 'string' && m.content.trim() && m.content.length <= 3000);
  if (!valid) return Response.json({ error: '问题格式不对，请刷新页面再试' }, { status: 400 });
  const system = RULES_SYSTEM;
  const messages = [{ role: 'system', content: system }, ...msgs.slice(-10).map(m => ({ role: m.role, content: m.content }))];
  const fails = [];   // HTTP status, 0 = unreachable or error, 'queue' = no answer started in time or stalled
  const order = await env.CHAT_STATE.get(DEEPSEEK_DOWN) ? ORDER.deepseekDown : ORDER.normal;
  let cur = await firstAnswer(order, 0, env, messages, fails);
  if (!cur) return Response.json({ error: chatFailed(fails) }, { status: 502 });
  const enc = new TextEncoder(), dec = new TextDecoder();
  const event = o => enc.encode(`data: ${JSON.stringify(o)}\n\n`);
  let lastData = Date.now();
  const stream = new ReadableStream({
    start(c) { cur.head.forEach(v => c.enqueue(v)); },
    async pull(c) {
      // Keep-alive comments don't count as progress: only data lines do.
      let timer, r;
      const stall = new Promise(ok => { timer = setTimeout(() => ok('stall'), Math.max(0, lastData + STALL_MS - Date.now())); });
      try { r = await Promise.race([cur.reader.read(), stall]); } catch (e) { r = 'broken'; console.log('chat model broke mid-answer', CHAT_MODELS[cur.i].id, String(e).slice(0, 200)); }
      clearTimeout(timer);
      if (r === 'stall' || r === 'broken') {
        if (r === 'stall') console.log(`chat model stalled ${STALL_MS / 1000}s mid-answer`, CHAT_MODELS[cur.i].id);
        fails.push(r === 'stall' ? 'queue' : 0);
        cur.reader.cancel().catch(() => {});
        const next = await firstAnswer(order, cur.k + 1, env, messages, fails);
        if (!next) { c.enqueue(event({ error: chatFailed(fails) })); return c.close(); }
        cur = next; lastData = Date.now();
        c.enqueue(event({ reset: CHAT_MODELS[cur.i].name }));   // the page drops the partial answer and starts over
        cur.head.forEach(v => c.enqueue(v));
        return;
      }
      if (r.done) return c.close();
      if (dec.decode(r.value, { stream: true }).includes('data:')) lastData = Date.now();
      c.enqueue(r.value);
    },
    cancel() { cur.reader.cancel().catch(() => {}); }
  });
  const h = { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' };
  if (cur.i) h['x-chat-fallback'] = CHAT_MODELS[cur.i].name;
  return new Response(stream, { headers: h });
}

const chatFailed = fails => fails.some(f => f === 503 || f === 429 || f === 'queue')   // overloaded / throttled / queueing
  ? 'AI 服务器都在忙，请过一两分钟再问' : `规则助手暂时不可用（${fails.join('/')}），请稍后再试`;

// The first model from position `from` in `order` that starts answering:
// { k: position, i: index into CHAT_MODELS, reader, head (chunks read so far) }, or null.
async function firstAnswer(order, from, env, messages, fails) {
  for (let k = from; k < order.length; k++) {
    const i = order[k], o = await openModel(i, env, messages, fails);
    if (o) { if (i) console.log('chat fallback answered', CHAT_MODELS[i].id); return { k, i, ...o }; }
  }
  return null;
}

// Starts model i and waits up to FIRST_DATA_MS for its first data line. An overloaded DeepSeek may accept the request
// and then only send keep-alive comments while it waits in a queue. On failure, logs it, adds to `fails`, returns null.
async function openModel(i, env, messages, fails) {
  const { id } = CHAT_MODELS[i];
  const model = id.startsWith('@cf/') ? env.CHAT_CF_MODEL || id : id;   // CHAT_CF_MODEL: set only by the local tests
  const base = env.DEEPSEEK_BASE || 'https://api.deepseek.com';         // DEEPSEEK_BASE: set only by the local tests
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), FIRST_DATA_MS);
  const late = new Promise((_, no) => ctl.signal.addEventListener('abort', () => no(new Error('timeout'))));
  let reader;
  try {
    let stream;
    if (model.startsWith('@cf/')) {
      stream = await Promise.race([env.AI.run(model, { messages, stream: true, max_tokens: 900, temperature: 0.3, chat_template_kwargs: { enable_thinking: false } }), late]);
    } else {
      const r = await fetch(`${base}/chat/completions`, {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
        body: JSON.stringify({ model, stream: true, thinking: { type: 'disabled' }, max_tokens: 900, temperature: 0.3, messages })
      });
      if (!r.ok) { clearTimeout(timer); fails.push(r.status); console.log('chat model error', model, r.status, (await r.text()).slice(0, 500)); return null; }
      stream = r.body;
    }
    reader = stream.getReader();
    const dec = new TextDecoder(), head = [];
    let seen = '';
    while (!seen.includes('data:')) {
      const { done, value } = await Promise.race([reader.read(), late]);
      if (done) break;
      head.push(value); seen += dec.decode(value, { stream: true });
    }
    clearTimeout(timer);
    if (!seen.includes('data:')) { fails.push(502); console.log('chat model empty reply', model); return null; }
    return { reader, head };
  } catch (e) {
    clearTimeout(timer); reader?.cancel().catch(() => {});
    const queued = ctl.signal.aborted;
    fails.push(queued ? 'queue' : 0);
    console.log('chat model', queued ? `queued over ${FIRST_DATA_MS / 1000}s` : 'failed', model, String(e).slice(0, 300));
    return null;
  }
}

const MAX_UNDO = 30;
const MAX_NOTES = 4000;   // characters of one player's notes (JSON)

// One room = one Durable Object holding one game (and the records of the games played in it before).
// Every socket starts as a viewer and gets the public view. A socket that sends the room key becomes the Storyteller's
// and gets the whole state. A socket that sends a player token ({ pt }) also gets that player's own notes, and only them.
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      this.s = (await ctx.storage.get('s')) ?? null;
      this.key = (await ctx.storage.get('key')) ?? null;
      this.undo = (await ctx.storage.get('undo')) ?? [];
    });
  }

  async fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === '/init') {
      if (this.s) return new Response('exists', { status: 409 });
      const { code, key } = await req.json();
      this.s = initialState(); this.key = key; this.undo = [];
      await this.ctx.storage.put({ s: this.s, key, code, undo: [] });
      return new Response('ok');
    }
    if (path === '/games') {
      let key; try { ({ key } = JSON.parse(await req.text())); } catch {}
      if (!this.s || !this.keyOk(key)) return Response.json({ error: '房间密钥不对' }, { status: 403 });
      const all = await this.ctx.storage.list({ prefix: 'g:' });
      return Response.json([...all.values()]);
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ st: false, pt: null });
    server.send(this.s ? this.publicMsg() : JSON.stringify({ type: 'error', error: 'noroom' }));
    return new Response(null, { status: 101, webSocket: client });
  }

  keyOk(k) {
    if (typeof k !== 'string' || !this.key || k.length !== this.key.length) return false;
    let d = 0; for (let i = 0; i < k.length; i++) d |= k.charCodeAt(i) ^ this.key.charCodeAt(i);
    return d === 0;
  }

  att(ws) { return ws.deserializeAttachment() || { st: false, pt: null }; }
  privateMsg() { return JSON.stringify({ type: 'state', role: 'st', state: { ...this.s, canUndo: this.undo.length > 0 } }); }
  publicMsg() { return JSON.stringify({ type: 'state', role: 'view', state: publicView(this.s) }); }

  // The Storyteller gets every change. Viewers get a message only when what they can see changed,
  // so the number of messages doesn't give away how busy the Storyteller is at night.
  broadcast() {
    const pub = this.publicMsg(), priv = this.privateMsg(), pubChanged = pub !== this.lastPub;
    this.lastPub = pub;
    for (const w of this.ctx.getWebSockets()) {
      try { if (this.att(w).st) w.send(priv); else if (pubChanged) w.send(pub); } catch {}
    }
  }

  async webSocketMessage(ws, msg) {
    if (!this.s || typeof msg !== 'string' || msg.length > 6000) return;
    let m; try { m = JSON.parse(msg); } catch { return; }
    const me = this.att(ws);
    if (m.auth !== undefined) {
      if (!this.keyOk(m.auth)) { ws.send(JSON.stringify({ type: 'error', error: 'badkey' })); return; }
      ws.serializeAttachment({ ...me, st: true });
      ws.send(this.privateMsg());
      return;
    }
    // A player's own notes: stored under a random token only that phone knows.
    if (m.pt !== undefined) {
      if (typeof m.pt !== 'string' || !/^[0-9a-f]{32}$/.test(m.pt)) return;
      ws.serializeAttachment({ ...me, pt: m.pt });
      ws.send(JSON.stringify({ type: 'notes', notes: (await this.ctx.storage.get('p:' + m.pt)) ?? {} }));
      return;
    }
    if (m.notes !== undefined) {
      const raw = JSON.stringify(m.notes ?? {});
      if (!me.pt || !m.notes || typeof m.notes !== 'object' || Array.isArray(m.notes) || raw.length > MAX_NOTES) { ws.send(JSON.stringify({ type: 'error', error: 'notes' })); return; }
      await this.ctx.storage.put('p:' + me.pt, m.notes);
      for (const w of this.ctx.getWebSockets()) if (w !== ws && this.att(w).pt === me.pt) { try { w.send(JSON.stringify({ type: 'notes', notes: m.notes })); } catch {} }
      return;
    }
    // Everyone else may only write their own name on a seat.
    if (!me.st && !(m.action && nameAction(m.action))) { ws.send(JSON.stringify({ type: 'error', error: 'viewonly' })); return; }
    let next;
    if (m.undo) next = this.undo.length ? { ...this.undo.pop(), v: this.s.v + 1 } : null;
    else {
      next = reduce(this.s, m.action);
      if (next && me.st) { this.undo.push(this.s); if (this.undo.length > MAX_UNDO) this.undo.shift(); }
    }
    if (!next) { ws.send(me.st ? this.privateMsg() : this.publicMsg()); return; }   // rejected: resync the sender
    const before = this.s;
    this.s = next;
    await this.ctx.storage.put({ s: next, undo: this.undo });
    this.broadcast();
    await this.record(before);
  }

  async webSocketClose(ws, code) { try { ws.close(code, 'closed'); } catch {} }

  // Keep the record of a finished game; drop it again when the end is undone.
  async record(before) {
    const s = this.s;
    if (s.stage === 'over' && s.gid) {
      const old = await this.ctx.storage.get('g:' + s.gid);
      await this.ctx.storage.put('g:' + s.gid, { ...gameRecord(s), ended: old?.ended ?? Date.now() });
    } else if (before.stage === 'over' && before.gid && s.gid === before.gid) {
      await this.ctx.storage.delete('g:' + before.gid);
    }
  }
}
