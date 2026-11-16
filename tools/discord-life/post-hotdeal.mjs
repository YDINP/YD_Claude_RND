// reports/핫딜_TOP50_YYYYMMDD.md 의 표에서 상위 30개를 #핫딜 에 카드 3장(10개씩)으로 올린다.
// 사용: node post-hotdeal.mjs [YYYYMMDD] [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { api, HERE, loadState, saveState } from './lib.mjs';

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const kst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
const day = args.find((a) => /^\d{8}$/.test(a)) ?? kst;
const file = path.join(HERE, '..', '..', 'reports', `핫딜_TOP50_${day}.md`);
if (!fs.existsSync(file)) { console.error('없음:', file); process.exit(1); }

const md = fs.readFileSync(file, 'utf8');
const body = md.slice(md.indexOf('## TOP 50'));
const rows = body.split(/\r?\n/).filter((l) => /^\|\s*\d+\s*\|/.test(l)).map((l) => {
  const c = l.split('|').slice(1, -1).map((s) => s.trim());
  return { rank: +c[0], name: c[1], price: c[2], shop: c[3], url: c[5] };
}).sort((a, b) => a.rank - b.rank).slice(0, 30);
if (rows.length < 30) console.warn(`주의: ${rows.length}개만 읽힘`);

const esc = (s) => s.replace(/([*_~`|\[\]])/g, '\$1');
const line = (r) => `**${r.rank}.** ${esc(r.name)}\n　${esc(r.price)} · ${esc(r.shop)} · [원글](${r.url})`;
const d = `${day.slice(4, 6)}/${day.slice(6, 8)}`;
const colors = [0xff6b35, 0xf7a325, 0xf2c94c];
const embeds = [0, 1, 2].map((i) => ({
  title: i === 0 ? `🔥 ${d} 핫딜 TOP30` : undefined,
  description: rows.slice(i * 10, i * 10 + 10).map(line).join('\n'),
  color: colors[i],
  footer: i === 2 ? { text: '커뮤니티 추천순 · 가격·재고는 금방 바뀌니 원글에서 확인하세요' } : undefined,
})).filter((e) => e.description);

const total = embeds.reduce((n, e) => n + (e.title?.length ?? 0) + e.description.length + (e.footer?.text.length ?? 0), 0);
console.log(`${day}: ${rows.length}개, 카드 ${embeds.length}장, 글자 ${total}/6000`);
if (dry) { console.log(embeds.map((e) => e.description).join('\n---\n').slice(0, 1500)); process.exit(0); }

const state = loadState();
const key = `hotdeal:${day}`;
if (state.posted[key]) { console.log('이미 올림:', key); process.exit(0); }
const msg = await api('POST', `/channels/${state.channels.hotdeal}/messages`, { embeds, allowed_mentions: { parse: [] } });
state.posted[key] = msg.id;
saveState(state);
console.log('게시 완료', msg.id);
