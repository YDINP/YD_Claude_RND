// 의정부도시공사 공고 읽기 + 첨부 다운로드
export default async (ctx) => {
  const pg = await ctx.newPage();
  const out = process.env.OUT_DIR;
  try {
    await pg.goto(process.env.URL, { timeout: 30000 });
    await pg.waitForTimeout(2500);
    const t = await pg.evaluate('document.body.innerText');
    const html = await pg.content();
    const links = [];
    for (const m of html.matchAll(/<a[^>]*?(href|onclick)="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const h = m[2].replace(/&amp;/g, '&');
      if (/file|down|atch|hwp|pdf/i.test(h + m[3])) links.push([h, m[3].replace(/<[^>]+>/g,'').trim()]);
    }
    const files = [];
    if (out) {
      const loc = pg.getByText('다운로드', { exact: true });
      const n = await loc.count();
      for (let i = 0; i < n; i++) {
        try {
          const [d] = await Promise.all([pg.waitForEvent('download', { timeout: 15000 }), loc.nth(i).click()]);
          const p = out + '/' + d.suggestedFilename();
          const r = await pg.request.get(d.url());
          (await import('node:fs')).writeFileSync(p, await r.body()); files.push(p + ' ' + d.url());
        } catch (e) { files.push('ERR ' + e.message.slice(0, 100)); }
      }
    }
    const i = t.indexOf('AI');
    return { url: pg.url(), body: t.slice(Math.max(0, i - 500), i + 5000), links, files };
  } finally { await pg.close(); }
};
