// AI 창조공모대전 이미지 부문 구글폼 입력. 마지막 쪽(제출 버튼)에서 멈추고 탭을 열어 둔다.
// SUBMIT=1 이면 열려 있는 폼 탭에서 제출만 누른다.
// env: EXTRA=생년월일·주소 json(저장소 밖), 이름·휴대폰·이메일은 tools/events/pii.mjs
import fs from 'node:fs';
import { pii } from '../../../tools/events/pii.mjs';
const HERE = 'D:/park/YD_Claude_RND/reports/공모전/AI창조공모대전/';
const URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfnBEWuwmXn0TESdyZQewPrrn2LsgNGIQ2090TGz-qv0yLnxg/viewform';
const mask = s => s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>').replace(/01\d-?\d{3,4}-?\d{4}/g, '<tel>');

export default async (ctx) => {
  const log = [];
  if (process.env.SUBMIT === '1') {
    const p = ctx.pages().find(x => x.url().includes('1FAIpQLSfnBEWuwmXn0TESdyZQewPrrn2LsgNGIQ2090TGz'));
    if (!p) return 'NO FORM TAB';
    await p.bringToFront();
    const b = p.locator('div[role=button]:visible').filter({ hasText: /^제출$/ });
    if (!(await b.count())) return 'NO SUBMIT BUTTON';
    await b.first().click(); await p.waitForTimeout(6000);
    const t = mask((await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 300));
    await p.screenshot({ path: HERE + '_crop/form_done.png' });
    return 'SUBMITTED ' + t;
  }
  const I = pii(); const X = JSON.parse(fs.readFileSync(process.env.EXTRA, 'utf8'));
  const desc = fs.readFileSync(HERE + 'desc.txt', 'utf8').trim();
  const rec = fs.readFileSync(HERE + 'ai_record.txt', 'utf8').trim();
  const p = await ctx.newPage(); p.on('dialog', d => d.dismiss().catch(() => {}));
  await p.goto(URL, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(4000);
  const item = t => p.locator('div[role=listitem]').filter({ has: p.locator('[role=heading]', { hasText: t }) }).first();
  const text = async (t, v, sel = 'input[type=text], input[type=email], input[type=tel], textarea') => {
    const it = item(t); if (!(await it.count())) return false;
    await it.locator(sel).first().fill(v); log.push(`text ${t}`); return true; };
  const radio = async (t, v) => { const it = item(t); if (!(await it.count())) return false;
    await it.locator(`div[role=radio][data-value^="${v}"]`).first().click(); log.push(`radio ${t} = ${v.slice(0, 20)}`); return true; };
  const checkAll = async t => { const it = item(t); if (!(await it.count())) return false;
    const cs = it.locator('div[role=checkbox]'); const n = await cs.count();
    for (let i = 0; i < n; i++) { const lab = await cs.nth(i).getAttribute('aria-label') || ''; if (/기타/.test(lab) || lab === '') continue;
      if ((await cs.nth(i).getAttribute('aria-checked')) !== 'true') await cs.nth(i).click(); }
    log.push(`check all ${t} (${n})`); return true; };
  const next = async () => { const b = p.locator('div[role=button]:visible').filter({ hasText: /^다음$/ });
    if (!(await b.count())) return false; await b.first().click(); await p.waitForTimeout(3000);
    const err = (await p.locator('[role=alert]:visible').allInnerTexts()).join(' / ').trim(); if (err) log.push('ALERT ' + err.slice(0, 150)); return true; };

  for (let page = 1; page <= 8; page++) {
    const heads = (await p.locator('div[role=listitem] [role=heading]').allInnerTexts()).map(s => s.replace(/\s+/g, ' ').trim());
    log.push(`-- page ${page}: ${heads.join(' | ').slice(0, 200)}`);
    const em = p.locator('input[type=email]:visible');
    if (await em.count()) { await em.first().fill(I.email); log.push('text 이메일'); }
    if (heads.some(h => /성명/.test(h) && !/보호자/.test(h))) {
      await text(/^성명/, I.name);
      await text('생년월일', X.birth, 'input[type=date]');
      await radio('참가 구분', '일반');
      await text('휴대전화', I.phoneDash);
      await text('주소', X.address);
    }
    if (heads.some(h => /^주제/.test(h))) {
      await radio(/^주제/, '1. 한국의 멋');
      await text('작품명', '빛을 깁다');
      await text('작품 설명', desc, 'textarea');
    }
    if (heads.some(h => /사용 AI 툴/.test(h))) {
      const it = item('사용 AI 툴');
      const c = it.locator('div[role=checkbox][aria-label="ChatGPT(GPT 이미지)"]');
      if ((await c.getAttribute('aria-checked')) !== 'true') await c.click();
      const other = it.locator('div[role=checkbox][aria-label^="기타"]');
      if (await other.count()) { if ((await other.first().getAttribute('aria-checked')) !== 'true') await other.first().click();
        await it.locator('input[type=text]').first().fill('4x-UltraSharp, 4x-RealisticRescaler(업스케일), OpenCV(부분 합성)'); }
      log.push('check AI 툴: ChatGPT + 기타');
      await text('AI 제작기록', rec, 'textarea');
    }
    if (heads.some(h => /화면 비율/.test(h))) {
      await radio('화면 비율', '9:16');
      await radio('파일 형식', 'jpg');
      const it = item('작품 이미지 파일');
      const already = /a_3_final|빛을/.test(await it.innerText());
      if (!already) {
        await it.locator('div[role=button]').filter({ hasText: /파일 추가|Add file/ }).first().click(); await p.waitForTimeout(5000);
        let done = false;
        for (let k = 0; k < 10 && !done; k++) {
          for (const f of p.frames()) {
            const b = f.locator('button:visible, div[role=button]:visible').filter({ hasText: /찾아보기|Browse|기기에서|파일 선택/ });
            if (await b.count()) { const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 15000 }), b.first().click()]);
              await fc.setFiles(HERE + 'out/a_3_final.jpg'); done = true; break; }
          }
          if (!done) await p.waitForTimeout(1500);
        }
        log.push('upload chooser ' + (done ? 'OK' : 'NOT FOUND'));
        for (let k = 0; k < 40; k++) { await p.waitForTimeout(3000); if (/a_3_final/.test(await it.innerText())) { log.push('upload done'); break; } }
      }
    }
    if (heads.some(h => /창작 및 저작권/.test(h))) {
      await radio('창작 및 저작권', '서약합니다');
      await checkAll('유의사항 확인');
      await radio('개인정보 수집', '동의합니다');
    }
    await p.screenshot({ path: HERE + `_crop/form_p${page}.png`, fullPage: true });
    const hasSubmit = await p.locator('div[role=button]:visible').filter({ hasText: /^제출$/ }).count();
    if (hasSubmit) { log.push('READY 제출 (탭 열어 둠)'); return log.map(mask).join('\n'); }
    if (!(await next())) { log.push('NO NEXT'); break; }
  }
  return log.map(mask).join('\n');
};
