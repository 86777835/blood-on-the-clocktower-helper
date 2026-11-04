// Pieces shared by the room page and the character list page.
import { EDITIONS, CHARS, STEPS, TEAM_ZH } from './data.js';

export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const TEAMS = ['townsfolk', 'outsider', 'minion', 'demon'];

// The character's official icon (TPI's toolmaker resources, botc-release/resources/characters) on a parchment token.
export const icon = id => `<img src="img/roles/${id}.webp" alt="${esc(CHARS[id].zh)}" loading="lazy">`;
export const badge = id => CHARS[id] ? `<span class="cb ic t-${CHARS[id].team}">${icon(id)}</span>` : '<span class="cb">?</span>';
export const cname = id => CHARS[id] ? `<span class="cnm t-${CHARS[id].team}">${esc(CHARS[id].zh)}</span>` : '';

// The script's characters by team, each with this site's own one-line summary.
export function charList(ed) {
  const e = EDITIONS[ed];
  return TEAMS.map(t => {
    const ids = e.chars.filter(id => CHARS[id].team === t);
    return `<div class="cl-t t-${t}">${TEAM_ZH[t]}<small>${ids.length}</small></div>${ids.map(id => `<div class="cl" data-k="cl-${id}">${badge(id)}<div><b>${esc(CHARS[id].zh)}<small>${esc(CHARS[id].en)}</small></b><span>${esc(CHARS[id].gist)}</span>${CHARS[id].setup ? `<em>开局：${esc(CHARS[id].setupNote)}</em>` : ''}</div></div>`).join('')}`;
  }).join('');
}

// Night order by character (no seats): the same information as the official night sheet.
export function nightOrder(ed, first) {
  const key = first ? 'fn' : 'on';
  const rows = [
    ...Object.entries(STEPS).filter(([, st]) => st[key]).map(([id, st]) => ({ o: st[key], html: `<span class="cb step">${esc(st.zh[0])}</span><b>${esc(st.zh)}</b>` })),
    ...EDITIONS[ed].chars.filter(id => CHARS[id][key]).map(id => ({ o: CHARS[id][key], html: `${badge(id)}<b>${esc(CHARS[id].zh)}</b>` }))
  ].sort((a, b) => a.o - b.o);
  return `<ol class="no-list">${rows.map(r => `<li>${r.html}</li>`).join('')}</ol>`;
}

export const edName = ed => EDITIONS[ed] ? `${EDITIONS[ed].zh}` : '';
