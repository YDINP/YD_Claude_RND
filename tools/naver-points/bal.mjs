// 네이버페이 포인트 잔액만 확인한다. 사용: node ../agent-browser/cdp-run.mjs 9301 bal.mjs
export default async (ctx) => {
  const p = await ctx.newPage();
  await p.goto('https://new-m.pay.naver.com/pointshistory', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(4000);
  const h = (await p.evaluate(() => document.body.innerText)).replace(/\n+/g, ' / '); await p.close();
  const a = h.indexOf('내 포인트'); return h.slice(a + 8, a + 18);
};
