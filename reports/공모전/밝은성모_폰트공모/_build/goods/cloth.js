// 안경닦이 도안 (150×150mm 극세사, 정사각). 글자는 모두 밝은성모 글꼴 그대로.
function cloth(px){
  const s=px/1000;
  const rows=[['0.1','선명',200,36],['0.2','오늘도 닦는다',74,14],['0.3','김 서린 출근길에도',58,10],['0.5','라면 앞에서 뿌예진 날에도',46,7],['0.7','지문 묻은 렌즈 너머로',38,5],['0.9','언젠가 이 천을 서랍에 넣는 아침이 오면',28,3],['1.0','그날 처음 또렷하게 보이는 세상이, 나의 ㅅㅁ',20,1.5]];
  let y=125, h='';
  rows.forEach(([n,t,f,ls],i)=>{h+=`<div style="position:absolute;left:0;right:0;top:${y*s}px;text-align:center;font-size:${f*s}px;letter-spacing:${ls*s}px;line-height:1;${i==0?'':'color:#1d2433'}">${t}<span style="position:absolute;left:${70*s}px;top:${(f-22)*s}px;font-size:${18*s}px;letter-spacing:0;color:#a3a8b3">${n}</span></div>`; y+=f+(i==0?60:34);});
  return `<div style="position:relative;width:${px}px;height:${px}px;background:#fbf8f1;font-family:SL;color:#1d2433;overflow:hidden">
   <div style="position:absolute;inset:${22*s}px;border:${3*s}px dashed #e0b9a8;border-radius:${10*s}px"></div>
   <div style="position:absolute;left:0;right:0;top:${70*s}px;text-align:center;font-size:${22*s}px;letter-spacing:${14*s}px;color:#8a8f9c">나 의 ㅅ ㅁ 시 력 표</div>
   ${h}
   <div style="position:absolute;left:0;right:0;bottom:${70*s}px;text-align:center;font-family:VC;font-size:${30*s}px;color:#e0483a">닦을 때마다 한 줄씩 읽어 보세요</div>
  </div>`;
}
