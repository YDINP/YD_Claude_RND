import sys, re, zipfile
sys.stdout.reconfigure(encoding="utf-8")
for f in sys.argv[1:]:
    z = zipfile.ZipFile(f); i0 = z.infolist()[0]
    print('==', f, i0.filename, i0.compress_type, z.testzip())
    s = z.read('Contents/section0.xml').decode()
    print('tables', s.count('<hp:tbl '), 'PB', s.count('pageBreak="1"'))
    t = "\n".join("".join(re.findall(r"<hp:t>([^<]*)</hp:t>", q)) for q in re.findall(r"<hp:p .*?</hp:p>", s, flags=re.S))
    print(t[:1500]); print('...', len(t))
