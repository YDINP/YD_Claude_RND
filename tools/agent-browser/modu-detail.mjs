// 모두의 광장 공모 상세 읽기 (전용 크롬 CDP):
//   MODU_TITLE="제목 일부" MODU_PAGE=1 node cdp-run.mjs 9301 modu-detail.mjs
// 이 사이트는 전역 객체를 덮어써 page.evaluate(함수)가 깨지므로 innerText 문자열 평가 + page.content() 정규식만 쓴다.
export default async (ctx) => {
  const title = process.env.MODU_TITLE;
  const pno = process.env.MODU_PAGE || '1';
  const pg = await ctx.newPage();
  try {
    await pg.goto('https://modu.go.kr/front/epilogue/epilogueNewListPage.do?menu_id=527&miv_pageNo=' + pno, { timeout: 20000 });
    await pg.waitForTimeout(2000);
    await pg.getByText(title, { exact: false }).first().click();
    await pg.waitForTimeout(3000);
    const t = await pg.evaluate('document.body.innerText');
    const html = await pg.content();
    const re = /href="([^"]+)"/g;
    const links = [];
    for (const m of html.matchAll(re)) {
      const h = m[1].replace(/&amp;/g, '&');
      if (/form|naver\.me|forms\.gle|mailto|download|fileDown|atch/i.test(h)) links.push(h);
    }
    const i = t.indexOf('기관명');
    return { url: pg.url(), body: t.slice(Math.max(0, i - 200), i + 3500), links: [...new Set(links)] };
  } finally {
    await pg.close();
  }
};
