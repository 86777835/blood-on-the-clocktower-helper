// Finished games of the rooms where this device is the Storyteller (each room keeps its own records; needs the room key).
import { EDITIONS, CHARS } from './data.js';
import { esc, badge } from './views.js';

let mine = [];
try { mine = (JSON.parse(localStorage.getItem('botc-mine')) || []).filter(r => r && /^[A-Z0-9]{4}$/.test(r.code) && typeof r.key === 'string'); } catch {}
const el = document.getElementById('games');
const day = t => { const d = new Date(t); return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

(async () => {
  const all = [];
  await Promise.all(mine.map(async r => {
    try {
      const res = await fetch(`/api/room/${r.code}/games`, { method: 'POST', body: JSON.stringify({ key: r.key }) });
      if (res.ok) for (const g of await res.json()) all.push({ ...g, code: r.code });
    } catch {}
  }));
  all.sort((a, b) => b.ended - a.ended);
  el.innerHTML = all.length ? all.map(g => `<details class="card fq"><summary>${day(g.ended)} · ${esc(EDITIONS[g.ed]?.zh || '')} · ${g.n} 人<br><small style="color:var(--ink2);font-weight:500">房间 ${g.code} · ${g.result === 'good' ? '善良阵营获胜' : '邪恶阵营获胜'} · 进行到第 ${g.days} 天${g.why ? ` · ${esc(g.why)}` : ''}</small></summary>
      <div class="list" style="margin:0 10px 10px">${g.seats.map((x, i) => `<div class="card grim${x.dead ? ' dead' : ''}"><span class="sno">${i + 1}</span>${badge(x.role)}<span class="gm"><b>${esc(x.name)}<small>${esc(CHARS[x.role]?.zh || '')}${x.bel ? ` · 以为是${esc(CHARS[x.bel]?.zh || '')}` : ''}</small></b></span></div>`).join('')}</div>
      ${g.log.length ? `<div class="card log" style="margin:0 10px 10px">${g.log.slice(0, 60).map(x => `<div>${esc(x)}</div>`).join('')}</div>` : ''}</details>`).join('') : '<div class="empty">还没有结束的对局</div>';
})();
