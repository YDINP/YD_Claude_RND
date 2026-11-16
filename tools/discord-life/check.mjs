// 게시 전 자동 검수. 사람(에이전트)의 눈 검수 전에 기계적으로 걸러낼 것만 본다.
// 사용: node check.mjs hotdeal [YYYYMMDD]   → TOP30 원글 링크·종료 표시·가격·중복 확인
//       node check.mjs info [--n 5]         → 다음에 올릴 항목의 출처 링크·마감 경과 확인
import fs from 'node:fs';
import path from 'node:path';
import { HERE, loadState } from './lib.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36';
const [mode = 'hotdeal', ...rest] = process.argv.slice(2);
const kst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

async function probe(url) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko' }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
    const t = r.ok ? await r.text() : '';
    return { status: r.status, text: t };
  } catch (e) { return { status: 0, text: '', err: e.message }; }
}

if (mode === 'hotdeal') {
  const day = rest.find((a) => /^\d{8}$/.test(a)) ?? kst.replace(/-/g, '');
  const md = fs.readFileSync(path.join(HERE, '..', '..', 'reports', `핫딜_TOP50_${day}.md`), 'utf8');
  const rows = md.slice(md.indexOf('## TOP 50')).split(/\r?\n/).filter((l) => /^\|\s*\d+\s*\|/.test(l))
    .map((l) => { const c = l.split('|').slice(1, -1).map((s) => s.trim()); return { rank: +c[0], name: c[1], price: c[2], url: c[5] }; })
    .sort((a, b) => a.rank - b.rank).slice(0, 30);
  const issues = [];
  if (rows.length < 30) issues.push(`항목 ${rows.length}개 (30개 미만)`);
  const seenUrl = new Map(), seenName = new Map();
  for (const r of rows) {
    if (seenUrl.has(r.url)) issues.push(`#${r.rank} 링크 중복 (#${seenUrl.get(r.url)})`);
    seenUrl.set(r.url, r.rank);
    const k = r.name.replace(/\s+/g, '').slice(0, 12);
    if (seenName.has(k)) issues.push(`#${r.rank} 상품 중복 의심 (#${seenName.get(k)}) ${r.name}`);
    seenName.set(k, r.rank);
    if (!/[\d$]/.test(r.price)) issues.push(`#${r.rank} 가격 없음: ${r.price}`);
    if (!/^https?:\/\//.test(r.url)) issues.push(`#${r.rank} 링크 형식 오류: ${r.url}`);
    if (/성인|19금|도박|코인|대출|리딩방/.test(r.name)) issues.push(`#${r.rank} 부적절 의심: ${r.name}`);
  }
  // 같은 사이트는 순서대로 2초 간격 (펨코는 몰아서 열면 430으로 막음), 사이트끼리는 동시에
  const byHost = {};
  for (const r of rows) (byHost[new URL(r.url).host] ??= []).push(r);
  const res = [];
  await Promise.all(Object.values(byHost).map(async (list) => {
    for (const r of list) { res.push([r, await probe(r.url)]); await new Promise((ok) => setTimeout(ok, 2000)); }
  }));
  const blocked = [];
  const END = /종료된\s*딜|판매\s*종료|딜\s*종료|품절되었|\[종료\]|삭제된\s*게시물|존재하지\s*않는\s*게시물/;
  for (const [r, p] of res.sort((a, b) => a[0].rank - b[0].rank)) {
    if ([403, 429, 430].includes(p.status)) blocked.push(r.rank);
    else if (p.status !== 200) issues.push(`#${r.rank} 원글 열림 실패 (${p.status || p.err}) ${r.url}`);
    else {
      const m = p.text.slice(0, 60000).match(END);
      if (m) issues.push(`#${r.rank} 종료·품절·삭제 의심 («${m[0]}») ${r.name} — 원글 눈으로 확인`);
    }
  }
  if (blocked.length) console.log(`ℹ 봇 차단으로 자동 확인 못 함: #${blocked.join(', #')} — 눈 검수 필요`);
  console.log(issues.length ? `⚠ 검수 걸림 ${issues.length}건\n- ${issues.join('\n- ')}` : '✅ 자동 검수 통과 (30개)');
  process.exit(issues.length ? 2 : 0);
}

if (mode === 'info') {
  const n = Number(rest[rest.indexOf('--n') + 1]) || 5;
  const items = JSON.parse(fs.readFileSync(path.join(HERE, 'info.json'), 'utf8'));
  const state = loadState();
  const next = items.filter((it) => !state.posted[`info:${it.id}`]).slice(0, n);
  const issues = [];
  for (const it of next) {
    for (const f of ['title', 'big', 'due', 'gain', 'who', 'how', 'deadline']) if (!it[f]) issues.push(`${it.id} ${f} 비어 있음`);
    if (it.deadlineDate && it.deadlineDate < kst) issues.push(`${it.id} 마감 지남 (${it.deadlineDate})`);
    if (/하남|경기도|서울시|미사/.test(JSON.stringify(it))) issues.push(`${it.id} 지역 한정 표현 의심`);
    for (const [t, u] of it.links ?? []) {
      const p = await probe(u);
      if ([403, 429, 430].includes(p.status)) console.log(`ℹ ${it.id} 출처 봇 차단(${p.status}) — 눈 확인: ${u}`);
      else if (p.status !== 200) issues.push(`${it.id} 출처 열림 실패 (${p.status || p.err}) ${t} ${u}`);
    }
  }
  const left = items.filter((it) => !state.posted[`info:${it.id}`]).length;
  console.log(`다음 ${next.length}개: ${next.map((i) => i.id).join(', ')} · 남은 항목 ${left}개`);
  console.log(issues.length ? `⚠ 검수 걸림 ${issues.length}건\n- ${issues.join('\n- ')}` : '✅ 자동 검수 통과');
  process.exit(issues.length ? 2 : 0);
}
