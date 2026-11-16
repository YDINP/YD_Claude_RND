const r=require('D:/cache/npm-cache/_npx/d3dffeb053155d07/node_modules/k-skill-rhwp');
const fs=require('fs');
const MD=fs.readFileSync('../제안서_원고.md','utf8');
const NAME='박용진';
function sec(h){ const a=MD.split('## '+h)[1]; return a.split(/\n## |\n---/)[0]; }
function lines(h){ return sec(h).split('\n').map(s=>s.trim()).filter(s=>s && !s.startsWith('#')); }
const TITLE=lines('제안명(제목)')[0];
const BG=lines('제안 배경 (문제 및 대상)');
const CT=lines('제안 내용 (해결 아이디어)');
const EF=lines('기대효과');
const P=2;
function setCell(doc,c,ls){
  const n=doc.getCellParagraphCount(0,P,0,c);
  for(let i=n-1;i>=1;i--){ r.parseJsonResult(doc.deleteTextInCell(0,P,0,c,i,0,doc.getCellParagraphLength(0,P,0,c,i)),'dl'); doc.mergeParagraphInCell(0,P,0,c,i); }
  const L=doc.getCellParagraphLength(0,P,0,c,0);
  if(L>0) r.parseJsonResult(doc.deleteTextInCell(0,P,0,c,0,0,L),'del');
  r.parseJsonResult(doc.insertTextInCell(0,P,0,c,0,0,ls[0]),'ins');
  for(let i=1;i<ls.length;i++){ const l0=doc.getCellParagraphLength(0,P,0,c,i-1); doc.splitParagraphInCell(0,P,0,c,i-1,l0); r.parseJsonResult(doc.insertTextInCell(0,P,0,c,i,0,ls[i]),'ins2'); }
}
function repl(doc,p,c,i,from,to){
  const L=doc.getCellParagraphLength(0,p,0,c,i); const t=doc.getTextInCell(0,p,0,c,i,0,L);
  const k=t.indexOf(from); if(k<0) throw new Error('nf '+from+' in '+t);
  r.parseJsonResult(doc.deleteTextInCell(0,p,0,c,i,k,from.length),'rd'); r.parseJsonResult(doc.insertTextInCell(0,p,0,c,i,k,to),'ri');
}
(async()=>{
 // ---- 제안서
 const doc=await r.loadDocument('form_idea.hwp');
 r.parseJsonResult(doc.setTableProperties(0,P,0,JSON.stringify({treatAsChar:false,pageBreak:+(process.env.PB||1)})),'tp');
 repl(doc,P,1,0,'□ 기초생활','■ 기초생활');
 for(const c of [3,5,7,9]){ const n=doc.getCellParagraphCount(0,P,0,c); for(let i=0;i<n;i++){ const L=doc.getCellParagraphLength(0,P,0,c,i); if(L>0) r.parseJsonResult(doc.applyCharFormatInCell(0,P,0,c,i,0,L,JSON.stringify({textColor:'#000000'})),'cf'); } }
 setCell(doc,3,[TITLE]);
 r.parseJsonResult(doc.applyCharFormatInCell(0,P,0,3,0,0,TITLE.length,JSON.stringify({bold:true,fontSize:1100})),'tb');
 setCell(doc,5,BG); setCell(doc,7,CT); setCell(doc,9,EF);
 repl(doc,P,11,0,'년      월      일','2026년  11월  16일');
 repl(doc,P,13,0,' (서명 또는 인)',NAME+'  (서명 또는 인)');
 fs.mkdirSync('../제출',{recursive:true});
 fs.writeFileSync('../제출/아이디어제안서_박용진.hwp', Buffer.from(doc.exportHwp()));
 console.log('idea pages',doc.pageCount());
 // ---- 동의서
 const d2=await r.loadDocument('form_consent.hwp');
 const cp=1;
 const n0=d2.getCellParagraphCount(0,cp,0,0);
 let hits=0;
 for(let i=0;i<n0;i++){ const L=d2.getCellParagraphLength(0,cp,0,0,i); const t=d2.getTextInCell(0,cp,0,0,i,0,L);
   const k=t.indexOf('□ 동의함'); if(k>=0){ r.parseJsonResult(d2.deleteTextInCell(0,cp,0,0,i,k,1),'d'); r.parseJsonResult(d2.insertTextInCell(0,cp,0,0,i,k,'■'),'i'); hits++; } }
 if(hits!==2) throw new Error('consent hits '+hits);
 repl(d2,cp,1,0,'2026년　　월　　일','2026년　11월　16일');
 repl(d2,cp,1,5,'참가자 성명 :　　　　　　　　　(서명 또는 확인)','참가자 성명 :　　'+NAME+'　　　(서명 또는 확인)');
 fs.writeFileSync('../제출/개인정보수집이용동의서_박용진.hwp', Buffer.from(d2.exportHwp()));
 console.log('consent pages',d2.pageCount());
})().catch(e=>console.error('ERR',e.stack||e.message||e));
