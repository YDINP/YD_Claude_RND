// 네이버폼 응답: env URL, ANS(json: 문항 키워드 -> 선택지 문구), 이름·연락처 칸은 pii.mjs.
// 개인정보 동의 체크까지 하고 멈춘다. GO=1 이면 제출. 마케팅·제3자 문항이 있으면 멈춤.
import fs from 'node:fs';
import { pii } from './pii.mjs';
const mask = s => s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>').replace(/01\d-?\d{3,4}-?\d{4}/g, '<tel>');
export default async (ctx) => {
  const I = pii(); const ANS = process.env.ANS ? JSON.parse(fs.readFileSync(process.env.ANS, 'utf8')) : {}; const log = [];
  const p = await ctx.newPage(); p.on('dialog', d => { log.push('DIALOG ' + d.message().slice(0, 100)); d.accept().catch(() => {}); });
  await p.goto(process.env.URL, { waitUntil: 'domcontentloaded', timeout: 45000 }); await p.waitForTimeout(5000);
  const body = await p.evaluate(() => document.body.innerText);
  if (/마케팅|광고성 정보|제3자 제공/.test(body)) { log.push('STOP 마케팅·제3자 문구 있음'); await p.close(); return log.join('\n'); }
  for (const [k, v] of Object.entries(ANS)) {
    const lab = p.locator('label').filter({ hasText: v }).first();
    if (await lab.count()) { await lab.click(); log.push(`choice ${k} = ${v.slice(0, 30)}`); } else { log.push(`NOOPT ${k} ${v}`); await p.close(); return log.join('\n'); }
  }
  const name = p.locator('input[placeholder*="이름"]').first(); if (await name.count()) { await name.fill(I.name); log.push('text 이름'); }
  const tel = p.locator('input[type=tel], input[placeholder*="연락처"]').first(); if (await tel.count()) { await tel.fill(I.phone.replace(/-/g, '')); log.push('text 연락처'); }
  const agree = p.locator('label').filter({ hasText: /동의합니다/ }).last(); if (await agree.count()) { await agree.click(); log.push('check 동의'); }
  await p.waitForTimeout(800);
  const checked = await p.evaluate(() => [...document.querySelectorAll('input[type=checkbox]:checked')].length); log.push('checked ' + checked);
  if (process.env.GO !== '1') { await p.screenshot({ path: process.env.SHOT || 'nform_dry.png', fullPage: true }); log.push('READY (제출 안 함)'); return log.join('\n'); }
  await p.locator('button').filter({ hasText: /^제출$/ }).first().click(); await p.waitForTimeout(5000);
  log.push('SUBMITTED ' + mask((await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 200)));
  await p.close(); return log.join('\n');
};
