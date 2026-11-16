// 「생활」 카테고리 + #핫딜 · #유용정보 채널을 만든다(이미 있으면 재사용).
// 팀원(@everyone)은 읽기·반응만, 글·스레드 작성은 막는다. 봇은 관리자라 영향 없음.
import { api, GUILD, loadState, saveState } from './lib.mjs';

const P = (n) => 1n << BigInt(n);
const DENY = (P(11) | P(35) | P(36) | P(38)).toString();   // 메시지 보내기, 공개/비공개 스레드 만들기, 스레드에서 보내기
const ALLOW = (P(10) | P(16) | P(6)).toString();             // 채널 보기, 기록 읽기, 반응 추가
const overwrites = [{ id: GUILD, type: 0, allow: ALLOW, deny: DENY }];

const state = loadState();
const chans = await api('GET', `/guilds/${GUILD}/channels`);
let cat = chans.find((c) => c.type === 4 && c.name === '생활');
if (!cat) cat = await api('POST', `/guilds/${GUILD}/channels`, { name: '생활', type: 4, permission_overwrites: overwrites });
const want = [
  { key: 'hotdeal', name: '핫딜', topic: '매일 아침 커뮤니티 핫딜 TOP30 (추천순). 가격·재고는 바로 바뀔 수 있어요.' },
  { key: 'info', name: '유용정보', topic: '지역 상관없이 누구나 챙길 수 있는 생활 혜택·정보. 한 글에 하나씩, 출처 링크 포함.' },
];
state.channels = { category: cat.id };
for (const w of want) {
  let ch = chans.find((c) => c.type === 0 && c.name === w.name && c.parent_id === cat.id);
  if (!ch) ch = await api('POST', `/guilds/${GUILD}/channels`, { name: w.name, type: 0, parent_id: cat.id, topic: w.topic, permission_overwrites: overwrites });
  state.channels[w.key] = ch.id;
  console.log('채널', w.name, 'OK');
}
saveState(state);
