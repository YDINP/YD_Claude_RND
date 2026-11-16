// info.json 의 항목을 순서대로 #유용정보 에 한 글에 하나씩 올리고, 맨 위 고정 목차를 갱신한다.
// 사용: node post-info.mjs [--n 5] [--dry-run] [--remind]
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
function embedOf(it) {
  const fields = [
    { name: '💰 이득', value: it.gain },
    { name: '🙋 대상', value: it.who },
    { name: '📝 할 일', value: it.how },
    { name: '⏰ 기한', value: it.deadline },
  ];
  if (it.note) fields.push({ name: '⚠️ 알아 둘 것', value: it.note });
  if (it.links?.length) fields.push({ name: '🔗 출처', value: it.links.map(([t, u]) => `[${t}](${u})`).join(' · ') });
  return {
    title: `${it.emoji} ${it.title}`,
    color: COLOR[it.tags.find((t) => COLOR[t])] ?? 0x8d8d8d,
    fields,
    footer: { text: it.tags.map((t) => `#${t}`).join('  ') },
  };
}

async function refreshIndex() {
  const done = items.filter((it) => state.posted[`info:${it.id}`]);
  const guild = (await api('GET', `/channels/${ch}`)).guild_id;
  const lines = done.map((it) => `${it.emoji} [${it.title}](https://discord.com/channels/${guild}/${ch}/${state.posted[`info:${it.id}`]})`);
  const embed = {
    title: '📌 유용정보 목차',
    description: (lines.join('\n') || '아직 없음') + '\n\n지역 상관없이 누구나 챙길 수 있는 것만 올립니다. 한 글에 하나씩, 출처 링크를 붙입니다.',
    color: 0x3b82f6,
  };
  if (state.indexMsg) {
    await api('PATCH', `/channels/${ch}/messages/${state.indexMsg}`, { embeds: [embed] });
  } else {
    const m = await api('POST', `/channels/${ch}/messages`, { embeds: [embed] });
    await api('PUT', `/channels/${ch}/pins/${m.id}`);
    state.indexMsg = m.id;
  }
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
