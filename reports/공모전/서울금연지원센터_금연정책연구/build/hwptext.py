import olefile, zlib, struct, sys
def text(p):
    o=olefile.OleFileIO(p); hdr=o.openstream('FileHeader').read(); comp=hdr[36]&1
    out=[]
    for s in sorted([e for e in o.listdir() if e[0]=='BodyText'], key=lambda e:int(e[1][7:])):
        d=o.openstream(s).read()
        if comp: d=zlib.decompress(d,-15)
        i=0
        while i<len(d):
            h=struct.unpack('<I',d[i:i+4])[0]; t=h&0x3ff; lv=(h>>10)&0x3ff; sz=(h>>20)&0xfff; i+=4
            if sz==0xfff: sz=struct.unpack('<I',d[i:i+4])[0]; i+=4
            if t==67:
                raw=d[i:i+sz]; s2=''; j=0
                while j<len(raw):
                    c=struct.unpack('<H',raw[j:j+2])[0]
                    if c<32:
                        if c in (10,13): s2+='\n'
                        elif c==9: s2+='\t'; j+=14
                        elif c in (1,2,3,4,5,6,7,8,11,12,14,15,16,17,18,19,20,21,22,23): j+=14
                    else: s2+=chr(c)
                    j+=2
                out.append(s2)
            i+=sz
    return '\n'.join(out)
for p in sys.argv[1:]: print('=====',p); print(text(p))
