// 투표 완료 뒤 '경품 응모하기' 화면. SUBMIT=1 이면 휴대폰 입력·동의 확인, GO=1 이면 응모 버튼까지
import { pii } from './pii.mjs';
export default async (ctx) => {
  const I = pii(); const out = [];
  const p = await ctx.newPage(); p.on('dialog', d => { out.push('DIALOG ' + d.message().slice(0, 80)); d.dismiss().catch(() => {}); });
  await p.goto('https://script.google.com/macros/s/AKfycbymXE1cDH6XQoj6wGFpTRebaMbt-GdDnAigj3ItNzRZFjpFRRfuH-2QIV0ThlHKPsQ5Cw/exec', { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForTimeout(6000);
  const fr = p.frames().filter(x => x !== p.mainFrame()).pop();
  const txt = async () => (await fr.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  out.push('OPEN ' + (await txt()).slice(0, 250));
  const again = fr.locator('button:visible, a:visible', { hasText: '내 선택 다시 보기' }); if (await again.count()) { await again.first().click(); await p.waitForTimeout(2500); }
  const b = fr.locator('button:visible, a:visible', { hasText: '경품 응모하기' });
  if (!(await b.count())) { out.push('경품 응모하기 버튼 없음'); await p.close(); return out.join('\n'); }
  await b.first().click(); await p.waitForTimeout(2500);
  out.push('FORM ' + (await txt()).slice(0, 900)); { const t0 = await txt(); const m = t0.match(/.{0,160}(마케팅|광고|제3자|제 3자).{0,200}/g); out.push('HIT ' + (m||[]).join(' ### ')); }
  out.push('CTL ' + (await fr.evaluate(() => [...document.querySelectorAll('input,button')].filter(e => e.offsetParent).map(e => e.tagName + ':' + (e.type || '') + ':' + (e.placeholder || e.innerText || e.value || '').trim().slice(0, 25)).join(' | '))));
  if (process.env.SUBMIT === '1') {
    const t = (await txt()).replace(/제3자에게 제공하지 않[^.]*./g, ''); if (/마케팅|광고|제3자|제 3자/.test(t)) { out.push('STOP 마케팅/제3자 문구'); await p.close(); return out.join('\n'); }
    await fr.locator('input[type=tel]:visible, input[inputmode=numeric]:visible, input[type=text]:visible').first().fill(I.phoneDash);
    const cb = fr.locator('input[type=checkbox]:visible'); for (let i = 0; i < await cb.count(); i++) await cb.nth(i).check({ force: true }).catch(() => {});
    if (process.env.GO === '1') { await fr.locator('button:visible').filter({ hasText: /응모|제출|보내기|완료/ }).last().click(); await p.waitForTimeout(3500); out.push('AFTER ' + (await txt()).slice(0, 400)); }
  }
  await p.close(); return out.join('\n');
};
