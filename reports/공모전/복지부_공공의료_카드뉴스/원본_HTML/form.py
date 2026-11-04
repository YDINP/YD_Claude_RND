import os
H = os.path.dirname(os.path.abspath(__file__))
AI_NOTES = [
 "각 공모 분야(카드뉴스·수기·숏폼)는 생성형 AI의 활용 자체를 제한하지는 않습니다. 단, 작품의 핵심 아이디어 및 창작 내용은 응모자가 직접 구성·제작 또는 작성하여야 합니다.",
 "카드뉴스 및 숏폼 제작에 생성형 AI를 활용한 경우, 제출서류(AI 활용 내역 및 서약서)를 제출하고, 작품 내 마지막 페이지(카드뉴스) 및 엔딩 화면(숏폼)에 \"본 작품은 제작 과정에서 생성형 AI를 활용하였습니다. \"와 같은 문구를 표시해야 합니다.",
 "수기 작품은 핵심 내용과 문장을 응모자가 직접 작성하여야 하며, 생성형 AI를 활용한 경우에도 AI 활용 여부, 활용 도구 및 활용 범위를 제출서류(AI 활용 내역 및 서약서) 및 작품 설명란에 기재하여야 합니다.",
 "카드뉴스 및 숏폼의 이미지·음성·음악·내레이션·영상 등 시청각 요소에 생성형 AI를 활용한 경우, 해당 요소의 AI 활용 여부를 명확히 표시하여야 합니다.",
 "이미지·음원·폰트 등 외부 자료를 사용하는 경우 정당한 이용 권한 및 라이선스가 확인된 자료를 사용하여야 합니다.",
 "AI 생성물에 포함된 사실·통계·정책 등의 내용은 응모자가 직접 확인하여야 하며, 작품의 내용 및 권리관계에 대한 책임은 응모자에게 있습니다.",
 "AI 활용 사실을 기재하지 않거나 실제 활용 내용과 다르게 기재한 경우, 심사 제외, 감점 또는 수상 취소 등의 불이익이 발생할 수 있습니다.",
]
RULES = [
 "접수작은 타 공모전에서 수상하지 않은 순수 창작물이어야 하며, 표절·도용·모방 또는 제 3자의 권리를 침해한 작품은 심사에서 제외하거나 수상을 취소할 수 있습니다. 수상이 취소된 경우 지급된 상금은 환수될 수 있습니다.",
 "혐오 표현, 욕설·비속어, 음란성, 과도한 폭력적 묘사 등 부적절한 내용이 포함된 작품은 심사 대상에서 제외합니다.",
 "수상작에 대한 저작권은 수상자에게 있으나 출품 시 작품 활용에 동의한 것으로 간주되며, 공모전 주최측에서 공공의료 관련 교육⋅홍보 등의 목적으로 수상작(참가상 포함)을 활용할 수 있습니다.",
 "동일 응모자의 여러 작품이 수상작으로 선정된 경우, 가장 높은 점수를 받은 한 작품에 대해서만 시상합니다.",
 "개인 또는 팀/기관으로 참가할 수 있으며, 공모 분야별 주제를 달리하여 1작품씩 중복 참여할 수 있습니다. 단, 동일 응모자가 개인과 팀/기관 자격으로 중복하여 참가할 수 없습니다.",
 "팀/기관으로 접수 시 대표자를 지정해야 하며, 시상금은 대표자에게 지급됩니다.",
 "시상금의 제세공과금은 수상자 본인이 부담하며, 세금 공제 후 지급됩니다.",
]
OATH = [
 "본 출품작(카드뉴스·수기·숏폼)은 응모자가 직접 기획·제작 또는 작성한 순수 창작물로, 타 공모전에 출품되지 않았으며 이미 발표되었거나 모방·차용하지 않았음을 확인합니다.",
 "출품작은 제3자의 저작권, 특허권, 상표권, 초상권, 성명권 및 기타 지식재산권 등 타인의 권리를 일체 침해하지 않았음을 확인합니다.",
 "이미지·음원·폰트·영상 등 외부 자료를 활용한 경우 정당한 이용 권한 및 라이선스를 확보하였음을 확인합니다.",
 "생성형 AI를 활용한 경우 특정인의 저작물·화풍·캐릭터·상표·얼굴·음성 등을 무단으로 이용하거나 부당하게 모방하지 않았으며, AI 활용 내역을 사실에 근거하여 기재하였음을 서약합니다.",
 "본 출품작과 관련하여 허위 기재, 표절, 중복 출품 또는 제3자와의 권리 분쟁이 발생할 경우 모든 민·형사상 법적 책임은 응모자 본인에게 있습니다. 이 경우 주최/주관사의 결정에 따라 입상 무효, 수상 취소, 상금 및 상장 환수 조치가 이루어질 수 있으며, 주최/주관사에 발생한 손해 일체에 대해 배상 책임을 부담합니다.",
 "출품작에 대한 저작권(저작재산권과 저작인격권)은 출품자에게 귀속되며, 제출된 작품 및 서류는 반환하지 않습니다.",
 "주최/주관사는 입상작을 공모전의 취지·목적에 따라 비영리·공익적 목적으로 복제·전시·배포할 수 있으며, 교육 자료나 홍보물 제작 등을 위한 2차적 저작물 작성 및 활용 권리를 가집니다. (상금 지급을 통해 정당한 이용 권한을 합의·확보한 것으로 봅니다.)",
 "본인은 「AI 활용 유의사항」,「공모전 유의사항」및「저작권 및 권리 침해 방지 확인」의 내용을 모두 확인하고 이를 준수할 것에 동의합니다.",
]
ol = lambda L: "".join(f"<p class=n>{i}. {t}</p>" for i, t in enumerate(L, 1))
CSS = """
@page{size:A4;margin:14mm 14mm}
body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:10pt;color:#000;line-height:1.45}
h1{text-align:center;font-size:17pt;margin:0 0 10px;padding:8px;border:2px solid #000}
table{width:100%;border-collapse:collapse;margin-bottom:8px}
td,th{border:1px solid #000;padding:5px 7px;vertical-align:middle;font-size:9.5pt}
th{background:#e9e9e9;font-weight:700;text-align:center}
.l{background:#e9e9e9;font-weight:700;text-align:center;width:17%}
h2{font-size:11pt;margin:10px 0 4px;padding:3px 8px;background:#333;color:#fff}
p.n{margin:2px 0;font-size:8.6pt;line-height:1.38;text-align:justify}
.ex{color:#666}
.sign{margin-top:26px;text-align:center;font-size:12pt}
.sg{position:relative;display:inline-block;width:330px;text-align:left}
.sg img{position:absolute;left:190px;top:-22px;width:90px;opacity:.95}
.pb{page-break-before:always}
"""
page1 = f"""
<h1>2026 대국민 공공의료 공모전<br>생성형 AI 활용 내역 및 서약서</h1>
<table>
<tr><th class=l>구분</th><th colspan=3>내용</th></tr>
<tr><td class=l rowspan=5>출품자<br>(대표자)<br>기본정보</td><td class=l>공모분야</td><td colspan=2>[ <b>V</b> ] 카드뉴스 &nbsp;&nbsp;&nbsp; [&nbsp;&nbsp;] 숏폼 &nbsp;&nbsp;&nbsp; [&nbsp;&nbsp;] 수기</td></tr>
<tr><td class=l>성명</td><td colspan=2>박용진 (개인)</td></tr>
<tr><td class=l>연락처</td><td colspan=2>010-2576-9278</td></tr>
<tr><td class=l>이메일</td><td colspan=2>parkkb10@gmail.com</td></tr>
<tr><td class=l>작품명</td><td colspan=2><b>아픈 날, 어디로 가야 할지 막막했던 적 있나요? — 공공의료, 우리 곁의 이야기</b></td></tr>
<tr><td class=l colspan=2>생성형 AI 활용 여부</td><td colspan=2>[ <b>V</b> ] 활용 &nbsp;&nbsp;&nbsp;&nbsp; [&nbsp;&nbsp;] 미활용</td></tr>
</table>
<h2>생성형 AI 활용과정 기술서</h2>
<table>
<tr><th style="width:11%">단계</th><th style="width:19%">도구명/버전</th><th style="width:35%">주요 프롬프트 요약</th><th>출품자의 가공·편집</th></tr>
<tr><td class=l style="width:11%">기획·<br>자료조사</td><td>Claude (Anthropic) / Claude Code, Claude Sonnet 5.5</td><td>공모 요강·규격 확인, 세부 주제(자랑하고 싶은 공공의료) 선정, 6컷 구성안과 문구 초안 작성, 공식 출처(법령·국립중앙의료원·응급의료포털 E-GEN) 확인 보조</td><td>응모자가 주제·메시지 방향을 정하고, 문구와 사실관계(출처 원문)를 직접 확인·수정하여 확정</td></tr>
<tr><td class=l>이미지</td><td>생성형 AI 이미지 도구 미사용 (Claude가 작성한 HTML/CSS·인라인 SVG 코드로 도형·아이콘 구성, Chrome 헤드리스 캡처)</td><td>6컷 1080×1080px 레이아웃·색상·도형 아이콘 코드 작성 요청</td><td>응모자가 결과물을 검토하고 최종 확정</td></tr>
<tr><td class=l>영상</td><td colspan=3>해당 없음 (미사용)</td></tr>
<tr><td class=l>음성</td><td colspan=3>해당 없음 (미사용)</td></tr>
</table>
<table>
<tr><td class=l style="width:17%">AI 활용 비중</td><td>전체의 약 <b>70</b>% 활용 / [&nbsp;&nbsp;] 전체 생성 &nbsp; [ <b>V</b> ] 핵심 요소 생성 &nbsp; [&nbsp;&nbsp;] 보조적 활용<br><span class=ex>(기획 보조·문구 초안·레이아웃 코드 작성에 활용. 사진·일러스트 등 이미지 생성 AI는 사용하지 않음)</span></td></tr>
<tr><td class=l>출처 및 저작권 확인<br>(폰트, 음원, 레퍼런스 이미지 등)</td><td>
- 폰트: 맑은 고딕(Windows 기본 시스템 폰트)<br>
- 아이콘·도형: 직접 작성한 인라인 SVG (외부 이미지·음원·레퍼런스 이미지 사용 없음)<br>
- 인용 내용: 「공공보건의료에 관한 법률」 제2조(국가법령정보센터), 국립중앙의료원 홈페이지(nmc.or.kr), 응급의료포털 E-GEN(e-gen.or.kr) — 2026.10.27. 확인</td></tr>
</table>
"""
page2 = f"""
<h2>AI 활용 유의 사항</h2>{ol(AI_NOTES)}
<h2>공모전 유의사항</h2>{ol(RULES)}
<h2>저작권 및 권리 침해 방지 확인 서약</h2>{ol(OATH)}
<div class=sign>2026년 &nbsp;10월 &nbsp;28일<br><br><br>
신청인(대표자) &nbsp;&nbsp; <span class=sg><b>박 용 진</b><span style='margin-left:140px'>(서명 또는 인)</span><img src="sig.png"></span><br><br><br>
<b style="font-size:14pt">국립중앙의료원장 귀하</b></div>
"""
html = f"<!doctype html><html lang=ko><head><meta charset=utf-8><style>{CSS}</style></head><body>{page1}<div class=pb></div>{page2}</body></html>"
open(os.path.join(H, "ai_form.html"), "w", encoding="utf-8", newline="").write(html)
