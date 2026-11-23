// URL 을 열고 본문·iframe 안 텍스트와 입력 요소를 본다 (입력·제출 없음)
export default async (ctx) => {
  const p = await ctx.newPage(); await p.goto(process.env.URL, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(6000);
  const out = ['URL ' + p.url().slice(0, 100)];
  for (const f of p.frames()) { const t = await f.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 1500)).catch(() => ''); const ctl = await f.evaluate(() => [...document.querySelectorAll('input,select,textarea,button')].map(e => e.tagName + ':' + (e.type || '') + ':' + (e.name || e.id || '') + ':' + (e.value || e.innerText || '').slice(0, 20)).join(' | ').slice(0, 600)).catch(() => ''); if (t) out.push('FRAME ' + f.url().slice(0, 60) + '\n' + t + '\nCTL ' + ctl); }
  await p.close(); return out.join('\n');
};
