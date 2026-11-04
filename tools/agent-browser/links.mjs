export default async (ctx) => {
  const pg = await ctx.newPage();
  try { await pg.goto(process.env.URL, { timeout: 30000 }); await pg.waitForTimeout(2000);
    const html = await pg.content(); const l = new Set();
    for (const m of html.matchAll(/href="(\/menu\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) l.add(m[1] + ' ' + m[2].replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim());
    return [...l];
  } finally { await pg.close(); }
};
