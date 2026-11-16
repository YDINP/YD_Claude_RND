// 공고 양식(hwp)에 인적사항·작품 정보를 채운다. rhwp(@rhwp/core) 사용.
const fs = require('fs');
const { getRhwpCore } = require('D:/cache/npm-cache/_npx/d3dffeb053155d07/node_modules/k-skill-rhwp/src/wasm-init');
const B = 'D:/park/YD_Claude_RND/reports/공모전/서울미래인재_캐릭터';
const C = JSON.parse(fs.readFileSync(B + '/작업/content.json', 'utf8'));
const DATE = '2026년 11월 16일';
const NAME = '박용진';
const ok = (r, op) => { const j = JSON.parse(r); if (!j.ok) throw new Error(op + ' ' + r); return j; };

function setCell(doc, p, ctrl, cell, lines) {
  if (!Array.isArray(lines)) lines = [lines];
  const n = doc.getCellParagraphCount(0, p, ctrl, cell);
  for (let k = n - 1; k >= 1; k--) { // 여분 문단은 비운다
    const L = doc.getCellParagraphLength(0, p, ctrl, cell, k);
    if (L) ok(doc.deleteTextInCell(0, p, ctrl, cell, k, 0, L), 'del');
  }
  const L0 = doc.getCellParagraphLength(0, p, ctrl, cell, 0);
  if (L0) ok(doc.deleteTextInCell(0, p, ctrl, cell, 0, 0, L0), 'del0');
  let para = 0;
  lines.forEach((t, i) => {
    if (i > 0) { ok(doc.splitParagraphInCell(0, p, ctrl, cell, para, doc.getCellParagraphLength(0, p, ctrl, cell, para)), 'split'); para++; }
    if (t) {
      ok(doc.insertTextInCell(0, p, ctrl, cell, para, 0, t), 'ins');
      ok(doc.applyCharFormatInCell(0, p, ctrl, cell, para, 0, t.length, JSON.stringify({ italic: false, textColor: '#000000', fontSize: (lines.length > 1 || t.length > 28) ? 880 : 1000 })), 'ccf');
    }
  });
}
function setPara(doc, p, text) {
  const L = doc.getParagraphLength(0, p);
  if (L) ok(doc.deleteText(0, p, 0, L), 'delp');
  ok(doc.insertText(0, p, 0, text), 'insp');
}
function signLine(doc, p, label) {
  // "라벨:      (서명 또는 인)" 의 공백 일부를 이름으로 바꾼다
  const t = doc.getTextRange(0, p, 0, doc.getParagraphLength(0, p));
  const i = t.indexOf(':') + 1;
  const pad = ' '.repeat(Math.max(2, (t.indexOf('(') - i) - NAME.length - 4));
  setPara(doc, p, t.slice(0, i) + '  ' + NAME + pad + '(서명 또는 인)');
}
async function load(f) { const core = await getRhwpCore(); return new core.HwpDocument(new Uint8Array(fs.readFileSync(f))); }
function save(doc, f) { fs.writeFileSync(f, Buffer.from(doc.exportHwp())); console.log('saved', f, doc.pageCount(), 'pages'); }

(async () => {
  // 1) 참가신청서
  let d = await load(B + '/공고/form1_application.hwp');
  setCell(d, 2, 0, 1, '☑ 개인     ☐ 팀(4인 이하)');
  setCell(d, 2, 0, 3, NAME);
  setCell(d, 2, 0, 5, '해당 없음(개인 참가)');
  setCell(d, 2, 0, 7, '1997. 5. 29.');
  setCell(d, 2, 0, 9, '해당 없음');
  setCell(d, 2, 0, 11, ['(12903) 경기 하남시 미사강변한강로158번길 93, 401호']);
  setCell(d, 2, 0, 13, '휴대전화: 010-2576-9278');
  setCell(d, 2, 0, 14, '이메일: parkkb10@gmail.com');
  setCell(d, 2, 0, 16, C.title);
  setCell(d, 2, 0, 18, '이미지 01~03(PNG 3장), 04_생성형AI_활용내역.pdf');
  ok(d.setFormValueInCell(0, 2, 0, 20, 0, 0, JSON.stringify({ value: 1 })), 'cb사용');
  console.log('AI 사용 체크:', d.getFormObjectAt(0, 340, 480));
  setPara(d, 9, DATE);
  signLine(d, 15, '신청인(대표자)');
  // 2쪽: 캐릭터 설명 및 활용 아이디어 (공고: "캐릭터 설명과 활용 아이디어는 참가신청서에 작성")
  const last = d.getParagraphCount(0) - 1;
  ok(d.splitParagraph(0, last, d.getParagraphLength(0, last)), 'sp0');
  let p = d.getParagraphCount(0) - 1;
  const first = p;
  [...C.desc_lines, ''].forEach((t, i) => {
    if (i > 0) { ok(d.splitParagraph(0, p, d.getParagraphLength(0, p)), 'sp'); p++; }
    if (t) ok(d.insertText(0, p, 0, t), 'it');
    const L = d.getParagraphLength(0, p);
    ok(d.applyParaFormat(0, p, JSON.stringify({ alignment: i === 0 ? 'center' : 'justify', pageBreakBefore: p === first, lineSpacing: 128, lineSpacingType: 'Percent', spacingBefore: (t.startsWith('■') ? 600 : 0), spacingAfter: 0, indent: 0 })), 'pf');
    if (L) ok(d.applyCharFormat(0, p, 0, L, JSON.stringify({ fontFamily: '함초롬바탕', fontSize: i === 0 ? 1300 : 920, bold: i === 0 || t.startsWith('■') })), 'cf');
  });
  save(d, B + '/작업/서류/01_참가신청서_박용진.hwp');

  // 2) 개인정보 동의서
  d = await load(B + '/공고/form2_privacy.hwp');
  const fo = JSON.parse(d.getFormObjectAt(0, 122, 516));
  console.log('form object', JSON.stringify(fo));
  if (fo && fo.found !== false && fo.para !== undefined) ok(d.setFormValue(fo.sec ?? 0, fo.para, fo.ci ?? fo.controlIdx, JSON.stringify({ value: 1 })), 'form');
  setPara(d, 10, DATE);
  signLine(d, 12, '동의자 성명');
  save(d, B + '/작업/서류/02_개인정보동의서_박용진.hwp');

  // 3) 출품 서약서
  d = await load(B + '/공고/form3_pledge.hwp');
  setPara(d, 13, DATE);
  signLine(d, 15, '성명(대표자)');
  save(d, B + '/작업/서류/03_출품서약서_박용진.hwp');
})().catch(e => { console.error(e); process.exit(1); });
