// Pieces shared by the room page and the character list page.
import { EDITIONS, CHARS, STEPS, TEAM_ZH } from './data.js';

import { charactersOf, editionOf } from './custom.js';

export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const TEAMS = ['townsfolk', 'outsider', 'minion', 'demon'];

// The character's official icon (TPI's toolmaker resources, botc-release/resources/characters) on a parchment token.
export const icon = (id, S) => {
  const c = charactersOf(S)[id];
  if (!c) return '?';
  return c.custom ? `<span class="custom-letter">${esc([...c.zh][0])}<small>自制</small></span>` : `<img src="img/roles/${id}.webp" alt="${esc(c.zh)}" loading="lazy">`;
};
export const badge = (id, S) => { const c = charactersOf(S)[id]; return c ? `<span class="cb ic t-${c.team}">${icon(id, S)}</span>` : '<span class="cb">?</span>'; };
export const cname = (id, S) => { const c = charactersOf(S)[id]; return c ? `<span class="cnm t-${c.team}">${esc(c.zh)}${c.custom ? ' · 自制' : ''}</span>` : ''; };

// The script's characters by team, each with this site's own one-line summary.
export function charList(ed, S) {
  const CHARS = charactersOf(S), e = S ? editionOf(S) : EDITIONS[ed];
  return TEAMS.map(t => {
    const ids = e.chars.filter(id => CHARS[id].team === t);
    return `<div class="cl-t t-${t}">${TEAM_ZH[t]}<small>${ids.length}</small></div>${ids.map(id => `<div class="cl" data-k="cl-${id}">${badge(id, S)}<div><b>${esc(CHARS[id].zh)}<small>${CHARS[id].custom ? '自制' : esc(CHARS[id].en)}</small></b><span>${esc(CHARS[id].gist)}</span>${CHARS[id].setup ? `<em>开局：${esc(CHARS[id].setupNote)}</em>` : ''}</div></div>`).join('')}`;
  }).join('') + e.chars.flatMap(id => (CHARS[id].jinxes || []).filter(j => e.chars.includes(j.id)).map(j => `<p class="note">相克：${esc(CHARS[id].zh)} / ${esc(CHARS[j.id].zh)}：${esc(j.reason)}</p>`)).join('');
}

// Night order by character (no seats): the same information as the official night sheet.
export function nightOrder(ed, first, S) {
  const CHARS = charactersOf(S), e = S ? editionOf(S) : EDITIONS[ed];
  const order = S?.script?.[first ? 'firstNight' : 'otherNight'];
  const key = first ? 'fn' : 'on', steps = S?.ed === 'custom' ? S.script.steps : STEPS;
  const rows = [
    ...Object.entries(steps).filter(([, st]) => st[key]).map(([id, st]) => ({ o: order ? order.indexOf(id) + 1 : st[key], html: `<span class="cb step">${esc(st.zh[0])}</span><b>${esc(st.zh)}</b>` })),
    ...e.chars.filter(id => CHARS[id][key]).map(id => ({ o: order ? order.indexOf(id) + 1 : CHARS[id][key], html: `${badge(id, S)}<b>${esc(CHARS[id].zh)}</b>` }))
  ].sort((a, b) => a.o - b.o);
  return `<ol class="no-list">${rows.map(r => `<li>${r.html}</li>`).join('')}</ol>`;
}

export const edName = ed => EDITIONS[ed] ? `${EDITIONS[ed].zh}` : '';
