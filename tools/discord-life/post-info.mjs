// info.json 의 항목을 순서대로 #유용정보 에 한 글에 하나씩 올리고, 맨 위 고정 목차를 갱신한다.
// 사용: node post-info.mjs [--n 5] [--dry-run] [--remind] [--index]
//   --remind : deadlineDate 3일 전인 항목을 한 번만 다시 알린다.
import fs from 'node:fs';
import path from 'node:path';
import { api, HERE, loadState, saveState } from './lib.mjs';

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const n = Number(args[args.indexOf('--n') + 1]) || 5;
const items = JSON.parse(fs.readFileSync(path.join(HERE, 'info.json'), 'utf8'));
const state = loadState();
const ch = state.channels.info;
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

const COLOR = { '마감 임박': 0xe5484d, 청년: 0x3e9b4f, '차 있으면': 0x6e56cf, 직장인: 0x0090ff, 누구나: 0x8d8d8d };
// "A → B → C" 한 줄짜리 절차는 번호 목록으로 바꿔 읽기 쉽게
function steps(how) {
  if (how.includes('\n') || !how.includes('→')) return how;
  const [first, ...rest] = how.split(/\.\s+(?=\S)/);
  const parts = first.split(/\s*→\s*/);
  return parts.map((p, i) => `**${i + 1}.** ${p}`).join('\n') + (rest.length ? `\n${rest.join('. ')}` : '');
}
function embedOf(it) {
  const urgent = it.tags.includes('마감 임박');
  const desc = [`## 💰 ${it.big}`, `⏰ **${it.due}**`];
  if (it.hook) desc.push('', `-# ${it.hook}`);
  const fields = [
    { name: '🙋 누가', value: it.who },
    { name: '📝 이렇게 하세요', value: steps(it.how).replace(/^• /gm, '▸ ') },
    { name: '💵 얼마나', value: it.gain },
  ];
  if (it.note) fields.push({ name: '⚠️ 꼭 알아 둘 것', value: `> ${it.note.replace(/\n/g, '\n> ')}` });
  if (it.links?.length) fields.push({ name: '🔗 출처', value: it.links.map(([t, u]) => `[${t}](${u})`).join(' · ') });
  return {
    author: urgent ? { name: `🚨 마감 임박 · ${it.deadline.split(/[.(]/)[0].trim()}` } : undefined,
    title: `${it.emoji} ${it.title}`,
    description: desc.join('\n'),
    color: COLOR[Object.keys(COLOR).find((t) => it.tags.includes(t))] ?? 0x8d8d8d,
    fields,
    footer: { text: it.tags.map((t) => `#${t}`).join('  ') },
  };
}

async function refreshIndex() {
  const done = items.filter((it) => state.posted[`info:${it.id}`]);
  const guild = (await api('GET', `/channels/${ch}`)).guild_id;
  const short = (t) => (t.length > 26 ? t.slice(0, 25) + '…' : t);
  const link = (it) => `${it.emoji} [${short(it.title)}](https://discord.com/channels/${guild}/${ch}/${state.posted[`info:${it.id}`]})`;
  const SECTIONS = [
    ['🚨 마감 임박', (it) => it.tags.includes('마감 임박')],
    ['🙌 누구나', (it) => it.tags.includes('누구나')],
    ['💼 직장인·청년', (it) => it.tags.includes('직장인') || it.tags.includes('청년')],
    ['🚗 차 있으면', (it) => it.tags.includes('차 있으면')],
  ];
  const used = new Set();
  const blocks = [];
  for (const [label, pick] of SECTIONS) {
    const list = done.filter((it) => !used.has(it.id) && pick(it));
    list.forEach((it) => used.add(it.id));
    if (list.length) blocks.push(`**${label}**\n${list.map(link).join('\n')}`);
  }
  // 디스코드 한도: embed 설명 4096자, 메시지 전체 6000자 → 블록을 여러 embed 로 나눈다
  const head = '-# 지역 상관없이 누구나 챙길 수 있는 것만 올려요. 한 글에 하나씩, 출처 링크 포함.';
  const parts = [head];
  for (const b of (blocks.length ? blocks : ['아직 없음'])) {
    for (const line of b.split('\n')) {
      if ((parts[parts.length - 1] + '\n' + line).length > 3900) parts.push(line);
      else parts[parts.length - 1] += (parts[parts.length - 1] === head ? '\n\n' : '\n') + line;
    }
    parts[parts.length - 1] += '\n';
  }
  const embeds = parts.map((d, k) => ({ ...(k === 0 ? { title: '📌 유용정보 목차' } : {}), description: d.trim(), color: 0x3b82f6 }));
  embeds[embeds.length - 1].footer = { text: `${done.length}개 · 새 글이 올라오면 여기도 갱신됩니다` };
  // 메시지 한 개는 embed 합계 6000자 한도 → 넘치면 목차를 여러 메시지(각각 고정)로 나눈다
  const size = (e) => e.description.length + (e.title || '').length + (e.footer?.text.length || 0);
  const msgs = [[]];
  for (const e of embeds) {
    const cur = msgs[msgs.length - 1];
    if (cur.length && cur.reduce((n, x) => n + size(x), 0) + size(e) > 5800) msgs.push([e]);
    else cur.push(e);
  }
  const ids = state.indexMsgs ?? (state.indexMsg ? [state.indexMsg] : []);
  for (let k = 0; k < msgs.length; k++) {
    if (ids[k]) {
      await api('PATCH', `/channels/${ch}/messages/${ids[k]}`, { embeds: msgs[k] });
    } else {
      const m = await api('POST', `/channels/${ch}/messages`, { embeds: msgs[k] });
      await api('PUT', `/channels/${ch}/pins/${m.id}`);
      ids[k] = m.id;
    }
  }
  state.indexMsgs = ids;
  state.indexMsg = ids[0];
}

if (args.includes('--index')) {   // 목차만 다시 그림
  if (!dry) { await refreshIndex(); saveState(state); }
  process.exit(0);
}

if (args.includes('--remind')) {
  for (const it of items) {
    if (!it.deadlineDate || !state.posted[`info:${it.id}`]) continue;
    const d = Math.round((new Date(it.deadlineDate) - new Date(today)) / 86400e3);
    const key = `remind:${it.id}`;
    if (d === 3 && !state.posted[key]) {
      const content = `⏰ **3일 남았어요** — ${it.emoji} ${it.title} (${it.deadlineDate.slice(5).replace('-', '/')} 마감)\nhttps://discord.com/channels/${(await api('GET', `/channels/${ch}`)).guild_id}/${ch}/${state.posted[`info:${it.id}`]}`;
      if (dry) { console.log(content); continue; }
      const m = await api('POST', `/channels/${ch}/messages`, { content, allowed_mentions: { parse: [] } });
      state.posted[key] = m.id;
      saveState(state);
    }
  }
  process.exit(0);
}

if (args.includes('--edit')) {   // 이미 올린 글을 지금 형식으로 다시 그림
  for (const it of items) {
    const id = state.posted[`info:${it.id}`];
    if (!id) continue;
    if (dry) { console.log(JSON.stringify(embedOf(it), null, 1).slice(0, 1200)); break; }
    await api('PATCH', `/channels/${ch}/messages/${id}`, { embeds: [embedOf(it)] });
    console.log('수정', it.id);
  }
  if (!dry) { await refreshIndex(); saveState(state); }
  process.exit(0);
}

const todo = items.filter((it) => !state.posted[`info:${it.id}`]).slice(0, n);
for (const it of todo) {
  const e = embedOf(it);
  if (dry) { console.log(JSON.stringify(e).length, e.title); continue; }
  const m = await api('POST', `/channels/${ch}/messages`, { embeds: [e], allowed_mentions: { parse: [] } });
  state.posted[`info:${it.id}`] = m.id;
  saveState(state);
  console.log('게시', it.id);
}
if (!dry && todo.length) { await refreshIndex(); saveState(state); }
console.log(`남은 항목 ${items.filter((it) => !state.posted[`info:${it.id}`]).length}개`);
