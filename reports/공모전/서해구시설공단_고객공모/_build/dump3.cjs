const r=require('D:/cache/npm-cache/_npx/d3dffeb053155d07/node_modules/k-skill-rhwp');
(async()=>{
 const doc=await r.loadDocument(process.argv[2]);const P=+process.argv[3];
 for(const c of [1,2]){const n=doc.getCellParagraphCount(0,P,0,c);
  for(let i=0;i<n;i++)console.log(c,i,JSON.stringify(doc.getTextInCell(0,P,0,c,i,0,doc.getCellParagraphLength(0,P,0,c,i))).slice(0,200));}
 for(const c of [2,5,7,12]){}
})();
