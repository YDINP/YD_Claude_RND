const r=require('D:/cache/npm-cache/_npx/d3dffeb053155d07/node_modules/k-skill-rhwp');
const fs=require('fs');
const OUT=process.argv[2]||'hs_filled.hwp';
const TITLE='1월 화장 대기는 해마다 온다 — 함백산추모공원 「겨울 대비 화장 운영 달력」';
const FIELD='경영혁신(고객중심경영)';
const C={
5:['○ 사망자는 해마다 1월 전후에 몰린다. 2025년 1월 사망자는 3만 9,473명으로 한 해 월평균(약 3만 250명)보다 30% 많았다. 그런데 화장 대기 대응은 3일장 화장률이 무너진 뒤에야 시작된다.',
   '○ 이 제안은 함백산추모공원의 겨울 운영을 「미리 짜 두는 달력」으로 바꾸자는 것이다. 화장로 정비는 사망자가 적은 여름으로 옮기고, 겨울 증편 회차와 인력은 겨울 전에 미리 확정하고, 3일장 화장률을 매일 공개해 기준 아래로 떨어지면 정해 둔 대응이 바로 켜지게 한다.'],
7:['○ 겨울마다 같은 일이 반복된다. 2025년 1월 공사는 3일장 화장률이 30% 아래로 떨어지자 관내 사망자를 위해 하루 9~10회차를 한시적으로 더 배정했다. 대응은 했지만 이미 많은 유족이 4일장, 5일장을 치른 뒤였다.',
   '○ 장례가 하루 늘면 유족 부담이 바로 늘어난다. 빈소 사용료와 안치료, 접객 비용이 하루치 더 들고, 직장인 상주는 휴가를 더 내야 한다. 고인을 모시지 못하고 기다리는 시간 자체가 유족에게는 큰 고통이다.',
   '○ 화장로 5기 증설로 하루 화장 능력이 55건에서 80건으로 늘었다. 설비가 늘어난 지금이 운영 방식을 바꿀 때다. 설비가 있어도 정비 일정이 겨울과 겹치거나 증편 인력이 늦게 꾸려지면 겨울 대기는 다시 생긴다.',
   '○ 사망자가 몰리는 시기는 매년 거의 같다. 미리 알 수 있는 수요인데도 해마다 대기가 길어진 뒤에야 대응한다.'],
9:['① 정비는 여름에: 화장로 정기 정비와 내화물 보수 같은 큰 작업은 사망자가 적은 6~9월에 몰아 한다. 12~2월에는 모든 화장로를 가동하는 것을 원칙으로 하고, 겨울 정비는 고장 수리만 한다.',
   '② 겨울 증편은 매년 11월에 확정: 12월 중순~2월에는 첫 회차를 앞당기고 마지막 회차를 늦춘 「겨울 회차표」를 11월에 미리 e하늘장사정보시스템과 장례식장에 공지한다. 증편에 필요한 운영 인력은 교대 조정과 한시 채용으로 11월까지 확보한다.',
   '③ 3일장 화장률 매일 공개와 단계별 대응: 날마다 「사망 후 3일 안 화장 비율」을 누리집에 올린다. 70% 아래면 1단계(겨울 회차표 전면 가동), 50% 아래면 2단계(관내 사망자 우선 회차 추가), 30% 아래면 3단계(공동 이용 지자체·인근 화장시설과 대체 예약 연계)로 미리 정해 둔 대응이 자동으로 켜진다. 2025년 1월처럼 30% 아래까지 떨어진 뒤 움직이지 않도록 한다.',
   '④ 취소분은 바로 다시 배정: 예약 취소나 일정 변경으로 빈 회차가 생기면 대기 중인 장례식장에 즉시 문자로 알려 같은 날 채운다. 늦은 취소가 잦은 곳은 다음 예약 때 확인 전화를 거친다.',
   '○ 실현 가능성: 새 설비 없이 정비 일정, 회차표, 인력 배치, 공지만 바꾸는 일이다. 3일장 화장률은 예약 자료만으로 계산할 수 있어 별도 시스템 없이 엑셀과 누리집 게시로 시작할 수 있다.',
   '○ 기존 대응과의 차이: 지금까지의 확대 운영은 대기가 길어진 뒤 켜는 비상조치였다. 이 제안은 같은 자원을 겨울 전에 배치하고, 언제 무엇을 할지 숫자 기준으로 정해 둔다.',
   '○ 지역사회 연계: 장례식장, 공동 이용 지자체와 겨울 회차표를 함께 쓰고, 관내 장례식장 협의회에서 매년 10월 운영 계획을 점검한다.',
   '○ 추진 일정: 2026년 12월 초 겨울 회차표·인력 확정 → 12~2월 시행과 3일장 화장률 매일 공개 → 2027년 3월 결과 점검 → 6~9월 정비 일정 이전 → 2027년 겨울 본격 시행'],
11:['○ 유족: 겨울에도 3일장을 치를 수 있는 비율이 올라간다. 목표는 12~2월 3일장 화장률 70% 이상 유지다. 장례가 하루 줄 때마다 빈소·안치·접객 비용이 하루치 덜 든다.',
   '○ 공사: 이미 늘린 화장로 80건 능력을 가장 필요한 시기에 온전히 쓴다. 비상 증편을 급하게 꾸리던 업무 부담과 민원이 줄어든다.',
   '○ 시민 신뢰: 3일장 화장률을 매일 공개하면 유족은 예약 전 상황을 알 수 있고, 시민은 공사의 개선 결과를 숫자로 확인할 수 있다.',
   '○ 확산: 정비는 여름, 증편은 미리, 대응은 숫자 기준이라는 방식은 겨울 수요가 몰리는 다른 공설 장사시설에도 그대로 쓸 수 있다.',
   '○ 근거: 사망자 수 — 통계청 인구동향(2025년 1월 3만 9,473명, 2025년 연간 36만 2,968명) / 2025년 1월 화장로 확대 운영 — 공사 발표 보도(2025.1.17) / 화장로 5기 증설, 하루 55건→80건 — 화성시 발표 보도(2025.12)'],
};
function setCell(doc,p,k,c,lines){
  const n=doc.getCellParagraphCount(0,p,k,c);
  for(let i=n-1;i>=1;i--){ const L=doc.getCellParagraphLength(0,p,k,c,i); if(L) r.parseJsonResult(doc.deleteTextInCell(0,p,k,c,i,0,L),'dl'); doc.mergeParagraphInCell(0,p,k,c,i); }
  const L=doc.getCellParagraphLength(0,p,k,c,0);
  if(L>0) r.parseJsonResult(doc.deleteTextInCell(0,p,k,c,0,0,L),'del');
  r.parseJsonResult(doc.insertTextInCell(0,p,k,c,0,0,lines[0]),'ins');
  for(let i=1;i<lines.length;i++){ const l0=doc.getCellParagraphLength(0,p,k,c,i-1); doc.splitParagraphInCell(0,p,k,c,i-1,l0); r.parseJsonResult(doc.insertTextInCell(0,p,k,c,i,0,lines[i]),'ins2'); }
}
function repl(doc,p,k,c,i,from,to){
  const L=doc.getCellParagraphLength(0,p,k,c,i); const t=doc.getTextInCell(0,p,k,c,i,0,L);
  const x=t.indexOf(from); if(x<0) throw new Error('nf '+from+' in '+t);
  r.parseJsonResult(doc.deleteTextInCell(0,p,k,c,i,x,from.length),'rd'); r.parseJsonResult(doc.insertTextInCell(0,p,k,c,i,x,to),'ri');
}
(async()=>{
 const doc=await r.loadDocument('hs_form.hwp');
 // 신청서 p0 ctrl4
 repl(doc,0,4,1,0,'□ 경영혁신','■ 경영혁신');
 repl(doc,0,4,3,0,'□ 개','■ 개');
 setCell(doc,0,4,5,[TITLE]);
 setCell(doc,0,4,9,['박용진']);
 setCell(doc,0,4,11,['1997. 5. 29.']);
 repl(doc,0,4,13,0,'(휴대폰)','(휴대폰) 010-2576-9278');
 setCell(doc,0,4,15,['parkkb10@gmail.com']);
 setCell(doc,0,4,18,['(12903) 경기도 하남시 미사강변한강로158번길 93, 401호 (망월동)']);
 if(doc.getCellParagraphLength(0,0,4,29,5)===0) doc.mergeParagraphInCell(0,0,4,29,5);
 repl(doc,0,4,29,6,'동의함 □','동의함 ■');
 r.parseJsonResult(doc.applyParaFormatInCell(0,0,4,29,6,JSON.stringify({lineSpacing:160,spacingBefore:4})),'pf');
 repl(doc,0,4,30,3,'2026년    월     일','2026년  11월  16일');
 repl(doc,0,4,30,4,'신청인 :             (서명','신청인 :   박용진    (서명');
 // 제안서 p2 ctrl0
 setCell(doc,2,0,1,[TITLE]);
 setCell(doc,2,0,3,[FIELD]);
 for(const c of Object.keys(C)) setCell(doc,2,0,+c,C[c]);
 doc.reflowLinesegs();
 fs.writeFileSync(OUT, Buffer.from(doc.exportHwp()));
 console.log('pages',doc.pageCount());
 for(let pg=0;pg<doc.pageCount();pg++) fs.writeFileSync('hs_p'+pg+'.svg',doc.renderPageSvg(pg));
})().catch(e=>{console.error('ERR',e.message||e);process.exit(1)});
