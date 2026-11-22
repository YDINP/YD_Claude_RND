// 쇼핑 이벤트 페이지에서 BRAND 근처 알림받기 버튼을 찾는다. GO=1 이면 누른다
export default async (ctx) => {
  const U = process.env.URL || 'https://shopping.naver.com/event/6acc26b714c78778b15b2eb7'; const BRAND = process.env.BRAND || '신일'; const out = [];
  const p = await ctx.newPage(); p.on('dialog', d => { out.push('DIALOG ' + d.message().slice(0, 80)); d.dismiss().catch(() => {}); });
  await p.goto(U, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(5000);
  for (let i = 0; i < 15; i++) { await p.mouse.wheel(0, 2500); await p.waitForTimeout(500); }
  const find = () => p.evaluate(B => { const r = []; document.querySelectorAll('button,a').forEach((e, i) => { const t = (e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(); if (!/알림/.test(t)) return; let box = e; for (let k = 0; k < 5 && box.parentElement; k++) box = box.parentElement; const ctxT = box.innerText.replace(/\s+/g, ' ').slice(0, 120); if (ctxT.includes(B) || t.includes(B)) { e.dataset.hit = '1'; r.push(t.slice(0, 30) + ' [pressed=' + e.getAttribute('aria-pressed') + '] ctx=' + ctxT); } }); return r; }, BRAND);
  const hits = await find(); out.push('HITS ' + hits.length, ...hits.slice(0, 5));
  out.push('BRANDCOUNT ' + await p.evaluate(B => (document.body.innerText.match(new RegExp(B, 'g')) || []).length, BRAND));
  if (process.env.GO === '1' && hits.length) { const b = p.locator('[data-hit="1"]').first(); await b.scrollIntoViewIfNeeded(); await b.click(); await p.waitForTimeout(4000); out.push('pressed', ...(await find()).slice(0, 3)); }
  await p.close(); return out;
};
