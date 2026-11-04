import os
OUT=os.path.dirname(os.path.abspath(__file__))
CSS="""
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1080px;overflow:hidden}
body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;background:#FFF8EE;color:#12343B;position:relative;word-break:keep-all}
.bg1{background:#0F6B6E;color:#fff}
.bg2{background:#FFF8EE}
.bg3{background:#E6F3F1}
.page{position:absolute;right:56px;top:48px;font-size:26px;font-weight:700;opacity:.7;letter-spacing:2px}
.tag{position:absolute;left:72px;top:60px;font-size:30px;font-weight:700;padding:10px 26px;border-radius:40px;background:#F26B5B;color:#fff}
.h{position:absolute;left:72px;right:72px;font-weight:900;line-height:1.28}
.p{position:absolute;left:72px;right:72px;font-size:42px;font-weight:600;line-height:1.55}
.hl{color:#F26B5B}.hy{color:#FFC857}
.card{position:absolute;background:#fff;border-radius:36px;box-shadow:0 8px 0 rgba(15,107,110,.15);padding:34px 40px}
.src{position:absolute;left:72px;right:72px;bottom:40px;font-size:21px;line-height:1.5;color:#4a6a70}
svg{position:absolute}
"""
def page(cls,body,n):
    return f"<!doctype html><html lang=ko><head><meta charset=utf-8><style>{CSS}</style></head><body class='{cls}'><div class=page>{n} / 6</div>{body}</body></html>"
cross=lambda x,y,s,c: f"<svg style='left:{x}px;top:{y}px' width={s} height={s} viewBox='0 0 100 100'><rect x='36' y='8' width='28' height='84' rx='8' fill='{c}'/><rect x='8' y='36' width='84' height='28' rx='8' fill='{c}'/></svg>"
cards=[]
# 1
cards.append(("bg1",
 cross(740,520,260,'#FFC857')+cross(880,360,110,'rgba(255,255,255,.25)')+
 "<svg style='left:690px;top:800px' width=300 height=200 viewBox='0 0 300 200'><path d='M0 200 L0 110 L60 60 L120 110 L120 200Z M150 200 L150 80 L225 20 L300 80 L300 200Z' fill='rgba(255,255,255,.22)'/></svg>"
 "<div class=tag>2026 대국민 공공의료 공모전 · 카드뉴스</div>"
 "<div class=h style='top:210px;font-size:84px'>아픈 날,<br>어디로 가야 할지<br><span class=hy>막막했던 적</span><br>있나요?</div>"
 "<div class=p style='top:800px;font-size:44px;right:420px'>공공의료,<br>우리 곁의 이야기</div>"))
# 2
cards.append(("bg2",
 "<div class=tag>① 공공의료란?</div>"
 "<div class=h style='top:170px;font-size:68px'>병원 이름이 아니라<br><span class=hl>‘약속’</span>입니다</div>"
 "<div class=card style='left:72px;right:72px;top:420px;height:400px;padding:44px 48px'>"
 "<div style='font-size:34px;font-weight:700;color:#0F6B6E;margin-bottom:18px'>공공보건의료에 관한 법률 제2조</div>"
 "<div style='font-size:42px;font-weight:700;line-height:1.55'>지역·계층·분야에 관계없이<br><span class=hl>모든 국민의 보편적인 의료 이용을 보장</span>하고 건강을 보호·증진하는 모든 활동</div></div>"
 "<div class=p style='top:860px;font-size:38px'>사는 곳, 형편과 상관없이 누구나 — 그게 공공의료예요.</div>"
 "<div class=src>출처: 「공공보건의료에 관한 법률」 제2조 제1호 (국가법령정보센터)</div>"))
# 3
def row(y,col,t1,t2,ico):
    return (f"<div class=card style='left:72px;right:72px;top:{y}px;height:150px;padding:0 40px;display:flex;align-items:center'>"
      f"<div style='width:84px;height:84px;border-radius:50%;background:{col};flex:none;margin-right:32px;position:relative'>{ico}</div>"
      f"<div><div style='font-size:42px;font-weight:800'>{t1}</div><div style='font-size:28px;font-weight:600;color:#4a6a70;margin-top:4px'>{t2}</div></div></div>")
ic_cross="<svg style='left:18px;top:18px' width=48 height=48 viewBox='0 0 100 100'><rect x='36' y='8' width='28' height='84' rx='8' fill='#fff'/><rect x='8' y='36' width='84' height='28' rx='8' fill='#fff'/></svg>"
ic_heart="<svg style='left:18px;top:20px' width=48 height=44 viewBox='0 0 100 90'><path d='M50 88 C10 56 0 36 0 24 C0 8 12 0 26 0 C38 0 46 8 50 16 C54 8 62 0 74 0 C88 0 100 8 100 24 C100 36 90 56 50 88Z' fill='#fff'/></svg>"
ic_brain="<svg style='left:18px;top:18px' width=48 height=48 viewBox='0 0 100 100'><circle cx='50' cy='50' r='40' fill='none' stroke='#fff' stroke-width='12'/><circle cx='50' cy='50' r='12' fill='#fff'/></svg>"
ic_book="<svg style='left:18px;top:20px' width=48 height=44 viewBox='0 0 100 90'><path d='M4 8 H46 V86 H4Z M54 8 H96 V86 H54Z' fill='#fff'/></svg>"
cards.append(("bg3",
 "<div class=tag>② 누가 지킬까?</div>"
 "<div class=h style='top:150px;font-size:60px'>잘 안 보이는 곳에서도<br><span class=hl>국립중앙의료원</span>이 곁을 지켜요</div>"
 + row(350,'#F26B5B','중앙응급의료센터','응급의료 분야 국가중앙센터',ic_cross)
 + row(520,'#0F6B6E','중앙모자의료센터','모자의료 분야 국가중앙센터',ic_heart)
 + row(690,'#E0A526','중앙치매센터','치매 분야 국가중앙센터',ic_brain)
 + row(860,'#3C8DAD','공공보건의료 지원·교육훈련센터','공공보건의료 분야 국가중앙센터',ic_book)
 + "<div class=src style='bottom:12px;left:72px'>출처: 국립중앙의료원 홈페이지 ‘국가중앙센터’ (nmc.or.kr)</div>"))
# 4
pin="<svg style='left:760px;top:170px' width=230 height=290 viewBox='0 0 100 126'><path d='M50 0 C22 0 4 20 4 44 C4 74 50 126 50 126 C50 126 96 74 96 44 C96 20 78 0 50 0Z' fill='#F26B5B'/><rect x='41' y='20' width='18' height='50' rx='5' fill='#fff'/><rect x='25' y='36' width='50' height='18' rx='5' fill='#fff'/></svg>"
def chip(x,y,t): return f"<div style='position:absolute;left:{x}px;top:{y}px;width:454px;height:112px;border-radius:30px;background:#fff;border:5px solid #0F6B6E;font-size:40px;font-weight:800;color:#0F6B6E;display:flex;align-items:center;justify-content:center'>{t}</div>"
cards.append(("bg2",
 "<div class=tag>③ 이럴 땐 이렇게</div>"
 "<div class=h style='top:170px;font-size:64px;right:330px'>한밤중 갑자기<br>아플 때는</div>"+pin+
 "<div class=p style='top:420px;font-size:40px'><span class=hl>위급하면 119</span>, 그리고 가까운 곳은<br>응급의료포털 <b>E-GEN</b>(중앙응급의료센터)에서</div>"
 + chip(72,640,'응급실 찾기')+chip(554,640,'병원 찾기')+chip(72,780,'약국 찾기')+chip(554,780,'AED 찾기')
 + "<div class=src>출처: 응급의료포털 E-GEN (e-gen.or.kr), 국립중앙의료원 ‘공공의료기관 찾기’ · 2026.10.27. 확인</div>"))
# 5
cards.append(("bg1",
 "<div class=tag>④ 함께 지켜요</div>"
 "<div class=h style='top:170px;font-size:68px'>대형병원 응급실은<br><span class=hy>중증응급환자</span>에게</div>"
 "<div class=card style='left:72px;right:72px;top:520px;height:300px;color:#12343B;padding:50px 56px'>"
 "<div style='font-size:42px;font-weight:800;line-height:1.55'>지금 내 증상에 맞는 곳은 어디일까?<br><span class=hl>잠깐 확인하는 마음</span>이<br>이웃의 생명을 지켜요.</div></div>"
 "<div class=p style='top:860px;font-size:34px;opacity:.9'>중앙응급의료센터 공익광고 메시지에서 착안</div>"
 "<div class=src style='color:#cfe7e5'>출처: 응급의료포털 E-GEN 홍보자료 ‘(공익광고) 대형병원 응급실은 중증응급환자에게’ (e-gen.or.kr)</div>"))
# 6
cards.append(("bg3",
 cross(800,120,150,'#F26B5B')+
 "<div class=tag style='background:#0F6B6E'>우리 곁의 공공의료</div>"
 "<div class=h style='top:240px;font-size:70px'>내가 아플 때도,<br>이웃이 아플 때도<br><span class=hl>곁에 있는 약속</span></div>"
 "<div class=p style='top:640px;font-size:40px'>그 약속을 지키는 모든 의료진과<br>공공의료기관에 <b>감사와 응원</b>을 보냅니다.</div>"
 "<div style='position:absolute;left:72px;right:72px;top:840px;font-size:27px;font-weight:700;color:#12343B;line-height:1.5'>본 작품은 제작 과정에서 생성형 AI를 활용하였습니다.<br><span style='font-weight:500;font-size:23px;color:#4a6a70'>(기획·문구 초안 작성에 활용. 이미지는 AI 생성이 아닌 도형·아이콘으로 직접 제작)</span></div>"
 "<div class=src style='bottom:30px;font-size:19px'>출처: 「공공보건의료에 관한 법률」 제2조(국가법령정보센터) · 국립중앙의료원 nmc.or.kr · 응급의료포털 E-GEN e-gen.or.kr (2026.10.27. 확인)</div>"))
for i,(c,b) in enumerate(cards,1):
    open(os.path.join(OUT,f"card{i}.html"),'w',encoding='utf-8',newline='').write(page(c,b,i))
