export default async (ctx) => {
  const urls = (process.env.URLS||'').split('|');
  const out = [];
  for (const u of urls) {
    const p = await ctx.newPage();
    try {
      await p.goto(u, {waitUntil:'networkidle', timeout:45000}).catch(()=>{});
      await p.waitForTimeout(2500);
      const text = await p.evaluate(()=>document.body.innerText);
      const links = await p.evaluate(()=>[...document.querySelectorAll('a,button')].map(a=>({t:(a.innerText||'').trim().slice(0,40),h:a.href||''})).filter(x=>x.t||x.h).slice(0,300));
      const imgs = await p.evaluate(()=>[...document.querySelectorAll('img')].map(i=>i.src).filter(s=>s).slice(0,60));
      out.push({u, final:p.url(), text:text.slice(0,20000), links, imgs});
    } finally { await p.close(); }
  }
  return out;
};
