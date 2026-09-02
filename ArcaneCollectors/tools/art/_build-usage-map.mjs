/**
 * _build-usage-map.mjs — ASSET_USAGE_MAP.md 생성기
 * 실행: node tools/art/_build-usage-map.mjs
 *
 * asset-spec.json 을 단일 입력으로 삼아 매핑 표를 굽는다.
 * 스펙이 바뀌면 이 스크립트를 재실행해 문서를 갱신한다.
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

const spec = JSON.parse(readFileSync(path.resolve('tools/art/asset-spec.json'), 'utf8'));

/** targetPath -> Phaser 로더 경로 (public/ 접두 제거) */
const loadPath = (p) => p.replace(/^public\//, '');

/** id -> 텍스처 키. 카테고리별 규칙 */
function textureKey(a) {
  switch (a.category) {
    case 'background':
      return a.id; // bg_main, bg_chapter_1 …
    case 'frame':
    case 'button':
    case 'banner':
    case 'logo':
      return a.id;
    case 'icon':
      return a.id; // icon_currency_gold, icon_cult_yomi …
    case 'fullbody-extra':
      return a.id.startsWith('enemy_') ? a.id : a.id.replace('fullbody_', 'fb_');
    default:
      return a.id;
  }
}

/** 어느 로더 페이즈에서 등록되는가 */
function loadPhase(a) {
  switch (a.category) {
    case 'background':
      return 'PreloadScene.loadPhase0_Assets() — 씬 진입 전 일괄';
    case 'frame':
    case 'button':
    case 'logo':
      return 'PreloadScene.loadPhase0_Assets() — 씬 진입 전 일괄';
    case 'icon':
      return 'PreloadScene.loadPhase0_Assets() — 씬 진입 전 일괄';
    case 'banner':
      return 'GachaScene.preload() — 지연 로드 (배너 교체 대응)';
    case 'fullbody-extra':
      return a.id.startsWith('enemy_')
        ? 'BattleScene.preload() — 해당 스테이지 적 목록만 지연 로드'
        : 'HeroDetailScene.preload() — 조회 대상 1명만 지연 로드';
    default:
      return 'PreloadScene';
  }
}

const rows = spec.assets.map((a) => ({
  id: a.id,
  key: textureKey(a),
  loadPath: loadPath(a.targetPath),
  phase: loadPhase(a),
  priority: a.priority,
  usedBy: a.usedBy
}));

// 역방향 인덱스: 파일/컴포넌트 -> 에셋
const byConsumer = new Map();
for (const r of rows) {
  for (const c of r.usedBy) {
    if (!byConsumer.has(c)) byConsumer.set(c, []);
    byConsumer.get(c).push(r.id);
  }
}

const esc = (s) => String(s).replace(/\|/g, '\\|');

const section = (title, cats) => {
  const list = rows.filter((r) => cats.includes(spec.assets.find((a) => a.id === r.id).category));
  if (!list.length) return '';
  return (
    `| 에셋 id | 텍스처 키 | 로드 경로 | 우선도 | 사용처 |\n` +
    `|---------|----------|----------|--------|--------|\n` +
    list
      .map(
        (r) =>
          `| \`${r.id}\` | \`${r.key}\` | \`${r.loadPath}\` | ${r.priority} | ${esc(
            r.usedBy.join(', ') || '—'
          )} |`
      )
      .join('\n') +
    '\n\n'
  );
};

const blurRows = rows.filter(
  (r) => spec.assets.find((a) => a.id === r.id).category === 'background'
);

const md = `# ASSET_USAGE_MAP

> 생성 에셋과 코드의 매핑표. **자동 생성 문서다.**
> 원본은 \`tools/art/asset-spec.json\`이고, 이 문서는 \`node tools/art/_build-usage-map.mjs\`가 굽는다.
> 스펙을 고쳤다면 재실행할 것. 손으로 고치면 다음 생성에서 지워진다.

생성 시각: ${spec.generatedAt} · 총 **${spec.summary.total}건** (P1 ${spec.summary.P1} / P2 ${spec.summary.P2})

---

## 0. 읽는 법

| 열 | 의미 |
|----|------|
| **에셋 id** | \`asset-spec.json\`의 \`id\`. ComfyUI 배치 파일명과 일치시킨다 |
| **텍스처 키** | \`scene.add.image(x, y, '<키>')\`에 넣는 Phaser 텍스처 키 |
| **로드 경로** | \`scene.load.image()\`의 두 번째 인자. \`public/\`을 뺀 경로다 |
| **사용처** | 이 에셋을 참조하는 씬 또는 컴포넌트 |

**로드 규칙 3가지**

1. 배경·프레임·버튼·아이콘·로고는 \`PreloadScene.loadPhase0_Assets()\`에서 **일괄 등록**한다. 전 씬이 공유하므로 한 번만 로드한다.
2. 배너와 전신·적 스프라이트는 **지연 로드**한다. 배너는 교체 주기가 짧고, 전신은 조회 대상 1명만 필요하며, 적은 스테이지마다 다르다.
3. 모든 로드에는 **프로시저럴 폴백이 남아 있어야 한다.** 이미지가 없으면 기존 \`TextureGenerator\` / \`BackgroundFactory\` / \`IconFactory\` 결과를 그대로 쓴다. 에셋 도입이 회귀를 만들지 않게 하는 조건이다.

---

## 1. 배경 (background)

${section('배경', ['background'])}#### 블러 페어

\`glass\` 패널의 백드롭에 쓰이는 사전 블러본이다. ComfyUI 출력이 아니라 \`tools/art/build-blur.mjs\`가 원본에서 굽는다 (가우시안 24px + 밝기 −15%).

| 원본 키 | 블러 키 | 블러 로드 경로 |
|---------|--------|--------------|
${blurRows.map((r) => `| \`${r.key}\` | \`${r.key}_blur\` | \`${r.loadPath.replace(/\.png$/, '_blur.png')}\` |`).join('\n')}

---

## 2. 프레임 · 패널 (frame)

${section('프레임', ['frame'])}9-slice 코너값은 \`asset-spec.json\`의 각 항목 \`postProcess\`에 있고, 코드에서는 \`src/components/NineSliceFrame.js\`의 내장 테이블이 SSOT다.

---

## 3. 버튼 (button)

${section('버튼', ['button'])}---

## 4. 아이콘 (icon)

${section('아이콘', ['icon'])}> **메뉴·클래스·스탯 아이콘 21종은 이 표에 없다.** SDXL이 균질한 플랫 아이콘 세트를 만들지 못하므로 \`src/utils/IconFactory.js\` 벡터 확장(태스크 T-07)으로 처리한다. \`REDESIGN_PLAN.md §1-2\` 참조.

---

## 5. 배너 · 이펙트 (banner)

${section('배너', ['banner'])}---

## 6. 로고 (logo)

${section('로고', ['logo'])}> \`logo_arcane_collectors\`는 **엠블럼만**이다. "ARCANE COLLECTORS" 워드마크는 Orbitron 700으로 코드에서 렌더한다.

---

## 7. 적 유닛 · 전신 (fullbody-extra)

${section('적 유닛 및 전신', ['fullbody-extra'])}> hero_005~038의 전신 시트 34장은 **별도 트랙**에서 생성되며 이 스펙에 포함되지 않는다.
> 경로 규약은 \`public/assets/characters/fullbody/hero_XXX.png\`, 텍스처 키는 \`fb_hero_XXX\`로 동일하다.

---

## 8. 역방향 인덱스 (파일 · 컴포넌트 → 에셋)

| 사용처 | 필요한 에셋 |
|--------|-----------|
${[...byConsumer.entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([c, ids]) => `| ${esc(c)} | ${ids.map((i) => `\`${i}\``).join(', ')} |`)
  .join('\n')}

---

## 9. 디렉터리 준비 상태

현재 아래 디렉터리는 전부 비어 있다(\`.gitkeep\`만 존재). 에셋 배치 시 그대로 채우면 된다.

\`\`\`
public/assets/backgrounds/battle/     ← bg_chapter_1..5 (+_blur)
public/assets/backgrounds/scenes/     ← bg_main, bg_login, bg_gacha, bg_stageselect,
                                         bg_tower, bg_result_*, bg_pvp, bg_raid (+_blur)
public/assets/ui/frames/              ← frame_panel, frame_popup, frame_card_*, frame_hex
public/assets/ui/panels/              ← panel_header_ornament, banner_pickup_*
public/assets/ui/buttons/             ← btn_primary, btn_secondary, btn_ghost
public/assets/ui/icons/currency/      ← gold, gem, energy, ticket, spirit_stone
public/assets/ui/icons/cults/         ← 교단 9종
public/assets/effects/skills/         ← fx_summon_circle
public/assets/characters/battle/      ← 적 유닛 10종
public/assets/characters/fullbody/    ← (신규 생성 필요) 전신 시트
\`\`\`

\`public/assets/ui/icons/{classes,moods,stats,tabs}\`는 벡터 아이콘으로 가므로 **비워 둔다**.

---

## 10. 검증

에셋 배치 후 아래를 확인한다.

1. \`node tools/art/capture-before.mjs\` 계열 스크립트로 \`screenshots/after/\`를 뽑아 before와 대조한다.
2. 로드 스모크(태스크 T-27)로 이 표의 모든 텍스처 키가 **실제 이미지**인지 검사한다. 캔버스 폴백이 남아 있으면 실패로 본다.
3. Vite dev 서버가 없는 에셋에 \`index.html\`을 200으로 돌려주므로(태스크 T-04 이전) 404가 마스킹된다. 검증은 텍스처 크기로 하고 HTTP 상태로 하지 않는다.
`;

const out = path.resolve('docs/redesign/ASSET_USAGE_MAP.md');
writeFileSync(out, md, 'utf8');
console.log(`wrote ${out}`);
console.log(`rows ${rows.length}, consumers ${byConsumer.size}`);
