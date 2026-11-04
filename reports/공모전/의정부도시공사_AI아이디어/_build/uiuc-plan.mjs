export default async (ctx) => {
  const pg = await ctx.newPage(); const out = process.env.OUT_DIR; const files=[];
  try {
    await pg.goto(process.env.URL, { timeout: 30000 }); await pg.waitForTimeout(2000);
    await pg.getByText(process.env.CLICK, { exact: false }).first().click(); await pg.waitForTimeout(2500);
    const t = await pg.evaluate('document.body.innerText');
    const loc = pg.getByText('다운로드', { exact: true }); const n = await loc.count();
    for (let i = 0; i < n; i++) { try {
      const [d] = await Promise.all([pg.waitForEvent('download', { timeout: 15000 }), loc.nth(i).click()]);
      const p = out + '/' + d.suggestedFilename(); const r = await pg.request.get(d.url());
      (await import('node:fs')).writeFileSync(p, await r.body()); files.push(p);
    } catch (e) { files.push('ERR ' + e.message.slice(0, 100)); } }
    const i = t.indexOf('상세'); return { url: pg.url(), body: t.slice(i, i + 2500), files };
  } finally { await pg.close(); }
};
