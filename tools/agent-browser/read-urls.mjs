// URLS="a|b|c" 의 각 페이지 본문 innerText 를 반환 (읽기 전용)
export default async (ctx) => {
  const pg = await ctx.newPage(); const res = {};
  try {
    for (const u of process.env.URLS.split('|')) {
      try { await pg.goto(u, { timeout: 30000 }); await pg.waitForTimeout(2000);
        const t = await pg.evaluate('document.body.innerText');
        const i = t.indexOf(process.env.ANCHOR || ''); res[u] = t.slice(Math.max(0,i), Math.max(0,i) + (+process.env.LEN || 4000));
      } catch (e) { res[u] = 'ERR ' + e.message.slice(0, 120); }
    }
    return res;
  } finally { await pg.close(); }
};
