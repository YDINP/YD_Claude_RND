const r=require('D:/cache/npm-cache/_npx/d3dffeb053155d07/node_modules/k-skill-rhwp');
(async()=>{
 for(const f of ['form_idea.hwp','form_consent.hwp']){
  const doc=await r.loadDocument(f);
  console.log('=====',f,'pages',doc.pageCount(),'paras',doc.getParagraphCount(0));
  const np=doc.getParagraphCount(0);
  for(let p=0;p<np;p++){
    const L=doc.getParagraphLength(0,p); console.log('P',p,JSON.stringify(doc.getTextRange?doc.getTextRange(0,p,0,L):''));
    for(let c=0;c<40;c++){ let n; try{ n=doc.getCellParagraphCount(0,p,0,c);}catch(e){break;} if(n==null||n<0)break;
      const ts=[]; for(let i=0;i<n;i++){const l=doc.getCellParagraphLength(0,p,0,c,i); ts.push(doc.getTextInCell(0,p,0,c,i,0,l));}
      console.log('  cell',c,JSON.stringify(ts)); }
  }
 }
})().catch(e=>console.error('ERR',e.stack||e));
