import { CHARS, STEPS, COUNTS, TEAM_ZH } from './data.js';
import { esc, badge, TEAMS } from './views.js';
import { parseScript, exportScript, copyEdition, MAX_SCRIPT_BYTES } from './custom.js';
import { poolCheck } from './logic.js';
let placement = {};
let draft = null, form = null, err = '', query = '', importing = false, json = '';
const key = 'botc-custom-scripts';
export const editorActive = () => draft !== null;
function recent() {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  const xs = JSON.parse(raw);
  if (!Array.isArray(xs)) throw new Error('本机剧本列表损坏，请先备份 localStorage');
  return xs;
}
export function openEditor(action, S) {
  err = ''; query = ''; form = null; importing = action === 'custom-import'; json = '';
  draft = action === 'custom-copy' ? copyEdition(S.ed) : action === 'custom-edit' && S.ed === 'custom' ? exportScript(S.script) : [{ id: '_meta', name: '', author: '' }];
}
const idOf = r => typeof r === 'string' ? r : r.id;
const definition = r => typeof r === 'string' ? CHARS[r] : { zh: r.name, team: r.team, custom: true, fn: r.firstNight, on: r.otherNight };
function orders(key, exclude) {
  const short = key === 'firstNight' ? 'fn' : 'on';
  const rows = [...Object.entries(STEPS).filter(([, c]) => c[short]).map(([id, c]) => ({ id, name: c.zh, n: c[short] })),
    ...draft.slice(1).filter(r => idOf(r) !== exclude && definition(r)[short]).map(r => ({ id: idOf(r), name: definition(r).zh, n: definition(r)[short] }))];
  const metaOrder = draft[0][key];
  if (metaOrder) for (const row of rows) row.n = metaOrder.indexOf(row.id) + 1;
  return rows.sort((a, b) => a.n - b.n);
}
function nightSelect(key, title) {
  const rows = orders(key, form.id), value = placement[key] || form[key];
  return `<label class="lbl">${title}</label><select class="pn" data-role-field="${key}"><option value="0"${value === 0 ? ' selected' : ''}>不行动</option>
    ${form[key] ? `<option value="${form[key]}"${!placement[key] ? ' selected' : ''}>保留当前顺序（${form[key]}）</option>` : ''}
    ${rows.flatMap(r => [['before', '之前'], ['after', '之后']].map(([pos, label]) => `<option value="${pos}:${r.id}"${value === `${pos}:${r.id}` ? ' selected' : ''}>${esc(r.name)}${label}</option>`)).join('')}</select>`;
}
function roleForm() {
  return `<h2 class="h"><span>${draft.some(r => idOf(r) === form.id) ? '编辑' : '新建'}自制角色</span></h2><p class="note">自制 · 文字图标 · 能力和提示按纯文本保存，不自动执行。</p>
    <label class="lbl" for="customRoleName">名称（必填）</label><input class="pn" id="customRoleName" data-role-field="name" maxlength="30" value="${esc(form.name)}">
    <label class="lbl">阵营（必填）</label><select class="pn" data-role-field="team">${TEAMS.map(t => `<option value="${t}"${t === form.team ? ' selected' : ''}>${TEAM_ZH[t]}</option>`).join('')}</select>
    <label class="lbl">能力描述（必填，可写关键词）</label><textarea class="pn" data-role-field="ability" maxlength="250">${esc(form.ability)}</textarea>
    ${nightSelect('firstNight', '首夜行动顺序')}${nightSelect('otherNight', '其他夜晚行动顺序')}
    <label class="lbl">首夜提示（可选，仅说书人）</label><textarea class="pn" data-role-field="firstNightReminder" maxlength="500">${esc(form.firstNightReminder)}</textarea>
    <label class="lbl">其他夜晚提示（可选，仅说书人）</label><textarea class="pn" data-role-field="otherNightReminder" maxlength="500">${esc(form.otherNightReminder)}</textarea>
    <label class="lbl">提醒标记（每行一个，最多 20 个，每个 30 字）</label><textarea class="pn" data-role-field="marks">${esc(form.reminders.join('\n'))}</textarea>
    <label class="check"><input type="checkbox" data-role-field="setup"${form.setup ? ' checked' : ''}>会改变开局配置（人工提醒）</label>
    ${err ? `<p class="err" role="alert">${esc(err)}</p>` : ''}
    <div class="btns"><button class="btn ghost" data-act="custom-role-cancel">返回编辑器</button><button class="btn" data-act="custom-role-save">保存自制角色</button></div>`;
}
export function editorView(n) {
  if (form) return `<div class="custom-editor" data-k="custom-role">${roleForm()}</div>`;
  const selected = draft.slice(1), count = t => selected.filter(r => definition(r).team === t).length;
  const pool = poolCheck({ ed: 'custom', script: { chars: selected.map(idOf), characters: Object.fromEntries(selected.map(r => [idOf(r), typeof r === 'string' ? CHARS[r] : definition(r)])) } }, n);
  let saved = [];
  try { saved = recent(); } catch (e) { err = e.message; }
  return `<div class="custom-editor" data-k="custom-editor"><h2 class="h"><span>自定义剧本编辑器</span></h2>
    <p class="note">官方角色池：现有 72 个。内置三个剧本不可编辑；这里的修改只在保存时生成本局快照。自定义局统一人工记录。</p>
    <label class="lbl">剧本名（必填）</label><input class="pn" id="customName" data-script-field="name" maxlength="50" value="${esc(draft[0].name)}">
    <label class="lbl">作者（可选）</label><input class="pn" data-script-field="author" maxlength="50" value="${esc(draft[0].author)}">
    <div class="card cts">${TEAMS.map((t, i) => `<span class="ct t-${t}"><b>${count(t)}</b>${TEAM_ZH[t]}<small>参考需 ${COUNTS[n][i]}</small></span>`).join('')}</div>
    <p class="note">${n} 人配置参考：${pool.ok ? '角色池可按本站现有人数规则配置开局（含官方配置修正）' : '角色池不足以满足本站人数规则；' + (TEAMS.filter((t, i) => count(t) < COUNTS[n][i]).map(t => `${TEAM_ZH[t]}不足标准参考数`).join('、') || '请核对改变配置的角色')}。这里只提示，不替你改选角；入袋后按本站配置规则核对。</p>
    ${draft[0].firstNight || draft[0].otherNight ? '<p class="note">本剧本采用整表夜序；新增官方角色按本站官方夜序定位，已有角色相对顺序保留。请在下方夜序预览核对。</p>' : ''}
    ${selected.some(r => typeof r === 'object' && r.setup) ? '<p class="note secret">有自制角色会改变开局配置，请说书人人工确认，不自动计算。</p>' : ''}
    <div class="btns"><button class="btn ghost" data-act="custom-role-new">新建自制角色</button><button class="btn ghost" data-act="custom-show-import">导入 JSON / 最近使用</button></div>
    ${selected.filter(r => typeof r === 'object').map(r => `<div class="card custom-row"><span>${esc(r.name)} · ${TEAM_ZH[r.team]} · 自制</span><button class="lnk" data-act="custom-role-edit" data-id="${r.id}">编辑</button><button class="lnk" data-act="custom-remove" data-id="${r.id}">移除</button></div>`).join('')}
    ${importing ? `<div class="card custom-import"><h3>导入英文官方 JSON</h3><p class="note">最多 128 KiB。中文格式、图片 URL 和 special 暂不支持；不支持的字段须明确移除后重试。</p><input type="file" id="customFile" accept=".json,application/json"><textarea class="pn" id="customJSON" placeholder="粘贴 JSON 数组">${esc(json)}</textarea><button class="btn ghost" data-act="custom-parse">校验并载入编辑器</button>
      ${saved.map((r, i) => `<button class="btn ghost" data-act="custom-recent" data-i="${i}">${esc(r[0].name)}</button>`).join('')}</div>` : ''}
    ${err ? `<p class="err" role="alert">${esc(err)}</p>` : ''}
    <label class="lbl">搜索官方角色</label><input class="pn" id="customSearch" placeholder="名称 / 英文 id / 能力" value="${esc(query)}">
    ${TEAMS.map(t => `<div class="pk-t t-${t}">${TEAM_ZH[t]}</div><div class="pk">${Object.entries(CHARS).filter(([id, c]) => c.team === t && `${id} ${c.zh} ${c.gist}`.toLowerCase().includes(query.toLowerCase())).map(([id, c]) => `<button class="pkc${selected.some(r => idOf(r) === id) ? ' on' : ''}" data-act="custom-toggle" data-id="${id}">${badge(id)}<span>${esc(c.zh)}</span></button>`).join('')}</div>`).join('')}
    <details class="card ref"><summary>夜序预览（完整剧本）</summary>${['firstNight', 'otherNight'].map(k => `<p class="note">${k === 'firstNight' ? '首夜' : '其他夜晚'}：${orders(k).map(r => esc(r.name)).join(' → ')}</p>`).join('')}</details>
    <div class="btns"><button class="btn ghost" data-act="custom-cancel">取消</button><button class="btn ghost" data-act="custom-export">导出 JSON</button></div><button class="btn" data-act="custom-use">保存并使用此剧本</button><p class="hint-s">最近 10 个剧本保存在本机；清理浏览器会丢失，可用 JSON 文件备份。保存会清空当前开局配置。</p></div>`;
}
function remove(id) {
  draft = draft.filter(r => idOf(r) !== id);
  for (const k of ['firstNight', 'otherNight']) if (draft[0][k]) draft[0][k] = draft[0][k].filter(x => x !== id);
}
export async function editorClick(action, d, { use }) {
  err = '';
  try {
    switch (action) {
      case 'custom-cancel': draft = null; break;
      case 'custom-show-import': importing = !importing; break;
      case 'custom-toggle': if (draft.some(r => idOf(r) === d.id)) remove(d.id); else {
        // Insert beside the next official-order anchor without reordering existing roles.
        for (const k of ['firstNight', 'otherNight']) if (draft[0][k]) {
          const short = k === 'firstNight' ? 'fn' : 'on';
          if (CHARS[d.id][short]) {
            const at = draft[0][k].findIndex(id => (CHARS[id]?.[short] ?? STEPS[id]?.[short]) > CHARS[d.id][short]);
            draft[0][k].splice(at < 0 ? draft[0][k].length : at, 0, d.id);
          }
        }
        draft.push(d.id);
      } break;
      case 'custom-remove': remove(d.id); break;
      case 'custom-role-new': placement = {}; form = { id: 'hb' + crypto.randomUUID().replaceAll('-', '').slice(0, 24), name: '', team: 'townsfolk', ability: '', firstNight: 0, otherNight: 0, firstNightReminder: '', otherNightReminder: '', reminders: [], setup: false }; break;
      case 'custom-role-edit': placement = {}; form = structuredClone(draft.find(r => typeof r === 'object' && r.id === d.id)); break;
      case 'custom-role-cancel': form = null; break;
      case 'custom-role-save': {
        const candidate = structuredClone(form), meta = structuredClone(draft[0]);
        for (const k of ['firstNight', 'otherNight']) {
          const rows = orders(k, form.id);
          if (placement[k]) {
            const [side, id] = placement[k].split(':'), at = rows.findIndex(r => r.id === id);
            if (at < 0) throw new Error('夜序参照角色已不存在，请重新选择');
            rows.splice(at + (side === 'after' ? 1 : 0), 0, { id: form.id });
            candidate[k] = rows.findIndex(r => r.id === form.id) + 1;
          } else if (form[k]) {
            rows.push({ id: form.id, n: form[k] }); rows.sort((a, b) => a.n - b.n);
          }
          meta[k] = rows.map(r => r.id);
        }
        // Validate the whole changed definition before replacing the draft.
        parseScript([{ ...meta, name: meta.name || '角色校验' }, ...draft.slice(1).filter(r => idOf(r) !== form.id), candidate]);
        draft[0] = meta; form = candidate;
        const i = draft.findIndex(r => idOf(r) === form.id);
        if (i < 0) draft.push(form); else draft[i] = form;
        form = null; break;
      }
      case 'custom-parse': draft = exportScript(parseScript(json)); break;
      case 'custom-recent': draft = exportScript(parseScript(recent()[+d.i])); break;
      case 'custom-export': {
        if (draft.length < 5) throw new Error('官方 Script Tool 格式要求至少 4 个角色（加 _meta 共 5 项）；请补足后导出。');
        const data = exportScript(parseScript(draft)), url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = 'custom-script.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); break;
      }
      case 'custom-use': {
        const data = exportScript(parseScript(draft));
        const saved = recent().filter(r => JSON.stringify(r) !== JSON.stringify(data));
        localStorage.setItem(key, JSON.stringify([data, ...saved].slice(0, 10)));
        use(data); draft = null; break;
      }
    }
  } catch (e) { err = e.message; }
  if (['custom-role-new', 'custom-role-edit', 'custom-role-save', 'custom-role-cancel'].includes(action)) window.scrollTo(0, 0);
}
export function editorInput(e, render) {
  const el = e.target, d = el.dataset;
  if (d.scriptField) { draft[0][d.scriptField] = el.value; return true; }
  if (d.roleField && form) {
    const k = d.roleField;
    if (k === 'marks') form.reminders = el.value.split('\n').filter(x => x.trim());
    else if (['firstNight', 'otherNight'].includes(k)) {
      if (el.value.includes(':')) placement[k] = el.value;
      else { delete placement[k]; form[k] = +el.value; }
    } else form[k] = k === 'setup' ? el.checked : el.value;
    return true;
  }
  if (el.id === 'customSearch') { query = el.value; render(); return true; }
  if (el.id === 'customJSON') { json = el.value; return true; }
  if (el.id === 'customFile') {
    if (e.type !== 'change') return true;
    const f = el.files[0];
    if (f) {
      if (f.size > MAX_SCRIPT_BYTES) { err = 'JSON 超过 128 KiB 上限'; render(); }
      else f.text().then(t => { json = t; render(); }).catch(() => { err = '文件读取失败'; render(); });
    }
    return true;
  }
  return false;
}
