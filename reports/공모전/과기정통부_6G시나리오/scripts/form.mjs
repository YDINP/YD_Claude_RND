export default async (ctx) => {
  const p = await ctx.newPage();
  const res = {};
  try {
    await p.goto('https://6gvisionfest.org/6gsangsangpeulleoseu2', {waitUntil:'networkidle', timeout:60000}).catch(()=>{});
    await p.waitForTimeout(5000);
    for (let i=0;i<8;i++){ await p.mouse.wheel(0,1500).catch(()=>{}); await p.waitForTimeout(700);} // page scroll inside page only
    res.frames = p.frames().map(f=>f.url());
    res.byFrame = [];
    for (const f of p.frames()) {
      try {
        const r = await f.evaluate(()=>{
          const els=[...document.querySelectorAll('input,textarea,select,[role=textbox],label,[data-testid]')];
          return {text: document.body? document.body.innerText.slice(0,15000):'',
            fields: [...document.querySelectorAll('input,textarea,select')].map(e=>({tag:e.tagName,type:e.type,name:e.name,ph:e.placeholder,aria:e.getAttribute('aria-label'),max:e.maxLength,req:e.required,id:e.id}))};
        });
        res.byFrame.push({u:f.url(), ...r});
      } catch(e){ res.byFrame.push({u:f.url(), err:String(e)}); }
    }
  } finally { await p.close(); }
  return res;
};
