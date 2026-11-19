const r=require('D:/cache/npm-cache/_npx/d3dffeb053155d07/node_modules/k-skill-rhwp');
(async()=>{
 const doc=await r.loadDocument(process.argv[2]);
 console.log('pages',doc.pageCount(),'paras',doc.getParagraphCount(0));
 for(let p=0;p<doc.getParagraphCount(0);p++){
  console.log('P',p,JSON.stringify(doc.getTextRange?doc.getTextRange(0,p,0,doc.getParagraphLength(0,p)):''));
  for(let k=0;k<6;k++){
   let dim; try{dim=doc.getTableDimensions(0,p,k);}catch(e){continue}
   if(!dim) continue; console.log(' table',p,k,dim);
   for(let c=0;c<40;c++){
    try{const n=doc.getCellParagraphCount(0,p,k,c);let t=[];for(let i=0;i<n;i++){t.push(doc.getTextInCell(0,p,k,c,i,0,doc.getCellParagraphLength(0,p,k,c,i)))}
     console.log('  c',c,JSON.stringify(t).slice(0,150));}catch(e){break}
   }
  }
 }
})().catch(e=>console.error(e));
