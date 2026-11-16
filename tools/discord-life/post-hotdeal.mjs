// reports/핫딜_TOP50_YYYYMMDD.md 의 표에서 상위 30개를 #핫딜 에 올린다.
// 카드는 분류별(먹거리 / 전자·게임 / 생활·뷰티 / 패션·기타)로 나누고, 분류 안에서는 순위 순.
// 사용: node post-hotdeal.mjs [YYYYMMDD] [--dry-run] [--edit]   (요약은 채널, 전체는 스레드)
//   --edit : 이미 올린 그날 글과 스레드를 지우고 새 형식으로 다시 올린다.
import fs from 'node:fs';
import path from 'node:path';
import { api, HERE, loadState, saveState } from './lib.mjs';

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const edit = args.includes('--edit');
const kst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
const day = args.find((a) => /^\d{8}$/.test(a)) ?? kst;
const file = path.join(HERE, '..', '..', 'reports', `핫딜_TOP50_${day}.md`);
if (!fs.existsSync(file)) { console.error('없음:', file); process.exit(1); }

const md = fs.readFileSync(file, 'utf8');
const rows = md.slice(md.indexOf('## TOP 50')).split(/\r?\n/)
  .filter((l) => /^\|\s*\d+\s*\|/.test(l))
  .map((l) => {
    const c = l.split('|').slice(1, -1).map((s) => s.trim());
    return { rank: +c[0], name: c[1].replace(/\s*\((네이버멤버십|네멤)\)/, ''), price: c[2], shop: c[3], url: c[5], memo: c[6] ?? '' };
  })
  .sort((a, b) => a.rank - b.rank).slice(0, 30);
if (rows.length < 30) console.warn(`주의: ${rows.length}개만 읽힘`);

// ── 분류 ──
const GROUPS = [
  { key: 'tech', label: '🎮 전자·게임', color: 0x5b8def, re: /PS5|닌텐도|스위치|스팀|게임기|아이폰|갤럭시|배터리|충전|mAh|헤드폰|이어폰|버즈|SSD|모니터|노트북|키보드|마우스|TV|USB|그래픽|CPU|태블릿|워치/i },
  { key: 'living', label: '🧴 생활·뷰티', color: 0x2fb38a, re: /폼 |폼$|샴푸|린스|세제|섬유유연|휴지|물티슈|치약|칫솔|로션|니베아|핸드워시|바디|면도|생리대|기저귀|청소/ },
  { key: 'fashion', label: '👟 패션·기타', color: 0xa17bf2, re: /나이키|아디다스|리복|뉴발란스|운동화|신발|자켓|패딩|티셔츠|바지|가방|금액권|상품권|기프티콘/ },
];
const FOOD = { key: 'food', label: '🍜 먹거리', color: 0xf08c3a };
const groupOf = (r) => GROUPS.find((g) => g.re.test(r.name)) ?? FOOD;

// ── 한 줄 다듬기 ──
const esc = (s) => s.replace(/([*_~`|\[\]])/g, '\\$1');
function priceParts(p) {
  const m = p.match(/^([^()]+?)\s*(?:\((.+)\))?$/);
  const amount = (m?.[1] ?? p).trim();
  const ship = (m?.[2] ?? '').trim().replace(/무배|무료/g, '무료배송').replace(/네멤/g, '네이버멤버십');
  return { amount, ship };
}
function extras(memo) {
  const out = [];
  const unit = memo.match(/(개당|캔당|병당|팩당|봉당|장당|롤당|포당)\s*약?\s*[\d,]+원/);
  if (unit) out.push(unit[0].replace(/\s*약\s*/, ' 약 '));
  if (/해외직구/.test(memo)) out.push('⚠️ 해외직구');
  if (/소비기한/.test(memo)) out.push('⚠️ 소비기한 임박');
  if (/리셀/.test(memo)) out.push('⚠️ 리셀가');
  if (/매장/.test(memo)) out.push('⚠️ 매장 행사일 수 있음');
  return out;
}
const badge = (n) => ['🥇', '🥈', '🥉'][n - 1] ?? `\`${String(n).padStart(2, '0')}\``;
function line(r) {
  const { amount, ship } = priceParts(r.price);
  const meta = [`**${esc(amount)}**`, ship && esc(ship), esc(r.shop), ...extras(r.memo)].filter(Boolean).join(' · ');
  return `${badge(r.rank)} [${esc(r.name)}](${r.url})\n　${meta}`;
}

// ── 카드 조립 ──
const d = `${+day.slice(4, 6)}월 ${+day.slice(6, 8)}일`;
const order = [FOOD, ...GROUPS];
const buckets = order.map((g) => ({ g, items: rows.filter((r) => groupOf(r).key === g.key) })).filter((b) => b.items.length);

// 채널에는 요약(TOP5 + 분류별 개수)만 보이고, 전체 30개는 스레드 안에 분류별로 펼쳐 둔다.
const top5 = rows.slice(0, 5).map(line).join('\n\n');
const counts = buckets.map(({ g, items }) => `${g.label} ${items.length}`).join('　');
const summary = {
  title: `🔥 ${d} 핫딜 TOP 30`,
  description: `-# 커뮤니티(펨코·루리웹·퀘이사존 등)에서 추천이 많이 붙은 순서 · 상품명을 누르면 원글로 갑니다\n\n${top5}\n\n**📂 나머지는 아래 스레드에서 펼쳐 보세요**\n${counts}`,
  color: 0xff5a36,
  footer: { text: '가격·재고는 금방 바뀝니다. 사기 전에 원글에서 꼭 확인하세요.' },
};
const cards = buckets.map(({ g, items }) => ({ title: `${g.label} (${items.length})`, description: items.map(line).join('\n\n'), color: g.color }));

const over = [summary, ...cards].find((e) => e.description.length > 4096);
console.log(`${day}: ${rows.length}개 · 요약 1장 + 스레드 카드 ${cards.length}장 (${counts})`);
if (over) { console.error('글자 수 초과:', over.title); process.exit(1); }
if (dry) { console.log(summary.description); process.exit(0); }

const state = loadState();
const key = `hotdeal:${day}`;
const ch = state.channels.hotdeal;
if (state.posted[key]) {
  if (!edit) { console.log('이미 올림:', key, '(다시 올리려면 --edit)'); process.exit(0); }
  // 형식이 바뀌었을 수 있으니 옛 글(과 스레드)을 지우고 새로 올린다
  await api('DELETE', `/channels/${ch}/messages/${state.posted[key]}`).catch((e) => console.warn('옛 글 삭제 실패', e.message));
  if (state.posted[`${key}:thread`]) await api('DELETE', `/channels/${state.posted[`${key}:thread`]}`).catch(() => {});
}
const msg = await api('POST', `/channels/${ch}/messages`, { embeds: [summary], allowed_mentions: { parse: [] } });
const thread = await api('POST', `/channels/${ch}/messages/${msg.id}/threads`, { name: `📂 ${+day.slice(4, 6)}/${+day.slice(6, 8)} 전체 30개 펼쳐 보기`, auto_archive_duration: 1440 });
for (const c of cards) await api('POST', `/channels/${thread.id}/messages`, { embeds: [c], allowed_mentions: { parse: [] } });
state.posted[key] = msg.id;
state.posted[`${key}:thread`] = thread.id;
saveState(state);
console.log('게시 완료', msg.id, '스레드', thread.id);
