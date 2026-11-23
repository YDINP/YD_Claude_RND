// koreaaiart.com 공고 읽기: 첫 화면 텍스트와 링크, 공고/접수 관련 하위 페이지 텍스트
export default async (ctx) => {
  const p = await ctx.newPage(); const out = {};
  await p.goto(process.env.URL || 'https://koreaaiart.com', { waitUntil: 'domcontentloaded', timeout: 45000 }); await p.waitForTimeout(5000);
  out.url = p.url(); out.text = (await p.evaluate(() => document.body.innerText)).slice(0, 6000);
  out.links = await p.evaluate(() => [...new Set([...document.querySelectorAll('a')].map(a => (a.innerText.trim().slice(0, 30) + ' => ' + a.href)).filter(x => !/javascript:|#$/.test(x)))].slice(0, 80));
  out.imgs = await p.evaluate(() => [...document.querySelectorAll('img')].map(i => i.src).filter(s => !/logo|icon/.test(s)).slice(0, 20));
  await p.close(); return out;
};
