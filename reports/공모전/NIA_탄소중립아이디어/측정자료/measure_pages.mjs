import { createRequire } from 'node:module';
import { readdirSync, existsSync, writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
const req = createRequire('D:/park/YD_Claude_RND/tools/agent-browser/x.js');
let pw; try { pw = req('playwright-core'); } catch { const base = join(process.env.LOCALAPPDATA,'npm-cache','_npx'); for (const d of readdirSync(base)) { const p=join(base,d,'node_modules','playwright-core'); if (existsSync(p)) { pw=req(p); break; } } }
const [sitesFile, outFile, ud] = process.argv.slice(2);
const sites = readFileSync(sitesFile,'utf8').split(/\s+/).filter(Boolean);
const ctx = await pw.chromium.launchPersistentContext(ud, { executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true, viewport:{width:1366,height:900}, ignoreHTTPSErrors:true });
const results=[];
for (const site of sites) {
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  const reqs = new Map();
  cdp.on('Network.responseReceived', e => { const h={}; for (const [k,v] of Object.entries(e.response.headers)) h[k.toLowerCase()]=v; reqs.set(e.requestId,{url:e.response.url,type:e.type,mime:e.response.mimeType,h,bytes:0,decoded:0}); });
  cdp.on('Network.dataReceived', e => { const r=reqs.get(e.requestId); if(r) r.decoded+=e.dataLength; });
  cdp.on('Network.loadingFinished', e => { const r=reqs.get(e.requestId); if(r) r.bytes=e.encodedDataLength; });
  let err=null, final='';
  try { await page.goto('https://'+site+'/', {waitUntil:'load', timeout:45000}); await page.waitForTimeout(4000); final=page.url(); } catch(e){ err=String(e).slice(0,100); final=page.url(); }
  const all=[...reqs.values()];
  const isText = r => /text\/(html|css|javascript)|application\/(javascript|x-javascript|json)|image\/svg/.test(r.mime);
  const isImg = r => r.type==='Image' || /^image\//.test(r.mime) && !/svg/.test(r.mime);
  const text=all.filter(r=>isText(r) && r.decoded>1400);
  const img=all.filter(isImg);
  const maxAge = r => { const m=/max-age=(\d+)/.exec(r.h['cache-control']||''); return m?+m[1]:0; };
  const sameOriginStatic = all.filter(r=>/\.(css|js|png|jpe?g|gif|webp|svg|woff2?)(\?|$)/i.test(r.url));
  results.push({ site, final, err, n:all.length,
    total_bytes: all.reduce((a,r)=>a+r.bytes,0),
    text_n:text.length, text_uncompressed:text.filter(r=>!r.h['content-encoding']).length,
    text_bytes:text.reduce((a,r)=>a+r.bytes,0), text_uncomp_bytes:text.filter(r=>!r.h['content-encoding']).reduce((a,r)=>a+r.bytes,0),
    img_n:img.length, img_bytes:img.reduce((a,r)=>a+r.bytes,0),
    img_modern:img.filter(r=>/webp|avif/.test(r.mime)).length,
    img_over_300k: img.filter(r=>r.bytes>300000).length,
    static_n:sameOriginStatic.length, static_no_cache_day: sameOriginStatic.filter(r=>maxAge(r)<86400 && !r.h['expires']).length,
    server: (all[0]?.h?.server)||'' });
  console.log(JSON.stringify(results.at(-1)));
  await page.close();
}
await ctx.close();
writeFileSync(outFile, JSON.stringify(results,null,1));
