const r=require('D:/cache/npm-cache/_npx/d3dffeb053155d07/node_modules/k-skill-rhwp');
const fs=require('fs');
(async()=>{ const f=process.argv[2], pre=process.argv[3];
 const doc=await r.loadDocument(f); const n=doc.pageCount(); console.log('pages',n);
 for(let i=0;i<n;i++){ fs.writeFileSync(`${pre}_p${i+1}.svg`, doc.renderPageSvg(i)); }
})().catch(e=>console.error('ERR',e.stack||e));
