from PIL import Image, ImageDraw, ImageFont, ImageFilter
import random
W,H=3508,4961
base='D:/park/YD_Claude_RND/reports/공모전/경륜경정_건전화/'
src=Image.open(base+'작업/bg1_raw.png').convert('RGB')
s=W/src.width
im=src.resize((W,round(src.height*s)),Image.LANCZOS).crop((0,0,W,H))
# 약한 종이 질감 그레인으로 업스케일 흐림 완화
import numpy as np
a=np.asarray(im).astype(np.int16)
rng=np.random.default_rng(7)
n=rng.normal(0,4,(H,W,1)).astype(np.int16)
im=Image.fromarray(np.clip(a+n,0,255).astype(np.uint8))
d=ImageDraw.Draw(im)
R='C:/Windows/Fonts/malgun.ttf'; B='C:/Windows/Fonts/malgunbd.ttf'
F=lambda p,z: ImageFont.truetype(p,z)
WHITE=(250,244,230); YEL=(242,190,92); NAVY=(24,33,62); SAND=(222,196,152)
M=260
d.text((M,300),'경륜·경정 중독예방치유센터 희망길벗',font=F(B,96),fill=YEL)

d.text((M,560),'본전 찾으러',font=F(B,300),fill=WHITE)
d.text((M,900),'가는 길 말고,',font=F(B,300),fill=WHITE)
d.text((M,1240),'희망길벗 가는 길',font=F(B,300),fill=YEL)
body=['잃은 돈이 자꾸 떠오를 때, 그 생각이 발길을 다시 경주로 돌립니다.',
      '오른쪽 길은 전화 한 통이면 열립니다. 상담은 무료, 가족도 함께 받을 수 있어요.']
for i,t in enumerate(body): d.text((M,1680+i*120),t,font=F(R,82),fill=WHITE)
# 길 표지
def tag(x,y,text,col,tc,anchor_pt):
    f=F(B,92); bb=d.textbbox((0,0),text,font=f); w=bb[2]-bb[0]+110; h=bb[3]-bb[1]+80
    d.line((x+w//2,y+h,anchor_pt[0],anchor_pt[1]),fill=col,width=7)
    d.rounded_rectangle((x,y,x+w,y+h),radius=h//2,fill=col)
    d.text((x+55,y+40-bb[1]),text,font=f,fill=tc)
tag(170,2460,'다시, 본전 찾는 길',(70,78,105),(235,228,212),(600,2900))
tag(2560,2330,'희망길벗 가는 길',YEL,NAVY,(3120,2690))
# 하단 정보 패널
py=4230
d.rectangle((0,py,W,H),fill=NAVY)
d.text((M,py+90),'몰입예방 1·3 가이드라인',font=F(B,84),fill=YEL)
g='1일 3시간 이하   ·   3경주 연속 구매 시 1경주 쉬기   ·   1경주 최대 3만원'
d.text((M,py+205),g,font=F(R,74),fill=WHITE)
d.line((M,py+340,W-M,py+340),fill=(70,80,115),width=4)
d.text((M,py+395),'희망길벗 무료 상담',font=F(B,96),fill=WHITE)
f=F(B,170); t='080-646-5000'; bb=d.textbbox((0,0),t,font=f)
d.text((W-M-(bb[2]-bb[0]),py+370-bb[1]+10),t,font=f,fill=YEL)
d.text((M,py+540),'미사본장 031-790-8888',font=F(R,70),fill=(200,205,220))
out=base+'제출/포스터1_희망길벗가는길_A3.png'
im.save(out,dpi=(300,300))
im.resize((W//4,H//4),Image.LANCZOS).save(base+'작업/p1_preview.png')
print('ok')
