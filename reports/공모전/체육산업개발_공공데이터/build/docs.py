"""참가신청서·동의서·기획서를 같은 블록 모델로 HWPX(section XML)와 HTML(PDF용)로 그린다.

공식 양식은 바이너리 HWP(원본/공공데이터_활용_사례_공모전(안내문).hwp)라 직접 채울 수 없어,
양식의 표 구성·문구를 그대로 옮겨 HWPX 로 새로 짠다. 뼈대(용지·글꼴·테두리 모양)는 build/_skeleton.hwpx.
"""
import re
import struct
import sys
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT))
import docgen as D  # noqa: E402
import content as C  # noqa: E402

SKEL = HERE / "_skeleton.hwpx"
SIG = (ROOT / "assets" / "sig_1_10.png").read_bytes()
ME = C.ME
DATE = f"{ME['y']}년  {ME['m']}월  {ME['d']}일"
EVENT = "2026년도 공공데이터 활용 경진대회"
NAMES = {
    "app": f"[붙임1] 참가신청서_{ME['name']}",
    "consent": f"[붙임1-1] 개인정보수집이용동의서_{ME['name']}",
    "plan": f"기획서_{ME['name']}_퇴장겹침예보",
}


def png_px(b):
    return struct.unpack(">II", b[16:24])


# ───────────────────────── 블록 정의 ─────────────────────────
def app_blocks():
    B = [("title", "붙임1", f"{EVENT} 참가 신청서"),
         ("tbl", dict(cols=[16, 12, 12, 12, 16, 12, 10, 10], align="cl", rows=[
             ["참가구분", "■ 개인   ☐ 팀", None, None, "참가분야", "■ 활용 사례", None, None],
             ["성명(대표자)", ME["name"], None, None, "생년월일", ME["birth"], None, None],
             ["휴대전화번호", ME["phone"], None, None, "이메일", ME["email"], None, None],
             ["주소", ME["addr"], None, None, None, None, None, None],
             ["소속(기업)", ME["org"], None, None, "팀명", ME["team"], None, None],
         ])),
         ("tbl", dict(cols=[16, 21, 21, 21, 21], head=["구분", "팀원1", "팀원2", "팀원3", "팀원4"], align="ccccc", rows=[
             ["성명", "-", "-", "-", "-"], ["휴대전화번호", "-", "-", "-", "-"], ["이메일", "-", "-", "-", "-"]])),
         ("tbl", dict(cols=[16, 84], align="cl", rows=[
             ["활용사례 제목", C.TITLE],
             ["활용데이터", "\n".join(["· " + x for x in C.DATA_MAIN] + ["· (타 기관) " + x for x in C.DATA_OTHER])],
             ["활용사례\n기획 개요", "\n".join("◦ " + x for x in C.APP_OVERVIEW)],
         ])),
         ("pledge",)]
    return B


PLEDGE_LEAD = f"본인은 한국체육산업개발(주)에서 개최하는 ｢{EVENT}｣에 참가하면서, 다음 각 호의 규정을 지킬 것을 서약합니다."
PLEDGE = [
    "1. 대회의 제반 규정을 준수하겠습니다.",
    "2. 참가신청서 및 기획서에 기재한 내용이 사실임을 확인하며, 허위 사실 기재 등으로 인하여 문제가 발생하면 모든 책임은 본인(팀)에게 있음을 확인합니다.",
    "3. 응모작에 대한 저작권으로 인하여 발생하는 민‧형사상 책임은 참가자에게 있습니다.",
    "4. 동일·유사 응모작으로 타 경진대회에서 수상한 사실이 있거나, 타인의 저작권을 침해하거나, 제출 내용이 허위로 확인되는 경우 접수 및 수상이 취소될 수 있으며, 이미 지급 받은 시상금은 반환합니다.",
    "5. 응모작의 저작권은 참가자에게 귀속되며, 수상작에 한하여 한국체육산업개발(주)가 정책개선 및 공공 활용을 위하여 홈페이지 등에 게재·공개하는 것에 동의합니다.",
    "6. 수상작의 경우 웹/앱 등 원천 개발 소스 제공 및 2028년까지 서비스 운영에 협조하겠습니다.",
    "7. 심사 결과에 대해 이의를 제기하지 않으며, 원활한 대회 진행에 적극적으로 협조하겠습니다.",
]

CONSENT = [
    ("1. 개인정보 수집‧이용 목적", f"｢{EVENT}｣ 참가자 관리, 수상자 선정, 진행 상황 안내, 수상작 활용 협약 체결 및 사후 관리를 위해 개인정보를 수집하며, 목적 이외의 용도로는 사용하지 않습니다."),
    ("2. 개인정보 처리자", "한국체육산업개발(주) 디지털혁신팀 02-2180-3504"),
    ("3. 개인정보 수집‧이용 항목", "이름, 생년월일, 휴대전화번호, 이메일, 주소, 소속, 팀명\n※ 수상자의 시상금 지급을 위한 정보는 수상 확정 후 별도 동의를 받아 수집"),
    ("4. 동의 거부 권리 및 불이익", f"신청자는 개인정보 수집‧이용 동의에 대해 거부할 권리가 있습니다. 다만, 동의를 거부할 경우에는 ｢{EVENT}｣ 참가자에 대한 공정한 심사 등을 위해 참가가 제한됩니다."),
    ("5. 보유 및 이용기간", "일반참가자는 결과 발표 후 즉시 해당 정보 파기, 수상자의 경우 시상금 지급 완료 및 수상작 서비스 운영 협약 종료일(2028년)까지 보유합니다.\n관련 법령에 따라 보존이 필요한 정보는 해당 기간 동안 보존하며, 보유기간 경과 시 지체 없이 파기합니다."),
]


def consent_blocks():
    return [("title", "붙임1-1", "개인정보 수집 및 이용에 관한 동의서"),
            ("tbl", dict(cols=[28, 72], align="ll", rows=[[a, b] for a, b in CONSENT])),
            ("p_c", "본인은 개인정보 수집‧이용에 관한 상기 내용을 확인하였으며, 아래와 같이 동의합니다."),
            ("p_c", DATE),
            ("consent_sign",)]


def plan_blocks():
    S = C.SUMMARY
    B = [("title", "붙임1", f"{EVENT} 기획서"),
         ("h", "o 기획 요약서"),
         ("tbl", dict(cols=[20, 80], align="cl", rows=[
             ["1. 활용사례명", S["name"]],
             ["2. 사용한 공공데이터명", S["data"]],
             ["3. 요약", "\n".join("◦ " + x for x in S["summary"])],
             ["4. 기대효과", "\n".join("◦ " + x for x in S["effect"])],
         ])),
         ("pb",),
         ("h", "o 상세 기획서")]
    return B + C.detail_blocks()


# ───────────────────────── HWPX ─────────────────────────
class Builder:
    def __init__(self):
        z = zipfile.ZipFile(SKEL)
        self.sec = z.read("Contents/section0.xml").decode("utf-8")
        self.hdr0 = z.read("Contents/header.xml").decode("utf-8")
        self.ids = D.Ids(int(re.search(r'<hh:charProperties itemCnt="(\d+)"', self.hdr0).group(1)),
                         int(re.search(r'<hh:paraProperties itemCnt="(\d+)"', self.hdr0).group(1)))
        self.hdr = D.extend_header(self.hdr0, self.ids)
        self.h = D.Hwpx(self.ids)

    def first_para(self, label, page_num=False):
        t = D.top_paragraphs(self.sec)
        p0 = self.sec[t[0][0]:t[0][1]]
        p0 = p0.replace("&lt;서식 3&gt;", escape(label))
        if page_num:
            p0 = p0.replace("</hp:ctrl></hp:run>", '</hp:ctrl><hp:ctrl><hp:pageNum pos="BOTTOM_CENTER" formatType="DIGIT" sideChar="-"/></hp:ctrl></hp:run>', 1)
        return self.sec[:t[0][0]], p0, self.sec[t[-1][1]:]

    def sig_run(self, cp):
        return f'<hp:run charPrIDRef="{cp}">{self.h.pic(SIG, png_px(SIG), 18)}<hp:t/></hp:run>'

    def render(self, blocks, label, page_num=False):
        head, p0, tail = self.first_para(label, page_num)
        ids, out, rest = self.ids, [], []
        special = ("title", "pledge", "p_c", "consent_sign")
        for b in blocks:
            k = b[0]
            if k not in special:
                rest.append(b)
                continue
            if rest:
                out.append(self.h.render(rest, self.loader))
                rest = []
            if k == "title":
                out.append(self.h.table(dict(cols=[14, 86], align="cc", rows=[[b[1], b[2]]])))
                out.append(D.para(D.PP_PLAIN, f'<hp:run charPrIDRef="{D.CP_T}"/>'))
            elif k == "pledge":
                lines = ["**참가 서약서**", PLEDGE_LEAD] + PLEDGE
                out.append(self.h.table(dict(cols=[1], rows=[["\n".join(lines)]], first=False, align="l")))
                out.append(D.para(D.PP_CELL_C, D.bold_runs(DATE, D.CP_BODY, D.CP_BODY)))
                out.append(D.para(D.PP_CELL_C, D.bold_runs(f"신청인   {ME['name']}       (인) ", D.CP_BODY, D.CP_BODY) + self.sig_run(D.CP_BODY)))
                out.append(D.para(D.PP_CELL_C, D.bold_runs("한국체육산업개발주식회사 귀하", D.CP_H, D.CP_H)))
            elif k == "p_c":
                out.append(D.para(D.PP_CELL_C, D.bold_runs(b[1], D.CP_BODY, D.CP_BODY)))
            elif k == "consent_sign":
                tbl = self.h.table(dict(cols=[34, 33, 33], head=["동의 여부", "이름", "서명"], align="ccc", first=False, rows=[
                    ["■ 동의  /  □ 거부", ME["name"], "@SIG@"],
                    ["□ 동의  /  □ 거부", "", ""], ["□ 동의  /  □ 거부", "", ""],
                    ["□ 동의  /  □ 거부", "", ""], ["□ 동의  /  □ 거부", "", ""]]))
                # 서명 칸에 그림 넣기
                tbl = tbl.replace('<hp:t>@SIG@</hp:t></hp:run>', '<hp:t/></hp:run>' + self.sig_run(D.CP_T), 1)
                out.append(tbl)
        if rest:
            out.append(self.h.render(rest, self.loader))
        return head + p0 + "".join(out) + tail

    @staticmethod
    def loader(path):
        b = (ROOT / path).read_bytes()
        return b, png_px(b)


def text_of(xml):
    return "\r\n".join(re.sub(r"<[^>]+>", "", "".join(re.findall(r"<hp:t>(.*?)</hp:t>", q)))
                       for q in re.findall(r"<hp:p .*?</hp:p>", xml, flags=re.S))


def package(out, section, header, images, title):
    import xml.dom.minidom as md
    zin = zipfile.ZipFile(SKEL)
    with zipfile.ZipFile(out, "w") as z:
        for info in zin.infolist():
            fn = info.filename
            data = zin.read(fn)
            if fn == "Contents/section0.xml":
                data = section.encode("utf-8")
            elif fn == "Contents/header.xml":
                data = header.encode("utf-8")
            elif fn == "Contents/content.hpf":
                s = data.decode("utf-8")
                items = "".join(f'<opf:item id="{iid}" href="BinData/{iid}.png" media-type="image/png" isEmbeded="1"/>' for iid, _ in images)
                s = s.replace('<opf:item id="section0"', items + '<opf:item id="section0"', 1)
                s = s.replace("<opf:title/>", f"<opf:title>{escape(title)}</opf:title>", 1)
                s = re.sub(r'(<opf:meta name="creator" content="text">)[^<]*', rf"\g<1>{ME['name']}", s)
                s = re.sub(r'(<opf:meta name="lastsaveby" content="text">)[^<]*', rf"\g<1>{ME['name']}", s)
                s = re.sub(r'(<opf:meta name="(?:CreatedDate|ModifiedDate)" content="text">)[^<]*', r"\g<1>2026-11-08T09:00:00Z", s)
                s = re.sub(r'(<opf:meta name="date" content="text">)[^<]*', r"\g<1>2026년 11월 8일 일요일", s)
                data = s.encode("utf-8")
            elif fn == "Preview/PrvText.txt":
                data = text_of(section)[:1000].encode("utf-8")
            ct = zipfile.ZIP_STORED if fn in ("mimetype", "version.xml", "Preview/PrvImage.png") else zipfile.ZIP_DEFLATED
            z.writestr(zipfile.ZipInfo(fn, date_time=info.date_time), data, compress_type=ct)
            if fn == "Contents/header.xml":
                for iid, b in images:
                    z.writestr(zipfile.ZipInfo(f"BinData/{iid}.png", date_time=info.date_time), b, compress_type=zipfile.ZIP_STORED)
    with zipfile.ZipFile(out) as z:
        for n in ("Contents/section0.xml", "Contents/header.xml", "Contents/content.hpf"):
            md.parseString(z.read(n))
        assert z.namelist()[0] == "mimetype"
    print("hwpx", out.name, out.stat().st_size)


def build_hwpx(kind):
    bd = Builder()
    blocks = {"app": app_blocks, "consent": consent_blocks, "plan": plan_blocks}[kind]()
    label = ""  # 맨 위 안내 문구 자리는 비움(제목 상자에 붙임 번호가 있음)
    sec = bd.render(blocks, label, page_num=(kind == "plan"))
    package(ROOT / f"{NAMES[kind]}.hwpx", sec, bd.hdr, bd.h.images, NAMES[kind])
    return sec


# ───────────────────────── HTML ─────────────────────────
def sig_img(h=40):
    import base64
    return f'<img class="sig" style="height:{h}px" src="data:image/png;base64,{base64.b64encode(SIG).decode()}">'


FORM_CSS = """
body { font-size:11pt; }
.form table.t td, .form table.t th { padding:3pt 6pt; }
.title { display:flex; border:0.3mm solid #000; margin-bottom:8pt; }
.title .l { width:14%; background:#F5F7FA; font-weight:bold; text-align:center; padding:6pt 0; border-right:0.15mm solid #000; font-size:11pt; }
.title .r { flex:1; text-align:center; font-weight:bold; font-size:15pt; padding:4pt 0; }
.pc { text-align:center; margin:6pt 0; }
.sw { position:relative; display:inline-block; }
.sig { position:absolute; left:50%; top:50%; transform:translate(-50%,-55%); }
table.t td p { text-align:left; }
.pledge { border:0.15mm solid #000; padding:6pt 10pt; font-size:9.6pt; line-height:1.4; margin:0 0 4pt; }
.pledge p { margin:0 0 3pt; padding-left:1.2em; text-indent:-1.2em; }
.pledge p.lead { padding-left:0; text-indent:0; }
"""


def html_doc(kind):
    blocks = {"app": app_blocks, "consent": consent_blocks, "plan": plan_blocks}[kind]()
    img_src = lambda p: (ROOT / p).as_uri()
    out = []
    for b in blocks:
        k = b[0]
        if k == "title":
            out.append(f'<div class="title"><div class="l">{escape(b[1])}</div><div class="r">{escape(b[2])}</div></div>')
        elif k == "pledge":
            out.append('<div class="pledge"><p class="lead" style="text-align:center"><b>참가 서약서</b></p>'
                       f'<p class="lead">{escape(PLEDGE_LEAD)}</p>' + "".join(f"<p>{escape(x)}</p>" for x in PLEDGE) + "</div>")
            out.append(f'<p class="pc">{DATE}</p>')
            out.append(f'<p class="pc">신청인 &nbsp; {ME["name"]} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <span class="sw">(인){sig_img(34)}</span></p>')
            out.append('<p class="pc" style="font-size:13pt;font-weight:bold">한국체육산업개발주식회사 귀하</p>')
        elif k == "p_c":
            out.append(f'<p class="pc">{escape(b[1])}</p>')
        elif k == "consent_sign":
            rows = "".join(f'<tr><td class="c">{"■" if i == 0 else "□"} 동의 &nbsp;/&nbsp; □ 거부</td><td class="c">{ME["name"] if i == 0 else ""}</td>'
                           f'<td class="c" style="height:30pt">{("<span class=sw>&nbsp;" + sig_img(36) + "</span>") if i == 0 else ""}</td></tr>' for i in range(5))
            out.append(f'<table class="t"><thead><tr><th>동의 여부</th><th>이름</th><th>서명</th></tr></thead><tbody>{rows}</tbody></table>')
        else:
            if out and isinstance(out[-1], list):
                out[-1].append(b)
            else:
                out.append([b])
    out = [D.render_html(x, img_src) if isinstance(x, list) else x for x in out]
    extra = FORM_CSS + ("body{font-size:12pt;line-height:1.55} .h{font-size:13.5pt} table.t{font-size:9.6pt}" if kind == "plan" else "")
    css = D.CSS if kind == "plan" else D.CSS.replace('@bottom-center { content: "- " counter(page) " -"; font-family:\'HY신명조\',\'Batang\',serif; font-size:9pt; color:#333; }', "")
    if kind != "plan":
        extra += "@page { size:A4; margin:14mm 16mm 12mm; }"
    return f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>{escape(NAMES[kind])}</title><style>{css}{extra}</style></head><body class="{"plan" if kind == "plan" else "form"}">{"".join(out)}</body></html>'
