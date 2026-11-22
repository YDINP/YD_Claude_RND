// 「포인트 쉽게 받기」의 브랜드스토어 알림받기 카드를 연다. GO=1 이면 알림받기 버튼까지 누른다.
// env: BRAND(카드 문구, 기본 신일전자), GO
export default async (ctx) => {
  const BRAND = process.env.BRAND || '신일전자'; const out = [];
  const bal = async () => { const q = await ctx.newPage(); await q.goto('https://new-m.pay.naver.com/pointshistory', { waitUntil: 'domcontentloaded' }); await q.waitForTimeout(4000); const h = (await q.evaluate(() => document.body.innerText)).replace(/\n+/g, ' / '); await q.close(); const a = h.indexOf('내 포인트'); return h.slice(a + 8, a + 18); };
  out.push('start ' + await bal());
  const p = await ctx.newPage(); p.on('dialog', d => { out.push('DIALOG ' + d.message().slice(0, 80)); d.dismiss().catch(() => {}); });
  await p.goto('https://point.pay.naver.com/pc/main', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(5000);
  const card = p.getByText(BRAND + ' 브랜드스토어 알림받기', { exact: false }).first();
  if (!(await card.count())) { out.push('NO CARD'); await p.close(); return out; }
  const pp = ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null);
  await card.scrollIntoViewIfNeeded().catch(() => {}); await card.click({ timeout: 8000 }).catch(e => out.push('click err ' + e.message.slice(0, 60)));
  let t = await pp; t = t || p; await t.waitForLoadState('domcontentloaded').catch(() => {}); await t.waitForTimeout(6000);
  const dump = async (tag) => out.push(tag + ' URL ' + t.url().slice(0, 90), tag + ' BODY ' + (await t.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 600),
    tag + ' BTN ' + (await t.evaluate(() => [...document.querySelectorAll('button,a[role=button]')].filter(e => e.offsetParent && /알림|받기|포인트/.test(e.innerText)).map(e => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 30) + (e.getAttribute('aria-pressed') ? '[' + e.getAttribute('aria-pressed') + ']' : '')).join(' | '))));
  await dump('A');
  if (process.env.GO === '1') {
    const b = t.locator('button:visible, a[role=button]:visible').filter({ hasText: /^\s*알림받기\s*$|알림 받기/ }).first();
    if (await b.count()) { await b.click(); await t.waitForTimeout(4000); out.push('pressed 알림받기'); await dump('B');
      const c = t.getByText('포인트 받기').first(); if (await c.count()) { await c.click().catch(() => {}); await t.waitForTimeout(5000); out.push('pressed 포인트 받기'); } }
    else out.push('NO 알림받기 BUTTON');
  }
  if (t !== p) await t.close().catch(() => {}); await p.close();
  out.push('end ' + await bal()); return out;
};
