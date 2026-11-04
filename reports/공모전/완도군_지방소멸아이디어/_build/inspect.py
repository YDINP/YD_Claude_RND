import sys; sys.stdout.reconfigure(encoding="utf-8")
import re, zipfile, sys
s = zipfile.ZipFile(sys.argv[1]).read('Contents/section0.xml').decode()
depth=0;tops=[];st=0
for m in re.finditer(r'<hp:p[ >]|</hp:p>',s):
    if m.group().startswith('</'):
        depth-=1
        if depth==0: tops.append((st,m.end()))
    else:
        if depth==0: st=m.start()
        depth+=1
for i,(a,b) in enumerate(tops):
    seg=s[a:b]; t=''.join(re.findall(r'<hp:t>([^<]*)',seg))
    pb = re.match(r'<hp:p [^>]*>', seg).group()
    print(i, b-a, seg.count('<hp:tbl'), 'PB' if 'pageBreak="1"' in pb else '', repr(t[:80]))
