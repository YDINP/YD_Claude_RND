// 경기신보 「모두의 소통」 공모 — 상세 PPT (표지 + 본문 10쪽)
// 실행: NODE_PATH=<pptxgenjs 설치 폴더>/node_modules node make_ppt.js <출력.pptx>
const path = require("path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const md = require("react-icons/md");
const { applyTheme } = require(process.env.APPLY_THEME);

const OUT = process.argv[2];
const FONT = "맑은 고딕";
const THEME = {
  name: "Stopline",
  headFontFace: FONT,
  bodyFontFace: FONT,
  colors: {
    dk1: "1B2A2F", lt1: "FFFFFF", dk2: "0F4C5C", lt2: "EEF4F5",
    accent1: "0F4C5C", accent2: "E4572E", accent3: "F2A900", accent4: "6C8B93",
    accent5: "C9DCE0", accent6: "2E7D5B", hlink: "0F4C5C", folHlink: "6C8B93",
  },
};
const HEX = THEME.colors;

async function icon(name, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(md[name], { color: "#" + color, size: String(size) }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

(async () => {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
  pres.title = "멈춤선 약정 — 경기신용보증재단 재도약 정책 제안";
  pres.author = "박용진";
  pres.theme = { headFontFace: FONT, bodyFontFace: FONT };
  const C = pres.SchemeColor;
  const W = 13.333;

  // ── 레이아웃 ──
  pres.defineSlideMaster({
    title: "COVER",
    background: { color: HEX.dk2 },
    objects: [],
  });
  pres.defineSlideMaster({
    title: "CONTENT",
    background: { color: HEX.lt1 },
    margin: [0.4, 0.6, 0.5, 0.6],
    objects: [
      { placeholder: { options: { name: "kicker", type: "body", x: 0.6, y: 0.38, w: 9, h: 0.34, fontSize: 13, bold: true, color: C.accent2, margin: 0, valign: "middle" }, text: "" } },
      { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.72, w: 12.1, h: 0.8, fontSize: 28, bold: true, color: C.text1, margin: 0, valign: "middle", align: "left" }, text: "" } },
      { text: { text: "멈춤선 약정 · 박용진", options: { x: 9.2, y: 7.05, w: 3.0, h: 0.3, fontSize: 9, color: C.accent4, align: "right", margin: 0 } } },
    ],
    slideNumber: { x: 12.3, y: 7.05, w: 0.45, h: 0.3, fontSize: 9, color: C.accent4, align: "right" },
  });

  const I = {
    store: await icon("MdStorefront", HEX.lt1),
    storeGrey: await icon("MdStorefront", "9AAEB3"),
    note: await icon("MdEditNote", HEX.lt1),
    pause: await icon("MdPauseCircleOutline", HEX.lt1),
    route: await icon("MdAltRoute", HEX.lt1),
    up: await icon("MdTrendingUp", HEX.lt1),
    swap: await icon("MdCompareArrows", HEX.lt1),
    exit: await icon("MdExitToApp", HEX.lt1),
    bank: await icon("MdAccountBalance", HEX.lt1),
    shield: await icon("MdShield", HEX.lt1),
    groups: await icon("MdGroups", HEX.lt1),
    warn: await icon("MdWarningAmber", HEX.lt1),
    bulb: await icon("MdLightbulbOutline", HEX.lt1),
    phone: await icon("MdPhoneInTalk", HEX.lt1),
  };

  const shadow = () => ({ type: "outer", color: "1B2A2F", opacity: 0.12, blur: 6, offset: 2, angle: 90 });
  const source = (s, text) => s.addText(text, { x: 0.6, y: 6.72, w: 8.5, h: 0.62, fontSize: 9.5, color: C.accent4, margin: 0, valign: "bottom", isTextBox: true, objectName: "source" });
  const head = (s, kicker, title) => {
    s.addText(kicker, { placeholder: "kicker" });
    s.addText(title, { placeholder: "title" });
  };
  const circleIcon = (s, img, x, y, d, fill, name) => {
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill }, objectName: name + "-circle" });
    const p = d * 0.22;
    s.addImage({ data: img, x: x + p, y: y + p, w: d - 2 * p, h: d - 2 * p, objectName: name + "-icon" });
  };
  const card = (s, x, y, w, h, fill, name, withShadow = true) =>
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: { color: fill }, shadow: withShadow ? shadow() : undefined, objectName: name });

  // ═════════ 표지 ═════════
  pres.addSection({ title: "표지" });
  {
    const s = pres.addSlide({ masterName: "COVER", sectionTitle: "표지" });
    s.addText("「모두의 소통」 소상공인 성장 및 재도약을 위한 정책 아이디어 공모전 · 재도약 분야", { x: 0.8, y: 0.7, w: 11.5, h: 0.4, fontSize: 14, color: "C9DCE0", margin: 0, isTextBox: true, objectName: "cover-contest" });
    s.addText([
      { text: "폐업은 ‘결심’이 아니라", options: { breakLine: true } },
      { text: "‘사고’처럼 온다" },
    ], { x: 0.8, y: 1.55, w: 11.5, h: 2.1, fontSize: 48, bold: true, color: C.background1, margin: 0, valign: "top", isTextBox: true, objectName: "cover-title" });
    s.addText("장사될 때 사장님이 미리 정해 두는 「멈춤선 약정」 — 경기신용보증재단 보증에 붙이는 재도약 장치", { x: 0.8, y: 3.75, w: 11.5, h: 0.5, fontSize: 19, color: "E8F0F2", margin: 0, isTextBox: true, objectName: "cover-sub" });
    // 멈춤선 모티프
    s.addShape(pres.shapes.LINE, { x: 0.8, y: 5.35, w: 11.7, h: 0, line: { color: HEX.accent3, width: 5, dashType: "dash" }, objectName: "cover-stopline" });
    s.addText("멈춤선  ·  예: 3개월 매출이 1년 전보다 30% 줄면, 30일 멈추고 세 갈래를 숫자로 비교한다", { x: 0.8, y: 5.5, w: 11.7, h: 0.4, fontSize: 14, color: HEX.accent3, margin: 0, isTextBox: true, objectName: "cover-stopline-label" });
    s.addText("제안자 박용진 · 2026. 11.", { x: 0.8, y: 6.6, w: 6, h: 0.4, fontSize: 14, color: "C9DCE0", margin: 0, isTextBox: true, objectName: "cover-author" });
    s.addNotes("안녕하십니까. 박용진입니다. 제 제안은 한 문장입니다. 폐업은 결심이 아니라 사고처럼 온다, 그래서 장사가 될 때 미리 멈출 선을 정해 두자는 것입니다. 경기신용보증재단 보증에 붙이는 작은 약정 한 장으로 시작할 수 있습니다.");
  }

  // ═════════ 1. 한 장 요약 ═════════
  pres.addSection({ title: "요약" });
  {
    const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "요약" });
    head(s, "한 장 요약", "내리막 구간에 ‘미리 정한 약속’을 둔다");
    const cols = [
      { t: "문제", img: I.warn, fill: HEX.accent2, items: ["폐업 10곳 중 9곳은 1년 전 ‘폐업 생각 없음’", "절반은 매출이 40~60% 줄어서야 결정", "재기 지원은 폐업·대위변제 ‘뒤’에 열림"] },
      { t: "해법 · 멈춤선 약정", img: I.note, fill: HEX.dk2, items: ["정한다: 보증 신청·연장 때 사장님이 직접 선택", "멈춘다: 선에 닿으면 30일 멈춤 상담·원금 유예", "고른다: 다시 서기·줄이기·사고 전 정리를 숫자로 비교"] },
      { t: "효과", img: I.up, fill: HEX.accent6, items: ["빚이 덜 쌓였을 때 결정", "사고 전 정리 → 신용 보존, 최대 15년 분할", "재단은 대위변제 전에 회수, 부실 감소"] },
    ];
    const cw = 3.87, gap = 0.25, y0 = 1.85;
    cols.forEach((c, i) => {
      const x = 0.6 + i * (cw + gap);
      card(s, x, y0, cw, 3.65, HEX.lt2, "sum-card-" + i, false);
      circleIcon(s, c.img, x + 0.3, y0 + 0.3, 0.7, c.fill, "sum-" + i);
      s.addText(c.t, { x: x + 1.15, y: y0 + 0.3, w: cw - 1.3, h: 0.7, fontSize: 19, bold: true, color: C.text1, margin: 0, valign: "middle", isTextBox: true, objectName: "sum-title-" + i });
      s.addText(c.items.map((t, k) => ({ text: t, options: { bullet: true, breakLine: k < c.items.length - 1 } })), { x: x + 0.3, y: y0 + 1.2, w: cw - 0.55, h: 2.3, fontSize: 16, color: C.text1, paraSpaceAfter: 12, valign: "top", margin: 0, isTextBox: true, objectName: "sum-body-" + i });
    });
    card(s, 0.6, 5.75, 12.1, 0.8, HEX.dk2, "sum-pilot", false);
    s.addText([
      { text: "첫 달 실행  ", options: { bold: true, color: HEX.accent3 } },
      { text: "1개 지점의 만기연장 고객에게 1쪽 약정서를 추가 — 시스템 개발 없이 기존 상담 흐름에서 시작", options: { color: HEX.lt1 } },
    ], { x: 0.9, y: 5.75, w: 11.6, h: 0.8, fontSize: 16, margin: 0, valign: "middle", isTextBox: true, objectName: "sum-pilot-text" });
    s.addNotes("요약입니다. 경기도에서 문을 닫은 가게 열 곳 중 아홉 곳은 1년 전까지 폐업을 생각하지 않았습니다. 절반은 매출이 반 가까이 빠진 뒤에야 결정합니다. 그런데 지금의 재기 지원은 폐업한 뒤, 또는 보증 사고가 난 뒤에 열립니다. 그래서 장사가 될 때 사장님이 직접 멈춤선을 정하고, 선에 닿으면 30일 멈춰서 세 갈래를 숫자로 비교해 고르게 하자는 것이 제안입니다.");
  }

  // ═════════ 2. 경기도 현황 ═════════
  pres.addSection({ title: "진단" });
  {
    const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "진단" });
    head(s, "경기도 소상공인 지금", "빚은 늘고, 가게의 수명은 짧아졌다");
    const tiles = [
      ["302조 원", "경기 자영업자 대출", "2025년 말 · 전국의 27.7%"],
      ["1.77%", "자영업자 대출 연체율", "2025년 말 · 10년 평균 0.95%"],
      ["1.01", "개업 대비 폐업 비율", "2024년 · 2022년 0.59에서 상승"],
      ["50.9%", "개업 점포 3년 생존율", "2024년 · 음식점업 41.3%"],
    ];
    const tw = 2.86, tg = 0.22;
    tiles.forEach((t, i) => {
      const x = 0.6 + i * (tw + tg), y = 1.85;
      card(s, x, y, tw, 2.45, HEX.lt1, "kpi-card-" + i);
      s.addText(t[0], { x: x + 0.25, y: y + 0.22, w: tw - 0.5, h: 0.95, fontSize: 38, bold: true, color: i === 1 ? C.accent2 : C.text2, margin: 0, valign: "middle", isTextBox: true, objectName: "kpi-num-" + i });
      s.addText(t[1], { x: x + 0.25, y: y + 1.22, w: tw - 0.5, h: 0.55, fontSize: 14, bold: true, color: C.text1, margin: 0, valign: "top", isTextBox: true, objectName: "kpi-label-" + i });
      s.addText(t[2], { x: x + 0.25, y: y + 1.77, w: tw - 0.5, h: 0.5, fontSize: 12, color: C.accent4, margin: 0, valign: "top", isTextBox: true, objectName: "kpi-note-" + i });
    });
    // 아래: 패널 조사 2개 + 시사점
    card(s, 0.6, 4.55, 5.9, 1.55, HEX.lt2, "panel-card", false);
    s.addText("가게의 빚과 수명", { x: 0.85, y: 4.68, w: 5.4, h: 0.4, fontSize: 14, bold: true, color: C.text2, margin: 0, isTextBox: true, objectName: "panel-title" });
    s.addText([
      { text: "운영 관련 대출(경기신보 패널)  8,712만 → 1억 335만 원(+18.6%)", options: { bullet: true, breakLine: true } },
      { text: "평균 영업기간(경상원)  3.7년(2020) → 3.2년(2024)", options: { bullet: true } },
    ], { x: 0.85, y: 5.1, w: 5.5, h: 0.95, fontSize: 13.5, color: C.text1, paraSpaceAfter: 8, margin: 0, valign: "top", isTextBox: true, objectName: "panel-body" });
    s.addText([
      { text: "버티는 동안 빚이 쌓인다", options: { bold: true, color: HEX.accent2, breakLine: true } },
      { text: "가게가 짧게 살수록, 문을 닫는 ‘때’를 정하는 일이 정책의 빈칸이 된다.", options: { color: HEX.dk1 } },
    ], { x: 6.85, y: 4.55, w: 5.85, h: 1.55, fontSize: 18, margin: 0, valign: "middle", isTextBox: true, objectName: "kpi-takeaway" });
    source(s, "출처: 한국은행 경기본부 자료(메트로신문 2026.10.8) · 경기도시장상권진흥원(메트로신문 2024.12.16, 경인일보 2025.6.4 「경제이슈 브리프 VOL.05」, 디지털타임스 2025.1.9) · 경기신용보증재단 「2025 경기도 소상공인 백서」 50쪽");
    s.addNotes("경기도 자영업자 대출은 302조 원, 연체율은 1.77%로 10년 평균의 두 배 가까이 됩니다. 2024년에는 문 닫는 가게가 여는 가게보다 많아졌고, 3년을 버티는 가게는 절반입니다. 재단 패널을 보면 운영 대출이 1년 새 18.6% 늘었습니다. 버티는 동안 빚이 쌓이고 있습니다.");
  }

  // ═════════ 3. 진단① 예고 없는 폐업 ═════════
  {
    const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "진단" });
    head(s, "진단 ①  폐업은 예고 없이 온다", "폐업 10곳 중 9곳은 1년 전 ‘폐업 생각이 없었다’");
    s.addText("92%", { x: 0.6, y: 1.8, w: 4.2, h: 1.6, fontSize: 88, bold: true, color: C.accent2, margin: 0, valign: "middle", isTextBox: true, objectName: "big-92" });
    s.addText("1년 사이 폐업한 238곳 중 약 219곳은 1년 전 조사에서 ‘1년 안에 폐업을 고려하지 않는다’고 답한 사업체", { x: 0.6, y: 3.45, w: 4.3, h: 1.2, fontSize: 15, color: C.text1, margin: 0, valign: "top", isTextBox: true, objectName: "big-92-label" });
    // 가게 10칸
    const gx = 5.3, gy = 1.95, d = 1.18, gg = 0.28;
    for (let k = 0; k < 10; k++) {
      const r = Math.floor(k / 5), c = k % 5;
      const x = gx + c * (d + gg), y = gy + r * (d + 0.45);
      const hit = k < 9;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: d, h: d, rectRadius: 0.12, fill: { color: hit ? HEX.accent2 : HEX.lt2 }, line: { color: hit ? HEX.accent2 : "9AAEB3", width: 1 }, objectName: "store-" + k });
      s.addImage({ data: hit ? I.store : I.storeGrey, x: x + 0.24, y: y + 0.2, w: d - 0.48, h: d - 0.48, objectName: "store-icon-" + k });
    }
    s.addText([{ text: "■ ", options: { color: HEX.accent2 } }, { text: "1년 전 ‘폐업 고려 안 함’ → 폐업   " }, { text: "■ ", options: { color: "9AAEB3" } }, { text: "‘폐업 고려’ → 폐업" }], { x: gx, y: 4.85, w: 7.2, h: 0.35, fontSize: 12, color: C.text1, margin: 0, isTextBox: true, objectName: "store-legend" });
    card(s, 0.6, 5.35, 12.1, 1.2, HEX.dk2, "imp-card", false);
    s.addText([
      { text: "그래서  ", options: { bold: true, color: HEX.accent3 } },
      { text: "‘폐업 예정자’가 먼저 신청하기를 기다리는 지원은 폐업할 가게 10곳 중 1곳만 만난다. 사장님이 손들기 전에, 미리 약속해 둔 기준이 대신 손을 들어야 한다.", options: { color: HEX.lt1 } },
    ], { x: 0.9, y: 5.35, w: 11.6, h: 1.2, fontSize: 16, margin: 0, valign: "middle", isTextBox: true, objectName: "imp-text" });
    source(s, "출처: 경기신용보증재단 「2025 경기도 소상공인 백서」 34~35쪽(패널 3,100곳, 1차 2024.10~12·2차 2025.10~12 방문면접). 비율은 백서 수치로 제안자 계산 — 폐업 고려 안 함 2,997곳 × 폐업률 7.3% ≈ 219곳, 폐업 고려 103곳 × 18.4% ≈ 19곳");
    s.addNotes("재단 백서의 패널 데이터입니다. 1년 사이 문을 닫은 238곳 가운데 약 219곳, 92%는 1년 전 조사에서 폐업을 고려하지 않는다고 답했던 곳입니다. 폐업을 예정한 분이 먼저 손들기를 기다리는 방식으로는 열 곳 중 한 곳만 만납니다.");
  }

  // ═════════ 4. 진단② 늦은 결정 ═════════
  {
    const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "진단" });
    head(s, "진단 ②  결정은 늦다", "매출이 반 가까이 빠져야 문을 닫고, 그때는 남는 게 적다");
    card(s, 0.6, 1.8, 5.6, 2.35, HEX.lt2, "late-card", false);
    s.addText("52%", { x: 0.9, y: 1.95, w: 2.4, h: 1.1, fontSize: 54, bold: true, color: C.accent2, margin: 0, valign: "middle", isTextBox: true, objectName: "late-52" });
    s.addText("매출이 40~60% 줄어든 뒤에 폐업을 결정 (20~40% 감소 때 결정 32%)", { x: 3.35, y: 2.0, w: 2.7, h: 1.05, fontSize: 13.5, color: C.text1, margin: 0, valign: "middle", isTextBox: true, objectName: "late-52-label" });
    s.addText("32.6%", { x: 0.9, y: 3.0, w: 2.4, h: 1.0, fontSize: 40, bold: true, color: C.text2, margin: 0, valign: "middle", isTextBox: true, objectName: "late-326" });
    s.addText("사업을 이어가는 이유 ‘특별한 대안이 없어서’", { x: 3.35, y: 3.05, w: 2.7, h: 0.9, fontSize: 13.5, color: C.text1, margin: 0, valign: "middle", isTextBox: true, objectName: "late-326-label" });
    card(s, 0.6, 4.35, 5.6, 2.2, HEX.lt2, "debt-card", false);
    s.addText("66.1%", { x: 0.9, y: 4.5, w: 2.4, h: 1.0, fontSize: 40, bold: true, color: C.text2, margin: 0, valign: "middle", isTextBox: true, objectName: "debt-661" });
    s.addText("빚을 안고 폐업, 평균 6,802만 원", { x: 3.35, y: 4.55, w: 2.7, h: 0.9, fontSize: 13.5, color: C.text1, margin: 0, valign: "middle", isTextBox: true, objectName: "debt-label" });
    s.addText("전국 조사: 폐업이 늦어진 이유 46.1%가 ‘새 인수자를 찾느라’", { x: 0.9, y: 5.55, w: 5.1, h: 0.85, fontSize: 13.5, color: C.text1, margin: 0, valign: "middle", isTextBox: true, objectName: "debt-note" });
    // 오른쪽: 폐업 절차 애로 차트
    s.addText("폐업 절차의 주된 어려움 (경기, 폐업 소상공인)", { x: 6.6, y: 1.8, w: 6.1, h: 0.4, fontSize: 15, bold: true, color: C.text1, margin: 0, isTextBox: true, objectName: "chart-title" });
    s.addChart(pres.charts.BAR, [{ name: "응답 비율(%)", labels: ["권리금 회수·업체 양도", "대출금 상환", "재고·비품·설비 처분", "폐업 시점 결정"], values: [22.6, 17.7, 17.7, 16.1] }], {
      x: 6.5, y: 2.25, w: 6.2, h: 3.25, barDir: "bar", catAxisOrientation: "maxMin",
      chartColors: [HEX.dk2], showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: '0.0"%"', dataLabelFontSize: 12, dataLabelColor: HEX.dk1, dataLabelFontFace: "+mn-lt",
      catAxisLabelColor: HEX.dk1, catAxisLabelFontSize: 13, catAxisLabelFontFace: "+mn-lt", valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" },
      valAxisMaxVal: 28, showLegend: false, barGapWidthPct: 55, objectName: "chart-pain",
    });
    s.addText("가게를 넘기고, 빚을 갚고, ‘언제’ 닫을지 정하는 일 — 모두 시간이 있어야 풀린다. 결정이 늦을수록 그 시간이 없다.", { x: 6.6, y: 5.6, w: 6.1, h: 0.95, fontSize: 15, bold: true, color: C.accent2, margin: 0, valign: "middle", isTextBox: true, objectName: "late-takeaway" });
    source(s, "출처: 경기신용보증재단 「2025 경기도 소상공인 백서」 37~39·96쪽(폐업 소상공인 추적조사 62곳, 사업 지속 의지 3,100곳) · 중소기업중앙회 「2025 폐업 소상공인 실태조사」(헤럴드경제 2025.12.2)");
    s.addNotes("결정은 늦습니다. 폐업자의 52%는 매출이 40~60% 줄어든 뒤에야 결정했습니다. 계속하는 이유의 3분의 1은 특별한 대안이 없어서입니다. 그 사이 빚은 쌓여 세 곳 중 두 곳이 평균 6,800만 원의 빚을 안고 문을 닫았습니다. 폐업할 때 가장 힘든 일은 권리금 회수와 양도, 대출 상환, 설비 처분, 그리고 언제 닫을지 정하는 일이었습니다. 모두 시간이 있어야 풀리는 문제입니다.");
  }

  // ═════════ 5. 진단③ 지원 공백 ═════════
  {
    const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "진단" });
    head(s, "진단 ③  왜 지금 정책이 닿지 않나", "지원은 ‘폐업 뒤’와 ‘사고 뒤’에 열린다");
    // 타임라인
    const ty = 4.05;
    const stages = [
      { x: 0.6, w: 1.7, t: "영업", fill: HEX.lt2, fc: HEX.dk1 },
      { x: 2.4, w: 3.2, t: "매출 내리막 · 아직 갚는 중", fill: HEX.accent3, fc: HEX.dk1 },
      { x: 5.7, w: 2.25, t: "연체 우려·연체", fill: "F4C7B8", fc: HEX.dk1 },
      { x: 8.05, w: 2.25, t: "폐업", fill: HEX.accent4, fc: HEX.lt1 },
      { x: 10.4, w: 2.3, t: "대위변제", fill: HEX.dk1, fc: HEX.lt1 },
    ];
    stages.forEach((g, i) => {
      s.addShape(pres.shapes.CHEVRON, { x: g.x, y: ty, w: g.w, h: 0.75, fill: { color: g.fill }, line: { color: g.fill }, objectName: "stage-" + i });
      s.addText(g.t, { x: g.x + 0.25, y: ty, w: g.w - 0.5, h: 0.75, fontSize: 14, bold: true, color: g.fc, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: "stage-label-" + i });
    });
    // 위쪽: 기존 지원
    const sup = [
      { x: 5.7, w: 2.25, t: "위기 알림톡", d: "중기부·지역신보(2026.3~). 위기 우려 시 알림 발송" },
      { x: 8.05, w: 2.25, t: "장기분할 전환보증", d: "폐업한 성실상환자, 최대 15년 분할(2025.9~)" },
      { x: 10.4, w: 2.3, t: "재도전 특례보증", d: "대위변제 기업 등, 교육 수료 후 최대 5천만 원" },
    ];
    sup.forEach((g, i) => {
      card(s, g.x, 1.75, g.w, 1.95, HEX.lt1, "sup-card-" + i);
      s.addText(g.t, { x: g.x + 0.15, y: 1.85, w: g.w - 0.3, h: 0.55, fontSize: 13.5, bold: true, color: C.text2, margin: 0, valign: "middle", isTextBox: true, objectName: "sup-title-" + i });
      s.addText(g.d, { x: g.x + 0.15, y: 2.4, w: g.w - 0.3, h: 1.2, fontSize: 11.5, color: C.text1, margin: 0, valign: "top", isTextBox: true, objectName: "sup-desc-" + i });
    });
    s.addText("+ 경기도시장상권진흥원 사업정리 지원(컨설팅·재기장려금) — 폐업 단계", { x: 5.7, y: 4.9, w: 7.0, h: 0.35, fontSize: 11.5, color: C.accent4, margin: 0, isTextBox: true, objectName: "sup-extra" });
    // 빈 구간
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 2.4, y: 1.75, w: 3.2, h: 1.95, rectRadius: 0.08, fill: { color: HEX.lt1 }, line: { color: HEX.accent2, width: 2, dashType: "dash" }, objectName: "gap-box" });
    s.addText([{ text: "빈 구간", options: { bold: true, color: HEX.accent2, fontSize: 18, breakLine: true } }, { text: "사장님이 결정해야 할 때, 결정을 돕는 장치가 없다", options: { color: HEX.dk1, fontSize: 14 } }], { x: 2.6, y: 1.85, w: 2.8, h: 1.75, margin: 0, valign: "middle", isTextBox: true, objectName: "gap-text" });
    card(s, 0.6, 5.45, 12.1, 1.15, HEX.lt2, "why-card", false);
    s.addText([
      { text: "알림은 위험을 알려 주지만 결정은 여전히 혼자 한다.  ", options: { bold: true, color: HEX.dk2 } },
      { text: "9.7년을 지킨 가게(폐업 소상공인 평균 운영기간) 앞에서 ‘대안이 없다’는 사장님은 남이 보낸 경고보다 자기가 미리 정한 기준에 더 잘 움직인다.", options: { color: HEX.dk1 } },
    ], { x: 0.85, y: 5.45, w: 11.6, h: 1.15, fontSize: 15, margin: 0, valign: "middle", isTextBox: true, objectName: "why-text" });
    source(s, "출처: 경북매일 2026.3.31(위기 알림톡) · 경향신문 2025.9.4(폐업 소상공인 장기 분할상환 보증) · 헤럴드경제 2026.4.21(재도전지원 특례보증 대상) · 파이낸셜뉴스 2026.4.6(경기도 사업정리 지원) · 백서 38쪽(평균 운영기간 9.7년)");
    s.addNotes("왜 지금 정책이 닿지 않을까요. 위기 알림톡은 위험을 알려 줍니다. 전환보증은 이미 폐업한 분, 재도전 특례보증은 대위변제가 난 분이 대상입니다. 매출이 꺾였지만 아직 갚고 있는 내리막 구간, 바로 사장님이 결정해야 하는 때에는 결정을 돕는 장치가 없습니다.");
  }

  // ═════════ 6. 해법 ═════════
  pres.addSection({ title: "해법" });
  {
    const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "해법" });
    head(s, "제안  「멈춤선 약정」", "정한다 · 멈춘다 · 고른다");
    const steps = [
      { n: "1", t: "정한다", when: "보증 신청·만기연장 상담 때 5분", img: I.note, fill: HEX.dk2,
        items: [["사장님이 직접 고르는 멈춤선", 0], ["3개월 매출 30%↓(1년 전 대비)", 1], ["보증부 대출 이자 1회 연체", 1], ["생활비 3개월 못 가져감", 1], ["약정 고객은 보증료 우대", 0]] },
      { n: "2", t: "멈춘다", when: "선에 닿으면 30일", img: I.phone, fill: HEX.accent3,
        items: [["분기마다 매출·연체 확인(본인 동의)", 0], ["담당자가 직접 전화, 30분 상담", 0], ["30일 원금 상환 유예(은행 협약)", 0], ["문을 닫으라는 것이 아님", 0]] },
      { n: "3", t: "고른다", when: "우리 가게 숫자로 비교", img: I.route, fill: HEX.accent6,
        items: [["다시 서기 → 유예·컨설팅", 0], ["줄이기·바꾸기 → 조건 변경", 0], ["사고 전 정리 → 15년 분할", 0], ["고르면 재단이 바로 연결", 0]] },
    ];
    const cw = 3.87, gap = 0.25, y0 = 1.8;
    steps.forEach((c, i) => {
      const x = 0.6 + i * (cw + gap);
      card(s, x, y0, cw, 3.75, HEX.lt1, "step-card-" + i);
      circleIcon(s, c.img, x + 0.3, y0 + 0.3, 0.75, c.fill, "step-" + i);
      s.addText(c.n + "  " + c.t, { x: x + 1.2, y: y0 + 0.28, w: cw - 1.35, h: 0.45, fontSize: 21, bold: true, color: C.text1, margin: 0, valign: "middle", isTextBox: true, objectName: "step-title-" + i });
      s.addText(c.when, { x: x + 1.2, y: y0 + 0.73, w: cw - 1.35, h: 0.35, fontSize: 12.5, color: C.accent4, margin: 0, valign: "middle", isTextBox: true, objectName: "step-when-" + i });
      s.addText(c.items.map(([t, lv], k) => ({ text: t, options: { bullet: lv ? { code: "2013" } : true, indentLevel: lv, breakLine: k < c.items.length - 1 } })), { x: x + 0.3, y: y0 + 1.3, w: cw - 0.55, h: 2.35, fontSize: 15, color: C.text1, paraSpaceAfter: 8, margin: 0, valign: "top", isTextBox: true, objectName: "step-body-" + i });
      if (i < 2) s.addText("›", { x: x + cw - 0.05, y: y0 + 1.5, w: 0.35, h: 0.6, fontSize: 30, bold: true, color: C.accent4, align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: "step-arrow-" + i });
    });
    card(s, 0.6, 5.75, 12.1, 0.85, HEX.lt2, "why-works", false);
    s.addText([
      { text: "왜 통하나  ", options: { bold: true, color: HEX.dk2 } },
      { text: "장사가 될 때 정한 선은 ‘남이 보낸 경고’가 아니라 ‘내가 한 약속’이다. 미리 약속하게 한 저축 설계(Save More Tomorrow)는 가입자 저축률을 3.5%에서 13.6%로 올렸다.", options: { color: HEX.dk1 } },
    ], { x: 0.85, y: 5.75, w: 11.6, h: 0.85, fontSize: 14, margin: 0, valign: "middle", isTextBox: true, objectName: "why-works-text" });
    source(s, "출처: R. Thaler & S. Benartzi (2004), “Save More Tomorrow”, Journal of Political Economy 112(S1). 보증료 우대 폭·멈춤선 기본값은 재단이 정하는 값(제안자 예시)");
    s.addNotes("제안은 세 단계입니다. 첫째, 보증을 신청하거나 만기를 연장할 때 5분을 들여 사장님이 직접 멈춤선을 고릅니다. 둘째, 그 선에 닿으면 재단 담당자가 직접 전화하고 30일 멈춥니다. 원금은 30일 유예하고 30분 상담을 합니다. 셋째, 다시 서기, 줄이기와 바꾸기, 사고 전 정리 세 갈래를 우리 가게 숫자로 비교해 사장님이 고릅니다. 장사가 될 때 스스로 정한 선이기 때문에 경고가 아니라 약속으로 받아들여집니다.");
  }

  // ═════════ 7. 한 장 견본 ═════════
  {
    const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "해법" });
    head(s, "견본  사장님이 받는 두 장", "약정서 1쪽, 그리고 멈춤 상담의 ‘세 갈래 비교표’");
    // 약정서
    card(s, 0.6, 1.8, 4.6, 4.75, HEX.lt1, "pledge-card");
    s.addText("나의 멈춤선 약정서", { x: 0.9, y: 1.95, w: 4.0, h: 0.5, fontSize: 18, bold: true, color: C.text2, margin: 0, isTextBox: true, objectName: "pledge-title" });
    s.addText("아래 중 하나라도 닿으면, 30일 멈추고 재단과 상담하겠습니다.", { x: 0.9, y: 2.45, w: 4.0, h: 0.6, fontSize: 12.5, color: C.text1, margin: 0, isTextBox: true, objectName: "pledge-lead" });
    s.addText([
      { text: "☑  3개월 매출이 1년 전보다  30 %  줄면", options: { breakLine: true } },
      { text: "☐  보증부 대출 이자를 한 번이라도 늦게 내면", options: { breakLine: true } },
      { text: "☐  생활비를 3개월 가져가지 못하면", options: { breakLine: true } },
      { text: "연락받을 사람:  본인 · 가족(          )", options: { breakLine: true } },
      { text: "매출 확인 동의:  카드매출·부가세 신고(분기)", options: { breakLine: true } },
      { text: "2026.  .  .     사장님 서명  ____________" },
    ], { x: 0.9, y: 3.1, w: 4.1, h: 2.7, fontSize: 13.5, color: C.text1, paraSpaceAfter: 9, margin: 0, valign: "top", isTextBox: true, objectName: "pledge-items" });
    s.addText("약정 고객: 보증료 우대 · 멈춤 기간 원금 유예", { x: 0.9, y: 5.85, w: 4.1, h: 0.5, fontSize: 12.5, bold: true, color: C.accent6, margin: 0, valign: "middle", isTextBox: true, objectName: "pledge-perk" });
    // 세 갈래
    s.addText("멈춤 상담 비교표 — 예시(가상 가게): 음식점, 월 매출 1,800만 → 1,250만 원(-31%), 보증부 대출 7,000만 원", { x: 5.5, y: 1.8, w: 7.2, h: 0.6, fontSize: 13, bold: true, color: C.text1, margin: 0, valign: "middle", isTextBox: true, objectName: "route-lead" });
    const routes = [
      { t: "다시 서기", img: I.up, fill: HEX.accent6, d: "30일 원금 유예 + 재단 컨설팅(손익·고정비·메뉴 진단) → 3개월 뒤 같은 선으로 다시 확인" },
      { t: "줄이기·바꾸기", img: I.swap, fill: HEX.accent3, d: "면적 축소·이전·업종 전환. 보증 조건 변경으로 대출 유지, 이전 비용은 기존 정책자금 연결" },
      { t: "사고 전 정리", img: I.exit, fill: HEX.dk2, d: "15년 분할 전환보증: 2년간 이자 월 약 17만 원 → 이후 원리금 월 약 54만 원. 정리 기간 보증 유지(권리금 회수), ‘성실 정리 확인서’ 발급" },
    ];
    routes.forEach((r, i) => {
      const y = 2.5 + i * 1.37;
      card(s, 5.5, y, 7.2, 1.22, HEX.lt2, "route-card-" + i, false);
      circleIcon(s, r.img, 5.7, y + 0.24, 0.74, r.fill, "route-" + i);
      s.addText(r.t, { x: 6.6, y: y + 0.1, w: 1.75, h: 1.02, fontSize: 16, bold: true, color: C.text1, margin: 0, valign: "middle", isTextBox: true, objectName: "route-title-" + i });
      s.addText(r.d, { x: 8.35, y: y + 0.08, w: 4.2, h: 1.06, fontSize: 12.5, color: C.text1, margin: 0, valign: "middle", isTextBox: true, objectName: "route-desc-" + i });
    });
    source(s, "예시는 가상 가게. 상환액은 7,000만 원·연 2.95%·2년 거치 후 13년 원리금 균등 가정으로 제안자 계산(전환보증 조건: 경향신문 2025.9.4). ‘성실 정리 확인서’는 이 제안에서 새로 만드는 문서");
    s.addNotes("실제로 사장님이 받는 두 장입니다. 왼쪽은 약정서 한 쪽입니다. 오른쪽은 멈춤 상담 때 받는 비교표입니다. 예를 들어 매출이 31% 줄고 보증부 대출이 7,000만 원인 가게라면, 다시 서기, 줄이기와 바꾸기, 사고 전 정리를 나란히 보여 드립니다. 사고 전 정리를 고르면 15년 분할로 2년간 이자 월 17만 원, 이후 월 54만 원 수준이 됩니다. 숫자를 보고 사장님이 고릅니다.");
  }

  // ═════════ 8. 차이·역할 ═════════
  {
    const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "해법" });
    head(s, "기존 사업과의 관계", "새 제도를 더하는 것이 아니라, 있는 제도로 ‘제때’ 건너가게 한다");
    const hdr = (t) => ({ text: t, options: { bold: true, color: HEX.lt1, fill: { color: HEX.dk2 }, align: "center", valign: "middle" } });
    const cell = (t, o = {}) => ({ text: t, options: Object.assign({ color: HEX.dk1, valign: "middle" }, o) });
    const hl = (t) => cell(t, { bold: true, color: HEX.dk2, fill: { color: "FFF3D1" } });
    const rows = [
      [hdr(""), hdr("위기 알림톡"), hdr("장기분할 전환보증"), hdr("재도전 특례보증"), hdr("멈춤선 약정")],
      [cell("언제", { bold: true }), cell("위기 우려가 감지될 때"), cell("폐업한 뒤"), cell("대위변제 등 사고 뒤"), hl("매출 내리막, 연체 전")],
      [cell("기준은 누가", { bold: true }), cell("기관의 판단"), cell("제도 요건"), cell("제도 요건"), hl("사장님이 미리 약정")],
      [cell("사장님의 결정", { bold: true }), cell("정보를 받고 혼자 판단"), cell("이미 결정한 뒤"), cell("실패 뒤 재출발"), hl("30일 멈춤 + 세 갈래 비교 후 선택")],
    ];
    s.addTable(rows, { x: 0.6, y: 1.75, w: 12.1, colW: [1.9, 2.5, 2.5, 2.5, 2.7], rowH: [0.45, 0.5, 0.5, 0.5], fontSize: 13, fontFace: FONT, border: { type: "solid", pt: 0.75, color: "C9DCE0" }, objectName: "cmp-table" });
    s.addText("멈춤선 약정은 세 제도를 대신하지 않고, 상담 결과에 따라 그중 맞는 제도로 바로 연결한다.", { x: 0.6, y: 3.85, w: 12.1, h: 0.4, fontSize: 13.5, color: C.accent4, margin: 0, isTextBox: true, objectName: "cmp-note" });
    const roles = [
      { t: "경기신용보증재단", img: I.shield, fill: HEX.dk2, d: "약정서·보증료 우대, 분기 확인과 전화, 멈춤 상담과 비교표, 전환·재도전 보증 연결, 성실 정리 확인서, 약정·비약정 대위변제율 공개" },
      { t: "금융기관(은행)", img: I.bank, fill: HEX.accent3, d: "멈춤 기간 30일 원금 유예(협약), 사고 전 정리 고객 전환보증 대출 즉시 취급, 매출 정보 제공(본인 동의)" },
      { t: "유관기관", img: I.groups, fill: HEX.accent6, d: "경기도시장상권진흥원 사업정리 지원 우선 연계, 소진공 희망리턴패키지, 한국은행 경기본부 취약성 분석 공유" },
    ];
    const rw = 3.87, rg = 0.25;
    roles.forEach((r, i) => {
      const x = 0.6 + i * (rw + rg), y = 4.4;
      card(s, x, y, rw, 1.95, HEX.lt1, "role-card-" + i);
      circleIcon(s, r.img, x + 0.25, y + 0.22, 0.6, r.fill, "role-" + i);
      s.addText(r.t, { x: x + 1.0, y: y + 0.22, w: rw - 1.15, h: 0.6, fontSize: 15, bold: true, color: C.text1, margin: 0, valign: "middle", isTextBox: true, objectName: "role-title-" + i });
      s.addText(r.d, { x: x + 0.25, y: y + 0.95, w: rw - 0.45, h: 0.95, fontSize: 12.5, color: C.text1, margin: 0, valign: "top", isTextBox: true, objectName: "role-desc-" + i });
    });
    source(s, "기존 사업 출처: 경북매일 2026.3.31 · 경향신문 2025.9.4 · 헤럴드경제 2026.4.21 · 파이낸셜뉴스 2026.4.6");
    s.addNotes("기존 사업과의 관계입니다. 멈춤선 약정은 새 지원금을 만드는 것이 아닙니다. 알림톡, 전환보증, 재도전 보증은 모두 좋은 제도이지만 열리는 때가 늦거나 기준이 바깥에 있습니다. 멈춤선 약정은 사장님이 미리 정한 선에서 30일 멈추게 하고, 그 결과에 맞는 제도로 제때 건너가게 하는 다리입니다. 재단, 은행, 유관기관의 역할은 아래와 같습니다.");
  }

  // ═════════ 9. 시범 운영 ═════════
  pres.addSection({ title: "실행" });
  {
    const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "실행" });
    head(s, "실행 계획", "첫 달, 지점 한 곳의 만기연장 창구에서 시작한다");
    const ph = [
      { t: "1개월", h: "약정 시작", d: ["1개 지점 음식점·주점업 만기연장 고객 (업종별 폐업률 14.1%, 최고)", "연장 상담에 약정서 1쪽, 엑셀로 관리", "목표 약정 100건(추정)"] },
      { t: "2~6개월", h: "멈춤 운영", d: ["분기 매출 확인 (부가세·카드매출)", "선 도달 시 전화, 30일 멈춤 상담", "은행 1곳과 원금 유예 협약"] },
      { t: "7~12개월", h: "비교·확대", d: ["약정·비약정 고객 비교 공개", "전 지점·전 업종 확대", "보증 시스템에 약정 항목 반영"] },
    ];
    const pw = 2.78, pg = 0.18;
    ph.forEach((p, i) => {
      const x = 0.6 + i * (pw + pg);
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.8, w: pw, h: 0.85, rectRadius: 0.08, fill: { color: i === 0 ? HEX.accent2 : HEX.dk2 }, line: { color: i === 0 ? HEX.accent2 : HEX.dk2 }, objectName: "phase-head-" + i });
      s.addText([{ text: p.t, options: { bold: true, fontSize: 17, breakLine: true } }, { text: p.h, options: { fontSize: 12.5 } }], { x: x + 0.15, y: 1.8, w: pw - 0.3, h: 0.85, color: C.background1, margin: 0, valign: "middle", isTextBox: true, objectName: "phase-label-" + i });
      card(s, x, 2.75, pw, 2.75, HEX.lt2, "phase-card-" + i, false);
      s.addText(p.d.map((t, k) => ({ text: t, options: { bullet: true, breakLine: k < p.d.length - 1 } })), { x: x + 0.18, y: 2.9, w: pw - 0.32, h: 2.5, fontSize: 13.5, color: C.text1, paraSpaceAfter: 8, margin: 0, valign: "top", isTextBox: true, objectName: "phase-body-" + i });
    });
    card(s, 0.6, 5.65, 8.7, 0.9, HEX.dk2, "cost-band", false);
    s.addText([
      { text: "비용  ", options: { bold: true, color: HEX.accent3 } },
      { text: "약정서 인쇄·담당자 안내 외 새 시스템 없음. 보증료 0.1%p 우대 가정 시 100건 × 평균 보증 5,000만 원 = 연 500만 원(추정)", options: { color: HEX.lt1 } },
    ], { x: 0.85, y: 5.65, w: 8.3, h: 0.9, fontSize: 13, margin: 0, valign: "middle", isTextBox: true, objectName: "cost-text" });
    // KPI
    const kx = 9.55;
    card(s, kx, 1.8, 3.15, 4.75, HEX.lt1, "kpi-box");
    s.addText("성과 지표", { x: kx + 0.25, y: 1.95, w: 2.7, h: 0.45, fontSize: 16, bold: true, color: C.text2, margin: 0, isTextBox: true, objectName: "kpi-box-title" });
    s.addText([
      { text: "약정률 (연장 고객 중)", options: { bullet: true, breakLine: true } },
      { text: "선 도달 후 30일 안 상담률", options: { bullet: true, breakLine: true } },
      { text: "정리 결정 시점의 매출 감소율 (지금 40~60% → 30%대)", options: { bullet: true, breakLine: true } },
      { text: "정리 때 남은 빚", options: { bullet: true, breakLine: true } },
      { text: "약정·비약정 고객 대위변제 비율", options: { bullet: true } },
    ], { x: kx + 0.25, y: 2.5, w: 2.75, h: 3.9, fontSize: 13.5, color: C.text1, paraSpaceAfter: 10, margin: 0, valign: "top", isTextBox: true, objectName: "kpi-box-items" });
    source(s, "출처: 경기신용보증재단 「2025 경기도 소상공인 백서」 35쪽(업종별 폐업률). 목표 건수·우대 폭·평균 보증액은 제안자 가정값");
    s.addNotes("첫 달에 바로 할 수 있습니다. 지점 한 곳에서, 폐업률이 가장 높은 음식점과 주점업의 만기연장 고객에게 약정서 한 장을 추가합니다. 시스템 개발 없이 엑셀로 관리합니다. 2~6개월에는 분기마다 매출을 확인하고, 선에 닿으면 전화와 멈춤 상담을 합니다. 7~12개월에는 약정한 고객과 하지 않은 고객의 대위변제 비율과 정리 때 남은 빚을 비교해 공개하고 넓힙니다.");
  }

  // ═════════ 10. 기대효과·출처 ═════════
  {
    const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "실행" });
    head(s, "기대 효과", "멈춤선은 문을 닫는 선이 아니라, 생각을 시작하는 선");
    const fx = [
      { t: "소상공인", img: I.store, fill: HEX.accent2, d: ["빚이 덜 쌓였을 때 결정", "사고 없이 정리 → 신용 보존, 재창업 보증 우대", "권리금·설비 회수할 시간"] },
      { t: "경기신용보증재단", img: I.shield, fill: HEX.dk2, d: ["대위변제 전에 정리·회수", "컨설팅 병행 보증은 부실률 최대 2.58%p 낮음", "약정 데이터로 위기 기준 고도화"] },
      { t: "경기도", img: I.bulb, fill: HEX.accent6, d: ["버티기 대신 제때 전환·재기", "기존 재기 사업의 이용 시점 앞당김", "큰 예산 없이 보증 창구에서 시작"] },
    ];
    const fw = 3.87, fg = 0.25;
    fx.forEach((f, i) => {
      const x = 0.6 + i * (fw + fg), y = 1.8;
      card(s, x, y, fw, 2.85, HEX.lt2, "fx-card-" + i, false);
      circleIcon(s, f.img, x + 0.25, y + 0.25, 0.65, f.fill, "fx-" + i);
      s.addText(f.t, { x: x + 1.05, y: y + 0.25, w: fw - 1.2, h: 0.65, fontSize: 17, bold: true, color: C.text1, margin: 0, valign: "middle", isTextBox: true, objectName: "fx-title-" + i });
      s.addText(f.d.map((t, k) => ({ text: t, options: { bullet: true, breakLine: k < f.d.length - 1 } })), { x: x + 0.25, y: y + 1.05, w: fw - 0.45, h: 1.7, fontSize: 14.5, color: C.text1, paraSpaceAfter: 8, margin: 0, valign: "top", isTextBox: true, objectName: "fx-body-" + i });
    });
    s.addText("출처", { x: 0.6, y: 4.85, w: 2, h: 0.3, fontSize: 11, bold: true, color: C.text2, margin: 0, isTextBox: true, objectName: "src-title" });
    const L = [
      "경기신용보증재단, 「2025 경기도 소상공인 백서」(2026.2) — gcgf.or.kr 발간자료 > 단행본",
      "메트로신문 2026.10.8 한국은행 경기본부 정책협의회 — metroseoul.co.kr/article/20261007500638",
      "메트로신문 2024.12.16 경상원 개업 대비 폐업 — metroseoul.co.kr/article/20241216500508",
      "경인일보 2025.6.4 경상원 경제이슈 브리프 VOL.05 — kyeongin.com/article/1742015",
      "디지털타임스 2025.1.9 평균 영업기간 — dt.co.kr/article/11638572",
      "헤럴드경제 2025.12.2 중기중앙회 폐업 실태조사 — heraldk.com/article/2025120218355750379",
    ];
    const R = [
      "경북매일 2026.3.31 위기 알림톡 — kbmaeil.com/article/20260331500153",
      "경향신문 2025.9.4 폐업자 장기분할 전환보증 — khan.co.kr/article/202509041202001",
      "헤럴드경제 2026.4.21 재도전지원 특례보증 — heraldk.com/article/2026042114261452203",
      "파이낸셜뉴스 2026.4.6 경기도 사업정리 지원 — fnnews.com/news/202604061024480264",
      "한국경제 2026.3.19 컨설팅 병행 보증 부실률 — hankyung.com/article/202603192871h",
      "Thaler & Benartzi (2004) Save More Tomorrow, JPE 112(S1) — doi.org/10.1086/380085",
    ];
    s.addText(L.join("\n"), { x: 0.6, y: 5.15, w: 6.0, h: 1.8, fontSize: 9.5, color: C.accent4, margin: 0, valign: "top", paraSpaceAfter: 2, isTextBox: true, objectName: "src-left" });
    s.addText(R.join("\n"), { x: 6.75, y: 5.15, w: 5.95, h: 1.8, fontSize: 9.5, color: C.accent4, margin: 0, valign: "top", paraSpaceAfter: 2, isTextBox: true, objectName: "src-right" });
    s.addNotes("기대 효과입니다. 사장님은 빚이 덜 쌓였을 때, 사고 없이 결정할 수 있습니다. 재단은 대위변제 전에 정리하고 회수할 수 있고, 이미 확인된 것처럼 컨설팅을 붙인 보증은 부실률이 낮습니다. 멈춤선은 문을 닫는 선이 아니라 생각을 시작하는 선입니다. 감사합니다.");
  }

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("written", OUT);
})();
