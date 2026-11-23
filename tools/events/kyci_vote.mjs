// 청소년상담복지개발원 소통사례 토너먼트: 매 판 앞쪽 사례 선택 → 끝 화면에서 SUBMIT=1 이면 휴대폰 번호로 경품 응모
import { pii } from './pii.mjs';
export default async (ctx) => {
  const I = pii(); const out = [];
  const p = await ctx.newPage(); p.on('dialog', d => { out.push('DIALOG ' + d.message().slice(0, 80)); d.dismiss().catch(() => {}); });
  await p.goto('https://script.google.com/macros/s/AKfycbymXE1cDH6XQoj6wGFpTRebaMbt-GdDnAigj3ItNzRZFjpFRRfuH-2QIV0ThlHKPsQ5Cw/exec', { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForTimeout(6000);
  const f = p.frames().find(x => /script\.googleusercontent|n-.*-script/.test(x.url()) && x !== p.mainFrame()) || p.frames()[p.frames().length - 1];
  const inner = f.childFrames().length ? f.childFrames()[0] : f;
  const fr = p.frames().filter(x => x !== p.mainFrame()).pop();
  await fr.getByText('토너먼트 시작하기').click(); await p.waitForTimeout(2000);
  for (let k = 0; k < 60; k++) {
    await fr.waitForFunction(() => !([...document.querySelectorAll('.interlude')].some(e => e.offsetParent && getComputedStyle(e).display !== 'none' && getComputedStyle(e).opacity !== '0')), null, { timeout: 8000 }).catch(() => {});
    const hasTel = await fr.locator('input[type=tel]:visible, input[inputmode=numeric]:visible').count();
    const st = await fr.evaluate(() => {
      const vis = e => e.offsetParent && getComputedStyle(e).visibility !== 'hidden';
      const picks = [...document.querySelectorAll('button[data-pick]')].filter(vis);
      if (picks.length >= 2) { const lab = picks.map(b => b.getAttribute('aria-label') || b.innerText.slice(0, 20)); picks[0].click(); return 'pick ' + lab.join(' vs '); }
      const b = [...document.querySelectorAll('button')].filter(vis).find(x => /라운드 시작|다음 라운드|다음|결승|계속|결과 보기|응모하기/.test(x.innerText) && !/미리 보기|다시/.test(x.innerText));
      if (b) { const t = b.innerText.trim().slice(0, 30); b.click(); return 'btn ' + t; }
      return 'NONE ' + [...document.querySelectorAll('button,input,a')].filter(vis).map(x => (x.tagName + ':' + (x.type||'') + ':' + (x.innerText || x.value || x.placeholder || '').trim().slice(0, 30))).join(' | ').slice(0, 700) + ' || TEXT ' + document.body.innerText.replace(/\s+/g, ' ').slice(-500); });
    if (st && st.startsWith('NONE') && /투표 완료하기/.test(st) && process.env.SUBMIT === '1') {
      await fr.evaluate(() => { const r = [...document.querySelectorAll('input[type=radio]')]; const byLab = t => r.find(x => (x.labels?.[0]?.innerText || x.parentElement.innerText || '').trim().startsWith(t));
        for (const t of ['30대', '기타']) byLab(t)?.click();
        const names = [...new Set(r.map(x => x.name))]; for (const n of names) { const g = r.filter(x => x.name === n); if (g.length === 5 && g.every(x => /^[1-5]$/.test(x.value) || /^[1-5]/.test((x.parentElement.innerText||'').trim()))) g[3].click(); } });
      await fr.locator('button:visible', { hasText: '투표 완료하기' }).first().click(); await p.waitForTimeout(3000);
      out.push('VOTED ' + (await fr.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 600)); break; }
    if (st && st.startsWith('NONE')) { out.push(st); break; }
    if (hasTel) { out.push(`END step${k}`); break; }
    if (!st) { out.push(`NO BTN step${k} ` + (await fr.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(-400)); break; }
    out.push(`step${k} ${st.slice(0, 80)}`); await p.waitForTimeout(1500);
  }
  if (process.env.SUBMIT === '1') {
    const inp = fr.locator('input[type=tel]:visible, input[type=text]:visible').first();
    if (await inp.count()) { await inp.fill(I.phoneDash); const agree = fr.locator('input[type=checkbox]:visible'); for (let i = 0; i < await agree.count(); i++) await agree.nth(i).check().catch(() => {});
      out.push('CONSENT ' + (await fr.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').match(/.{0,200}(동의|개인정보).{0,200}/)?.[0]);
      const ctext = (await fr.evaluate(() => document.body.innerText)); if (/마케팅|광고|제3자|제 3자/.test(ctext)) { out.push('STOP: 마케팅/제3자 동의 문구 있음'); } else if (process.env.GO === '1') { await fr.locator('button:visible').filter({ hasText: /응모|제출|보내기|완료/ }).first().click(); await p.waitForTimeout(3000); out.push('AFTER ' + (await fr.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 300)); } }
  }
  await p.close(); return out.join('\n');
};
