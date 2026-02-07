/**
 * ArcaneCollectors Balance Simulation Script
 * 1v1 배틀 시뮬레이션을 통한 캐릭터 밸런스 분석
 */
const fs = require('fs');
const path = require('path');

// ─── 데이터 로드 ────────────────────────────────────────────────
const dataPath = path.join(__dirname, '..', 'src', 'data', 'characters.json');
const { characters } = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// ─── 상성 테이블 ────────────────────────────────────────────────
// key가 value에 대해 유리 (1.2x 데미지)
const MOOD_ADVANTAGES = {
  brave:   ['calm', 'stoic'],
  fierce:  ['brave', 'wild'],
  wild:    ['calm', 'devoted'],
  calm:    ['cunning', 'fierce'],
  stoic:   ['wild', 'cunning'],
  devoted: ['brave', 'fierce'],
  cunning: ['stoic', 'devoted'],
  noble:   ['fierce', 'wild'],
  mystic:  ['noble', 'cunning'],
};

function getMoodMultiplier(attackerMood, defenderMood) {
  if (attackerMood === defenderMood) return 1.0;
  const advTargets = MOOD_ADVANTAGES[attackerMood] || [];
  if (advTargets.includes(defenderMood)) return 1.2; // 유리
  // 역으로 체크: 상대가 나에 대해 유리하면 나는 불리
  const defAdvTargets = MOOD_ADVANTAGES[defenderMood] || [];
  if (defAdvTargets.includes(attackerMood)) return 0.8; // 불리
  return 1.0; // 중립
}

// ─── 배틀 시뮬레이션 ─────────────────────────────────────────────
function simulateBattle(charA, charB) {
  let hpA = charA.stats.hp;
  let hpB = charB.stats.hp;
  let gaugeA = 0;
  let gaugeB = 0;
  const MAX_TURNS = 30;

  const moodMultA = getMoodMultiplier(charA.mood, charB.mood);
  const moodMultB = getMoodMultiplier(charB.mood, charA.mood);

  // 스킬 배율 결정: skills[1].multiplier, 없으면 2.5
  const skillMultA = (charA.skills[1] && charA.skills[1].multiplier) || 2.5;
  const skillMultB = (charB.skills[1] && charB.skills[1].multiplier) || 2.5;

  // 속도 순서 결정 (동일하면 랜덤)
  let order;
  if (charA.stats.spd > charB.stats.spd) {
    order = ['A', 'B'];
  } else if (charB.stats.spd > charA.stats.spd) {
    order = ['B', 'A'];
  } else {
    order = Math.random() < 0.5 ? ['A', 'B'] : ['B', 'A'];
  }

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    for (const who of order) {
      let atk, def, moodMult, skillMult;
      let gauge;

      if (who === 'A') {
        atk = charA.stats.atk;
        def = charB.stats.def;
        moodMult = moodMultA;
        skillMult = skillMultA;
        gauge = gaugeA;
      } else {
        atk = charB.stats.atk;
        def = charA.stats.def;
        moodMult = moodMultB;
        skillMult = skillMultB;
        gauge = gaugeB;
      }

      // 스킬 사용 여부
      let multiplier;
      if (gauge >= 100) {
        multiplier = skillMult;
        if (who === 'A') gaugeA = 0; else gaugeB = 0;
      } else {
        multiplier = 1.0;
        if (who === 'A') gaugeA += 25; else gaugeB += 25;
      }

      // 데미지 계산: atk * multiplier * moodMult * (1 - def/(def+200))
      const defReduction = 1 - def / (def + 200);
      const damage = atk * multiplier * moodMult * defReduction;

      if (who === 'A') {
        hpB -= damage;
        if (hpB <= 0) return 'A';
      } else {
        hpA -= damage;
        if (hpA <= 0) return 'B';
      }
    }
  }

  // 30턴 초과 시 남은 HP 비율로 판정
  const ratioA = hpA / charA.stats.hp;
  const ratioB = hpB / charB.stats.hp;
  if (ratioA > ratioB) return 'A';
  if (ratioB > ratioA) return 'B';
  return Math.random() < 0.5 ? 'A' : 'B'; // 완전 동일하면 랜덤
}

// ─── 캐릭터 선택: 등급별 5명 대표 ──────────────────────────────
function pickRepresentatives(chars, rarity, count = 5) {
  const pool = chars.filter(c => c.rarity === rarity);
  if (pool.length <= count) return pool;

  // 다양한 mood/class 분포를 위해 분산 선택
  const selected = [];
  const usedMoods = new Set();
  const usedClasses = new Set();

  // 1차: mood 다양성 우선
  for (const c of pool) {
    if (selected.length >= count) break;
    if (!usedMoods.has(c.mood)) {
      selected.push(c);
      usedMoods.add(c.mood);
      usedClasses.add(c.class);
    }
  }

  // 2차: class 다양성
  for (const c of pool) {
    if (selected.length >= count) break;
    if (!selected.includes(c) && !usedClasses.has(c.class)) {
      selected.push(c);
      usedClasses.add(c.class);
      usedMoods.add(c.mood);
    }
  }

  // 3차: 나머지 채우기
  for (const c of pool) {
    if (selected.length >= count) break;
    if (!selected.includes(c)) {
      selected.push(c);
    }
  }

  return selected.slice(0, count);
}

// ─── 시뮬레이션 실행 ─────────────────────────────────────────────
const SIMS_PER_PAIR = 100;
const reps = {};
for (let r = 1; r <= 5; r++) {
  reps[r] = pickRepresentatives(characters, r, 5);
}

console.log('='.repeat(80));
console.log('  ArcaneCollectors 밸런스 시뮬레이션 리포트');
console.log('  시뮬레이션 횟수: 각 매치업 ' + SIMS_PER_PAIR + '회');
console.log('='.repeat(80));

// ─── 1. 선택된 대표 캐릭터 출력 ─────────────────────────────────
console.log('\n[1] 등급별 대표 캐릭터 (각 5명)');
console.log('-'.repeat(80));
for (let r = 1; r <= 5; r++) {
  console.log(`\n  ★${r} (${reps[r].length}명):`);
  for (const c of reps[r]) {
    const s = c.stats;
    console.log(`    ${c.name.padEnd(12)} | ${c.mood.padEnd(8)} | ${c.class.padEnd(8)} | HP:${s.hp} ATK:${s.atk} DEF:${s.def} SPD:${s.spd}`);
  }
}

// ─── 2. 등급 간 승률 분석 ────────────────────────────────────────
console.log('\n\n[2] 등급 간 평균 승률 (행 vs 열)');
console.log('-'.repeat(80));

const tierWins = {}; // tierWins[rA][rB] = wins for rA against rB
for (let rA = 1; rA <= 5; rA++) {
  tierWins[rA] = {};
  for (let rB = 1; rB <= 5; rB++) {
    tierWins[rA][rB] = { wins: 0, total: 0 };
  }
}

// 전체 캐릭터별 승률 추적
const charWins = {};
const charTotal = {};
characters.forEach(c => { charWins[c.id] = 0; charTotal[c.id] = 0; });

for (let rA = 1; rA <= 5; rA++) {
  for (let rB = rA; rB <= 5; rB++) {
    for (const cA of reps[rA]) {
      for (const cB of reps[rB]) {
        if (cA.id === cB.id) continue;
        for (let sim = 0; sim < SIMS_PER_PAIR; sim++) {
          const winner = simulateBattle(cA, cB);
          if (winner === 'A') {
            tierWins[rA][rB].wins++;
            charWins[cA.id]++;
          } else {
            tierWins[rB][rA].wins++;
            charWins[cB.id]++;
          }
          tierWins[rA][rB].total++;
          tierWins[rB][rA].total++;
          charTotal[cA.id]++;
          charTotal[cB.id]++;
        }
      }
    }
  }
}

// 테이블 출력
const header = '         ' + [1,2,3,4,5].map(r => `★${r}`.padStart(8)).join('');
console.log(header);
for (let rA = 1; rA <= 5; rA++) {
  let row = `  ★${rA}    `;
  for (let rB = 1; rB <= 5; rB++) {
    const { wins, total } = tierWins[rA][rB];
    if (total === 0) {
      row += '   -   '.padStart(8);
    } else {
      const pct = ((wins / total) * 100).toFixed(1);
      row += `${pct}%`.padStart(8);
    }
  }
  console.log(row);
}

// ─── 3. 분위기(Mood) 상성 효과 분석 ─────────────────────────────
console.log('\n\n[3] 분위기(Mood) 상성 효과 분석');
console.log('-'.repeat(80));

// 전체 캐릭터로 mood 상성 시뮬 (같은 등급 내에서만)
const moodStats = {
  advantage: { wins: 0, total: 0 },
  disadvantage: { wins: 0, total: 0 },
  neutral: { wins: 0, total: 0 },
};

// 등급별로 같은 등급 캐릭터 사이에서 mood 상성 효과 측정
for (let r = 1; r <= 5; r++) {
  const pool = characters.filter(c => c.rarity === r);
  // 너무 많으면 샘플링
  const testPool = pool.length > 10 ? pool.slice(0, 10) : pool;

  for (let i = 0; i < testPool.length; i++) {
    for (let j = i + 1; j < testPool.length; j++) {
      const cA = testPool[i];
      const cB = testPool[j];
      const moodMultA = getMoodMultiplier(cA.mood, cB.mood);

      let category;
      if (moodMultA > 1.0) category = 'advantage';
      else if (moodMultA < 1.0) category = 'disadvantage';
      else category = 'neutral';

      let winsA = 0;
      for (let sim = 0; sim < SIMS_PER_PAIR; sim++) {
        if (simulateBattle(cA, cB) === 'A') winsA++;
      }

      moodStats[category].wins += winsA;
      moodStats[category].total += SIMS_PER_PAIR;
    }
  }
}

console.log('  상성 관계           | 평균 승률       | 매치 수');
console.log('  ' + '-'.repeat(55));
for (const [cat, label] of [['advantage', '유리 (1.2x)'], ['disadvantage', '불리 (0.8x)'], ['neutral', '중립 (1.0x)']]) {
  const { wins, total } = moodStats[cat];
  if (total > 0) {
    const pct = ((wins / total) * 100).toFixed(1);
    console.log(`  ${label.padEnd(20)} | ${pct.padStart(5)}%          | ${total} 매치`);
  } else {
    console.log(`  ${label.padEnd(20)} |     N/A          | 0 매치`);
  }
}

// 개별 mood 상성 세부 분석
console.log('\n  [3-1] 개별 Mood 상성 승률 상세');
console.log('  ' + '-'.repeat(60));

const moodPairStats = {};
for (const [atkMood, defMoods] of Object.entries(MOOD_ADVANTAGES)) {
  for (const defMood of defMoods) {
    const key = `${atkMood} > ${defMood}`;
    moodPairStats[key] = { wins: 0, total: 0 };
  }
}

// 같은 등급 내에서 상성 매치업 세부 분석
for (let r = 1; r <= 5; r++) {
  const pool = characters.filter(c => c.rarity === r);
  for (let i = 0; i < pool.length; i++) {
    for (let j = 0; j < pool.length; j++) {
      if (i === j) continue;
      const cA = pool[i];
      const cB = pool[j];
      const advTargets = MOOD_ADVANTAGES[cA.mood] || [];
      if (!advTargets.includes(cB.mood)) continue;

      const key = `${cA.mood} > ${cB.mood}`;
      if (!moodPairStats[key]) continue;

      let winsA = 0;
      const simCount = 50; // 세부 분석은 50회
      for (let sim = 0; sim < simCount; sim++) {
        if (simulateBattle(cA, cB) === 'A') winsA++;
      }
      moodPairStats[key].wins += winsA;
      moodPairStats[key].total += simCount;
    }
  }
}

console.log('  상성 매치업              | 유리 측 평균 승률');
console.log('  ' + '-'.repeat(50));
const sortedPairs = Object.entries(moodPairStats)
  .filter(([, v]) => v.total > 0)
  .sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total));

for (const [key, { wins, total }] of sortedPairs) {
  const pct = ((wins / total) * 100).toFixed(1);
  const bar = '█'.repeat(Math.round(wins / total * 20));
  console.log(`  ${key.padEnd(25)} | ${pct.padStart(5)}% ${bar}`);
}

// ─── 4. 밸런스 아웃라이어 분석 ───────────────────────────────────
console.log('\n\n[4] 밸런스 아웃라이어 (전체 대표 캐릭터 기준)');
console.log('-'.repeat(80));

// 대표 캐릭터들만 승률 계산
const repIds = new Set();
for (let r = 1; r <= 5; r++) {
  reps[r].forEach(c => repIds.add(c.id));
}

const repResults = [];
for (const id of repIds) {
  if (charTotal[id] > 0) {
    const char = characters.find(c => c.id === id);
    const winRate = charWins[id] / charTotal[id];
    repResults.push({ char, winRate, wins: charWins[id], total: charTotal[id] });
  }
}

repResults.sort((a, b) => b.winRate - a.winRate);

console.log('\n  전체 대표 캐릭터 승률 순위:');
console.log('  ' + '-'.repeat(75));
console.log('  ' + '이름'.padEnd(12) + ' | ★ | ' + 'Mood'.padEnd(8) + ' | ' + 'Class'.padEnd(8) + ' | 승률       | 전적');
console.log('  ' + '-'.repeat(75));

for (const { char, winRate, wins, total } of repResults) {
  const pct = (winRate * 100).toFixed(1);
  const flag = winRate > 0.70 ? ' ⚠ OP' : winRate < 0.30 ? ' ⚠ WEAK' : '';
  console.log(`  ${char.name.padEnd(12)} | ${char.rarity} | ${char.mood.padEnd(8)} | ${char.class.padEnd(8)} | ${pct.padStart(5)}%     | ${wins}W/${total - wins}L${flag}`);
}

// 아웃라이어 하이라이트
console.log('\n  [4-1] 밸런스 주의 캐릭터 (승률 >70% 또는 <30%):');
console.log('  ' + '-'.repeat(60));

const outliers = repResults.filter(r => r.winRate > 0.70 || r.winRate < 0.30);
if (outliers.length === 0) {
  console.log('  아웃라이어 없음 - 밸런스 양호!');
} else {
  for (const { char, winRate } of outliers) {
    const pct = (winRate * 100).toFixed(1);
    const status = winRate > 0.70 ? 'OVERPOWERED' : 'UNDERPOWERED';
    console.log(`  [${status}] ${char.name} (★${char.rarity}, ${char.mood}, ${char.class}) - 승률 ${pct}%`);
    const s = char.stats;
    console.log(`           Stats: HP=${s.hp} ATK=${s.atk} DEF=${s.def} SPD=${s.spd}`);
  }
}

// ─── 5. 같은 등급 내 밸런스 분석 (전체 캐릭터) ──────────────────
console.log('\n\n[5] 등급 내 밸런스 분석 (전체 캐릭터, 같은 등급 간 라운드로빈)');
console.log('-'.repeat(80));

for (let r = 1; r <= 5; r++) {
  const pool = characters.filter(c => c.rarity === r);
  const intraWins = {};
  const intraTotal = {};
  pool.forEach(c => { intraWins[c.id] = 0; intraTotal[c.id] = 0; });

  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const simCount = pool.length > 15 ? 30 : 50;
      for (let sim = 0; sim < simCount; sim++) {
        const winner = simulateBattle(pool[i], pool[j]);
        if (winner === 'A') {
          intraWins[pool[i].id]++;
        } else {
          intraWins[pool[j].id]++;
        }
        intraTotal[pool[i].id]++;
        intraTotal[pool[j].id]++;
      }
    }
  }

  const results = pool.map(c => ({
    char: c,
    winRate: intraTotal[c.id] > 0 ? intraWins[c.id] / intraTotal[c.id] : 0,
    wins: intraWins[c.id],
    total: intraTotal[c.id],
  })).sort((a, b) => b.winRate - a.winRate);

  console.log(`\n  ★${r} 등급 내 승률 (${pool.length}명 라운드로빈):`);
  console.log('  ' + '-'.repeat(70));

  for (const { char, winRate, wins, total } of results) {
    const pct = (winRate * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(winRate * 20));
    const flag = winRate > 0.70 ? ' OP!' : winRate < 0.30 ? ' WEAK!' : '';
    console.log(`  ${char.name.padEnd(12)} ${char.mood.padEnd(8)} ${char.class.padEnd(8)} ${pct.padStart(5)}% ${bar}${flag}`);
  }

  // 등급 내 표준편차
  const rates = results.map(r => r.winRate);
  const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
  const variance = rates.reduce((a, r) => a + (r - avg) ** 2, 0) / rates.length;
  const stdDev = Math.sqrt(variance);
  console.log(`  → 평균 승률: ${(avg * 100).toFixed(1)}%, 표준편차: ${(stdDev * 100).toFixed(1)}%`);
  if (stdDev > 0.15) {
    console.log('  → ⚠ 표준편차가 높음 - 등급 내 밸런스 조정 필요');
  } else if (stdDev > 0.10) {
    console.log('  → 표준편차 보통 - 약간의 밸런스 차이 존재');
  } else {
    console.log('  → 표준편차 낮음 - 등급 내 밸런스 양호');
  }
}

// ─── 6. 클래스별 승률 분석 ───────────────────────────────────────
console.log('\n\n[6] 클래스별 평균 승률 (같은 등급 내)');
console.log('-'.repeat(80));

const classStats = {};
for (let r = 1; r <= 5; r++) {
  const pool = characters.filter(c => c.rarity === r);
  const intraWins = {};
  const intraTotal = {};
  pool.forEach(c => { intraWins[c.id] = 0; intraTotal[c.id] = 0; });

  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      for (let sim = 0; sim < 30; sim++) {
        const winner = simulateBattle(pool[i], pool[j]);
        if (winner === 'A') intraWins[pool[i].id]++;
        else intraWins[pool[j].id]++;
        intraTotal[pool[i].id]++;
        intraTotal[pool[j].id]++;
      }
    }
  }

  for (const c of pool) {
    if (!classStats[c.class]) classStats[c.class] = { wins: 0, total: 0 };
    classStats[c.class].wins += intraWins[c.id];
    classStats[c.class].total += intraTotal[c.id];
  }
}

console.log('  클래스       | 평균 승률 | 총 매치 수');
console.log('  ' + '-'.repeat(45));
for (const [cls, { wins, total }] of Object.entries(classStats).sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total))) {
  const pct = ((wins / total) * 100).toFixed(1);
  console.log(`  ${cls.padEnd(12)} | ${pct.padStart(5)}%    | ${total}`);
}

// ─── 요약 ───────────────────────────────────────────────────────
console.log('\n\n' + '='.repeat(80));
console.log('  시뮬레이션 요약');
console.log('='.repeat(80));
console.log(`  총 캐릭터: ${characters.length}명`);
console.log(`  등급 분포: ★1=${characters.filter(c=>c.rarity===1).length}, ★2=${characters.filter(c=>c.rarity===2).length}, ★3=${characters.filter(c=>c.rarity===3).length}, ★4=${characters.filter(c=>c.rarity===4).length}, ★5=${characters.filter(c=>c.rarity===5).length}`);
console.log(`  Mood 종류: ${[...new Set(characters.map(c => c.mood))].length}종`);
console.log(`  상성 유리 시 평균 승률: ${moodStats.advantage.total > 0 ? ((moodStats.advantage.wins / moodStats.advantage.total) * 100).toFixed(1) : 'N/A'}%`);
console.log(`  상성 불리 시 평균 승률: ${moodStats.disadvantage.total > 0 ? ((moodStats.disadvantage.wins / moodStats.disadvantage.total) * 100).toFixed(1) : 'N/A'}%`);

const allOutliers = [];
for (let r = 1; r <= 5; r++) {
  const pool = characters.filter(c => c.rarity === r);
  const intraWins = {};
  const intraTotal = {};
  pool.forEach(c => { intraWins[c.id] = 0; intraTotal[c.id] = 0; });
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      for (let sim = 0; sim < 30; sim++) {
        const winner = simulateBattle(pool[i], pool[j]);
        if (winner === 'A') intraWins[pool[i].id]++;
        else intraWins[pool[j].id]++;
        intraTotal[pool[i].id]++;
        intraTotal[pool[j].id]++;
      }
    }
  }
  for (const c of pool) {
    const wr = intraTotal[c.id] > 0 ? intraWins[c.id] / intraTotal[c.id] : 0.5;
    if (wr > 0.70 || wr < 0.30) {
      allOutliers.push({ name: c.name, rarity: c.rarity, mood: c.mood, cls: c.class, winRate: wr });
    }
  }
}

if (allOutliers.length > 0) {
  console.log(`\n  밸런스 아웃라이어 (등급 내 승률 >70% 또는 <30%):`);
  for (const o of allOutliers.sort((a, b) => b.winRate - a.winRate)) {
    const status = o.winRate > 0.70 ? 'OP' : 'WEAK';
    console.log(`    [${status}] ${o.name} (★${o.rarity}, ${o.mood}, ${o.cls}) - ${(o.winRate * 100).toFixed(1)}%`);
  }
} else {
  console.log('\n  등급 내 밸런스 아웃라이어: 없음');
}

console.log('\n' + '='.repeat(80));
console.log('  시뮬레이션 완료!');
console.log('='.repeat(80));
