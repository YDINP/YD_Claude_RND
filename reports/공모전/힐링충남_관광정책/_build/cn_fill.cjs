const r=require('D:/cache/npm-cache/_npx/d3dffeb053155d07/node_modules/k-skill-rhwp');
const fs=require('fs');
const OUT=process.argv[2]||'cn_filled.hwp';
const DATE='2026년  11월  16일';
const NAME='박용진';
const TITLE='몰래 하던 해루질, 어촌계와 함께 — 충남 「밤 갯벌 마중」';

const P=[ // [cell, lines]
 [8,['○ 서해 갯벌과 밤 썰물(물때), 어촌체험휴양마을, 어촌계 식당·민박, 서해 해넘이']],
 [10,['○ 시범: 태안군 이원면 만대어촌체험마을(밤낙지 체험 운영 경험), 보령시 오천면 일대 어촌체험마을, 서천군 서면 월하성어촌체험마을',
      '○ 확대: 서산·당진·홍성 갯벌 어촌계 (해경 출입통제구역은 제외)']],
 [12,['○ 수도권 30~40대 가족, 해루질을 해 보고 싶었지만 위험하거나 불법일까 봐 망설인 사람, 이미 혼자 다니는 해루질 동호인']],
 [14,['○ 밤 갯벌에는 이미 사람이 온다. 손전등을 들고 낙지·소라·박하지를 잡는 해루질은 영상과 SNS를 타고 취미로 퍼졌다. 그런데 지금 이 수요는 충남에 돈 대신 사고와 갈등을 남긴다.',
      ' - 사고: 2021년~2026년 상반기 해루질 고립 구조 592명 가운데 충남이 221명으로 인천 다음이다. 같은 기간 전국 사망·실종은 94명, 2025년에만 22명이다(해양경찰청 자료). 올여름에도 태안 갯벌에서 밤에 해루질하던 50대가 숨진 채 발견됐다.',
      ' - 갈등: 어촌계는 마을 어장의 바지락·낙지를 가져가는 외지인 때문에 단속을 요구한다. 보령의 한 어촌계는 해안에 CCTV를 달았다. 태안 통개항 갯벌은 야간 출입통제구역이 됐지만, 어촌계장은 통제 뒤에도 하룻밤 50~60명이 찾아온다고 말한다.',
      '○ 막아도 오는 수요라면 막기보다 안전한 길로 옮기는 편이 낫다. 어촌계가 안내하면 마을은 체험비를 벌고, 관광객은 걱정 없이 잡고, 해경은 순찰 부담을 던다.',
      '○ 밤 썰물은 체류를 만든다. 해루질 물때는 해가 진 뒤 썰물(대개 오후 8시~자정)이라 끝나면 돌아갈 차편이 마땅치 않다. 당일치기 바닷가에 하룻밤 묵을 이유가 저절로 생긴다. 충남 방문의 해가 남긴 과제인 「스쳐 가는 관광에서 머무는 관광으로」와 바로 맞닿는다.']],
 [16,['○ 어촌계원이 안내자가 되어 밤 썰물 2시간 동안 관광객을 마을 체험 어장으로 데려가고 데려오는 프로그램',
      '○ 관광객이 겪는 하루',
      ' ① 오후 5시 도착, 해넘이 보며 마을 식당에서 저녁',
      ' ② 오후 7시 30분 마을회관 집결: 안전교육 15분, 구명조끼·헤드랜턴·장화·채집통 지급',
      ' ③ 썰물 시각에 출발: 안내자 1명이 10명을 맡아 마을이 정한 체험 어장만 돌며 낙지 구멍 찾는 법, 박하지 잡는 법을 알려 줌',
      ' ④ 밀물 40분 전 호루라기와 문자로 철수, 인원 확인 후 마을로 복귀',
      ' ⑤ 잡은 것은 마을 식당에서 손질해 라면이나 탕으로 끓여 먹고(조리비 별도) 마을 민박에서 묵음',
      ' ⑥ 다음 날 아침 갯벌 걷기, 수산물 직판장 들러 귀가',
      '○ 지키는 약속 세 가지',
      ' - 어장: 마을이 정한 체험 구역만, 1인 채집 상한(예: 낙지 5마리, 소라 1kg). 상한을 넘는 양은 마을이 시세로 사 감',
      ' - 안전: 구명조끼 없이는 출발하지 않음. 형광 띠와 LED 손목 표지로 인원을 셈. 해경 파출소에 일정과 인원을 미리 알림',
      ' - 날짜: 물때표로 밤 썰물이 좋은 날(사리 전후 월 6~8일)만 엶. 「밤 갯벌 달력」을 미리 공개해 숙박 예약과 묶음']],
 [18,['○ 시기: 봄(4~6월)·가을(9~11월). 밤 기온과 낙지 철을 고려하고 겨울은 쉼',
      '○ 장소: 시범 3개 마을(태안·보령·서천), 마을별 체험 어장 1곳',
      '○ 예약: 한국어촌어항공단 「바다여행」 누리집과 충남 관광 누리집에 밤 갯벌 달력을 올리고, 충남 투어패스·트래블 페스타 숙박 상품에 넣음',
      '○ 요금(안): 성인 2만 5천 원, 어린이 1만 5천 원(장비·안내·보험 포함). 민박과 묶으면 할인',
      '○ 인력: 마을별 안내자 4~6명(어촌계원·귀어인). 해경·소방의 연안 안전교육을 이수해야 안내자가 됨',
      '○ 정원: 1회 40명(안내자 4명). 기상·파도 기준을 넘으면 당일 취소·전액 환불']],
 [20,['○ 체류: 밤 썰물 시각 때문에 참가자 대부분이 숙박하게 됨. 저녁·야식·숙박·다음 날 아침까지 소비가 마을 안에서 이어짐',
      '○ 마을 수입(시범 1개 마을 추정): 월 8회 × 40명 = 320명, 체험비 월 약 700만 원에 식당·민박·직판장 매출이 붙음. 연 6개월 운영 시 마을당 체험비만 약 4,200만 원',
      '○ 어촌계 입장에서는 도둑맞던 어장이 돈 받는 체험장이 됨. 단속 요구 대신 운영 의지가 생김',
      '○ 봄·가을 평일 밤에도 손님이 생겨 민박과 식당의 빈 날이 줄어듦']],
 [22,['○ 이미 있는 것을 씀: 어촌체험휴양마을의 체험 운영 경험(만대마을 밤낙지 체험 등), 바다여행 예약망, 해경의 물때·안전 정보',
      '○ 예산(시범 3개 마을, 1년 추정): 안전장비(마을당 60세트) 약 3,000만 원, 안내자 교육·인건비 지원 약 4,500만 원, 홍보·예약 연동·밤 갯벌 달력 약 1,500만 원, 단체 상해보험 약 500만 원 → 합계 약 9,500만 원. 2년 차부터는 체험비로 인건비·보험을 충당하고 도는 홍보만 지원',
      '○ 1단계(2027 상반기): 3개 마을 선정, 안내자 교육, 해경 협의, 4~6월 시범 운영',
      '○ 2단계(2027 하반기): 만족도·안전사고·숙박 연계율 점검 후 가을 운영',
      '○ 3단계(2028~): 서산·당진·홍성 어촌계로 확대, 이름과 안전 기준을 공동 기준으로 묶음']],
 [24,['○ 운영 주체가 어촌계라서 도 지원이 줄어도 마을이 돈을 버는 한 계속 돌아감',
      '○ 마을마다 잡는 것이 달라 「밤 갯벌 도장 여행」(태안 낙지 → 보령 소라 → 서천 박하지)으로 묶을 수 있음',
      '○ 해넘이 명소, 별 보기, 국립해양생물자원관·보령 머드 등 낮 관광과 이어 1박 2일 코스로 확장',
      '○ 통제구역 관리와 함께 쓰면 위험한 곳은 막고 안전한 곳은 열어 주는 「막고 여는 갯벌 정책」이 됨']],
 [26,['○ 출처: 해루질 사고 통계 — 김선교 의원실 해양경찰청 자료 분석 보도(2026.9) / 통개항 야간 통제·어촌계장 발언 — 2026.5 보도 / 보령 어촌계 CCTV — 서울신문(2022.5.1) / 충남 방문의 해 관광객 4천만 명 — 뉴시스(2026.7.14)']],
];

function setCell(doc,p,c,lines){
  const n=doc.getCellParagraphCount(0,p,0,c);
  for(let i=n-1;i>=1;i--){ const Lp=doc.getCellParagraphLength(0,p,0,c,i-1); r.parseJsonResult(doc.deleteTextInCell(0,p,0,c,i,0,doc.getCellParagraphLength(0,p,0,c,i)),'dl'); doc.mergeParagraphInCell(0,p,0,c,i); }
  const L=doc.getCellParagraphLength(0,p,0,c,0);
  if(L>0) r.parseJsonResult(doc.deleteTextInCell(0,p,0,c,0,0,L),'del');
  r.parseJsonResult(doc.insertTextInCell(0,p,0,c,0,0,lines[0]),'ins');
  for(let i=1;i<lines.length;i++){ const l0=doc.getCellParagraphLength(0,p,0,c,i-1); doc.splitParagraphInCell(0,p,0,c,i-1,l0); r.parseJsonResult(doc.insertTextInCell(0,p,0,c,i,0,lines[i]),'ins2'); }
}
function replInCellPara(doc,p,c,i,from,to){
  const L=doc.getCellParagraphLength(0,p,0,c,i); const t=doc.getTextInCell(0,p,0,c,i,0,L);
  const k=t.indexOf(from); if(k<0) throw new Error('nf '+from+' in '+t);
  r.parseJsonResult(doc.deleteTextInCell(0,p,0,c,i,k,from.length),'rd'); r.parseJsonResult(doc.insertTextInCell(0,p,0,c,i,k,to),'ri');
}
(async()=>{
 const doc=await r.loadDocument('cn_form.hwpx');
 // 신청서 (para 63)
 setCell(doc,63,4,['□ 힐링관광 / ■ 야간관광']);
 setCell(doc,63,6,[TITLE]);
 setCell(doc,63,9,[NAME]);
 setCell(doc,63,11,['1997. 5. 29.']);
 setCell(doc,63,13,['(12903) 경기도 하남시 미사강변한강로158번길 93, 401호 (망월동)']);
 setCell(doc,63,15,['parkkb10@gmail.com']);
 setCell(doc,63,17,['010-2576-9278']);
 replInCellPara(doc,63,20,2,'2026년    월    일',DATE);
 replInCellPara(doc,63,20,3,'신청자:                   (서명 또는 인)','신청자:   '+NAME+'          (서명 또는 인)');
 // 제안서 (para 65)
 setCell(doc,65,4,['□ 힐링관광 / ■ 야간관광']);
 setCell(doc,65,6,[TITLE]);
 for(const [c] of P){ const n=doc.getCellParagraphCount(0,65,0,c); for(let i=0;i<n;i++){ const L=doc.getCellParagraphLength(0,65,0,c,i); if(L>0) r.parseJsonResult(doc.applyCharFormatInCell(0,65,0,c,i,0,L,JSON.stringify({textColor:'#000000',fontSize:+(process.env.FS||1100)})),'cf'); } }
 for(const [c,lines] of P) setCell(doc,65,c,lines);
 // 동의서 (para 68)
 const np=(cell)=>JSON.stringify([{controlIndex:0,cellIndex:0,cellParaIndex:13},{controlIndex:0,cellIndex:cell,cellParaIndex:0}]);
 r.parseJsonResult(doc.insertTextInCellByPath(0,68,np(4),3,' '+NAME),'n4');
 r.parseJsonResult(doc.insertTextInCellByPath(0,68,np(5),0,'1997. 5. 29.'),'n5');
 { const path=np(6); const L=doc.getCellParagraphLengthByPath(0,68,path); const t=doc.getTextInCellByPath(0,68,path,0,L); const k=t.indexOf('□ 동의');
   r.parseJsonResult(doc.deleteTextInCellByPath(0,68,path,k,1),'cd'); r.parseJsonResult(doc.insertTextInCellByPath(0,68,path,k,'■'),'ci'); }
 r.parseJsonResult(doc.insertTextInCellByPath(0,68,np(7),0,NAME),'n7');
 replInCellPara(doc,68,0,12,'□ 위와','■ 위와');
 replInCellPara(doc,68,0,14,'2026년     월      일',DATE);
 // 서약서 (para 70)
 replInCellPara(doc,70,0,12,'2026년     월     일',DATE);
 replInCellPara(doc,70,0,14,'성명 :           (서명 또는 인)','성명 :   '+NAME+'   (서명 또는 인)');
 // 공고문 본문 삭제 (para 1..60), para 0 비움
 for(let p=60;p>=1;p--) doc.deleteParagraph(0,p);
  r.parseJsonResult(doc.deleteTableControl(0,0,2),'dt');
 doc.deleteParagraph(0,0);
 fs.writeFileSync(OUT, Buffer.from(doc.exportHwp()));
 console.log('pages',doc.pageCount(),'paras',doc.getParagraphCount(0));
})().catch(e=>console.error('ERR',e.stack||e.message||e));
