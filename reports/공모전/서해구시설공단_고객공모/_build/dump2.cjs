const r=require('D:/cache/npm-cache/_npx/d3dffeb053155d07/node_modules/k-skill-rhwp');
(async()=>{
 const doc=await r.loadDocument(process.argv[2]);
 const P=2, K=0;
 function nested(outerCells){
  for(const [cell,para] of outerCells){
   const base=[{controlIndex:K,cellIndex:cell,cellParaIndex:para}];
   for(let c=0;c<6;c++){
    try{const path=base.concat([{controlIndex:0,cellIndex:c,cellParaIndex:0}]);
     const n=doc.getCellParagraphCountByPath(0,P,JSON.stringify(path));
     const t=[];for(let i=0;i<n;i++){const pp=base.concat([{controlIndex:0,cellIndex:c,cellParaIndex:i}]);t.push(doc.getTextInCellByPath(0,P,JSON.stringify(pp),0,doc.getCellParagraphLengthByPath(0,P,JSON.stringify(pp))))}
     console.log(cell,para,'c',c,JSON.stringify(t))}catch(e){console.log(cell,para,c,'err',String(e).slice(0,80));break}
   }
  }
 }
 nested([[13,1],[14,1],[14,0],[13,0]].concat([]));
 for(const c of [1,2]){}
})().catch(e=>console.error(e));
