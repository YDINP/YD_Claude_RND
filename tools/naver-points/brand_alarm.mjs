// 브랜드스토어의 알림받기 버튼 상태를 본다. GO=1 이면 꺼져 있을 때 누른다. env: STORE(기본 https://brand.naver.com/shinil)
export default async (ctx) => {
  const STORE = process.env.STORE || 'https://brand.naver.com/shinil'; const out = [];
  const p = await ctx.newPage(); p.on('dialog', d => { out.push('DIALOG ' + d.message().slice(0, 80)); d.dismiss().catch(() => {}); });
  await p.goto(STORE, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(6000);
  const st = async () => p.evaluate(() => [...document.querySelectorAll('button,a')].filter(e => e.offsetParent && /알림/.test(e.innerText + (e.getAttribute('aria-label') || ''))).map(e => (e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 30) + ' [pressed=' + e.getAttribute('aria-pressed') + ']').join(' | '));
  out.push('URL ' + p.url().slice(0, 80), 'TITLE ' + (await p.title()).slice(0, 60), 'ALARM ' + await st());
  if (process.env.GO === '1') {
    const b = p.locator('button:visible').filter({ hasText: /알림받기/ }).first();
    if (await b.count() && (await b.getAttribute('aria-pressed')) !== 'true') { await b.click(); await p.waitForTimeout(4000); out.push('pressed', 'ALARM ' + await st(), 'BODYTOP ' + (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 200)); }
    else out.push('skip (no button or already on)');
  }
  await p.close(); return out;
};
