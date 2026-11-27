// 아침 루틴 중 "정보글 링크 적립"만 따로 돌린다(다모앙 + 퀘이사존·뽐뿌·루리웹). 사용: DLOG=파일 node ../agent-browser/cdp-run.mjs 9301 links_only.mjs
import fs from 'node:fs';
import { bal, claim, todayIds, extraIds } from './daily_log.mjs';
export default async (ctx) => {
  const out = []; const LOG = process.env.DLOG || 'links_only.log';
  out.push = (...a) => { for (const x of a) fs.appendFileSync(LOG, x + '\n'); return Array.prototype.push.apply(out, a); };
  out.push('start ' + await bal(ctx));
  const IDS = await todayIds(ctx, out);
  const extra = await extraIds(ctx, out, new Set(IDS));
  for (const id of extra) { const pg = await ctx.newPage(); pg.on('dialog', d => d.accept().catch(() => {})); try { await pg.goto('https://campaign2.naver.com/npay/v2/click-point/?eventId=' + id, { waitUntil: 'domcontentloaded' }); out.push(id + ' :: ' + await claim(pg)); } catch { out.push(id + ' ERR'); } await pg.close().catch(() => {}); }
  out.push('end ' + await bal(ctx));
  return out.filter(x => /^(start|end|extra|post|no post)/.test(x));
};
