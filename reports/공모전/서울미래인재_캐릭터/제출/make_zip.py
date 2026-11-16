# 서명한 서류로 교체한 뒤 다시 실행하면 ZIP을 새로 만든다. 사용: python make_zip.py
import zipfile, os
here = os.path.dirname(os.path.abspath(__file__))
name = "서울미래인재재단_캐릭터공모전_박용진_징검이"
src = os.path.join(here, name); out = os.path.join(here, name + ".zip")
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(os.listdir(src)):
        z.write(os.path.join(src, f), arcname=f)
total = os.path.getsize(out)
for f in sorted(os.listdir(src)):
    s = os.path.getsize(os.path.join(src, f)); print(f"{f}\t{s/1024/1024:.2f} MB" + ("  <-- 10MB 초과" if s > 10*1024*1024 else ""))
print(f"ZIP {total/1024/1024:.2f} MB" + ("  <-- 50MB 초과" if total > 50*1024*1024 else " (50MB 이하)"))
