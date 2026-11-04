import sys, re, zipfile
sys.stdout.reconfigure(encoding="utf-8")
s = zipfile.ZipFile(sys.argv[1]).read('Contents/section0.xml').decode()
depth=0;tops=[];st=0
for m in re.finditer(r'<hp:p[ >]|</hp:p>',s):
    if m.group().startswith('</'):
        depth-=1
        if depth==0: tops.append((st,m.end()))
    else:
        if depth==0: st=m.start()
        depth+=1
for idx in map(int, sys.argv[2:]):
    seg = s[tops[idx][0]:tops[idx][1]]
    print('=== top', idx, re.findall(r'<hp:tbl [^>]*>', seg))
    for tc in re.finditer(r'<hp:tc .*?</hp:tc>', seg, flags=re.S):
        c = tc.group()
        addr = re.search(r'<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"/>', c)
        span = re.search(r'<hp:cellSpan colSpan="(\d+)" rowSpan="(\d+)"/>', c)
        paras = re.findall(r'<hp:p .*?</hp:p>', c, flags=re.S)
        txt = [''.join(re.findall(r'<hp:t>([^<]*)', p)) for p in paras]
        print(f'r{addr.group(2)} c{addr.group(1)} span{span.groups()}', txt)
