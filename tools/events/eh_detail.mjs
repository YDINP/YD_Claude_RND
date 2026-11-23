// 이벤트하우스 상세(비회원 이용)에서 원문 링크·본문을 뽑는다. env IDS="fnum,fnum,..."
export default async (ctx) => {
  const ids = (process.env.IDS || '').split(',').filter(Boolean); const out = [];
  const p = await ctx.newPage(); p.on('dialog', d => d.dismiss().catch(() => {}));
  for (const id of ids) {
    try {
      await p.goto(`https://www.eventhouse.kr/site/fgo.php?fnum=${id}&go=2&ban=1&flogin_no=1`, { waitUntil: 'domcontentloaded', timeout: 30000 }); await p.waitForTimeout(2500);
      const g = p.getByText('비회원이용').first(); if (await g.count()) { await g.click().catch(() => {}); await p.waitForTimeout(4500); }
      const url = p.url();
      const txt = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
      const links = await p.evaluate(() => [...new Set([...document.querySelectorAll('a')].map(a => a.href).filter(h => /forms\.gle|docs\.google|naver\.me|form\.naver|smore|moaform|survey|tally|typeform|surveymonkey|forms\.office|bit\.ly|vo\.la|han\.gl/.test(h)))].slice(0, 5));
      const k = ['참여 방법', '참여방법', '이벤트 방법', '참여기간', '응모 방법'].map(w => txt.indexOf(w)).filter(i => i >= 0).sort((a, b) => a - b)[0] ?? 0;
      out.push(`## ${id} ${url.slice(0, 90)}\nLINKS ${links.join(' ')}\n${txt.slice(Math.max(0, k - 150), k + 700)}`);
    } catch (e) { out.push(`## ${id} ERR ${e.message.slice(0, 80)}`); }
  }
  await p.close(); return out.join('\n\n');
};
