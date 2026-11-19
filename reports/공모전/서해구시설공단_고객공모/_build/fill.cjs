const r=require('D:/cache/npm-cache/_npx/d3dffeb053155d07/node_modules/k-skill-rhwp');
const fs=require('fs');
const BODY_CELL_H=+(process.env.CH||4200), PARA_LS=+(process.env.LS||160);
const BASE='D:/park/YD_Claude_RND/reports/공모전/';
const SRC=BASE+'화성도시공사_ESG혁신/_build/hs_fill.cjs';
const OUTDIR=BASE+'서해구시설공단_고객공모/제출/';
const FORM=BASE+'서해구시설공단_고객공모/양식/';
// --- applicant info read from code (never printed)
const src=fs.readFileSync(SRC,'utf8');
const arg=(re)=>{const m=src.match(re);if(!m)throw new Error('nf '+re);return m[1];};
const NAME=new Function('return '+arg(/setCell\(doc,0,4,9,(\[.*?\])\)/))()[0];
const EMAIL=new Function('return '+arg(/setCell\(doc,0,4,15,(\[.*?\])\)/))()[0];
const ADDR_FULL=new Function('return '+arg(/setCell\(doc,0,4,18,(\[.*?\])\)/))().join(' ');
const PHONE=arg(/'\(휴대폰\) (010-[0-9-]+)'/);
// 주소: 상세주소 기입 불필요 -> 우편번호·동호수 제외, 도로명까지
const ADDR=ADDR_FULL.replace(/^\(\d+\)\s*/,'').split(',')[0].trim();
// --- 원고
const md=fs.readFileSync(BASE+'서해구시설공단_고객공모/응모안.md','utf8');
const sec3=md.split('## 3.')[1].split('## 4.')[0];
const BODY=sec3.match(/```\n([\s\S]*?)\n```/)[1].split('\n').filter(l=>l.trim());
const TITLE=sec3.match(/제목: \*\*(.*?)\*\*/)[1];
const POEM=md.split('## 4.')[1].split('## 5.')[0].split('**최종')[1].split('\n').filter(l=>/^\| \*\*[가-힣]\*\* \|/.test(l)).map(l=>l.split('|')[2].trim());
if(POEM.length!==7) throw new Error('poem '+POEM.length);
POEM.forEach(l=>{if([...l].length>40)throw new Error('long')});

function setCell(doc,p,k,c,lines){
  const n=doc.getCellParagraphCount(0,p,k,c);
  for(let i=n-1;i>=1;i--){const L=doc.getCellParagraphLength(0,p,k,c,i);if(L)r.parseJsonResult(doc.deleteTextInCell(0,p,k,c,i,0,L),'dl');doc.mergeParagraphInCell(0,p,k,c,i);}
  const L=doc.getCellParagraphLength(0,p,k,c,0);
  if(L>0)r.parseJsonResult(doc.deleteTextInCell(0,p,k,c,0,0,L),'del');
  r.parseJsonResult(doc.insertTextInCell(0,p,k,c,0,0,lines[0]),'ins');
  for(let i=1;i<lines.length;i++){const l0=doc.getCellParagraphLength(0,p,k,c,i-1);doc.splitParagraphInCell(0,p,k,c,i-1,l0);r.parseJsonResult(doc.insertTextInCell(0,p,k,c,i,0,lines[i]),'ins2');}
}
function repl(doc,p,k,c,i,from,to){
  const L=doc.getCellParagraphLength(0,p,k,c,i);const t=doc.getTextInCell(0,p,k,c,i,0,L);
  const x=t.indexOf(from);if(x<0)throw new Error('nf '+from);
  r.parseJsonResult(doc.deleteTextInCell(0,p,k,c,i,x,from.length),'rd');r.parseJsonResult(doc.insertTextInCell(0,p,k,c,i,x,to),'ri');
}
function replRegex(doc,p,k,c,i,re,to){
  const L=doc.getCellParagraphLength(0,p,k,c,i);const t=doc.getTextInCell(0,p,k,c,i,0,L);
  const m=t.match(re);if(!m)throw new Error('nf '+re);
  r.parseJsonResult(doc.deleteTextInCell(0,p,k,c,i,m.index,m[0].length),'rd');r.parseJsonResult(doc.insertTextInCell(0,p,k,c,i,m.index,to),'ri');
}
// nested (path) check: replace first '□' preceding label
function checkNested(doc,P,outer,cell,innerCell,label){
  const path=JSON.stringify([{controlIndex:0,cellIndex:outer,cellParaIndex:1},{controlIndex:0,cellIndex:innerCell,cellParaIndex:0}]);
  const L=doc.getCellParagraphLengthByPath(0,P,path);const t=doc.getTextInCellByPath(0,P,path,0,L);
  const x=t.indexOf('□ '+label);if(x<0)throw new Error('nested nf '+label);
  r.parseJsonResult(doc.deleteTextInCellByPath(0,P,path,x,1),'d');r.parseJsonResult(doc.insertTextInCellByPath(0,P,path,x,'■'),'i');
}
function common(doc,off,back){ // off: 0 for N행시, 1 for 혁신 (cell index shift after 제목 row)
  const P=2;
  setCell(doc,P,0,1,[NAME]);setCell(doc,P,0,3,[PHONE]);setCell(doc,P,0,5,[ADDR]);setCell(doc,P,0,7,[EMAIL]);
  const A=13+off, C=14+off, D=15+off;
  checkNested(doc,P,A,0,1,'참석가능');
  checkNested(doc,P,C,0,1,'동의');
  // 이 위치: C 안의 '□ 동의' 가 '□ 비동의'보다 먼저 와야 함 (indexOf('□ 동의'))
  replRegex(doc,P,0,D,1,/2026\.\s+\.\s+\./,'2026. 11. 19.');
  replRegex(doc,P,0,D,2,/신청인\s+\(서명\)/,'신청인      '+NAME+'      (서명)');
  const B=back;
  repl(doc,B,0,1,4,'동의함 □','동의함 ■');
  repl(doc,B,0,1,9,'동의함 □','동의함 ■');
  replRegex(doc,B,0,2,2,/2026 년\s+월\s+일/,'2026 년   11 월   19 일');
  replRegex(doc,B,0,2,5,/본  인 :\s+\(서명 또는 인\)/,'본  인 :     '+NAME+'     (서명 또는 인)');
}
function black(doc,p,k,c,n,size,boldFn,lines){
  for(let i=0;i<n;i++){
    const L=doc.getCellParagraphLength(0,p,k,c,i);
    const pr={fontFamily:'맑은 고딕',fontSize:size,textColor:'#000000',bold:boldFn?boldFn(lines[i]):false};
    r.parseJsonResult(doc.applyCharFormatInCell(0,p,k,c,i,0,L,JSON.stringify(pr)),'cf');
    r.parseJsonResult(doc.insertTextInCell(0,p,k,c,i,0,'x'),'x1');r.parseJsonResult(doc.deleteTextInCell(0,p,k,c,i,0,1),'x2');
  }
}
(async()=>{
 const out={};
 // ---- 혁신 아이디어
 {
  const doc=await r.loadDocument(FORM+'제19회_고객_공모전_신청서(혁신_아이디어)_성명.hwp');
  common(doc,1,3);
  repl(doc,2,0,9,0,'□ 고객','■ 고객') ;
  setCell(doc,2,0,12,[TITLE]);
  // 안내 칸은 그대로 두고 높이만 줄이고, 본문은 앞면 표 아래에 일반 문단으로 흘려 넣는다
  r.parseJsonResult(doc.setCellProperties(0,2,0,13,JSON.stringify({height:BODY_CELL_H})),'ch');
  {const tp=JSON.parse(doc.getTableProperties(0,2,0));r.parseJsonResult(doc.setTableProperties(0,2,0,JSON.stringify({tableHeight:tp.tableHeight-(34457-BODY_CELL_H)})),'th');}
  r.parseJsonResult(doc.splitParagraph(0,2,1),'sp1');      // P2 앞면표 | P3 뒷면 라벨
  r.parseJsonResult(doc.splitParagraph(0,3,0),'sp2');      // P3 빈 문단 | P4 뒷면 라벨
  let q=3; // 본문 문단 인덱스
  r.parseJsonResult(doc.insertText(0,q,0,BODY[0]),'b0');
  for(let i=1;i<BODY.length;i++){const L=doc.getParagraphLength(0,q+i-1);r.parseJsonResult(doc.splitParagraph(0,q+i-1,L),'bs');r.parseJsonResult(doc.insertText(0,q+i,0,BODY[i]),'bi');}
  for(let i=0;i<BODY.length;i++){
    const L=doc.getParagraphLength(0,q+i);const head=/^\d\. /.test(BODY[i]);
    r.parseJsonResult(doc.applyCharFormat(0,q+i,0,L,JSON.stringify({fontFamily:'맑은 고딕',fontSize:1200,textColor:'#000000',bold:head})),'cf');
    r.parseJsonResult(doc.applyParaFormat(0,q+i,JSON.stringify({alignment:'left',pageBreakBefore:false,lineSpacing:PARA_LS,spacingBefore:head?8:2,spacingAfter:0,marginLeft:0,indent:0})),'pf');
  }
  for(let i=0;i<BODY.length;i++){r.parseJsonResult(doc.insertText(0,q+i,0,'x'),'x1');r.parseJsonResult(doc.deleteText(0,q+i,0,1),'x2');}
  r.parseJsonResult(doc.applyParaFormat(0,q+BODY.length,JSON.stringify({pageBreakBefore:true})),'pb');
  doc.reflowLinesegs();
  fs.writeFileSync(OUTDIR+'제19회_고객_공모전_신청서(혁신_아이디어)_'+NAME+'.hwp',Buffer.from(doc.exportHwp()));
  out.idea=doc.pageCount();
 }
 // ---- N행시
 {
  const doc=await r.loadDocument(FORM+'제19회_고객_공모전_신청서(N행시)_성명.hwp');
  common(doc,0,4);
  repl(doc,2,0,9,0,'□ 서해구','■ 서해구');
  setCell(doc,2,0,12,POEM);
  black(doc,2,0,12,POEM.length,1100,()=>false,POEM);
  doc.reflowLinesegs();
  fs.writeFileSync(OUTDIR+'제19회_고객_공모전_신청서(N행시)_'+NAME+'.hwp',Buffer.from(doc.exportHwp()));
  out.poem=doc.pageCount();
 }
 console.log(JSON.stringify(out),'nameLen',NAME.length,'phoneLen',PHONE.length,'addrLen',ADDR.length,'emailLen',EMAIL.length,'bodyLines',BODY.length);
})().catch(e=>{console.error('ERR',e&&e.stack||e);process.exit(1)});
