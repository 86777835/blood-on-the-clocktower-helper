import { setupCheck, threshold, onBlock, nightList, phaseName, teamOf as baseTeamOf, isGood, BELIEVE, stepLabel as baseStepLabel, edChars as baseEdChars,
  MIN_PLAYERS, MAX_PLAYERS, EDITIONS, CHARS as OFFICIAL_CHARS, STEPS, TEAM_ZH } from './logic.js';
import { esc, badge as baseBadge, icon as baseIcon, cname as baseCname, charList as baseCharList, nightOrder as baseNightOrder, TEAMS } from './views.js';
import { autoInfo, pickInfo, PICKS, warnings, standing } from './info.js';

import { charactersOf, editionOf } from './custom.js';
import { editorView, editorClick, editorInput, openEditor, editorActive } from './editor.js';
let CHARS = OFFICIAL_CHARS;
const badge = id => baseBadge(id, S), icon = id => baseIcon(id, S), cname = id => baseCname(id, S);
const charList = ed => baseCharList(ed, S), nightOrder = (ed, first) => baseNightOrder(ed, first, S);
const edChars = ed => baseEdChars(ed, S), teamOf = id => baseTeamOf(id, S), stepLabel = k => baseStepLabel(k, S);
const $ = s => document.querySelector(s);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};

const qs = new URLSearchParams(location.search);
let code = cleanCode(qs.get('r'));
const viewOnly = qs.get('v') === '1';   // the Storyteller's own phone showing the public view
// A Storyteller link for another device carries the key in the fragment (#k=…), which never reaches the server logs.
{ const k = new URLSearchParams(location.hash.slice(1)).get('k'); if (code && /^[0-9a-f]{32}$/.test(k || '')) { remember(code, k); history.replaceState(null, '', location.pathname + location.search); } }

let S = null, role = null, noRoom = false, online = false, ws = null, queue = [], retry = 0, notes = null;
const ui = { tab: 'game', ptab: 'town', sheet: null, err: '', busy: false, saving: false, nom: null, rv: null, past: false, pick: {}, jug: {} };   // pick/jug: targets tapped in a night calculator

function cleanCode(v) { const c = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); return c.length === 4 ? c : null; }
// Rooms where this phone is the Storyteller: [{ code, key, t }], newest first.
function mine() { try { const v = JSON.parse(store.get('botc-mine')); if (Array.isArray(v)) return v.filter(r => r && cleanCode(r.code) && typeof r.key === 'string'); } catch {} return []; }
function remember(c, key) { store.set('botc-mine', JSON.stringify([{ code: c, key, t: Date.now() }, ...mine().filter(r => r.code !== c)].slice(0, 12))); }
const keyOf = c => mine().find(r => r.code === c)?.key || null;
function forget(c) { store.set('botc-mine', JSON.stringify(mine().filter(r => r.code !== c))); }
// A random token for this phone's own notes (only this phone knows it).
function playerToken() {
  let t = store.get('botc-pt');
  if (!/^[0-9a-f]{32}$/.test(t || '')) { t = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join(''); store.set('botc-pt', t); }
  return t;
}
// Which seat this phone sits in (players only; just for highlighting and the review name).
const mySeat = () => { const v = parseInt(store.get(`botc-seat-${code}`), 10); return Number.isInteger(v) && S?.seats?.[v] ? v : null; };

/* ---------- connection ---------- */
function connect() {
  if (!code) return;
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/room/${code}/ws`);
  ws.onopen = () => {
    retry = 0; online = true;
    const k = keyOf(code);
    if (k && !viewOnly) ws.send(JSON.stringify({ auth: k }));
    else ws.send(JSON.stringify({ pt: playerToken() }));
    queue.splice(0).forEach(m => ws.send(m)); render();
  };
  ws.onmessage = e => {
    if (e.data === 'pong') return;
    const m = JSON.parse(e.data);
    if (m.type === 'state') { S = m.state; role = m.role; render(); }
    else if (m.type === 'notes') { notes = m.notes || {}; render(); }
    else if (m.type === 'error' && m.error === 'noroom') { noRoom = true; forget(code); ws.close(); render(); }
    else if (m.type === 'error' && m.error === 'badkey') toast('说书人密钥不对，现在是玩家视图');
    else if (m.type === 'error' && m.error === 'notes') toast('笔记太长了，没能保存');
  };
  ws.onclose = () => { online = false; render(); if (!noRoom && code) setTimeout(connect, Math.min(5000, 400 * 2 ** retry++)); };
}
setInterval(() => { if (ws && ws.readyState === 1) ws.send('ping'); }, 25000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && code && !noRoom && (!ws || ws.readyState > 1)) { retry = 0; connect(); } });
function sendRaw(o) { const m = JSON.stringify(o); if (ws && ws.readyState === 1) ws.send(m); else queue.push(m); }
const send = action => sendRaw({ action });
function toast(t) { const el = $('#toast'); el.innerHTML = `<div class="toast">${esc(t)}</div>`; clearTimeout(toast.t); toast.t = setTimeout(() => el.innerHTML = '', 2400); }

/* ---------- render (DOM morph keeps focus and typed text) ---------- */
function morph(a, b) {
  const ac = [...a.childNodes], bc = [...b.childNodes];
  bc.forEach((y, i) => {
    const x = ac[i];
    if (!x) { a.appendChild(y); return; }
    if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName || (x.nodeType === 1 && x.getAttribute('data-k') !== y.getAttribute('data-k'))) { a.replaceChild(y, x); return; }
    if (x.nodeType !== 1) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; return; }
    for (const at of [...x.attributes]) if (!y.hasAttribute(at.name)) x.removeAttribute(at.name);
    for (const at of [...y.attributes]) if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value);
    if (x.tagName === 'INPUT' || x.tagName === 'TEXTAREA') { if (x !== document.activeElement && x.type !== 'checkbox') x.value = x.tagName === 'TEXTAREA' ? y.value : y.getAttribute('value') ?? ''; if (x.type === 'checkbox') x.checked = y.hasAttribute('checked'); return; }
    if ('disabled' in x) x.disabled = y.hasAttribute('disabled');
    morph(x, y);
  });
  while (a.childNodes.length > bc.length) a.removeChild(a.lastChild);
}
function render() {
  CHARS = charactersOf(S);
  const t = document.createElement('div');
  t.innerHTML = `<div class="back-nav" data-k="back-nav" data-html2canvas-ignore>${code
    ? '<button class="back-pill" data-act="leave">‹ 首页</button>'
    : '<a class="back-pill" href="https://boardgame.leisurecat.cloud">‹ 全部游戏</a>'}</div>` + view();
  morph($('#app'), t);
  const sh = document.createElement('div');
  sh.innerHTML = ui.sheet && S ? sheetView() : '';
  morph($('#sheet'), sh);
  document.body.classList.toggle('has-dock', !!$('.dock'));
}

function view() {
  if (!code) return landing();
  if (noRoom) return `${hero()}<div class="wrap"><h2 class="h"><span>房间 ${code} 不存在</span></h2><p class="note">房间码可能输错了，或者房间已失效。</p><button class="btn" data-act="leave">返回首页</button></div>`;
  if (!S) return `${hero()}<div class="wrap"><h2 class="h"><span>正在连接房间 ${code}…</span></h2></div>`;
  return bar() + `<div class="wrap" data-k="${role}-${S.stage}">` + (role === 'st' ? stView() : publicPage()) + '</div>';
}
const hero = () => `<div class="hero" data-k="hero"><div class="en">BLOOD ON THE CLOCKTOWER</div><h1>血染钟楼助手</h1><div class="orn"></div></div><div class="band"></div>`;
const bar = () => `<div class="bar" data-k="bar"><span class="ttl">血染钟楼${S?.ed ? `<small>${esc(editionOf(S).zh)}</small>` : ''}</span>
  <span class="who-tag ${role === 'st' ? 'mm' : 'view'}">${role === 'st' ? '说书人' : '玩家'}</span>
  <button class="room" data-act="share"><small>房间</small>${code}</button><span class="conn ${online ? 'on' : ''}" title="${online ? '已连接' : '重新连接中'}"></span></div>`;

function landing() {
  const my = mine();
  return `<div class="hero-box" data-k="hero"><img src="img/cover.jpg" alt="《染·钟楼谜团》游戏盒封面"><div class="hz">血染钟楼助手</div><div class="hs">说书人的记录本</div></div>
    <div class="wrap" data-k="landing">
    <div class="card start">
      <button class="btn" data-act="create" ${ui.busy ? 'disabled' : ''}>我当说书人：创建房间</button>
      <div class="or">玩家输入房间码加入</div>
      <div class="join"><input id="joinCode" maxlength="4" autocomplete="off" autocapitalize="characters" placeholder="房间码"><button class="btn navy" data-act="join">加入</button></div>
      ${ui.err ? `<div class="err">${esc(ui.err)}</div>` : ''}
    </div>
    <p class="note">身份照常线下抽实体标记，夜里照常用手势，投票照常举手。这里只帮说书人记下魔典、夜晚清单和票型，终局后大家一起复盘。</p>
    <div class="tiles">
      <a class="card tile" href="guide"><span class="ti"><img src="img/guide.jpg" alt=""></span><span><b>规则介绍</b>流程 + 常见问题</span></a>
      <a class="card tile" href="roles"><span class="ti">角</span><span><b>角色表</b>三个剧本 · 夜晚顺序</span></a>
      <a class="card tile wide" href="history"><span class="ti">录</span><span><b>往期对局</b>本机当过说书人的对局存档</span></a>
    </div>
    <h2 class="h"><span>我的房间</span><small>本机当说书人的房间</small></h2>
    <div class="list">${my.length ? my.map(r => `<button class="card lobby" data-act="rejoin" data-code="${r.code}" data-k="lb-${r.code}">
        <span class="lc">${r.code}</span><span class="lp">说书人</span><span class="ls">${ago(r.t)}</span></button>`).join('') : '<div class="empty">还没有房间</div>'}</div>
    <footer>非官方玩家工具，与 The Pandemonium Institute、集石无关 · 免费、无广告<br>规则依据官方 Wiki 与集石钟楼百科，角色简述为本站自写<br>封面为官方游戏盒封面（集石中文版《染·钟楼谜团》），封面版权归出版社所有<br>角色图标来自 The Pandemonium Institute 向社区工具开放的官方资源<br><img class="ccc" src="img/ccc.png" alt="Community Created Content"></footer></div>`;
}
function ago(t) { const m = Math.floor((Date.now() - t) / 60000); return m < 1 ? '刚刚' : m < 60 ? `${m} 分钟前` : m < 1440 ? `${Math.floor(m / 60)} 小时前` : `${Math.floor(m / 1440)} 天前`; }

/* ---------- shared pieces ---------- */
const seatNo = i => `${i + 1}号`;
const who = (st, i) => `${seatNo(i)} ${esc(st.seats[i]?.name || '')}`;
function statusStrip(st) {
  const ph = st.ph, aliveN = st.seats.filter((x, i) => !x.dead).length;
  const night = ph?.k === 'night';
  return `<div class="status ${night ? 'night' : 'day'}"><span class="medal">${night ? '夜' : '昼'}</span><div><div class="t">${phaseName(ph)}</div>
    <div class="s">存活 ${aliveN}/${st.seats.length} 人${!night ? ` · 处决需要 ${Math.ceil(aliveN / 2)} 票` : ''}</div></div></div>`;
}
const qrData = text => { if (!window.qrcode) return ''; const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createDataURL(5, 2); };
const publicUrl = () => `${location.origin}/?r=${code}`;
function inviteCard() {
  return `<h2 class="h"><span>邀请玩家</span><small>扫码只能看公开信息</small></h2>
    <div class="card qrbox"><img alt="玩家视图二维码" src="${qrData(publicUrl())}"><p><b>${code}</b>玩家扫码或在首页输入房间码加入，可以自己填名字、看角色表、记笔记。看不到任何人的身份。<br><button class="btn ghost sm" data-act="share" style="width:auto;padding:0 12px;margin-top:6px">复制链接</button></p></div>`;
}

/* ---------- Storyteller ---------- */
function stView() {
  if (S.stage === 'setup') return setupView();
  if (S.stage === 'over') return overView(S, true);
  const tabs = [['game', S.ph.k === 'night' ? '夜晚' : '白天'], ['grim', '魔典'], ['log', '记录'], ['ref', '速查']];
  const tab = tabs.some(t => t[0] === ui.tab) ? ui.tab : 'game';
  const head = `<div class="tabs">${tabs.map(([k, n]) => `<button class="tab${tab === k ? ' on' : ''}" data-act="tab" data-tab="${k}">${n}</button>`).join('')}</div>`;
  const body = tab === 'grim' ? grimTab() : tab === 'log' ? logTab() : tab === 'ref' ? refTab() : S.ph.k === 'night' ? nightView() : dayView();
  return head + body;
}

function setupView() {
  if (editorActive()) return editorView(S.n || 7);
  const ed = S.ed, chk = ed ? setupCheck(ed, S.n, S.bag, S) : null;
  const edChips = Object.entries(EDITIONS).map(([k, e]) => `<button class="chip${ed === k ? ' on' : ''}" data-act="ed" data-ed="${k}">${esc(e.zh)}</button>`).join('');
  let out = `<p class="note secret">这是<b>说书人视图</b>，有所有人的身份，别让玩家看到。玩家扫码进入的是玩家视图。</p>
    <h2 class="h"><span>1 剧本和人数</span></h2>
    <div class="chips">${edChips}</div>
    <div class="btns"><button class="btn ghost" data-act="custom-new">新建自定义剧本</button><button class="btn ghost" data-act="custom-import">导入 / 最近使用</button></div>
    ${ed ? `<button class="btn ghost" data-act="${ed === 'custom' ? 'custom-edit' : 'custom-copy'}">${ed === 'custom' ? '编辑自定义剧本' : '复制为自定义剧本'}</button>` : ''}
    ${ed ? `<p class="hint-s">${esc(editionOf(S).en)}${editionOf(S).alias?.length ? ` · 也叫${editionOf(S).alias.map(esc).join('、')}` : ''}</p>` : ''}
    <div class="card cnt"><b>玩家人数</b><button class="ib" data-act="n" data-d="-1" ${!ed || S.n <= MIN_PLAYERS ? 'disabled' : ''}>−</button><span class="n">${S.n || '–'}</span><button class="ib" data-act="n" data-d="1" ${!ed || S.n >= MAX_PLAYERS ? 'disabled' : ''}>+</button></div>`;
  if (!ed) return out + '<p class="note">先选剧本。可用现有 72 个官方角色自建剧本；内置剧本不可编辑，自制角色只能加入自定义剧本。</p>';
  const need = chk.options.length === 1 ? chk.options[0] : null;
  const cnt = TEAMS.map(t => {
    const want = [...new Set(chk.options.map(o => o[t]))].join(' 或 ');
    const okT = chk.options.some(o => o[t] === chk.have[t]);
    return `<span class="ct t-${t}${okT ? ' ok' : ''}"><b>${chk.have[t]}<small>/${want}</small></b>${TEAM_ZH[t]}</span>`;
  }).join('');
  const inBag = new Set(S.bag);
  out += `<h2 class="h"><span>2 选角色放进袋子</span><small>${S.bag.length}/${S.n}</small></h2>
    <div class="card cts">${cnt}</div>
    ${S.bag.filter(id => CHARS[id].setup).map(id => `<p class="note secret"><b>${esc(CHARS[id].zh)}</b>：${esc(CHARS[id].setupNote)}</p>`).join('')}
    ${TEAMS.map(t => `<div class="pk-t t-${t}">${TEAM_ZH[t]}</div><div class="pk">${edChars(ed).filter(id => CHARS[id].team === t).map(id =>
      `<button class="pkc${inBag.has(id) ? ' on' : ''}" data-act="bag" data-id="${id}" data-k="pk-${id}">${badge(id)}<span>${esc(CHARS[id].zh)}</span></button>`).join('')}</div>`).join('')}
    ${chk.ok ? '' : `<p class="err" style="text-align:left">${S.bag.length !== S.n ? `还差 ${S.n - S.bag.length} 个角色` : '各类角色的数量和人数表对不上'}${need ? '' : ''}（可以照样开始，说书人自己决定）</p>`}`;
  const taken = new Set(S.seats.map(x => x.role).filter(Boolean));
  out += `<h2 class="h"><span>3 谁抽到了什么</span><small>玩家抽完标记后点选</small></h2>
    <div class="list">${S.seats.map((x, i) => `<div class="card seat-row" data-k="sr-${i}"><span class="sno">${i + 1}</span>
      <input class="pn sname" data-name="${i}" maxlength="12" placeholder="名字（玩家也可以自己填）" value="${esc(x.name)}">
      <button class="srole${x.role ? '' : ' empty'}" data-act="pickrole" data-i="${i}">${x.role ? `${badge(x.role)}<span>${esc(CHARS[x.role].zh)}${x.bel ? `<em>以为是${esc(CHARS[x.bel].zh)}</em>` : BELIEVE[x.role] ? '<em class="warn">选他以为的角色</em>' : ''}</span>` : '<span>选角色</span>'}</button></div>`).join('')}</div>
    <p class="hint-s">已分配 ${taken.size}/${S.n}${S.bag.length < S.n ? '，袋子里的角色还不够' : ''}</p>`;
  out += `<h2 class="h"><span>4 恶魔的伪装</span><small>3 个不在场的善良角色，也可以首夜再选</small></h2>${bluffCard()}`;
  out += inviteCard();
  const ready = S.seats.every(x => x.role);
  out += `<button class="btn" data-act="start" ${ready ? '' : 'disabled'}>开始游戏：进入首夜</button>${ready ? '' : '<div class="err">每个座位都要选好角色</div>'}`;
  return out;
}
function bluffCard() {
  return `<button class="card bluffs" data-act="bluffs">${S.bluffs.length ? S.bluffs.map(id => `<span>${badge(id)}${esc(CHARS[id].zh)}</span>`).join('') : '<span class="empty">还没选，点这里选</span>'}</button>`;
}

function nightView() {
  const list = nightList(S), left = list.filter(x => !S.done[x.k] && !x.dead).length;
  const logOf = k => S.log.find(e => e.at === `N${S.ph.n}` && e.k === k)?.x || '';
  const evil = t => S.seats.map((x, i) => [x, i]).filter(([x]) => teamOf(x.role) === t).map(([, i]) => seatNo(i)).join('、') || '无';
  const extra = k => k === 'minioninfo' ? `<span class="ns-x">爪牙：${evil('minion')}；恶魔：${evil('demon')}</span>`
    : k === 'demoninfo' ? `<span class="ns-x">爪牙：${evil('minion')}；伪装：${S.bluffs.length ? S.bluffs.map(id => esc(CHARS[id].zh)).join('、') : '<button class="lnk" data-act="bluffs">还没选，点这里选</button>'}</span>` : '';
  return `${statusStrip(S)}
    <p class="note">${S.ph.n === 1 ? '首夜' : '今晚'}要叫醒的角色，${S.ed === 'custom' ? '按本局快照夜晚顺序' : '按官方夜晚顺序'}。叫完一个就点左边的圈；给了什么信息记在下面那一行，终局复盘会用到。${S.n < 7 && S.ph.n === 1 ? '<b>5–6 人局：首夜没有爪牙信息和恶魔信息。</b>' : ''}</p>
    ${standing(S).length ? `<div class="card ns-stand">${standing(S).map(t => `<p>${esc(t)}</p>`).join('')}</div>` : ''}
    <div class="card nlist">${list.map((x, n) => {
      const on = !!S.done[x.k], st = x.seat != null ? S.seats[x.seat] : null;
      return `<div class="ns${on ? ' done' : ''}${x.dead ? ' dead' : ''}" data-k="ns-${x.k}">
        <button class="ns-ck" data-act="step" data-k="${x.k}" aria-label="${on ? '改回未完成' : '完成'}">${on ? '✓' : n + 1}</button>
        <div class="ns-b"><b>${x.char ? `${badge(x.char)}${esc(x.zh)} · ${who(S, x.seat)}` : esc(x.zh)}</b>
          ${x.fake ? `<em class="fake">这位是${esc(CHARS[st.role].zh)}：以为自己是${esc(x.zh)}，照样叫醒，但能力无效</em>` : ''}
          ${x.dead ? '<em>已死亡：一般不叫醒，除非能力在死亡当晚生效</em>' : ''}
          ${st?.marks.length ? `<span class="mk">${st.marks.map(m => `<i>${esc(m.t)}</i>`).join('')}</span>` : ''}
          <span class="ns-t">${esc(x.tip || '')}</span>${extra(x.k)}${infoBlock(x)}
          ${x.k === 'dusk' || x.k === 'dawn' ? '' : `<input class="pn ns-in" data-log="${x.k}" maxlength="120" placeholder="记一下：比如 给了数字 1、指了 3号 5号" value="${esc(logOf(x.k))}">`}</div></div>`;
    }).join('') || '<div class="empty">今晚没有要叫醒的角色</div>'}</div>
    <div class="btns more"><button class="btn ghost" data-act="tab" data-tab="grim">标记死亡 / 提醒标记</button><button class="btn ghost" data-act="note">记一笔</button></div>
    <button class="btn ghost" data-act="end">游戏结束：宣布胜负</button>
    <div class="dock" data-k="dock"><div class="dock-in"><button class="btn ghost" data-act="undo" ${S.canUndo ? '' : 'disabled'}>撤销</button>
      <button class="btn" data-act="dawn">${left ? `天亮（还有 ${left} 项没勾）` : '天亮'}</button></div></div>`;
}

function dayView() {
  const d = S.ph.n, today = S.noms.filter(x => x.d === d), ex = S.execs.find(x => x.d === d), blk = onBlock(S);
  const blkTxt = !blk ? '还没有人达到处决票数' : blk.tie ? `平票：${blk.tie.map(i => seatNo(i)).join('、')} 都是 ${blk.n} 票，今天没有人会被处决` : `${who(S, blk.seat)}（${blk.n} 票）`;
  return `${statusStrip(S)}
    ${ex ? `<div class="banner"><div><b>今天的处决</b>：${ex.seat === null ? '没有处决' : `${who(S, ex.seat)}${ex.died ? '' : '（没有死亡）'}`}</div></div>`
      : `<div class="card block"><span>即将被处决</span><b>${blkTxt}</b></div>`}
    <h2 class="h"><span>今天的提名</span><small>${today.length} 次</small></h2>
    ${nomList(S, today)}
    ${ex ? '' : `<button class="btn navy" data-act="nom">记录一次提名和投票</button>
      <div class="btns">${blk && !blk.tie ? `<button class="btn" data-act="exec" data-seat="${blk.seat}">处决 ${seatNo(blk.seat)}</button>` : ''}<button class="btn ghost" data-act="exec" data-seat="">今天不处决</button></div>`}
    <div class="btns more"><button class="btn ghost" data-act="tab" data-tab="grim">魔典</button><button class="btn ghost" data-act="note">记一笔</button></div>
    <button class="btn ghost" data-act="end">游戏结束：宣布胜负</button>
    <div class="dock" data-k="dock"><div class="dock-in"><button class="btn ghost" data-act="undo" ${S.canUndo ? '' : 'disabled'}>撤销</button>
      <button class="btn" data-act="dusk">${ex ? '' : '跳过处决，'}入夜：第 ${d + 1} 夜</button></div></div>`;
}
function nomList(st, noms) {
  if (!noms.length) return '<div class="empty card">还没有提名</div>';
  return `<div class="list">${noms.map(x => `<div class="card nom" data-k="nom-${x.d}-${x.on}"><div class="nom-h"><span>${who(st, x.by)} <i>提名</i> ${who(st, x.on)}</span><b class="${x.n >= x.need ? 'hit' : ''}">${x.n}<small>/${x.need} 票</small></b></div>
    <div class="nom-v">${x.votes.length ? x.votes.map(i => `<i>${i + 1}</i>`).join('') : '<em>没有人举手</em>'}</div></div>`).join('')}</div>`;
}

function grimTab() {
  const marked = S.seats.map((x, i) => [x, i]).filter(([x]) => x.marks.length);
  return `<p class="note secret">按座位围成一圈（1号在正上方，顺时针）。点座位改死活、幽灵票、提醒标记或角色。夜里标记的死亡要等天亮后玩家手机上才会显示。</p>
    ${ring(S, true)}
    ${marked.length ? `<h2 class="h"><span>提醒标记</span></h2><div class="card route"><ul class="dots">${marked.map(([x, i]) => `<li>${who(S, i)}：${x.marks.map(m => `${esc(CHARS[m.c].zh)}·${esc(m.t)}`).join('、')}</li>`).join('')}</ul></div>` : ''}
    <h2 class="h"><span>恶魔的伪装</span></h2>${bluffCard()}`;
}
// The seats in a circle like the real table: seat 1 at the top, then clockwise.
// Storyteller: each token shows the character; players: only names, deaths and ghost votes.
function ring(st, priv) {
  const n = st.seats.length, R = n <= 8 ? 36 : 40, me = priv ? null : mySeat();
  const aliveN = st.seats.filter(x => !x.dead).length;
  return `<div class="ring" data-k="ring-${priv ? 'st' : 'pub'}-${n}"><div class="rc"><b>${phaseName(st.ph)}</b><span>存活 ${aliveN}/${n}</span>${st.ph?.k === 'day' ? `<span>处决需 ${Math.ceil(aliveN / 2)} 票</span>` : ''}</div>
    ${st.seats.map((x, i) => {
      const a = (-90 + 360 * i / n) * Math.PI / 180, pos = `left:${(50 + R * Math.cos(a)).toFixed(2)}%;top:${(50 + R * Math.sin(a)).toFixed(2)}%`;
      const st2 = x.dead ? `<i class="sh">亡</i><i class="gv${x.ghost ? '' : ' used'}" title="${x.ghost ? '还有幽灵票' : '幽灵票已用'}">票</i>` : '';
      return priv
        ? `<button class="rt-s${x.dead ? ' dead' : ''}" style="${pos}" data-act="seat" data-i="${i}" data-k="g-${i}"><span class="rt-t ic t-${CHARS[x.role]?.team || ''}">${CHARS[x.role] ? icon(x.role) : '?'}</span><span class="rt-n">${i + 1}</span>${x.marks.length ? `<span class="rt-m">${x.marks.length}</span>` : ''}<b>${esc(x.name)}</b><small class="t-${CHARS[x.role]?.team || ''}">${esc(CHARS[x.role]?.zh || '')}${x.bel ? '*' : ''}</small><span class="rt-st">${st2}</span></button>`
        : `<div class="rt-s tw${x.dead ? ' dead' : ''}${i === me ? ' me' : ''}" style="${pos}" data-k="tw-${i}"><span class="rt-t">${i + 1}</span><b>${esc(x.name)}</b><span class="rt-st">${st2}</span></div>`;
    }).join('')}</div>`;
}

// Under a step of tonight's list: what this character would truly learn (Storyteller's reference only).
function infoBlock(x) {
  if (S.ed === 'custom') return x.char ? '<p class="hint-s">手动记录：自定义剧本停用真实信息及常驻效果计算，能力互动由说书人判断。</p>' : '';
  if (!x.char || x.dead) return '';
  const auto = autoInfo(S, x), P = PICKS[x.char], w = warnings(S, x.seat, x.char);
  const math = S.seats.some(o => o.role === 'mathematician' || o.bel === 'mathematician') && x.char !== 'mathematician';
  const abn = math && S.seats[x.seat].marks.some(m => m.c === 'mathematician' && m.t === '未正常生效');
  if (!auto && !P && !w.length && !math) return '';
  let calc = '';
  if (P) {
    const picks = ui.pick[x.k] || [], g = ui.jug[x.k] || {};
    const can = (o, j) => x.char !== 'chambermaid' || (!o.dead && j !== x.seat);
    const res = pickInfo(S, x, picks, g);
    calc = `<div class="pk-calc"><span class="pc-tip">${P.tip}</span><div class="grid4">${S.seats.map((o, j) => `<button class="${picks.includes(j) ? 'on' : ''}${o.dead ? ' dim' : ''}" data-act="pick" data-k="${x.k}" data-i="${j}" ${can(o, j) ? '' : 'disabled'}>${j + 1}</button>`).join('')}</div>
      ${x.char === 'juggler' ? picks.map(j => `<label class="jg">${seatNo(j)} 猜<select data-jug="${x.k}" data-i="${j}"><option value="">选角色</option>${edChars(S.ed).map(id => `<option value="${id}"${g[j] === id ? ' selected' : ''}>${esc(CHARS[id].zh)}</option>`).join('')}</select></label>`).join('') : ''}
      ${res ? `<span class="ns-info-r">真实信息：${esc(res)}</span><button class="lnk" data-act="infolog" data-k="${x.k}" data-x="${esc(`选 ${picks.map(j => seatNo(j)).join(' ')} → ${res}`)}">写进这一步的记录</button>` : ''}</div>`;
  }
  return `<div class="ns-info">${auto ? `<span class="ns-info-r">真实信息：${esc(auto)}</span><button class="lnk" data-act="infolog" data-k="${x.k}" data-x="${esc(auto)}">写进这一步的记录</button>` : ''}${calc}
    ${x.char === 'mathematician' && S.seats.some(o => o.marks.some(m => m.c === 'mathematician')) ? '<button class="lnk" data-act="clearabn">清掉所有「未正常生效」标记</button>' : ''}
    ${w.map(t => `<em class="warn">${esc(t)}</em>`).join('')}
    ${math ? `<button class="mkb sm${abn ? ' on' : ''}" data-act="mark" data-i="${x.seat}" data-c="mathematician" data-t="未正常生效">${abn ? '已标：能力未正常生效（数学家）' : '能力未正常生效？标记给数学家'}</button>` : ''}</div>`;
}

function logTab() {
  const groups = [];
  for (const e of S.log) { let g = groups.find(x => x.at === e.at); if (!g) groups.push(g = { at: e.at, xs: [] }); g.xs.push(e); }
  const atName = a => a === 'N1' ? '首夜' : a[0] === 'N' ? `第 ${a.slice(1)} 夜` : `第 ${a.slice(1)} 天`;
  return `<p class="note secret">只有说书人能看到；终局后所有人都能在复盘里看到。</p>
    ${groups.length ? groups.slice().reverse().map(g => `<h2 class="h"><span>${atName(g.at)}</span><small>${g.xs.length} 条</small></h2>
      <div class="card log">${g.xs.map(e => `<div class="${e.k === 'note' ? 'note' : ''}">${stepLabel(e.k) ? `<b>${esc(stepLabel(e.k).trim())}</b>` : ''}${esc(e.x)}</div>`).join('')}</div>`).join('') : '<div class="empty">还没有记录</div>'}
    <button class="btn ghost" data-act="note">记一笔</button>
    <h2 class="h"><span>历次提名</span></h2>${S.noms.length ? nomList(S, S.noms) : '<div class="empty card">还没有提名</div>'}`;
}

function refTab() {
  return `<details class="card ref" open><summary>${esc(editionOf(S).zh)}的角色</summary><div class="ref-sec">${charList(S.ed)}</div></details>
    <details class="card ref" style="margin-top:8px"><summary>首夜顺序</summary>${nightOrder(S.ed, true)}</details>
    <details class="card ref" style="margin-top:8px"><summary>其他夜晚顺序</summary>${nightOrder(S.ed, false)}</details>
    <a class="btn ghost" href="guide" target="_blank">规则介绍与常见问题</a>`;
}

/* ---------- results (Storyteller and players see the same thing) ---------- */
function overView(st, isSt) {
  const good = st.result === 'good';
  const atName = a => a === 'N1' ? '首夜' : a[0] === 'N' ? `第 ${a.slice(1)} 夜` : `第 ${a.slice(1)} 天`;
  const groups = [];
  for (const e of st.log || []) { let g = groups.find(x => x.at === e.at); if (!g) groups.push(g = { at: e.at, xs: [] }); g.xs.push(e); }
  const days = [...new Set(st.noms.map(x => x.d).concat(st.execs.map(x => x.d)))].sort((a, b) => a - b);
  return `<div id="shot" style="padding-top:2px">
    <div class="mvp ${good ? 'good' : 'evil'}"><div class="crown">BLOOD ON THE CLOCKTOWER · ${esc(editionOf(st).zh)}</div><div class="nm">${good ? '善良阵营获胜' : '邪恶阵营获胜'}</div>
      <div class="fg">${st.why ? esc(st.why) + '<br>' : ''}${st.seats.length} 人局 · 进行到${phaseName(st.ph)}</div></div>
    <h2 class="h"><span>魔典</span><small>每个人的真实身份</small></h2>
    <div class="list">${st.seats.map((x, i) => `<div class="card grim${x.dead ? ' dead' : ''}" data-k="og-${i}"><span class="sno">${i + 1}</span>${badge(x.role)}
      <span class="gm"><b>${esc(x.name)}<small>${cname(x.role)}${x.bel ? ` · 以为自己是${esc(CHARS[x.bel].zh)}` : ''}</small></b>
      ${x.marks?.length ? `<span class="mk">${x.marks.map(m => `<i>${esc(CHARS[m.c]?.zh || '')}·${esc(m.t)}</i>`).join('')}</span>` : ''}</span>
      <span class="gs-st">${x.dead ? '<i class="sh">亡</i>' : ''}</span></div>`).join('')}</div>
    ${st.bluffs?.length ? `<p class="note">恶魔的伪装：${st.bluffs.map(id => esc(CHARS[id].zh)).join('、')}</p>` : ''}
    <h2 class="h"><span>每晚发生了什么</span></h2>
    ${groups.length ? groups.map(g => `<div class="card log"><div><b style="color:var(--gold2)">${atName(g.at)}</b></div>${g.xs.map(e => `<div>${stepLabel(e.k) ? `<b>${esc(stepLabel(e.k).trim())}</b>` : ''}${esc(e.x)}</div>`).join('')}</div>`).join('<div style="height:6px"></div>') : '<div class="empty card">说书人没有记录</div>'}
    <h2 class="h"><span>每天的提名</span></h2>
    ${days.length ? days.map(d => { const ex = st.execs.find(x => x.d === d);
      return `<div class="fq-cat">第 ${d} 天${ex ? ` · ${ex.seat === null ? '没有处决' : `处决 ${who(st, ex.seat)}${ex.died ? '' : '（没有死亡）'}`}` : ''}</div>${nomList(st, st.noms.filter(x => x.d === d))}`; }).join('') : '<div class="empty card">没有提名</div>'}
    <footer>血染钟楼助手 · 房间 ${code}</footer></div>
    <div class="btns" data-html2canvas-ignore><button class="btn navy" data-act="save" ${ui.saving ? 'disabled' : ''}>${ui.saving ? '正在生成…' : '保存复盘长图'}</button></div>
    ${isSt ? `<p class="note" data-html2canvas-ignore>这局已存档，可以在首页「往期对局」查看。</p>
    <div class="btns" data-html2canvas-ignore><button class="btn ghost" data-act="undo" ${st.canUndo ? '' : 'disabled'}>撤销结算</button><button class="btn ghost" data-act="reset">在这个房间再开一局</button></div>` : ''}
    ${reviewCard()}`;
}

/* ---------- players ---------- */
function publicPage() {
  const st = S;
  if (st.stage === 'over') return overView(st, false);
  const me = mySeat();
  const meBar = `<div class="card mebar">${me === null ? '<span>你坐几号？</span>' : `<span>我是 <b>${seatNo(me)}</b> ${esc(st.seats[me].name)}</span>`}<button class="btn ghost sm" data-act="me">${me === null ? '选座位' : '换座位 / 改名字'}</button></div>`;
  if (st.stage === 'setup') return `<h2 class="h"><span>说书人正在准备</span></h2>
    <p class="note">${st.ed ? `本局剧本：<b>${esc(editionOf(st).zh)}</b>，${st.n} 人。` : ''}先选你的座位、填上名字，说书人那边就会显示。身份照常线下抽。</p>
    ${st.n ? meBar : ''}
    ${st.seats.length ? `<div class="list">${st.seats.map((x, i) => `<div class="card pseat${i === me ? ' me' : ''}" data-k="ps-${i}"><span class="sno">${i + 1}</span><b>${esc(x.name) || '<span style="color:var(--ink3)">还没填名字</span>'}</b></div>`).join('')}</div>` : ''}
    ${st.ed ? `<h2 class="h"><span>本剧本的角色</span></h2><div class="card ref-sec">${charList(st.ed)}</div>` : ''}
    <a class="btn ghost" href="guide">规则介绍与常见问题</a>`;
  const tabs = [['town', '广场'], ['roles', '角色表'], ['notes', '我的笔记']];
  const head = `<div class="tabs">${tabs.map(([k, n]) => `<button class="tab${ui.ptab === k ? ' on' : ''}" data-act="ptab" data-tab="${k}">${n}</button>`).join('')}</div>`;
  let body;
  if (ui.ptab === 'roles') body = `<details class="card ref" open><summary>${esc(editionOf(st).zh)}的角色</summary><div class="ref-sec">${charList(st.ed)}</div></details>
    <details class="card ref" style="margin-top:8px"><summary>首夜顺序</summary>${nightOrder(st.ed, true)}</details>
    <details class="card ref" style="margin-top:8px"><summary>其他夜晚顺序</summary>${nightOrder(st.ed, false)}</details>
    <a class="btn ghost" href="guide">规则介绍与常见问题</a>`;
  else if (ui.ptab === 'notes') body = notesView(st, me);
  else {
    const d = st.ph.k === 'day' ? st.ph.n : null, today = d ? st.noms.filter(x => x.d === d) : [];
    const past = st.noms.filter(x => x.d !== d);
    body = `${statusStrip(st)}${st.ph.k === 'night' ? '<div class="banner"><div><b>夜晚</b>：请闭上眼睛，放下手机。</div></div>' : ''}
      ${meBar}
      ${ring(st, false)}
      <p class="legend">「亡」已死亡；「票」死者还剩的一张幽灵票，用掉后变灰</p>
      ${d ? `<h2 class="h"><span>今天的提名</span><small>${today.length} 次</small></h2>${nomList(st, today)}` : ''}
      ${st.execs.length ? `<h2 class="h"><span>处决记录</span></h2><div class="card route"><ul class="dots">${st.execs.map(x => `<li>第 ${x.d} 天：${x.seat === null ? '没有处决' : `处决 ${who(st, x.seat)}${x.died ? '' : '（没有死亡）'}`}</li>`).join('')}</ul></div>` : ''}
      ${past.length ? `<details class="card ref" style="margin-top:10px"><summary>之前的提名（${past.length} 次）</summary><div style="padding:0 8px 8px">${nomList(st, past)}</div></details>` : ''}`;
  }
  return head + body + '<footer>玩家视图只显示桌上公开的信息</footer>';
}
function notesView(st, me) {
  const n = notes || {}, seats = n.seats || {};
  return `<p class="note">只有这台手机能看到，说书人也看不到。记下每个人说自己是什么角色、你怀疑谁。会自动保存。</p>
    <div class="list">${st.seats.map((x, i) => `<div class="card nrow${x.dead ? ' dead' : ''}" data-k="nr-${i}"><span class="sno">${i + 1}</span><b>${esc(x.name)}${i === me ? '<small>我</small>' : ''}</b>
      <input class="pn" data-note="${i}" maxlength="60" placeholder="他说自己是…" value="${esc(seats[i] || '')}"></div>`).join('')}</div>
    <h2 class="h"><span>随手记</span></h2><textarea class="pn" data-note="free" maxlength="1000" placeholder="比如：第 2 天 3号说他是共情者，得到 1">${esc(n.free || '')}</textarea>
    ${notes === null ? '<p class="hint-s">正在读取笔记…</p>' : ''}`;
}
let noteTimer = null;
function saveNote(k, v) {
  if (!notes) notes = {};
  if (k === 'free') notes.free = v.slice(0, 1000);
  else { notes.seats = { ...(notes.seats || {}) }; if (v) notes.seats[k] = v.slice(0, 60); else delete notes.seats[k]; }
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => sendRaw({ notes }), 700);
}

/* ---------- bottom sheets ---------- */
function sheetView() {
  const s = ui.sheet;
  let body = '';
  if (s.k === 'share') body = shareSheet();
  else if (s.k === 'me') body = meSheet();
  else if (role !== 'st') { ui.sheet = null; return ''; }
  else if (s.k === 'pickrole') body = pickRoleSheet(s.i);
  else if (s.k === 'bluffs') body = bluffSheet();
  else if (s.k === 'seat') body = seatSheet(s.i);
  else if (s.k === 'nom') body = nomSheet();
  else if (s.k === 'exec') body = `<h3>${s.seat === null ? '今天不处决？' : `处决 ${who(S, s.seat)}？`}</h3>
      ${s.seat === null ? '<p class="hint">今天的提名到此结束。</p>' : `<p class="hint">提名到此结束。被处决的人会标记死亡，并得到一张幽灵票。</p>
      <label class="check" style="padding-left:0"><input type="checkbox" id="noDie"><span>被处决但没有死亡（比如能力保护）</span></label>`}
      <div class="btns"><button class="btn ghost" data-act="close">取消</button><button class="btn" data-act="execok">确认</button></div>`;
  else if (s.k === 'dawn') body = `<h3>还有 ${s.left} 项没勾，确定天亮？</h3><p class="hint">没勾的可能是漏叫了人。确认没有遗漏再天亮。</p>
      <div class="btns"><button class="btn ghost" data-act="close">回去看看</button><button class="btn" data-act="dawnok">确定天亮</button></div>`;
  else if (s.k === 'note') body = `<h3>记一笔</h3><p class="hint">只记在说书人的记录里，终局复盘会显示。</p><textarea class="pn" id="noteX" maxlength="120" placeholder="例如：5号私聊时说自己是厨师"></textarea>
      <div class="btns"><button class="btn ghost" data-act="close">取消</button><button class="btn" data-act="noteok">记下</button></div>`;
  else if (s.k === 'end') body = `<h3>游戏结束</h3><p class="hint">宣布后所有人的手机都会显示完整魔典和记录，用来复盘。说错了可以撤销。</p>
      <div class="lbl">一句话说明（可不填）</div><input class="pn" id="endWhy" maxlength="60" placeholder="例如：第 3 天处决了小恶魔">
      <div class="btns" style="margin-top:12px"><button class="btn navy" data-act="endok" data-win="good">善良阵营获胜</button><button class="btn" data-act="endok" data-win="evil">邪恶阵营获胜</button></div>
      <button class="btn ghost" data-act="close">取消</button>`;
  else if (s.k === 'reset') body = `<h3>在这个房间再开一局？</h3><p class="hint">保留剧本、人数和名字，重新选角色。这局已经存档，不会丢。</p><div class="btns"><button class="btn ghost" data-act="close">取消</button><button class="btn" data-act="resetok">再开一局</button></div>`;
  return `<div class="mask" data-act="close"></div><div class="sheet" data-k="sh-${s.k}">${body}</div>`;
}

function shareSheet() {
  const k = role === 'st' ? keyOf(code) : null;
  return `<h3>房间 ${code}</h3>
    <div class="qrbox" style="padding:12px 0"><img alt="" src="${qrData(publicUrl())}"><p>玩家扫码进入<b style="display:inline;font:inherit;color:var(--c-p);letter-spacing:0">玩家视图</b><br>${esc(publicUrl())}</p></div>
    <button class="btn navy" data-act="copy" data-text="${esc(publicUrl())}">复制玩家链接</button>
    ${k ? `<div class="lbl">在另一台设备继续当说书人</div><p class="hint">这条链接带说书人密钥，<b style="color:var(--red2)">不要发给玩家</b>。</p>
      <button class="btn ghost" data-act="copy" data-text="${esc(`${publicUrl()}#k=${k}`)}">复制说书人链接</button>
      <button class="btn ghost" data-act="publicview">在这台手机上看玩家视图（投屏用）</button>` : ''}
    <button class="btn ghost" data-act="leave">返回首页</button>`;
}

function meSheet() {
  const me = mySeat();
  return `<h3>你坐几号？</h3><p class="hint">按桌上的座位顺序。选好后可以改自己的名字，所有人都能看到。</p>
    <div class="grid4" style="margin-top:10px">${S.seats.map((x, i) => `<button class="${i === me ? 'on' : ''}" data-act="sit" data-i="${i}">${i + 1}号</button>`).join('')}</div>
    ${me !== null ? `<div class="lbl">${seatNo(me)} 的名字</div><input class="pn" id="myName" maxlength="12" value="${esc(S.seats[me].name)}" placeholder="你的名字">
    <button class="btn" data-act="myname">保存名字</button>` : ''}
    <button class="btn ghost" data-act="close">完成</button>`;
}

function pickRoleSheet(i) {
  const x = S.seats[i], taken = new Set(S.seats.filter((o, j) => j !== i).map(o => o.role).filter(Boolean));
  const opts = S.bag.filter(id => !taken.has(id));
  const bel = BELIEVE[x.role];
  return `<h3>${seatNo(i)} ${esc(x.name)}抽到了</h3>
    <div class="pk" style="margin-top:10px">${opts.map(id => `<button class="pkc${x.role === id ? ' on' : ''}" data-act="setrole" data-i="${i}" data-id="${id}">${badge(id)}<span>${esc(CHARS[id].zh)}</span></button>`).join('') || '<div class="empty">袋子里的角色都分完了</div>'}</div>
    ${bel ? `<div class="lbl">${esc(CHARS[x.role].zh)}以为自己是</div><p class="hint">${x.role === 'drunk' ? '就是他抽到的那个镇民标记，最好选一个不在场的镇民。' : x.role === 'lunatic' ? '他以为自己是恶魔；夜里照恶魔的方式叫醒他。' : '他以为自己是善良角色。'}</p>
      <div class="pk">${edChars(S.ed).filter(id => bel.includes(teamOf(id)) && id !== x.role).map(id => `<button class="pkc${x.bel === id ? ' on' : ''}${S.bag.includes(id) ? ' inplay' : ''}" data-act="setbel" data-i="${i}" data-id="${id}">${badge(id)}<span>${esc(CHARS[id].zh)}</span></button>`).join('')}</div>` : ''}
    <div class="btns" style="margin-top:12px">${x.role ? `<button class="btn ghost" data-act="clearrole" data-i="${i}" style="margin-top:12px">清空</button>` : ''}<button class="btn" data-act="close">完成</button></div>`;
}

function bluffSheet() {
  const inPlay = new Set(S.stage === 'setup' ? S.bag : S.seats.map(x => x.role));
  return `<h3>恶魔的伪装<small>选 3 个</small></h3><p class="hint">首夜给恶魔看 3 个不在场的善良角色。已在场的角色会标出来。</p>
    ${['townsfolk', 'outsider'].map(t => `<div class="pk-t t-${t}">${TEAM_ZH[t]}</div><div class="pk">${edChars(S.ed).filter(id => teamOf(id) === t).map(id =>
      `<button class="pkc${S.bluffs.includes(id) ? ' on' : ''}${inPlay.has(id) ? ' inplay' : ''}" data-act="bluff" data-id="${id}">${badge(id)}<span>${esc(CHARS[id].zh)}${inPlay.has(id) ? '<em>在场</em>' : ''}</span></button>`).join('')}</div>`).join('')}
    <button class="btn" data-act="close">完成</button>`;
}

function seatSheet(i) {
  const x = S.seats[i];
  if (!x) { ui.sheet = null; return ''; }
  // reminders of every character in play (the real ones and the ones somebody thinks they are)
  const src = [...new Set(S.seats.flatMap(o => [o.role, o.bel]).filter(id => CHARS[id]?.rem?.length))];
  return `<h3>${seatNo(i)} ${esc(x.name)}<small>${esc(CHARS[x.role].zh)}${x.bel ? ` · 以为是${esc(CHARS[x.bel].zh)}` : ''}</small></h3>
    <div class="btns" style="margin-top:10px"><button class="btn ${x.dead ? 'navy' : ''}" data-act="dead" data-i="${i}" style="margin-top:0">${x.dead ? '复活（撤回死亡）' : '标记死亡'}</button>
      ${x.dead ? `<button class="btn ghost" data-act="ghost" data-i="${i}" style="margin-top:0;height:48px">${x.ghost ? '幽灵票：还有' : '幽灵票：已用'}</button>` : ''}</div>
    <div class="lbl">提醒标记</div>
    ${src.map(c => `<div class="mk-row">${badge(c)}<div>${CHARS[c].rem.map(t => { const on = x.marks.some(m => m.c === c && m.t === t);
      return `<button class="mkb${on ? ' on' : ''}" data-act="mark" data-i="${i}" data-c="${c}" data-t="${esc(t)}">${esc(t)}</button>`; }).join('')}</div></div>`).join('') || '<p class="hint">本局在场的角色没有提醒标记</p>'}
    <details style="margin-top:12px"><summary class="lbl" style="cursor:pointer">改角色（比如恶魔传位、被换了角色）</summary>
      <div class="pk">${edChars(S.ed).map(id => `<button class="pkc${x.role === id ? ' on' : ''}" data-act="chrole" data-i="${i}" data-id="${id}">${badge(id)}<span>${esc(CHARS[id].zh)}</span></button>`).join('')}</div></details>
    <button class="btn ghost" data-act="close">完成</button>`;
}

function nomSheet() {
  const n = ui.nom, d = S.ph.n, today = S.noms.filter(x => x.d === d);
  const byUsed = new Set(today.map(x => x.by)), onUsed = new Set(today.map(x => x.on));
  const need = threshold(S), blk = onBlock(S);
  const grid = (key, can) => `<div class="grid4">${S.seats.map((x, i) => `<button class="${n[key] === i ? 'on' : ''}${x.dead ? ' dim' : ''}" data-act="nompick" data-key="${key}" data-i="${i}" ${can(x, i) ? '' : 'disabled'}>${i + 1}${x.dead ? '·亡' : ''}</button>`).join('')}</div>`;
  const step = n.by === null ? 'by' : n.on === null ? 'on' : 'votes';
  return `<h3>记录提名和投票<small>今天第 ${today.length + 1} 次</small></h3>
    <div class="lbl">谁提名${n.by !== null ? `：<b class="pick">${who(S, n.by)}</b>` : ''}</div>
    ${step === 'by' ? grid('by', (x, i) => !x.dead && !byUsed.has(i)) + '<p class="hint">死人不能提名；每人每天只能提名一次（灰色的已经提名过）。</p>' : ''}
    ${step !== 'by' ? `<div class="lbl">被提名的是${n.on !== null ? `：<b class="pick">${who(S, n.on)}</b>` : ''}</div>` : ''}
    ${step === 'on' ? grid('on', (x, i) => !onUsed.has(i)) + '<p class="hint">每人每天只能被提名一次。</p>' : ''}
    ${step === 'votes' ? `<div class="lbl">谁举手了 <span class="vc">${n.votes.length} 票</span> · 需要 ${need} 票${blk && !blk.tie ? `，要超过 ${who(S, blk.seat)} 的 ${blk.n} 票` : blk?.tie ? `，目前平票 ${blk.n} 票` : ''}</div>
      <div class="grid4">${S.seats.map((x, i) => `<button class="${n.votes.includes(i) ? 'on' : ''}${x.dead ? ' dim' : ''}" data-act="vote" data-i="${i}" ${x.dead && !x.ghost ? 'disabled' : ''}>${i + 1}${x.dead ? (x.ghost ? '·亡' : '·无票') : ''}</button>`).join('')}</div>
      <p class="hint">从被提名者顺时针下一位开始数。死人投票会用掉他的幽灵票；幽灵票用完的不能投。</p>` : ''}
    <div class="btns" style="margin-top:12px">${step !== 'by' ? '<button class="btn ghost" data-act="nomback" style="margin-top:12px">上一步</button>' : '<button class="btn ghost" data-act="close" style="margin-top:12px">取消</button>'}
      ${step === 'votes' ? `<button class="btn" data-act="nomok">记录 ${n.votes.length} 票</button>` : ''}</div>`;
}

/* ---------- rating this game (stars + comment), shown on the hub boardgame.leisurecat.cloud ---------- */
// Nothing about the game goes into the request: only who rates, the stars, the comment and the room code.
const REVIEW_API = 'https://boardgame.leisurecat.cloud/api/reviews';
const STAR_TXT = ['点星星打分', '不推荐', '一般', '还行', '好玩', '超好玩'];
const rvWhos = () => role === 'st' ? ['说书人'] : ['玩家'];
const rvKey = () => `botc-rv-${code}-${role}`;
const savedReview = () => { try { return JSON.parse(store.get(rvKey())) || {}; } catch { return {}; } };
const rvName = rv => (role === 'st' ? '说书人' : (rv.name || '').trim() || (mySeat() !== null ? S.seats[mySeat()].name : '') || rv.who || '').slice(0, 20);
function reviewCard() {
  if (ui.rv?.key !== rvKey()) ui.rv = { who: rvWhos()[0], name: '', stars: 0, text: '', state: '', err: '', ...savedReview(), key: rvKey() };
  const rv = ui.rv;
  if (rv.state === 'sent') return `<h2 class="h" data-html2canvas-ignore><span>给这款游戏打个分</span></h2><div class="card rv" data-k="rv" data-html2canvas-ignore><div class="rv-done">${'★'.repeat(rv.stars)}${'☆'.repeat(5 - rv.stars)}</div>
    <p>谢谢 ${esc(rvName(rv))} 的评价！</p><div class="btns"><button class="btn ghost" data-act="rv-edit">修改评价</button><a class="btn navy" href="https://boardgame.leisurecat.cloud">看大家的评价</a></div></div>`;
  return `<h2 class="h" data-html2canvas-ignore><span>给这款游戏打个分</span><small>满分 5 星</small></h2><div class="card rv" data-k="rv" data-html2canvas-ignore>
    <div class="rv-l">我是</div><div class="rv-who">${rvWhos().map(w => `<button class="${rv.who === w ? 'on' : ''}" data-act="rv-who" data-who="${w}">${w}</button>`).join('')}</div>
    ${role === 'st' ? '' : `<input class="pn rv-name" data-rv="name" maxlength="20" placeholder="你的名字（可不填，默认用座位上的名字）" value="${esc(rv.name)}">`}
    <div class="rv-st">${[1, 2, 3, 4, 5].map(n => `<button class="${n <= rv.stars ? 'on' : ''}" data-act="rv-star" data-n="${n}" aria-label="${n} 星">★</button>`).join('')}<span>${STAR_TXT[rv.stars]}</span></div>
    <textarea data-rv="text" placeholder="说说这款游戏怎么样（可不填）" maxlength="300">${esc(rv.text)}</textarea>
    <button class="btn" data-act="rv-send" ${!rv.who || !rv.stars || rv.state === 'sending' ? 'disabled' : ''}>${rv.state === 'sending' ? '提交中…' : '提交评价'}</button>
    ${rv.err ? `<p class="err">${esc(rv.err)}</p>` : ''}
    <p class="note">评价和名字会显示在「桌游小助手」首页，并计入这款游戏的整体评分。同一局再次提交会覆盖之前的评价。</p></div>`;
}
async function sendReview() {
  const rv = ui.rv;
  rv.state = 'sending'; rv.err = ''; render();
  try {
    const r = await fetch(REVIEW_API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ game: 'botc', stars: rv.stars, name: rvName(rv), text: rv.text, room: code }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `提交失败（${r.status}）`);
    rv.state = 'sent';
    store.set(rvKey(), JSON.stringify({ who: rv.who, name: rv.name, stars: rv.stars, text: rv.text, state: 'sent' }));
  } catch (e) {
    rv.state = ''; rv.err = ['Failed to fetch', 'Load failed', 'network error'].includes(e.message) ? '网络连接失败，请稍后再试' : e.message;
  }
  render();
}

/* ---------- long image ---------- */
function loadScript(src) { return new Promise((ok, no) => { if (window.html2canvas) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); }
async function saveImage() {
  ui.saving = true; render();
  try {
    await loadScript('vendor/html2canvas.min.js');
    const canvas = await window.html2canvas($('#shot'), { backgroundColor: '#0d0809', scale: Math.min(2, window.devicePixelRatio || 2), useCORS: true,
      onclone: doc => { const c = doc.getElementById('shot'); c.style.padding = '12px'; c.style.width = '420px'; } });
    showImage(canvas.toDataURL('image/jpeg', 0.9));
  } catch (e) { toast('生成长图失败：' + e.message); }
  ui.saving = false; render();
}
function showImage(url) {
  const el = document.createElement('div');
  el.className = 'shotv';
  el.innerHTML = `<div class="sv-top"><span>长按图片保存到相册</span><a href="${url}" download="血染钟楼-${code}.jpg">下载</a><button>关闭</button></div><img src="${url}" alt="复盘长图">`;
  el.querySelector('button').onclick = () => el.remove();
  document.body.appendChild(el);
}

/* ---------- actions ---------- */
async function createRoom() {
  ui.busy = true; ui.err = ''; render();
  try {
    const r = await fetch('/api/room', { method: 'POST' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || '创建失败');
    remember(j.code, j.key);
    location.href = `/?r=${j.code}`;
  } catch (e) { ui.err = e.message || '网络出错，请重试'; ui.busy = false; render(); }
}

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const d = b.dataset, a = d.act;
  if (b.tagName === 'INPUT' && b.type === 'checkbox') return;
  switch (a) {
    case 'create': return createRoom();
    case 'join': { const c = cleanCode($('#joinCode').value); if (!c) { ui.err = '房间码是 4 位字母或数字'; return render(); } location.href = `/?r=${c}`; return; }
    case 'rejoin': location.href = `/?r=${d.code}`; return;
    case 'leave': location.href = '/'; return;
    case 'share': ui.sheet = { k: 'share' }; return render();
    case 'copy': try { await navigator.clipboard.writeText(d.text); toast('已复制'); } catch { prompt('复制这条链接', d.text); } return;
    case 'close': ui.sheet = null; ui.nom = null; return render();
    case 'tab': ui.tab = d.tab; ui.sheet = null; window.scrollTo(0, 0); return render();
    case 'ptab': ui.ptab = d.tab; return render();
    case 'publicview': window.open(`/?r=${code}&v=1`, '_blank'); return;
    case 'me': ui.sheet = { k: 'me' }; return render();
    case 'sit': store.set(`botc-seat-${code}`, d.i); return render();
    case 'myname': { const me = mySeat(), v = $('#myName').value.trim(); if (me !== null && v) send({ t: 'seat', i: me, name: v }); ui.sheet = null; return render(); }
    case 'save': return saveImage();
    case 'rv-who': ui.rv.who = d.who; return render();
    case 'rv-star': ui.rv.stars = +d.n; return render();
    case 'rv-send': return sendReview();
    case 'rv-edit': ui.rv.state = ''; return render();
  }
  if (role !== 'st') return;
  if (a.startsWith('custom-')) {
    if (S.stage !== 'setup') return;
    if (['custom-new', 'custom-copy', 'custom-edit', 'custom-import'].includes(a)) { openEditor(a, S); window.scrollTo(0, 0); }
    else await editorClick(a, d, { use: script => send({ t: 'setup', ed: 'custom', n: S.n || 7, script }) });
    return render();
  }
  switch (a) {
    case 'ed': send({ t: 'setup', ed: d.ed, n: S.n || 7 }); return;
    case 'n': send({ t: 'setup', ed: S.ed, n: S.n + +d.d }); return;
    case 'bag': { const has = S.bag.includes(d.id); if (!has && S.bag.length >= S.n) return toast(`已经选够 ${S.n} 个角色了`); send({ t: 'bag', ids: has ? S.bag.filter(x => x !== d.id) : [...S.bag, d.id] }); return; }
    case 'pickrole': ui.sheet = { k: 'pickrole', i: +d.i }; return render();
    case 'setrole': send({ t: 'seat', i: +d.i, role: d.id }); if (!BELIEVE[d.id]) { ui.sheet = null; render(); } return;
    case 'setbel': send({ t: 'seat', i: +d.i, bel: d.id }); return;
    case 'clearrole': send({ t: 'seat', i: +d.i, role: null }); ui.sheet = null; return render();
    case 'bluffs': ui.sheet = { k: 'bluffs' }; return render();
    case 'bluff': { const has = S.bluffs.includes(d.id); if (!has && S.bluffs.length >= 3) return toast('最多 3 个'); send({ t: 'bluffs', ids: has ? S.bluffs.filter(x => x !== d.id) : [...S.bluffs, d.id] }); return; }
    case 'start': send({ t: 'start' }); ui.tab = 'game'; window.scrollTo(0, 0); return;
    case 'step': send({ t: 'step', k: d.k, on: !S.done[d.k] }); return;
    case 'dawn': { const left = nightList(S).filter(x => !S.done[x.k] && !x.dead).length; if (left) { ui.sheet = { k: 'dawn', left }; return render(); } send({ t: 'dawn' }); window.scrollTo(0, 0); return; }
    case 'dawnok': send({ t: 'dawn' }); ui.sheet = null; window.scrollTo(0, 0); return render();
    case 'dusk': send({ t: 'dusk' }); ui.pick = {}; ui.jug = {}; window.scrollTo(0, 0); return;
    case 'seat': ui.sheet = { k: 'seat', i: +d.i }; return render();
    case 'dead': send({ t: 'dead', i: +d.i, dead: !S.seats[+d.i].dead }); return;
    case 'ghost': send({ t: 'ghost', i: +d.i, on: !S.seats[+d.i].ghost }); return;
    case 'mark': send({ t: 'mark', i: +d.i, c: d.c, x: d.t, on: !S.seats[+d.i].marks.some(m => m.c === d.c && m.t === d.t) }); return;
    case 'chrole': send({ t: 'seat', i: +d.i, role: d.id }); return;
    case 'nom': ui.nom = { by: null, on: null, votes: [] }; ui.sheet = { k: 'nom' }; return render();
    case 'pick': { const k = d.k, i = +d.i, max = PICKS[k.split('@')[0]].k, v = ui.pick[k] || []; ui.pick[k] = v.includes(i) ? v.filter(x => x !== i) : [...v, i].slice(-max); return render(); }
    case 'infolog': { const old = S.log.find(e => e.at === `N${S.ph.n}` && e.k === d.k)?.x; send({ t: 'log', k: d.k, x: old ? `${old}；${d.x}` : d.x }); toast('已写进记录'); return; }
    case 'clearabn': S.seats.forEach((o, i) => { if (o.marks.some(m => m.c === 'mathematician' && m.t === '未正常生效')) send({ t: 'mark', i, c: 'mathematician', x: '未正常生效', on: false }); }); return;
    case 'nompick': ui.nom[d.key] = +d.i; return render();
    case 'nomback': if (ui.nom.on !== null) { ui.nom.on = null; ui.nom.votes = []; } else ui.nom.by = null; return render();
    case 'vote': { const i = +d.i, v = ui.nom.votes; ui.nom.votes = v.includes(i) ? v.filter(x => x !== i) : [...v, i]; return render(); }
    case 'nomok': send({ t: 'nom', by: ui.nom.by, on: ui.nom.on, votes: ui.nom.votes }); ui.sheet = null; ui.nom = null; return render();
    case 'exec': ui.sheet = { k: 'exec', seat: d.seat === '' ? null : +d.seat }; return render();
    case 'execok': send({ t: 'exec', seat: ui.sheet.seat, died: !$('#noDie')?.checked }); ui.sheet = null; return render();
    case 'note': ui.sheet = { k: 'note' }; return render();
    case 'noteok': { const x = $('#noteX').value.trim(); if (x) send({ t: 'log', k: 'note', x }); ui.sheet = null; return render(); }
    case 'end': ui.sheet = { k: 'end' }; return render();
    case 'endok': send({ t: 'end', win: d.win, why: $('#endWhy').value.trim() }); ui.sheet = null; window.scrollTo(0, 0); return render();
    case 'undo': sendRaw({ undo: true }); return;
    case 'reset': ui.sheet = { k: 'reset' }; return render();
    case 'resetok': send({ t: 'reset' }); ui.sheet = null; ui.tab = 'game'; return render();
  }
});
document.addEventListener('input', e => {
  const d = e.target.dataset;
  if (editorActive() && editorInput(e, render)) return;
  if (d.rv === 'text') ui.rv.text = e.target.value;
  if (d.rv === 'name') ui.rv.name = e.target.value;
  if (d.note !== undefined && role !== 'st') saveNote(d.note, e.target.value);
});
document.addEventListener('change', e => {
  if (editorActive() && editorInput(e, render)) return;
  const d = e.target.dataset;
  if (role !== 'st') return;
  if (d.jug !== undefined) { ui.jug[d.jug] = { ...(ui.jug[d.jug] || {}), [d.i]: e.target.value }; return render(); }
  if (d.name !== undefined) send({ t: 'seat', i: +d.name, name: e.target.value });
  if (d.log !== undefined) send({ t: 'log', k: d.log, x: e.target.value });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'joinCode') $('[data-act="join"]').click();
  if (e.key === 'Enter' && (e.target.dataset?.log !== undefined || e.target.dataset?.name !== undefined)) e.target.blur();
});

// Load the QR library, then start.
{ const s = document.createElement('script'); s.src = 'vendor/qrcode.js'; s.onload = () => render(); document.head.appendChild(s); }
render();
connect();
