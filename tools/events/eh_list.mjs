// 이벤트하우스 목록 1~3쪽에서 fnum 과 카드 문구를 뽑는다. env URL(기본 giftnum=5)
export default async (ctx) => {
  const U = process.env.URL || 'https://www.eventhouse.kr/site/index.php?giftnum=5';
  const p = await ctx.newPage(); const out = [];
  for (const pg of [1, 2, 3]) {
    await p.goto(U + '&page=' + pg, { waitUntil: 'domcontentloaded', timeout: 45000 }); await p.waitForTimeout(3000);
    out.push(...await p.evaluate(() => [...document.querySelectorAll('a[href*="fnum="]')].map(a => {
      const m = a.href.match(/fnum=(\d+)/); let box = a; for (let i = 0; i < 6 && (box.innerText || '').trim().length < 25 && box.parentElement; i++) box = box.parentElement;
      return { h: m ? m[1] : a.href, t: (box.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 220) };
    })));
  }
  await p.close(); const seen = new Set();
  return out.filter(x => !seen.has(x.h) && seen.add(x.h)).map(x => x.h + ' | ' + x.t).join('\n');
};
