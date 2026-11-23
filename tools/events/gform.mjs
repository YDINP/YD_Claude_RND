// 구글폼 응답 워커.
// env: URL, ANS(json 파일: 질문 키워드 -> 선택지 문구 | [문구...] | 텍스트), SUBMIT=1 일 때만 개인정보 입력·제출
//      ALLOW_3P=1 이면 '경품 발송 목적' 제3자 제공 동의는 진행 (마케팅·광고 동의는 항상 멈춤)
// 개인정보는 pii.mjs 로 실행 때 읽는다 (출력에는 <pii> 로만).
import fs from 'node:fs';
import { pii } from './pii.mjs';

const POS = [/^매우 만족/, /^만족/, /^대체로 만족/, /^매우 그렇다/, /^그렇다/, /^대체로 그렇다/, /^동의/, /^예$|^네$/, /^좋/];
const NEG = /불만|않|아니|없음|모름|싫/;

export default async (ctx) => {
  const I = pii(); const ANS = process.env.ANS ? JSON.parse(fs.readFileSync(process.env.ANS, 'utf8')) : {};
  const SUBMIT = process.env.SUBMIT === '1'; const log = [];
  const p = await ctx.newPage(); p.on('dialog', d => d.dismiss().catch(() => {}));
  await p.goto(process.env.URL, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500);
  const isPiiQ = t => /성명|이름|성함|휴대|전화|연락처|핸드폰|이메일|e-?mail|메일 주소|주소/i.test(t);
  let lastSig = '', stuck = 0;
  for (let page = 0; page < 30; page++) {
    const items = p.locator('div[role=listitem]'); const n = await items.count();
    const sig = (await items.allInnerTexts()).join('|').slice(0, 300);
    if (sig === lastSig) { if (++stuck > 2) { log.push('STUCK ' + sig.slice(0, 120)); break; } } else stuck = 0; lastSig = sig;
    for (let i = 0; i < n; i++) {
      const it = items.nth(i); const raw = (await it.innerText()).replace(/\s+/g, ' ').trim();
      const title = raw.slice(0, 160); if (!title) continue;
      const req = /\*/.test(raw.slice(0, 200));
      const radios = it.locator('div[role=radio]'); const rc = await radios.count();
      const checks = it.locator('div[role=checkbox]'); const cc = await checks.count();
      const groups = it.locator('div[role=radiogroup]'); const gc = await groups.count();
      const texts = it.locator('input[type=text]:visible, input[type=email]:visible, input[type=tel]:visible, input[type=number]:visible, input[type=date]:visible, textarea:visible'); const tc = await texts.count();
      const lists = it.locator('div[role=listbox]'); const lc = await lists.count();
      const key = Object.keys(ANS).find(k => title.includes(k)); const a = key !== undefined ? ANS[key] : undefined;
      if (/마케팅|광고성|홍보성 정보 수신/.test(title) && !/경품/.test(title)) { log.push(`p${page} ${title.slice(0, 90)} => STOP (마케팅 동의, 사용자 확인 필요)`); await p.close(); return log.join('\n'); }
      if (/제3자|제 3자/.test(title) && !(process.env.ALLOW_3P && /경품|발송|배송/.test(raw))) { log.push(`p${page} ${title.slice(0, 120)} => STOP (제3자 제공, 사용자 확인 필요)`); await p.close(); return log.join('\n'); }
      if (gc > 1) { // 격자형
        for (let g = 0; g < gc; g++) { const rr = groups.nth(g).locator('div[role=radio]'); const labs = await rr.evaluateAll(es => es.map(e => e.getAttribute('aria-label') || e.getAttribute('data-value') || ''));
          let j = labs.findIndex(l => POS.some(r => r.test(l.split(',')[0].trim()))); if (j < 0) j = Math.min(labs.length - 1, Math.floor(labs.length * 0.7));
          await rr.nth(j).click(); }
        log.push(`p${page} ${title.slice(0, 60)} => grid ${gc} rows`); continue;
      }
      if (rc) {
        const labs = (await radios.evaluateAll(es => es.map(e => (e.getAttribute('aria-label') || e.getAttribute('data-value') || e.innerText || '').trim())));
        let j;
        if (a !== undefined) j = labs.findIndex(l => l === a) >= 0 ? labs.findIndex(l => l === a) : labs.findIndex(l => l.includes(String(a)));
        else if (/동의/.test(title)) j = labs.findIndex(l => /동의/.test(l) && !NEG.test(l));
        else { j = -1; for (const r of POS) { j = labs.findIndex(l => r.test(l)); if (j >= 0) break; } if (j < 0) j = labs.length >= 4 ? 1 : 0; }
        if (j < 0) { log.push(`p${page} ${title.slice(0, 80)} => NOOPT ${a} [${labs.join('/')}]`); await p.close(); return log.join('\n'); }
        await radios.nth(j).click(); log.push(`p${page} ${title.slice(0, 70)} => ${labs[j]}   [${labs.join('/').slice(0, 90)}]`); continue;
      }
      if (cc) {
        const labs = await checks.evaluateAll(es => es.map(e => (e.getAttribute('aria-label') || e.getAttribute('data-answer-value') || '').trim()));
        let picks = a !== undefined ? [].concat(a) : (/동의/.test(title) ? labs.filter(l => /동의/.test(l) && !NEG.test(l)) : [labs.find(l => !/기타|없음/.test(l)) || labs[0]]);
        for (const pk of picks) { const j = labs.findIndex(l => l === pk) >= 0 ? labs.findIndex(l => l === pk) : labs.findIndex(l => l.includes(pk)); if (j < 0) { log.push(`p${page} ${title.slice(0, 80)} => NOOPT ${pk} [${labs.join('/')}]`); await p.close(); return log.join('\n'); } if ((await checks.nth(j).getAttribute('aria-checked')) !== 'true') await checks.nth(j).click(); }
        log.push(`p${page} ${title.slice(0, 70)} => ${picks.join(';')}   [${labs.join('/').slice(0, 90)}]`); continue;
      }
      if (lc) {
        await lists.first().click(); await p.waitForTimeout(600);
        const opts = p.locator('div[role=option]:visible'); const labs = (await opts.allInnerTexts()).map(s => s.trim());
        let j = a !== undefined ? labs.findIndex(l => l.includes(String(a))) : labs.findIndex((l, k) => k > 0 && l);
        if (j < 0) { log.push(`p${page} ${title.slice(0, 80)} => NOOPT ${a} [${labs.join('/').slice(0, 120)}]`); await p.close(); return log.join('\n'); }
        await opts.nth(j).click(); await p.waitForTimeout(500); log.push(`p${page} ${title.slice(0, 70)} => ${labs[j]}`); continue;
      }
      if (tc) {
        let v = a;
        if (v === undefined && isPiiQ(title)) {
          if (!SUBMIT) { log.push(`p${page} ${title.slice(0, 80)} => STOP (개인정보 칸, 시험 실행)`); await p.close(); return log.join('\n'); }
          v = /성명|이름|성함/.test(title) ? I.name : /이메일|e-?mail|메일/i.test(title) ? I.email : /주소/.test(title) ? I.address : I.phone;
        }
        if (v === undefined) { if (!req) { log.push(`p${page} ${title.slice(0, 70)} => (선택, 비움)`); continue; } log.push(`p${page} ${title.slice(0, 90)} => TODO text`); await p.close(); return log.join('\n'); }
        await texts.first().fill(String(v));
        log.push(`p${page} ${title.slice(0, 60)} => ${[I.name, I.phone, I.email, I.address].includes(v) ? '<pii>' : '"' + String(v).slice(0, 40) + '"'}`); continue;
      }
    }
    const btns = p.locator('div[role=button]:visible'); const bt = (await btns.allInnerTexts()).map(s => s.trim());
    const ji = bt.findIndex(t => /^다음$|^Next$/.test(t)); const js = bt.findIndex(t => /^제출$|^Submit$/.test(t));
    if (ji >= 0) { await btns.nth(ji).click(); await p.waitForTimeout(2500);
      const err = await p.locator('[role=alert]:visible').allInnerTexts(); if (err.join('').trim()) log.push('ALERT ' + err.join(' / ').slice(0, 150));
      continue; }
    if (js >= 0) {
      if (!SUBMIT) { log.push('READY: 제출 버튼 (시험 실행이라 누르지 않음)'); break; }
      await btns.nth(js).click(); await p.waitForTimeout(4000);
      log.push('SUBMITTED ' + (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>').slice(0, 160)); break;
    }
    log.push('NO BUTTON [' + bt.join('/') + ']'); break;
  }
  await p.close(); return log.join('\n');
};
