const r=require('D:/cache/npm-cache/_npx/d3dffeb053155d07/node_modules/k-skill-rhwp');
const fs=require('fs');
(async()=>{const doc=await r.loadDocument(process.argv[2]);const pre=process.argv[3];console.log('pages',doc.pageCount());
for(let i=0;i<doc.pageCount();i++){fs.writeFileSync(pre+i+'.svg',doc.renderPageSvg(i));}})();
