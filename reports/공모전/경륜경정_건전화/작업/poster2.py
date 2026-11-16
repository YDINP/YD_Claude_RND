from PIL import Image, ImageDraw, ImageFont
import numpy as np
W,H=3508,4961
base='D:/park/YD_Claude_RND/reports/공모전/경륜경정_건전화/'
src=Image.open(base+'작업/bg2_raw.png').convert('RGB')
s=W/src.width
im=src.resize((W,round(src.height*s)),Image.LANCZOS).crop((0,0,W,H))
a=np.asarray(im).astype(np.int16); n=np.random.default_rng(3).normal(0,4,(H,W,1)).astype(np.int16)
im=Image.fromarray(np.clip(a+n,0,255).astype(np.uint8)); d=ImageDraw.Draw(im)
R='C:/Windows/Fonts/malgun.ttf'; B='C:/Windows/Fonts/malgunbd.ttf'
F=lambda p,z: ImageFont.truetype(p,z)
NAVY=(22,34,92); YEL=(246,190,40); CREAM=(252,240,205)
M=260
d.text((M,190),'경륜·경정 중독예방치유센터 희망길벗',font=F(B,92),fill=NAVY)
d.text((M,360),'한 판 더 대신,',font=F(B,310),fill=NAVY)
d.text((M,710),'전화 한 통.',font=F(B,310),fill=NAVY)
d.text((M,1130),'구겨진 표 한 장, 손도 안 댄 커피. ‘한 판만 더’가 남기는 것들입니다.',font=F(R,80),fill=NAVY)
d.text((M,1250),'그 말이 떠오르는 순간, 손을 오른쪽으로 옮겨 보세요.',font=F(R,80),fill=NAVY)
# 휴대폰 화면 (원본 화면 영역 x620-880, y560-1085)
sx0,sx1=int(620*s),int(880*s); sy0,sy1=int(560*s),int(1085*s); cx=(sx0+sx1)//2
def ctext(y,t,f,c):
    bb=d.textbbox((0,0),t,font=f); d.text((cx-(bb[2]-bb[0])//2-bb[0],y),t,font=f,fill=c)
ctext(sy0+260,'희망길벗',F(B,150),NAVY)
ctext(sy0+470,'무료 상담',F(R,84),NAVY)
f=F(B,190)
while d.textlength('080-646-5000',font=f)>(sx1-sx0)-90: f=F(B,f.size-4)
ctext(sy0+800,'080-646-5000',f,NAVY)
r=170; cy=sy1-380
d.ellipse((cx-r,cy-r,cx+r,cy+r),fill=NAVY)
ctext(cy-58,'통화',F(B,96),CREAM)
# 하단 띠
py=4230
d.text((M,py+70),'몰입예방 1·3 가이드라인',font=F(B,84),fill=YEL)
d.text((M,py+185),'1일 3시간 이하   ·   3경주 연속 구매 시 1경주 쉬기   ·   1경주 최대 3만원',font=F(R,74),fill=CREAM)
d.line((M,py+320,W-M,py+320),fill=(60,75,140),width=4)
d.text((M,py+380),'본인은 물론 가족도 상담받을 수 있어요',font=F(R,80),fill=CREAM)
d.text((M,py+510),'광명본장 080-646-5000   ·   미사본장 031-790-8888',font=F(R,70),fill=(200,205,225))
out=base+'제출/포스터2_한판더대신전화한통_A3.png'
im.save(out,dpi=(300,300)); im.resize((W//4,H//4),Image.LANCZOS).save(base+'작업/p2_preview.png'); print('ok')
