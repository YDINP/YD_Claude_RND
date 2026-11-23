// 한 쪽짜리 자체 설문: 라디오 묶음마다 '그렇다'류 선택, 텍스트·체크·버튼 목록 출력. SUBMIT=1 이면 휴대폰 입력, GO=1 이면 제출 버튼
import { pii } from './pii.mjs';
export default async (ctx) => {
  const I = pii(); const out = [];
  const p = await ctx.newPage(); p.on('dialog', async d => { out.push('DIALOG ' + d.message().slice(0, 120)); await d.accept().catch(() => {}); });
  await p.goto(process.env.URL, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForTimeout(4000);
  const info = await p.evaluate(() => {
    const lab = e => (e.labels?.[0]?.innerText || e.closest('label')?.innerText || e.parentElement?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    const radios = [...document.querySelectorAll('input[type=radio]')]; const names = [...new Set(radios.map(r => r.name))];
    const pref = [/^그렇다/, /^약간 그렇다/, /^만족/, /^동의/, /^예$/];
    const res = [];
    for (const n of names) { const g = radios.filter(r => r.name === n); const ls = g.map(lab); let j = -1; for (const re of pref) { j = ls.findIndex(l => re.test(l)); if (j >= 0) break; } if (j < 0) j = Math.min(1, g.length - 1); g[j].click(); res.push(n + '=' + ls[j] + ' [' + ls.join('/').slice(0, 60) + ']'); }
    const texts = [...document.querySelectorAll('input[type=text],input[type=tel],textarea')].filter(e => e.offsetParent && !/kwd|insiteschStr|sch/i.test(e.name || e.id)).map(e => (e.name || e.id) + ':' + (e.placeholder || '') + ':' + (e.closest('tr,li,div')?.innerText || '').replace(/\s+/g, ' ').slice(0, 60));
    const checks = [...document.querySelectorAll('input[type=checkbox]')].filter(e => e.offsetParent).map(e => (e.name || e.id) + ':' + lab(e));
    const btns = [...document.querySelectorAll('button,input[type=submit],input[type=button],a.btn')].filter(e => e.offsetParent).map(e => (e.innerText || e.value || '').trim().slice(0, 20)).filter(Boolean);
    return JSON.stringify({ res, texts, checks, btns: btns.slice(-15) });
  }).then(x => JSON.parse(x));
  out.push('RADIOS ' + info.res.length, ...info.res.map(r => '  ' + r), 'TEXTS ' + info.texts.join(' || '), 'CHECKS ' + info.checks.join(' || '), 'BTNS ' + info.btns.join(' | '));
  const body = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  const m = body.match(/.{0,150}(개인정보|마케팅|제3자).{0,250}/g); out.push('CONSENT ' + (m || []).slice(0, 3).join(' ### '));
  await p.close(); return out.join('\n');
};
