// Script definitions only: never accept game state, URLs or executable extensions.
import { CHARS, EDITIONS, STEPS } from './data.js';
export const MAX_SCRIPT_BYTES = 128 * 1024;
const copy = x => JSON.parse(JSON.stringify(x));
const teams = ['townsfolk', 'outsider', 'minion', 'demon'];
const fail = x => { throw new Error(x); };
const text = (v, max, label, required = false) => {
  if (typeof v !== 'string' || v.length > max || (required && !v.trim())) fail(`${label}须为${required ? '非空' : ''}文字，最多 ${max} 字`);
  return v;
};
function keys(o, allowed, label) {
  const bad = Object.keys(o).filter(k => !allowed.includes(k));
  if (bad.length) fail(`${label}不支持字段：${bad.join('、')}；仅支持英文官方格式，中文方言和 special 暂不支持。图片及 URL 不加载，请明确移除后重试。`);
}
export function parseScript(input) {
  const raw = typeof input === 'string' ? input : JSON.stringify(input);
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_SCRIPT_BYTES) fail('JSON 超过 128 KiB 上限');
  let rows;
  try { rows = JSON.parse(raw); } catch { fail('JSON 格式错误：请检查括号、逗号和引号'); }
  if (!Array.isArray(rows) || rows.length > 201) fail('剧本须为数组，最多 200 个角色；仅支持英文官方格式，暂不支持中文格式');
  let meta = null;
  const characters = {}, ids = new Set(), unknown = [];
  for (const row of rows) {
    if (!row || (typeof row !== 'string' && (typeof row !== 'object' || Array.isArray(row)))) fail('角色条目须为英文 id 或角色对象');
    const id = typeof row === 'string' ? row : row.id;
    if (typeof id !== 'string' || (id !== '_meta' && (!/^[a-z0-9]{1,50}$/.test(id) || ['constructor', 'prototype', '__proto__'].includes(id) || Object.hasOwn(STEPS, id)))) fail(`非法角色 id：${String(id)}；使用小写英文字母数字（最多50位），暂不支持中文格式`);
    if (ids.has(id)) fail(`重复 id：${id}`);
    ids.add(id);
    if (id === '_meta') {
      keys(row, ['id', 'name', 'author', 'firstNight', 'otherNight'], '_meta');
      meta = { name: text(row.name, 50, '剧本名', true), author: row.author === undefined ? '' : text(row.author, 50, '作者') };
      for (const k of ['firstNight', 'otherNight']) if (row[k] !== undefined) {
        if (!Array.isArray(row[k]) || row[k].length > 200 || row[k].some(x => typeof x !== 'string') || new Set(row[k]).size !== row[k].length) fail(`_meta.${k} 须为不重复的 id 数组`);
        meta[k] = row[k].slice();
      }
      continue;
    }
    if (typeof row === 'string' || Object.keys(row).length === 1) {
      if (!Object.hasOwn(CHARS, id)) { unknown.push(id); continue; }
      characters[id] = copy(CHARS[id]);
      continue;
    }
    if (Object.hasOwn(CHARS, id)) fail(`自制角色 id 与官方角色冲突：${id}，请使用新的 id`);
    keys(row, ['id', 'name', 'team', 'ability', 'firstNight', 'otherNight', 'firstNightReminder', 'otherNightReminder', 'reminders', 'setup', 'jinxes'], id);
    if (!teams.includes(row.team)) fail(`${id} 阵营不支持：${row.team}；仅支持镇民、外来者、爪牙、恶魔，暂不支持中文格式`);
    const c = { custom: true, zh: text(row.name, 30, `${id} 名称`, true), en: '', team: row.team, gist: text(row.ability, 250, `${id} 能力`, true) };
    for (const [key, dest] of [['firstNight', 'fn'], ['otherNight', 'on']]) {
      if (typeof row[key] !== 'number' || !Number.isFinite(row[key]) || row[key] < 0 || row[key] > 10000) fail(`${id}.${key} 须明确填写 0（不行动）或 0–10000 的夜序数值`);
      c[dest] = row[key];
    }
    c.stF = row.firstNightReminder === undefined ? '' : text(row.firstNightReminder, 500, `${id} 首夜提示`);
    c.stO = row.otherNightReminder === undefined ? '' : text(row.otherNightReminder, 500, `${id} 其他夜提示`);
    if (row.setup !== undefined && typeof row.setup !== 'boolean') fail(`${id}.setup 须为布尔值`);
    c.setup = row.setup === true; c.setupNote = c.setup ? '自制角色会改变开局配置，请说书人人工确认；不自动计算。' : '';
    if (row.reminders !== undefined && (!Array.isArray(row.reminders) || row.reminders.length > 20)) fail(`${id} 最多 20 个提醒标记`);
    c.rem = (row.reminders || []).map(x => text(x, 30, `${id} 提醒标记`, true));
    if (row.jinxes !== undefined && (!Array.isArray(row.jinxes) || row.jinxes.length > 50)) fail(`${id} 最多 50 条相克`);
    c.jinxes = (row.jinxes || []).map(j => {
      if (!j || typeof j !== 'object') fail(`${id} 相克格式错误`);
      keys(j, ['id', 'reason'], `${id} 相克`);
      return { id: text(j.id, 50, '相克 id', true), reason: text(j.reason, 500, '相克说明', true) };
    });
    characters[id] = c;
  }
  if (unknown.length) fail(`本站未收录或不认识的官方 id：${unknown.join('、')}。仅有现有 72 个官方角色；请明确移除后重试。暂不支持中文格式。`);
  if (!meta) fail('缺少 _meta：请添加剧本名 name（必填）和可选 author；仅支持英文官方格式');
  const chars = Object.keys(characters);
  if (chars.length < 1) fail('请至少选择一个角色');
  for (const [key, dest] of [['firstNight', 'fn'], ['otherNight', 'on']]) if (meta[key]) {
    const valid = [...chars, ...Object.keys(STEPS)];
    if (meta[key].some(id => !valid.includes(id))) fail(`_meta.${key} 含未知 id`);
    const expected = [...chars.filter(id => characters[id][dest]), ...Object.keys(STEPS).filter(id => STEPS[id][dest])];
    if (expected.some(id => !meta[key].includes(id)) || meta[key].some(id => !expected.includes(id))) fail(`_meta.${key} 必须完整列出本夜行动角色和步骤`);
    for (const id of chars) characters[id][dest] = meta[key].includes(id) ? meta[key].indexOf(id) + 1 : 0;
  }
  return { kind: 'custom', steps: copy(STEPS), name: meta.name, author: meta.author, chars, characters,
    ...(meta.firstNight ? { firstNight: meta.firstNight } : {}), ...(meta.otherNight ? { otherNight: meta.otherNight } : {}) };
}
export function exportScript(script) {
  if (script?.kind !== 'custom') fail('只能导出自定义剧本');
  const meta = { id: '_meta', name: script.name, author: script.author };
  for (const key of ['firstNight', 'otherNight']) if (script[key]) meta[key] = script[key].slice();
  return [meta, ...script.chars.map(id => {
    const c = script.characters[id];
    return c.custom ? { id, name: c.zh, team: c.team, ability: c.gist, firstNight: c.fn, otherNight: c.on,
      firstNightReminder: c.stF, otherNightReminder: c.stO, reminders: c.rem.slice(), setup: c.setup, jinxes: copy(c.jinxes || []) } : id;
  })];
}
export function copyEdition(ed) {
  if (!Object.hasOwn(EDITIONS, ed)) fail('内置剧本不存在');
  return [{ id: '_meta', name: `${EDITIONS[ed].zh}（自定义）`, author: '' }, ...EDITIONS[ed].chars];
}
export const charactersOf = S => S?.ed === 'custom' ? (S.script?.characters || {}) : CHARS;
export const editionOf = S => S?.ed === 'custom' ? { zh: S.script?.name || '缺少剧本快照', en: S.script?.author || '自定义剧本 · 人工记录', chars: S.script?.chars || [] } : EDITIONS[S?.ed];
// Public definition whitelist: no narrator prompts or reminder definitions, even before play.
export function publicScript(script) {
  const characters = {};
  for (const id of script.chars) {
    const c = script.characters[id];
    characters[id] = { zh: c.zh, en: c.en, team: c.team, gist: c.gist, fn: c.fn, on: c.on, custom: !!c.custom, jinxes: copy(c.jinxes || []) };
  }
  const steps = Object.fromEntries(Object.entries(script.steps).map(([id, st]) => [id, { zh: st.zh, fn: st.fn, on: st.on }]));
  return { kind: 'custom', steps, name: script.name, author: script.author, chars: script.chars.slice(), characters,
    ...(script.firstNight ? { firstNight: script.firstNight.slice() } : {}), ...(script.otherNight ? { otherNight: script.otherNight.slice() } : {}) };
}
