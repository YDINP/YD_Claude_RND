// 구글폼 전체 문항을 FB_PUBLIC_LOAD_DATA_ 에서 읽는다 (입력·제출 없음)
export default async (ctx) => {
  const p = await ctx.newPage(); await p.goto(process.env.URL, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3000);
  const r = await p.evaluate(() => { const d = window.FB_PUBLIC_LOAD_DATA_; if (!d) return ['no data'];
    const out = [(d[1][8] || '') + ' / ' + (d[1][0] || '').slice(0, 300).replace(/\s+/g, ' ')];
    for (const q of d[1][1]) { const t = q[1] || ''; const type = q[3]; const opts = (q[4] && q[4][0] && q[4][0][1]) ? q[4][0][1].map(o => o[0]).join('/') : ''; const req = q[4] && q[4][0] ? q[4][0][2] : '';
      out.push(`[${type}${req ? '*' : ''}] ${t.replace(/\s+/g, ' ').slice(0, 110)}${opts ? ' {' + opts.slice(0, 150) + '}' : ''}`); }
    return out; });
  await p.close(); return r.join('\n');
};
