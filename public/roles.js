// The three scripts' characters and night order (public information, the same as the printed character sheets).
import { EDITIONS } from './data.js';
import { esc, charList, nightOrder } from './views.js';

const eds = Object.keys(EDITIONS);
let ed = eds.includes(location.hash.slice(1)) ? location.hash.slice(1) : eds[0];
const el = document.getElementById('roles');
function render() {
  const e = EDITIONS[ed];
  el.innerHTML = `<div class="chips" style="margin-top:12px">${eds.map(k => `<button class="chip${k === ed ? ' on' : ''}" data-ed="${k}">${esc(EDITIONS[k].zh)}</button>`).join('')}</div>
    <p class="note">${esc(e.en)}${e.alias.length ? ` · 也叫${e.alias.map(esc).join('、')}` : ''}。能力简述是本站自己写的提示，以实体角色表和说书人为准。</p>
    <div class="card ref-sec" style="margin-top:10px">${charList(ed)}</div>
    <details class="card ref" style="margin-top:10px"><summary>首夜顺序</summary>${nightOrder(ed, true)}</details>
    <details class="card ref" style="margin-top:8px"><summary>其他夜晚顺序</summary>${nightOrder(ed, false)}</details>
    <a class="btn ghost" href="guide">规则介绍与常见问题</a><a class="btn ghost" href="./">返回首页</a>
    <footer>非官方玩家工具 · 角色名为集石官方中文名，能力简述为本站自写，夜晚顺序依据官方 nightsheet 数据<br>角色图标来自 The Pandemonium Institute 向社区工具开放的官方资源<br><img class="ccc" src="img/ccc.png" alt="Community Created Content"></footer>`;
}
el.addEventListener('click', e => { const b = e.target.closest('[data-ed]'); if (b) { ed = b.dataset.ed; history.replaceState(null, '', '#' + ed); render(); } });
render();
