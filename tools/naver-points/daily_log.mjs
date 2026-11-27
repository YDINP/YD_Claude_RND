import fs from 'node:fs';
const m17 = async () => 'skip';
const B = 'https://point.pay.naver.com/pc/mission-detail?';
const IDS_OLD = ['130133_261101_tjsxor_1200','cr_2026111204_2611_02_1428','cr_20261112_2611_1454','pointdraw_benefit_261112','pointdraw_appstore_261112','pointdraw_overseastrip_261112'];
async function bal(ctx) { const p = await ctx.newPage(); await p.goto('https://new-m.pay.naver.com/pointshistory', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(4000); const h = (await p.evaluate(() => document.body.innerText)).replace(/\n+/g,' / '); await p.close(); const a = h.indexOf('내 포인트'); return h.slice(a+8, a+18); }
async function claim(pg) {
  await pg.waitForLoadState('domcontentloaded').catch(()=>{}); await pg.waitForTimeout(3000);
  const t0 = (await pg.evaluate(() => document.body.innerText).catch(()=>'')).replace(/\s+/g,' ').slice(0, 45);
  const b = pg.getByText('포인트 받기').first();
  if (await b.count().catch(()=>0)) { const pp = pg.context().waitForEvent('page', { timeout: 8000 }).catch(() => null); await b.click({ timeout: 5000 }).catch(()=>{}); const p2 = await pp; await pg.waitForTimeout(8000); if (p2) await p2.close().catch(()=>{}); return 'btn ' + t0; }
  await pg.waitForTimeout(5000); return 'visit ' + t0.slice(0, 35);
}
async function clickAll(ctx, u, re, out, tag, max = 20) {
  const pg = await ctx.newPage(); pg.on('dialog', d => d.dismiss().catch(()=>{}));
  try {
    await pg.goto(u, { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(5000);
    const cands = await pg.locator('a,button').evaluateAll((es, s) => { const r = new RegExp(s); return es.map((e,i)=>[i,(e.innerText||'').replace(/\s+/g,' ').trim()]).filter(([i,t]) => r.test(t) && t.length < 90 && !/동의|알림|가입|개설|구매확정|오른쪽|쇼핑하고/.test(t)); }, re.source);
    out.push(tag + ' cands ' + cands.length);
    for (const [i, t] of cands.slice(0, max)) {
      try {
        const el = pg.locator('a,button').nth(i); await el.scrollIntoViewIfNeeded({ timeout: 3000 });
        const popP = ctx.waitForEvent('page', { timeout: 6000 }).catch(() => null);
        await el.click({ timeout: 5000 }); const pop = await popP;
        const r = pop ? await claim(pop) : (await pg.waitForTimeout(5000), 'same ' + pg.url().slice(0, 40));
        if (pop) await pop.close().catch(()=>{});
        out.push(' ' + t.slice(0, 28) + ' :: ' + r);
        if (pg.url() !== u) { await pg.goto(u, { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(4000); }
      } catch (e) { out.push(' ERR ' + t.slice(0, 28)); }
    }
  } finally { await pg.close().catch(()=>{}); }
}
async function todayIds(ctx, out) {
  const d = new Date(Date.now() + 9*3600e3).toISOString().slice(0, 10);
  const p = await ctx.newPage();
  await p.goto('https://damoang.net/economy', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(4000);
  const row = (await p.$$eval('a', as => as.map(a => [a.innerText.trim(), a.href]))).find(x => x[0].includes(d + ' 네이버페이'));
  let ids = [];
  if (row) { await p.goto(row[1], { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(4000);
    const t = await p.evaluate(() => document.body.innerText);
    ids = [...new Set([...t.matchAll(/click-point\/\?eventId=([A-Za-z0-9_]+)/g)].map(m => m[1]))];
    const adi = [...new Set([...t.matchAll(/adison\.co\/u\/naverpay\/ads\/(\d+)/g)].map(m => m[1]))];
    out.push('post ' + row[0].replace(/\s+/g,' ').slice(0, 60) + ' | ids ' + ids.length + ' | adison ' + adi.join(','));
  } else out.push('no post for ' + d);
  await p.close(); return ids;
}
// 다모앙 말고도 퀘이사존·뽐뿌·루리웹의 최근 [네이버페이] 적립 글에서 클릭 적립 링크(eventId)를 더 모은다.
// 결제·구매 조건 글은 제목으로 거르고, 링크는 campaign2 click-point 만 쓴다(naver.me 단축 링크는 click-point 로 풀릴 때만).
const KW = encodeURIComponent('네이버페이');
const EXTRA = [
  ['quasar', 'https://quasarzone.com/bbs/qb_saleinfo?kind=subject&keyword=' + KW, /quasarzone\.com\/bbs\/qb_saleinfo\/views\/\d+/],
  ['ppomppu', 'https://www.ppomppu.co.kr/zboard/zboard.php?id=coupon&search_type=subject&keyword=' + KW, /ppomppu\.co\.kr\/zboard\/view\.php\?id=coupon.*no=\d+/],
  ['ruliweb', 'https://bbs.ruliweb.com/market/board/1020?search_type=subject&search_key=' + KW, /ruliweb\.com\/market\/board\/1020\/read\/\d+/],
];
const POST_OK = /네이버페이.*(적립|받으세요|\d+원)/;
const POST_NO = /결제|구매|%|가입|개설|대출|카드 발급/;
const ID_RE = /click-point\/?\?eventId=([A-Za-z0-9_]+)/g;
async function shortToId(u) {
  try { const r = await fetch(u, { redirect: 'manual' }); const loc = r.headers.get('location') || ''; const m = loc.match(/click-point\/?\?eventId=([A-Za-z0-9_]+)/); return m ? m[1] : null; } catch { return null; }
}
async function extraIds(ctx, out, have, perSite = 6) {
  const found = new Set();
  for (const [tag, list, postRe] of EXTRA) {
    const p = await ctx.newPage(); let n = 0;
    try {
      await p.goto(list, { waitUntil: 'domcontentloaded', timeout: 30000 }); await p.waitForTimeout(3500);
      const rows = await p.$$eval('a', as => as.map(a => [a.innerText.trim().replace(/\s+/g, ' '), a.href]));
      const seen = new Set(); const posts = [];
      for (const [t, h] of rows) { const k = (h.match(/no=\d+|views\/\d+|read\/\d+/) || [h])[0]; if (postRe.test(h) && POST_OK.test(t) && !POST_NO.test(t) && t.length < 90 && !seen.has(k)) { seen.add(k); posts.push(h); } }
      for (const h of posts.slice(0, perSite)) {
        await p.goto(h, { waitUntil: 'domcontentloaded', timeout: 30000 }); await p.waitForTimeout(2500);
        const blob = await p.evaluate(() => document.body.innerText + '\n' + [...document.querySelectorAll('a')].map(a => a.href).join('\n'));
        for (const m of blob.matchAll(ID_RE)) if (!/xxx/i.test(m[1]) && !have.has(m[1]) && !found.has(m[1])) { found.add(m[1]); n++; }
        for (const s of new Set(blob.match(/https?:\/\/naver\.me\/[A-Za-z0-9]+/g) || [])) { const id = await shortToId(s); if (id && !have.has(id) && !found.has(id)) { found.add(id); n++; } }
      }
      out.push('extra ' + tag + ' posts ' + Math.min(posts.length, perSite) + ' | new ids ' + n);
    } catch (e) { out.push('extra ' + tag + ' ERR ' + String(e.message || e).slice(0, 60)); }
    await p.close().catch(() => {});
  }
  return [...found];
}
export default async (ctx) => {
  const out = []; const LOG = process.env.DLOG; out.push = (...a) => { for (const x of a) fs.appendFileSync(LOG, x + String.fromCharCode(10)); return Array.prototype.push.apply(out, a); }; out.push('start ' + await bal(ctx));
  if (out[0].includes('로그인') || out[0].includes(' / 네이버')) return out;
  const IDS = await todayIds(ctx, out);
  IDS.push(...await extraIds(ctx, out, new Set(IDS)));
  for (const id of IDS) { const pg = await ctx.newPage(); pg.on('dialog', d => d.accept().catch(()=>{})); try { await pg.goto('https://campaign2.naver.com/npay/v2/click-point/?eventId=' + id, { waitUntil: 'domcontentloaded' }); out.push(id + ' :: ' + await claim(pg)); } catch (e) { out.push(id + ' ERR'); } await pg.close().catch(()=>{}); }
  out.push('after links ' + await bal(ctx));
  await clickAll(ctx, 'https://mycar.naver.com/?from=push1', /클릭.*\?원|\?원.*클릭/, out, 'mycar', 6);
  await clickAll(ctx, 'https://insurance.pay.naver.com/?inflow=point_category', /\?원/, out, 'ins', 3);
  await clickAll(ctx, 'https://point.pay.naver.com/main?category=quickreward', /N 클릭/, out, 'quick', 20);
  await clickAll(ctx, B+'dataType=module&rank=7&pageKey=pensionmission&rankType=RANDOM_DAILY&sortCompletedAdToLast=false&mssCode=pensionmission', /자산운용.*확인하기|확인하기.*자산운용/, out, 'pension', 3);
  for (const k of ['dataType=placement&rank=5&pageKey=benefit_group_wts&rankType=RANDOM_DAILY&sortCompletedAdToLast=false&mssCode=stock','dataType=category&rank=9&pageKey=car&rankType=DESC&sortCompletedAdToLast=false&mssCode=cartest','dataType=placement&rank=15&pageKey=benefit_group_pp10&rankType=RANDOM&sortCompletedAdToLast=false&mssCode=pp10','dataType=module&rank=10&pageKey=carmission&rankType=DESC&sortCompletedAdToLast=false&mssCode=carmission','dataType=category&rank=11&pageKey=life&rankType=DESC&sortCompletedAdToLast=false&mssCode=life','dataType=category&rank=25&pageKey=all&rankType=DESC&sortCompletedAdToLast=false&mssCode=all'])
    await clickAll(ctx, B + k, /^클릭 \d+원/, out, k.split('mssCode=')[1], 40);
  out.push('after missions ' + await bal(ctx));
  out.push('live ' + JSON.stringify(await m17(ctx).catch(e => String(e).slice(0, 80))));
  out.push('end ' + await bal(ctx));
  return out;
};export { bal, claim, todayIds, extraIds };
