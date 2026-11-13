// Teach page: what the Storyteller reads aloud to a table of new players, written from this site's guide and FAQ
// (tools/讲解稿.md, tools/faq.json: the 集石 wiki's rules summary and the official wiki). It names every important element
// in a sentence and leaves character abilities to each player's own token and sheet. Only general rules: nothing about
// any game in progress. Terms in {text|id} open a note; 「问」 buttons ask the rules assistant (chat.js) straight away.
// Pictures: the official icons TPI opens to community tools (botc-release/resources: characters/generic, the character
// icons already in img/roles/, edition logos). Things with no official picture (the grimoire, nominations, the shroud,
// the vote token) are text only: nothing is drawn by this site.
const ICON = (src, cls = '') => src ? `<img class="ico ${cls}" src="img/${src}.webp" alt="">` : '';

// id: name, where you see it, what it means. icon: a picture under img/ (null when there is no official one).
const TERMS = {
  good: { name: '善良阵营', icon: 'teach/good', where: '蓝色的角色：镇民和外来者。', what: '找出并处决恶魔就赢。人数比邪恶多，但互相不知道谁是谁。' },
  evil: { name: '邪恶阵营', icon: 'teach/evil', where: '红色的角色：爪牙和恶魔。', what: '活着的玩家只剩两人时就赢（旅行者不算）。7 人及以上时，坏人开局互相认识。' },
  townsfolk: { name: '镇民', icon: 'teach/townsfolk', where: '角色表上最多的一类，蓝色。', what: '善良。能力通常帮好人找线索，比如夜里得知一些信息。' },
  outsider: { name: '外来者', icon: 'teach/outsider', where: '角色表上的蓝色角色，镇民下面一类。', what: '也是善良的，但能力通常帮倒忙，比如以为自己是镇民的酒鬼。' },
  minion: { name: '爪牙', icon: 'teach/minion', where: '角色表上的红色角色，一局 1～3 个。', what: '邪恶。帮恶魔搅局：下毒、冒充、混淆视听。' },
  demon: { name: '恶魔', icon: 'teach/demon', where: '角色表最下面的红色角色，一局一般 1 个。', what: '邪恶的核心，通常每晚杀一个人。恶魔死了，好人就赢。' },
  storyteller: { name: '说书人', icon: null, where: '主持的那个人，不算玩家。', what: '管魔典、叫人、给信息、主持提名和投票。规则问题说书人一定说真话，有争议由说书人裁定。' },
  grimoire: { name: '魔典', icon: null, where: '说书人面前那本盒子，或者说书人手机上的魔典页。', what: '记着每个人的真实角色和各种状态。玩家不准偷看。' },
  sheet: { name: '角色表', icon: 'teach/logo-tb', where: '桌上公开的那张剧本角色表，上面印着剧本名，比如暗流涌动。', what: '列出这局可能出现的全部角色和能力。在场的只是其中一部分，具体有谁只有说书人知道。' },
  token: { name: '角色标记', icon: 'roles/washerwoman', where: '开局从袋子里摸到的圆片，看完交回说书人。', what: '上面就是你的角色和能力。不同颜色：蓝色善良，红色邪恶。' },
  bluff: { name: '伪装角色', icon: null, where: '只有恶魔首夜看得到。', what: '说书人给恶魔看 3 个不在场的善良角色，方便他冒充。恶魔也可以冒充别的。' },
  nominate: { name: '提名', icon: null, where: '白天提名环节，玩家说“我提名某某”。', what: '提名后就投票。只有活人能提名；每人每天只能提名一次、被提名一次。' },
  vote: { name: '投票', icon: null, where: '说书人顺时针数到你时，你的手是举着的。', what: '从被提名者的下一位开始顺时针数，最后数被提名的人。活人每天可以给任意多人投票。' },
  execute: { name: '处决', icon: null, where: '提名环节结束时，票数最高且够门槛的那个人。', what: '票数要达到存活人数的一半，并且是当天最高票；平票都不处决。每天最多处决一人。' },
  life: { name: '生命标记', icon: null, where: '城镇广场板上每人一个，摆在自己面前对应的位置。', what: '活着是亮面；死了翻到暗面，上面再放一个投票标记。大家一眼就能看出谁死了。' },
  ghost: { name: '投票标记（幽灵票）', icon: null, where: '死的时候拿到的那一个小标记。', what: '死人整局只能再投一次票，投了就把这个标记交回。' },
  drunk: { name: '醉酒', icon: 'roles/drunk', where: '说书人魔典里的提醒标记，玩家看不到。', what: '失去能力，但自己不知道。说书人照常叫醒他，给他的信息可能是假的。' },
  poisoned: { name: '中毒', icon: 'roles/poisoner', where: '说书人魔典里的提醒标记，比如投毒者下的毒。', what: '效果和醉酒一样：失去能力、自己不知道，信息可能是假的。只是来源不同。' },
  madness: { name: '疯狂', icon: 'roles/cerenovus', where: '只在梦殒春宵的少数角色里出现，比如洗脑师。', what: '要真心努力让大家相信某件事是真的。做没做到由说书人判断，没做到可能被惩罚。' },
  traveller: { name: '旅行者', icon: 'teach/traveller', where: '晚到或要早走的人用的角色。', what: '可以随时加入、随时离开。能力很强但信息少；邪恶的旅行者只知道谁是恶魔。' },
  fabled: { name: '传奇角色', icon: 'teach/fabled', where: '说书人放在魔典边上的特殊标记。', what: '不是玩家，更像说书人加的特殊规则，比如照顾新手、让局面更公平。用了哪个会告诉大家，它不会死。' },
  script: { name: '剧本', icon: 'teach/logo-tb', where: '角色表顶上的名字：暗流涌动、黯月初升、梦殒春宵。', what: '决定这局用哪些角色。第一局建议玩暗流涌动。' },
  scarletwoman: { name: '红唇女郎', icon: 'roles/scarletwoman', where: '暗流涌动里的一个爪牙。', what: '恶魔死的时候，如果死前活着的有 5 人或更多，她马上变成恶魔，游戏继续。' }
};

// The script, in the order the Storyteller reads it. Abilities are left to each player's token and the sheet.
const PARTS = [
  { title: '怎么赢', sec: 35, lines: [
    '这局玩《血染钟楼》，我是{说书人|storyteller}。我先讲一遍主流程，讲完再一条条过注意事项。',
    '每人会摸到一个秘密角色。大多数人是{善良阵营|good}，少数人是{邪恶阵营|evil}。',
    '好人要找出并处决{恶魔|demon}：恶魔死了，好人就赢。',
    '坏人要藏好：活着的玩家只剩两人时，坏人就赢。',
    '死了也不出局：死人照样能说话、出主意，最后和自己的阵营一起赢或输。'
  ], ask: ['恶魔死了游戏一定马上结束吗？', '两边同时达成胜利条件怎么办？'] },
  { title: '角色和角色表', sec: 40, lines: [
    '角色分四类：{镇民|townsfolk}和{外来者|outsider}是好人，{爪牙|minion}和{恶魔|demon}是坏人。',
    '镇民的能力帮好人找线索；外来者也是好人，但能力常常帮倒忙；爪牙帮恶魔捣乱；恶魔通常每晚杀一个人。',
    '你的能力写在自己的{角色标记|token}上，桌上的{角色表|sheet}列着这局所有可能出现的角色。具体能力各自看，我不一一讲。',
    '我手里的{魔典|grimoire}记着每个人的真实角色，大家不能偷看，也不能偷看别人的角色标记。',
    '谁都可以说谎：坏人会冒充好人角色。好人也可以骗人，但一般说真话对好人更有利。'
  ], ask: ['我可以说谎吗？', '角色表上的角色都在场吗？'] },
  { title: '夜晚', sec: 40, lines: [
    '天黑了大家闭眼。我会按顺序轻拍某些人的肩膀，被拍的人睁眼。',
    '醒来后用手势交流：点头、摇头、比数字、用手指人，不要出声。完事我示意你闭眼。',
    '第一夜，7 人及以上时，我会让爪牙和恶魔互相认识，还会给恶魔看 3 个不在场的好人角色当{伪装|bluff}。',
    '之后每晚，恶魔通常会杀一个人。天亮时我只说谁死了，不说为什么。'
  ], ask: ['夜里被叫醒要做什么？', '天亮会公布死因吗？'] },
  { title: '白天和提名', sec: 50, lines: [
    '白天大家睁眼自由聊，可以公开说，也可以找人私聊。聊一阵我宣布开始提名，大家坐回原位。',
    '{提名|nominate}就是说“我提名某某”。只有活人能提名；每人每天只能提名一次，也只能被提名一次。',
    '被提名的人可以辩护几句，然后{投票|vote}：我从他的下一位开始顺时针数，最后数到他本人，数到你时手举着就算一票。',
    '票数达到存活人数的一半，并且是今天最高票，这个人就要被{处决|execute}；平票就都不处决。'
  ], ask: ['处决需要几票？', '平票了怎么办？', '可以给自己投票吗？'] },
  { title: '处决和死亡', sec: 35, lines: [
    '提名结束，票最多的那个人被处决。每天最多处决一人，也可以一个都不处决，处决完就入夜。',
    '死了的人把自己的{生命标记|life}翻到暗面，上面放一个{投票标记|ghost}，也就是常说的幽灵票。',
    '死人失去能力、不能再提名，整局只能再投一次票，投了就把标记交回来。',
    '死人的角色不公开，所以死掉的坏人还能继续带节奏。'
  ], ask: ['死人还能投票吗？', '处决和死亡有什么区别？'] },
  { title: '信息不一定是真的', sec: 30, lines: [
    '有些能力会让人{醉酒|drunk}或{中毒|poisoned}：他失去能力，但自己不知道，以为一切正常。',
    '这时我给他的信息可能是假的。所以任何一条信息都别当铁证，要和大家的说法对一对。',
    '规则问题我一定说真话；只有醉酒、中毒或者被当成别的角色时，信息才会出错。',
    '流程就这些，接下来一条条过注意事项。'
  ], ask: ['醉酒和中毒有什么区别？', '醉酒的人知道自己醉了吗？'] }
];

// 注意事项: fine points new players get wrong. Each answer comes from tools/faq.json and tools/讲解稿.md
// (the 集石 wiki and the official wiki); what is not here goes to the rules assistant.
// [title, answer, question for the assistant]
const NOTES = [
  ['可以说谎吗', '可以。任何人任何时候都可以说任何话，好人也能撒谎；不准做的是偷看魔典和别人的角色标记。不过好人一般说真话对自己阵营更有利。', '血染钟楼里可以说谎吗？有什么是不准做的？'],
  ['说书人给的信息可能是假的', '规则问题说书人必须说真话。但你{醉酒|drunk}、{中毒|poisoned}，或者对方被当作别的角色时，说书人给你的信息可以是错的。', '说书人可以骗玩家吗？'],
  ['醉酒和中毒一样吗', '效果完全一样：失去能力，自己不知道，说书人照常叫醒你，信息可能是假的。只是造成它的角色不同，名字不同。', '醉酒和中毒有什么区别？'],
  ['醉酒时用掉的一次性能力', '浪费了。清醒以后也不能再用一次。', '醉酒时用了一次性能力，清醒后还能再用吗？'],
  ['对中毒的人用能力照样准', '中毒只影响他自己的能力。别人对他用的能力照常生效，比如查一个中毒的恶魔，照样查得出他是恶魔。', '别人对中毒的恶魔用能力，还查得准吗？'],
  ['死人能做什么', '能说话、能私聊、能被提名；不能提名，失去能力，夜里也不会因为能力被叫醒（写明死亡时生效的能力除外）。', '死了还能做什么？死人还能提名吗？'],
  ['死人只剩一票', '死的时候拿到一个{投票标记|ghost}，整局只能再投一次，投了就交回。死人的票照样算进票数，门槛按存活人数算。', '死人投票后幽灵票就没了吗？死人的票算进门槛吗？'],
  ['活人能投几次', '活人每天可以给任意多个被提名的人投票，不是只能投一个。', '一天能给几个人投票？'],
  ['票从谁开始数', '说书人先指着被提名的人，然后从他的下一位开始顺时针一个个数，最后数被提名的人本人。轮到你时手是举着的才算。', '票从谁开始数？'],
  ['处决门槛和平票', '票数要达到存活人数的一半（正好一半也行），比如 7 人存活要 4 票，并且是当天最高票。平票的人都不处决；之后再有人被提名，要超过这个平票数才能上台。', '多少票才能处决？平票怎么办？'],
  ['处决不等于死亡', '处决是投票的结果，死亡是状态。有的人被处决了却没死；已经死了的人也可以被提名、被处决。', '处决和死亡有什么区别？'],
  ['天亮不说死因', '说书人只说谁死了，没人死也会说，但从不说为什么死。', '天亮会公布死因吗？'],
  ['死了不公开角色', '死人的角色一直保密，直到游戏结束。所以死掉的坏人还能继续误导大家。', '死了会公开角色吗？'],
  ['首夜之前先别聊角色', '恶魔要到首夜才拿到伪装角色，所以首夜过后再聊身份才公平，说书人也可以直接禁止首夜前聊。', '首夜之前可以聊自己的角色吗？'],
  ['5～6 人局坏人不认识', '7 人及以上，首夜爪牙和恶魔互相认识，恶魔还拿到 3 个{伪装|bluff}角色。6 人及以下没有这一步：坏人互相不认识，恶魔也没有伪装角色。', '6 人及以下，坏人也互相认识吗？'],
  ['恶魔死了不一定马上结束', '比如{红唇女郎|scarletwoman}：恶魔死前活着的有 5 人或更多，她就接任恶魔，游戏继续。另外，两边同时达成胜利条件时，好人赢。', '恶魔被处决，但红唇女郎在场会怎样？'],
  ['疯狂（梦殒春宵）', '{疯狂|madness}是要真心努力让大家相信某件事。直接说“我疯了”或者暗示自己在疯狂，都算没做到，说书人可以惩罚。', '疯狂是什么意思？我直接说“我疯了”行不行？'],
  ['旅行者和传奇角色', '{旅行者|traveller}给晚到或要早走的人用，可以随时加入、离开；邪恶的旅行者只知道谁是恶魔。{传奇角色|fabled}是说书人加的特殊规则，用了哪个会告诉大家。本站首版不记录这两类。', '旅行者是什么？传奇角色是什么？'],
  ['规则没写清的情况', '由说书人决定。说书人定好怎么处理，告诉大家，整局都照这个来。', '规则书没写清的角色互动怎么办？']
];

// Picture guide, grouped the way they show up at the table.
const GROUPS = [
  ['阵营', ['good', 'evil']],
  ['四类角色', ['townsfolk', 'outsider', 'minion', 'demon']],
  ['桌上的东西', ['token', 'sheet']],
  ['状态', ['drunk', 'poisoned', 'madness']],
  ['特殊角色', ['traveller', 'fabled', 'scarletwoman']]
];

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const term = (text, id) => `<button type="button" class="term" data-t="${id}">${ICON(TERMS[id].icon)}${esc(text)}</button>`;
const line = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\{([^|}]+)\|(\w+)\}/g, (_, t, id) => term(t, id));
// inside a button the terms show their picture but are not buttons themselves
const label = s => esc(s).replace(/\{([^|}]+)\|(\w+)\}/g, (_, t, id) => `<span class="tlab">${ICON(TERMS[id].icon)}${esc(t)}</span>`);
const askBtn = (text, q) => `<button type="button" class="tq" data-q="${esc(q)}">问 <span>${label(text)}</span></button>`;
const MIN = Math.round(PARTS.reduce((n, p) => n + p.sec, 0) / 60);

document.querySelector('h1').textContent = `${MIN} 分钟讲规则`;
document.title = `${MIN} 分钟讲规则 · 血染钟楼助手`;
document.getElementById('teach').innerHTML = `
  <p class="tlead">说书人先照着念主流程（约 ${MIN} 分钟），再一条条过注意事项。<b>带下划线的词</b>点一下看图和解释；有疑问点「问」，规则助手马上回答。具体角色能力不用讲，各自看角色标记和角色表。</p>
  <nav class="tnav">${PARTS.map((p, i) => `<a href="#p${i + 1}"><i>${i + 1}</i>${p.title}</a>`).join('')}<a href="#later">注意事项</a><a href="#icons">图片速查</a></nav>
  ${PARTS.map((p, i) => `<section class="card tpart" id="p${i + 1}">
    <h2 class="h"><span><i>${i + 1}</i>${p.title}</span><small>约 ${p.sec} 秒</small></h2>
    ${p.lines.map(s => `<p class="tline">${line(s)}</p>`).join('')}
    <div class="tasks"><em>桌上常见疑问</em>${p.ask.map(q => askBtn(q, q)).join('')}</div>
  </section>`).join('')}
  <section class="card tpart" id="later">
    <h2 class="h"><span><i>✓</i>注意事项</span><small>${NOTES.length} 条</small></h2>
    <p class="tnote">流程讲完后，一条一条过一遍。都是新人最容易弄错或吵起来的地方，点开就是答案。</p>
    <div class="tnotes">${NOTES.map(([t, a, q], i) => `<details class="tni"><summary><i>${i + 1}</i>${esc(t)}</summary><p>${line(a)}</p>${askBtn('还有疑问？问规则助手', q)}</details>`).join('')}</div>
    <p class="tnote">注意事项里没有的，点右下角「规则」问 AI，本站资料查不到会联网找。</p>
  </section>
  <a class="btn tgo" href="/">讲完了，去建房间</a>
  <h2 class="h" id="icons"><span>图片速查</span><small>点图片看解释</small></h2>
  ${GROUPS.map(([g, ids]) => `<div class="card tgrid"><h3>${g}</h3><div>${ids.map(id => `<button type="button" class="tic" data-t="${id}">${ICON(TERMS[id].icon)}<span>${TERMS[id].name}</span></button>`).join('')}</div></div>`).join('')}
  <footer>讲稿依据本站规则介绍（集石钟楼百科与官方 Wiki）· 图片来自 The Pandemonium Institute 向社区工具开放的官方资源（<a href="https://release.botc.app/resources" target="_blank" rel="noopener">原文</a>），版权归 The Pandemonium Institute 所有 · 非官方玩家工具<br><img class="ccc" src="img/ccc.png" alt="Community Created Content"></footer>`;

// The note for a term: a sheet from the bottom with the picture (if there is an official one), where it is and what it means.
const sheet = document.createElement('div');
sheet.className = 'tsheet hidden';
document.body.appendChild(sheet);
const close = () => sheet.classList.add('hidden');
function show(id) {
  const t = TERMS[id];
  sheet.innerHTML = `<div class="tsbg"></div><div class="tsbox" role="dialog" aria-label="${esc(t.name)}">
    <div class="tshd">${ICON(t.icon, 'big')}<b>${esc(t.name)}</b><button type="button" class="tsx" aria-label="关闭">×</button></div>
    <p><em>在哪儿看到</em>${esc(t.where)}</p><p><em>什么意思</em>${esc(t.what)}</p>
    <button type="button" class="btn navy tsask" data-q="${esc(`「${t.name}」是什么，怎么用？`)}">还不懂？问规则助手</button></div>`;
  sheet.classList.remove('hidden');
}
const ask = q => { close(); window.askRules?.(q); };
document.addEventListener('click', e => {
  const t = e.target.closest('[data-t]');
  if (t) return show(t.dataset.t);
  const q = e.target.closest('[data-q]');
  if (q) return ask(q.dataset.q);
  if (e.target.closest('.tsx,.tsbg')) close();
});
addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
