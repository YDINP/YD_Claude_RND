/**
 * 렌더러 튜닝 상수. 매직 넘버는 전부 여기에 모은다.
 * 레이아웃 비율은 "심볼 한 변" 기준의 배수다 (해상도와 무관하게 같은 비례를 유지).
 */

/** 심볼 사이 간격 = 심볼 한 변 x 이 값. */
export const SYMBOL_GAP_RATIO = 0.06
/** 릴 영역과 프레임 테두리 사이 여백 = 심볼 한 변 x 이 값. */
export const FRAME_PADDING_RATIO = 0.1
/** 프레임 테두리 두께 = 심볼 한 변 x 이 값. */
export const FRAME_BORDER_RATIO = 0.05
/** 프레임 모서리 반경 = 심볼 한 변 x 이 값. */
export const FRAME_RADIUS_RATIO = 0.16
/** 심볼 스프라이트가 셀 안에서 차지하는 비율. 1보다 작게 두어 숨 쉴 공간을 준다. */
export const SYMBOL_FILL_RATIO = 0.86
/** 캔버스 최소 심볼 크기(px). 이보다 작아지면 심볼을 알아볼 수 없다. */
export const MIN_SYMBOL_SIZE = 24
/** 캔버스 최대 심볼 크기(px). 태블릿에서 과하게 커지는 것을 막는다. */
export const MAX_SYMBOL_SIZE = 200

/** 기본 스핀 길이(ms). 릴 1개 기준. */
export const DEFAULT_SPIN_DURATION_MS = 900
/** 릴 사이 정지 간격(ms). 왼쪽에서 오른쪽으로. */
export const DEFAULT_STAGGER_MS = 160
/** 첫 릴이 도는 최소 바퀴 수. 릴마다 1바퀴씩 더 돈다. */
export const BASE_REVOLUTIONS = 3
/**
 * 스핀을 시작할 때 모든 릴이 함께 뒤로 당기는 거리(심볼 단위, 위쪽).
 * 아래로 튕겨 나가기 직전의 반동이다. 레버를 당겼다 놓는 느낌을 준다.
 */
export const PULL_UP_SYMBOLS = 0.25
/** 뒤로 당기는 시간(ms). */
export const PULL_UP_MS = 110
/** 정지 직전에 아주 살짝 지나쳤다 돌아오는 거리(심볼 단위). 튕김이 아니라 마무리다. */
export const LANDING_SETTLE_SYMBOLS = 0.04
/** 마무리에 쓰는 시간(ms). */
export const LANDING_SETTLE_MS = 90
/** 마무리가 전체 스핀 시간에서 차지할 수 있는 최대 비율. 짧은 스핀에서 마무리가 잡아먹지 않게 한다. */
export const LANDING_SETTLE_MAX_PORTION = 0.3
/**
 * 마지막 릴이 완전히 멈춘 뒤(정착 트윈까지 끝난 뒤) 당첨 강조·심볼 fx·스프라이트 시트 재생·
 * 피처 배너 같은 승리 연출이 시작되기까지 두는 최소 숨 고르기 시간(ms, `normal` 기준). 사용자
 * 피드백: "각 연출은 릴스탑이 끝나고 나올 것" — "멈췄다"와 "터진다"가 같은 프레임 근처에서
 * 겹쳐 보이면 안 된다. 실제 스케일은 `SPIN_SPEED_PROFILES[speed].winStartDelayScale`이 정한다
 * (터보는 스핀 리듬 자체가 짧으니 이 여백도 비례해 줄인다). 스킵(스탑/탭/스페이스)으로 릴을
 * 곧장 스냅시킨 경우도 `showWins()`를 거치는 건 같으므로 이 여백이 동일하게 적용된다.
 */
export const WIN_START_DELAY_MS = 100

/**
 * 스핀 속도 프로파일. 프라그마틱 계열의 빠른 스핀/터보 스핀 관행을 따른다
 * (`docs/REFERENCE_PRAGMATIC.md` §3: 정지는 좌→우 순차, 릴당 0.1~0.2초 간격).
 *
 * - `normal`: 기본. 5릴 기준 총 1.65초.
 * - `quick`: 회전과 간격을 55%로 줄인다. 총 0.9초. 리듬은 그대로 남는다.
 * - `turbo`: 최소. 총 0.45초. 당김을 생략하고 릴이 거의 동시에 선다.
 *
 * `winHoldScale`은 승리 연출 A단계 홀드에 곱한다. 릴이 0.45초에 서는데 배당을 3초 붙들면
 * 빨라진 것이 하나도 없기 때문이다.
 */
export const SPIN_SPEED_PROFILES = {
  normal: {
    durationMs: DEFAULT_SPIN_DURATION_MS,
    staggerMs: DEFAULT_STAGGER_MS,
    pullUpMs: PULL_UP_MS,
    settleMs: LANDING_SETTLE_MS,
    winHoldScale: 1,
    winStartDelayScale: 1,
  },
  quick: { durationMs: 500, staggerMs: 88, pullUpMs: 60, settleMs: 60, winHoldScale: 1, winStartDelayScale: 0.7 },
  turbo: { durationMs: 380, staggerMs: 18, pullUpMs: 0, settleMs: 40, winHoldScale: 0.55, winStartDelayScale: 0.45 },
} as const

/** 아무것도 고르지 않았을 때의 스핀 속도. */
export const DEFAULT_SPIN_SPEED = 'normal'

/** 모션 축소 시 스핀 길이(ms). */
export const REDUCED_SPIN_DURATION_MS = 240
/** 모션 축소 시 릴 간격(ms). */
export const REDUCED_STAGGER_MS = 30
/** 모션 축소 시 전체 스핀이 넘으면 안 되는 상한(ms). */
export const REDUCED_TOTAL_CAP_MS = 300

/** 승리 라인을 한 줄씩 순환하는 주기(ms). */
export const WIN_CYCLE_MS = 900
/** 승리 심볼 펄스 최대 배율. */
export const WIN_PULSE_SCALE = 1.12
/** 펄스 1회 길이(ms). */
export const WIN_PULSE_MS = 420
/** 페이라인 선 두께(px). 심볼 크기와 무관하게 가늘게 유지한다. */
export const WIN_LINE_STROKE_PX = 3
/** 페이라인 선 불투명도. 심볼을 가리지 않도록 낮춘다. */
export const WIN_LINE_ALPHA = 0.6
/** 승리 심볼 테두리 두께(px). */
export const WIN_HIGHLIGHT_STROKE_PX = 2
/**
 * 승리 심볼 바깥 광채. 굵고 흐린 선부터 겹쳐 그려 블러 필터 없이 번짐을 흉내 낸다.
 * 색은 `palette.frame`(브라스)이라 페이라인 색과 달리 초록이 섞이지 않는다.
 */
export const WIN_GLOW_LAYERS = [
  { widthPx: 12, alpha: 0.1 },
  { widthPx: 7, alpha: 0.18 },
  { widthPx: 4, alpha: 0.3 },
] as const

/**
 * 승리 등급 문턱(총 베팅액 대비 배수). `docs/REFERENCE_PRAGMATIC.md` §2의 업계 관행 구간이다.
 * 배수가 큰 등급부터 검사해야 하므로 순서대로 읽을 것.
 */
export const WIN_TIER_MULTIPLIERS = { big: 10, mega: 20, epic: 50, max: 100 } as const

/** 총 배당이 베팅액의 이 배수 이상이면 빅윈(가장 낮은 등급) 이상이다. */
export const BIG_WIN_BET_MULTIPLIER = WIN_TIER_MULTIPLIERS.big
/** 코인 파티클 개수 상한. 저사양 기기 보호. */
export const MAX_COIN_PARTICLES = 60

/** 등급별 코인 샤워 세기(파티클 수). 등급이 오를수록 쏟아진다. */
export const COIN_COUNT_BY_TIER = { none: 0, big: 20, mega: 35, epic: 50, max: MAX_COIN_PARTICLES } as const

/** 색종이 개수. 최고 등급에서만 뿌린다. */
export const CONFETTI_COUNT = 36
/** 색종이 낙하 시간(ms). */
export const CONFETTI_FALL_MS = 2000
/** 색종이 색. 브라스 팔레트에 붉은/푸른 강조를 섞는다. */
export const CONFETTI_COLORS = ['#f4d98a', '#d8a94a', '#e0605c', '#4fc3d9', '#f2f4f8'] as const
/** 코인 파티클 낙하 시간(ms). */
export const COIN_FALL_MS = 1400

/** 유휴 상태에서 릴이 미세하게 흔들리는 진폭(심볼 단위). */
export const IDLE_AMPLITUDE_SYMBOLS = 0.012
/** 유휴 흔들림 왕복 주기(ms). */
export const IDLE_CYCLE_MS = 2200

/** 이미지 로딩 실패 시 그려 넣는 폴백 텍스처 한 변(px). */
export const FALLBACK_TEXTURE_SIZE = 256

/** 테마 파일 경로. `<baseUrl>/theme/theme.json`. */
export const THEME_FILE_PATH = 'theme/theme.json'

/** 가속 구간이 차지하는 시간 비율 (스핀 회전 시간 대비). */
export const ACCEL_TIME_RATIO = 0.45
/** 가속 구간이 소화하는 이동 거리 비율. 나머지는 감속 구간이 맡는다. */
export const ACCEL_DISTANCE_RATIO = 0.3
/** 모션 축소 시 승리 라인 순환 주기(ms). */
export const REDUCED_WIN_CYCLE_MS = 450
/** 컨테이너 크기를 잴 수 없을 때 쓰는 기본 폭(px). */
export const FALLBACK_CONTAINER_WIDTH = 320

/**
 * 프레임 아트 안에서 릴 창이 차지하는 비율. 프레임 이미지 크기 기준의 분수다.
 * `docs/ART_DIRECTION.md` §5의 x 8~92%, y 22~68%와 같은 값이고,
 * `theme.json`이 `frameLayout`을 주지 않을 때의 기본값이다.
 */
export const DEFAULT_FRAME_WINDOW = { x: 0.08, y: 0.22, w: 0.84, h: 0.46 } as const

/**
 * `fit: 'window'`에서 프레임이 컨테이너 폭을 넘어도 되는 비율.
 *
 * 기본 0 — **프레임은 좌우로 잘리지 않는다.** 예전 기본값 0.4는 릴 창을 컨테이너 폭까지
 * 키우는 대신 좌우 기둥과 레일을 컨테이너 밖으로 밀어냈고, 실제 화면에서 양옆이 잘려 보였다.
 * 창이 조금 좁아지더라도 아트가 온전히 보이는 쪽을 기본으로 삼는다.
 *
 * 0보다 크게 주면 그 비율만큼 다시 넘칠 수 있다. 잘림을 감수하고 릴을 키우려는 게임만 쓴다.
 */
export const DEFAULT_OVERFLOW_X = 0

/** 크로마키 판정: 초록 채널이 이 값보다 커야 후보가 된다. */
export const CHROMA_GREEN_MIN = 140
/** 크로마키 판정: 초록이 빨강·파랑보다 이만큼은 더 커야 한다. */
export const CHROMA_GREEN_DOMINANCE = 50

/** 반짝임 개수 하한. */
export const SPARKLE_MIN_COUNT = 6
/** 반짝임 개수 상한. 은은해야 하므로 낮게 잡는다. */
export const SPARKLE_MAX_COUNT = 10
/** 반짝임 최대 불투명도. 1이면 눈에 띄어 릴을 방해한다. */
export const SPARKLE_ALPHA = 0.5
/** 반짝임 1회 페이드 인/아웃 시간(ms). */
export const SPARKLE_FADE_MS = 1200
/** 반짝임 크기 범위(스프라이트 배율). */
export const SPARKLE_MIN_SCALE = 0.25
export const SPARKLE_MAX_SCALE = 0.6
/** 반짝임이 다시 나타나기까지의 최대 대기(ms). */
export const SPARKLE_MAX_DELAY_MS = 4200
/** 반짝임을 릴 창에서 밀어낼 때 두는 여유(창 크기 대비 비율). */
export const SPARKLE_WINDOW_MARGIN = 0.04
/** 반짝임 자리를 다시 뽑아 보는 최대 횟수. 못 찾으면 그 하나는 버린다. */
export const SPARKLE_PLACEMENT_ATTEMPTS = 12

/**
 * 승리 연출 A단계(전체 승리 동시 재생) 길이(ms). 등급 없는 보통 승리.
 * 실사용에서 순환이 빠르다는 지적을 받아 기존 900ms에서 1.4배로 늘렸다.
 */
export const PHASE_ALL_MS = 1260
/** BIG 등급의 A단계 길이(ms). 카운터가 올라갈 시간을 준다. */
export const PHASE_ALL_BIGWIN_MS = 2240
/** MEGA 이상의 A단계 길이(ms). 숫자가 클수록 천천히 올라가야 무게감이 산다. */
export const PHASE_ALL_MEGA_MS = 3080
/**
 * 짧은 연출(`presentation: 'brief'`, 오토스핀용) A단계 홀드에 곱하는 배율.
 * 기준은 등급별 길이가 아니라 **보통 승리의 A단계 길이**(`PHASE_ALL_MS`)다 — 빅윈/메가에서도
 * 같은 길이로 스쳐 지나가야 "짧게 1회"라는 약속(총 1.2초 이내, 터보 0.6초 이내)을 지킬 수 있다.
 * 속도 프로파일의 `winHoldScale`은 그 위에 그대로 곱해진다.
 */
export const BRIEF_PHASE_ALL_SCALE = 0.6
/** 승리 연출 B단계(라인 하나씩) 한 스텝 길이(ms). 허브 문구를 읽을 시간을 준다. */
export const PHASE_LINE_MS = 1900
/** 라인이 바뀔 때 겹쳐 넘기는 시간(ms). */
export const PHASE_CROSSFADE_MS = 220
/** 연출 중 참여하지 않는 심볼의 불투명도. */
export const DIM_ALPHA = 0.5

/** fx에서 길이를 지정하지 않았을 때의 기본값(ms). */
export const FX_DEFAULT_DURATION_MS = 700
/** 내장 폴백 pulse의 주기(ms). 업계 관행 0.4~0.6초의 중간값. */
export const BUILTIN_PULSE_MS = 500
/** `flash`의 기본 구획 수. 1이면 심볼 전체가 한 번에 깜빡인다. */
export const FX_DEFAULT_SEGMENTS = 1
/** `flash` 구획 사이 지연(ms). 위에서 아래로 훑는 리듬을 만든다. */
export const FX_SEGMENT_DELAY_MS = 120
/** 구획 수 상한. 심볼 하나에 스프라이트를 무한정 쌓지 않는다. */
export const FX_MAX_SEGMENTS = 6
/** `pulse` 기본 배율. */
export const FX_DEFAULT_PULSE_SCALE = 1.12
/** `shine` 기본 기울기(도). */
export const FX_DEFAULT_SHINE_ANGLE = 25
/** `wobble` 기본 회전 폭(도). */
export const FX_DEFAULT_WOBBLE_DEGREES = 12
/** `bounce` 기본 이동량(심볼 높이 대비). */
export const FX_DEFAULT_BOUNCE_PX = 0.08
/** `burst` 기본 파티클 수. */
export const FX_DEFAULT_BURST_PARTICLES = 24
/** `burst` 파티클 수 상한. 저사양 기기 보호. */
export const FX_MAX_BURST_PARTICLES = 40
/** `glow` 기본 색. 팔레트를 못 읽는 자리에서 쓰는 브라스. */
export const FX_DEFAULT_GLOW_COLOR = '#f4d98a'
/** `flash` 스태거가 켜졌을 때 심볼 사이 지연(ms). */
export const FX_STAGGER_STEP_MS = 90

/** 프리스핀 중 스핀이 빨라지는 배수. 1보다 작으면 짧아진다. */
export const FAST_SPIN_FACTOR = 0.8

/** 스캐터 트리거 연출(파티클이 가운데로 모이는 구간) 길이(ms). */
export const PHASE_FEATURE_MS = 900
/** 스캐터 자리에서 가운데로 날아가는 파티클 수(자리 하나당). */
export const SCATTER_BURST_PARTICLES = 8
/** 스캐터를 감싸는 금빛 링의 두께(px). */
export const SCATTER_RING_STROKE_PX = 3
/** 스캐터 링이 심볼보다 커지는 배수. */
export const SCATTER_RING_SCALE = 0.62
/** 스캐터 링 맥동 주기(ms). */
export const SCATTER_RING_PULSE_MS = 700

/** 프리스핀 중 릴 창 테두리에 입히는 금빛 두께(px). */
export const FREE_SPINS_EDGE_STROKE_PX = 4
/** 프리스핀 테두리 불투명도. */
export const FREE_SPINS_EDGE_ALPHA = 0.55

/**
 * 프리스핀 진입/이탈 전환 — 화면 전체를 완전히 가리는 커튼 3단계(ms, normal 속도 기준).
 * (a) 덮기: 불투명 커튼이 알파 0→1로 캔버스 전체를 완전히 가린다.
 * (b) 배너: 완전히 가려진 채로 배경/모드를 갈아 끼우고 그 상태를 붙들어 둔다.
 * (c) 걷기: 커튼이 알파 1→0으로 걷히며 새 모드가 드러난다.
 * 셋을 더하면 normal 기준 1.5초다. 반투명 와이프로 스치듯 지나가던 예전 연출을 대신한다.
 */
export const MODE_COVER_IN_MS = 380
export const MODE_BANNER_MS = 700
export const MODE_COVER_OUT_MS = 420

/**
 * 스핀 속도별 전환 길이 배율. quick/turbo에서도 화면 전환 자체는 체감이 빨라야 스핀 리듬과
 * 어긋나지 않는다 — 세 구간 모두 같은 배율로 줄인다(비율은 유지).
 */
export const MODE_TRANSITION_SPEED_SCALE = { normal: 1, quick: 0.7, turbo: 0.45 } as const

/**
 * 모션 축소 시 전환 — 애니메이션(덮기/걷기)은 최소로 줄이고 배너만 짧게 유지한다.
 * 셋을 더해도 400ms를 넘지 않는다.
 */
export const REDUCED_MODE_COVER_IN_MS = 60
export const REDUCED_MODE_BANNER_MS = 280
export const REDUCED_MODE_COVER_OUT_MS = 60

/** 커튼 색. 게임 테마와 무관하게 항상 읽히도록 어두운 중립색을 쓴다. */
export const MODE_CURTAIN_COLOR = '#0b0b12'
/** 프리스핀 배경 이미지가 없을 때 덧씌우는 금빛 틴트의 불투명도. */
export const MODE_TINT_ALPHA = 0.22

/**
 * 스킵했을 때 마지막 릴이 자리를 잡기까지의 시간(ms).
 *
 * 남은 회전을 **훑지 않는다.** 릴은 곧장 정지 위치 바로 위에 붙고 이 시간 안에 내려앉는다.
 * 예전에는 남은 거리를 260ms에 몰아 지나갔는데, 스트립이 길면 그동안 심볼이 통째로 흘러
 * "다시 돌다 멈춘다"로 보였다. 스냅은 거리와 무관하므로 그 착시가 생기지 않는다.
 */
export const SKIP_SETTLE_MS = 120
/** 스킵 시 릴 사이 착지 간격(ms). 왼쪽부터 순서대로 내려앉게 한다. */
export const SKIP_STAGGER_MS = 40
/** 스킵 착지에서 정지 위치 위로 띄웠다가 내려오는 거리(심볼 단위). 재가속 없이 내려앉기만 한다. */
export const SKIP_SETTLE_SYMBOLS = 0.06

/**
 * 변형(뮤테이션) 연출 길이(ms). 종류마다 다른 이유가 있다.
 * 확장 와일드는 릴 한 줄이 통째로 자라므로 가장 길고, 승급은 크로스페이드뿐이라 짧다.
 */
export const MUTATION_MS_BY_TYPE = {
  mystery: 600,
  expandWild: 700,
  upgrade: 550,
  randomWild: 650,
} as const

/** 모션 축소 시 변형 1단계 길이(ms). 결과만 보여주고 넘어간다. */
export const REDUCED_MUTATION_MS = 200

/**
 * 단계 시작 기준으로 텍스처를 갈아 끼우는 시점의 비율.
 *
 * 뒤집기·크로스페이드는 한가운데에서 바꿔야 "변했다"가 읽힌다.
 * 낙하는 떨어지는 것 자체가 와일드라 시작하자마자 바꾼다.
 */
export const MUTATION_COMMIT_RATIO = {
  mystery: 0.5,
  expandWild: 0.55,
  upgrade: 0.5,
  randomWild: 0,
} as const

/** 와일드가 칸마다 차례로 떨어지는 간격(ms). */
export const MUTATION_DROP_STAGGER_MS = 90
/** 칸 사이 지연이 단계 길이에서 차지할 수 있는 최대 비율. */
export const MUTATION_MAX_STAGGER_PORTION = 0.4
/** 와일드가 떨어지기 시작하는 높이(심볼 한 변 대비). */
export const MUTATION_DROP_HEIGHT_SYMBOLS = 1.6
/** 낙하 착지 먼지 파티클 수(칸 하나당). */
export const MUTATION_DUST_PARTICLES = 10
/** 미스터리 리빌·승급에서 터지는 금빛 파티클 수(칸 하나당). */
export const MUTATION_BURST_PARTICLES = 14
/** 변형 파티클이 날아가는 거리 = 심볼 한 변 x 이 값. */
export const MUTATION_PARTICLE_DISTANCE_RATIO = 0.8
/** 확장 와일드 기둥의 최대 불투명도. */
export const MUTATION_COLUMN_ALPHA = 0.55
/** 확장 와일드 기둥이 릴 폭보다 넓어지는 배수. */
export const MUTATION_COLUMN_WIDTH_SCALE = 1.35

/** ways 게임에서 `ways.betDivisor`를 읽지 못했을 때의 기본 배당 단위. 엔진 기본값과 같다. */
export const DEFAULT_WAYS_BET_DIVISOR = 25
