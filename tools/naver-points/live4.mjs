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
export default async (ctx) => {
  const out = ['start ' + await bal(ctx)];
  const p = await ctx.newPage(); p.on('dialog', d => d.dismiss().catch(()=>{}));
  await p.goto('https://point.pay.naver.com/pc/main', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(5000);
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 2500); await p.waitForTimeout(600); }
  const href = await p.$$eval('a', as => (as.find(a => /쇼핑라이브 보고/.test(a.innerText)) || {}).href);
  await p.goto(href, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(8000);
  const base = p.url();
  for (let k = 0; k < 25; k++) {
    const n = await p.evaluate(() => { const els=[...document.querySelectorAll('a,button,li,div')].filter(e => /^1원/.test((e.innerText||'').trim()) && !e.dataset.done && e.querySelectorAll('a,button').length<=1 && (e.innerText||'').length<120); return els.length; });
    if (!n) break;
    const t = await p.evaluate(() => { const e=[...document.querySelectorAll('a,button,li,div')].filter(e => /^1원/.test((e.innerText||'').trim()) && !e.dataset.done && e.querySelectorAll('a,button').length<=1 && (e.innerText||'').length<120).pop(); e.dataset.done='1'; window.__t=e; return (e.innerText||'').replace(/\s+/g,' ').slice(0,50); });
    const pp = ctx.waitForEvent('page', { timeout: 6000 }).catch(()=>null);
    await p.evaluate(() => { const e=window.__t; (e.closest('a,button')||e.querySelector('a,button')||e).click(); });
    const pop = await pp; await p.waitForTimeout(pop ? 12000 : 4000);
    if (pop) await pop.close().catch(()=>{});
    out.push(' ' + t + (pop ? ' :: pop' : ' :: ' + p.url().slice(0,40)));
    if (p.url() !== base) { await p.goto(base, { waitUntil: 'domcontentloaded' }).catch(()=>{}); await p.waitForTimeout(6000); }
  }
  await p.close();
  out.push('end ' + await bal(ctx)); return out;
};
