/**
 * theme-gen 튜닝 상수. 매직 넘버는 전부 여기에 모은다.
 */

/** ComfyUI 기본 서버 주소. `COMFY_URL` 환경변수로 덮어쓴다. */
export const DEFAULT_COMFY_URL = 'http://127.0.0.1:8188'
/** ComfyUI 기본 체크포인트. `COMFY_CHECKPOINT` 환경변수로 덮어쓴다. */
export const DEFAULT_COMFY_CHECKPOINT = 'sd_xl_base_1.0.safetensors'
/** SDXL 기준 기본 스텝 수. */
export const DEFAULT_COMFY_STEPS = 30
/** SDXL 기준 기본 CFG scale. */
export const DEFAULT_COMFY_CFG = 7.0
export const DEFAULT_COMFY_SAMPLER = 'dpmpp_2m'
export const DEFAULT_COMFY_SCHEDULER = 'karras'
/** ComfyUI 작업 폴링 주기(ms). */
export const DEFAULT_COMFY_POLL_INTERVAL_MS = 1000
/** ComfyUI 작업 대기 상한(ms). */
export const DEFAULT_COMFY_POLL_TIMEOUT_MS = 120_000

/** gpt-image-1 기본 품질. `THEME_GEN_QUALITY` 환경변수로 덮어쓴다. */
export const DEFAULT_OPENAI_QUALITY = 'medium'

export const GEMINI_MODEL = 'gemini-2.5-flash-image'

/** 심볼 전용 128px 썸네일 한 변(px). */
export const SYMBOL_THUMB_SIZE = 128
/** 심볼을 정사각 캔버스에 배치할 때 각 변에 두는 여백 비율. */
export const SYMBOL_MARGIN_RATIO = 0.08
/** 출력 webp 품질(0-100). */
export const WEBP_QUALITY = 90

/** 크로마키 기준 색(순수 초록). */
export const CHROMA_KEY_COLOR = { r: 0, g: 255, b: 0 } as const
/** 크로마키 색상 허용 오차(도). 이 안쪽 색상은 배경으로 간주해 투명 처리한다. */
export const CHROMA_KEY_TOLERANCE_DEG = 30
/** 크로마키 최소 채도. 이보다 채도가 낮은(회색조) 픽셀은 초록이어도 키잉하지 않는다. */
export const CHROMA_KEY_MIN_SATURATION = 0.15
/** 크로마키 경계 페더링 반경(px). */
export const CHROMA_KEY_FEATHER_PX = 1

/**
 * 평평한 배경 제거(`flatMatte.ts`) 튜닝값. 크로마키를 못 쓰는 로컬 SDXL 출력을 위한 갈래다.
 * 배경색을 이미지 테두리에서 추정하므로 "무슨 색인지"를 미리 정하지 않는다.
 */
/** 배경색 추정에 쓸 테두리 띠 두께 (이미지 짧은 변 대비). 1024px에서 약 20px. */
export const FLAT_MATTE_BORDER_BAND_RATIO = 0.02
/** 배경으로 볼 색상 거리(채널 유클리드, 0-441). SDXL 배경의 완만한 그라데이션을 흡수할 만큼 넉넉하게. */
export const FLAT_MATTE_TOLERANCE = 42
/** 알파 경계 페더링 반경(px). */
export const FLAT_MATTE_FEATHER_PX = 1
/**
 * 지운 비율이 이 값보다 작으면 "배경이 평평하지 않았다"고 보고 원본을 그대로 둔다.
 * 사방 여백이 있는 심볼 이미지는 보통 40~70%가 배경이다.
 */
export const FLAT_MATTE_MIN_REMOVED_RATIO = 0.05
/** 지운 비율이 이 값보다 크면 오브젝트까지 먹은 것으로 보고 원본을 그대로 둔다. */
export const FLAT_MATTE_MAX_REMOVED_RATIO = 0.97

/** 프로바이더 호출 실패 시 추가 재시도 횟수 (총 시도 = 이 값 + 1). */
export const RETRY_COUNT = 2
/** 재시도 백오프 기준 지연(ms). 지수적으로 증가한다. */
export const RETRY_BASE_DELAY_MS = 500

/** 원본 프로바이더 출력을 보관하는 폴더 이름 (`<gameDir>/art/<이 값>/<id>.png`). */
export const RAW_DIR_NAME = 'raw'

/** codex CLI 한 번 실행 상한(ms). 이미지 생성 1건에 1~3분 걸릴 수 있다. */
export const DEFAULT_CODEX_TIMEOUT_MS = 300_000
/**
 * `kind: "sheet"` asset(3x3 콘택트시트, 프롬프트가 길다) 전용 codex 기본 타임아웃(ms).
 * codex가 out.png를 다 쓰고도 이미지 검증용 PowerShell을 몇 분 더 돌리는 걸 실측해서
 * 기본 타임아웃보다 여유를 더 준다. asset.timeoutMs로 개별 오버라이드도 가능하다.
 */
export const DEFAULT_CODEX_SHEET_TIMEOUT_MS = 540_000
/** `codex login status`로 가용성을 확인할 때 쓰는 상한(ms). */
export const DEFAULT_CODEX_AVAILABILITY_TIMEOUT_MS = 10_000
/** out.png 조기 종료 감시 폴링 주기(ms). `earlyExitStableChecks`와 곱하면 대략 안정 판정 소요 시간이 된다. */
export const CODEX_EARLY_EXIT_POLL_INTERVAL_MS = 2500
/** out.png 크기가 이 횟수만큼 연속으로 안 변하면(기본 2회 = 약 5초) 조기 종료한다. */
export const CODEX_EARLY_EXIT_STABLE_CHECKS = 2
/** codex 작업용 임시 폴더 접두사. `os.tmpdir()` 아래 `<이 값><asset id>-<랜덤6글자>`로 만들어진다. */
export const CODEX_TEMP_DIR_PREFIX = 'tgslot-codex-'
/**
 * 성공한 자산의 임시 폴더 정리(`rmSync`)가 Windows에서 EPERM/EBUSY 등으로 실패할 때 재시도할
 * 최대 횟수(첫 시도 포함). 프로세스 트리를 막 죽인 직후에는 파일 핸들이 잠깐 남아 있을 수 있어,
 * 짧게 몇 번 더 시도해 보고 그래도 안 되면 경고만 남기고 넘어간다(자산 성공 여부에는 영향 없음).
 */
export const CODEX_TEMP_CLEANUP_RETRIES = 3
/** 임시 폴더 정리 재시도 사이 지연(ms). */
export const CODEX_TEMP_CLEANUP_RETRY_DELAY_MS = 150
/** codex가 결과를 저장하도록 지시하는 파일 이름 (임시 폴더 안). */
export const CODEX_OUTPUT_FILENAME = 'out.png'
/** codex 실행 로그를 담는 파일 이름 (`-o` 옵션, 임시 폴더 안). */
export const CODEX_LOG_FILENAME = 'last.txt'
/** 실패 메시지에 붙이는 stdout/stderr 꼬리 최대 길이(문자 수). */
export const CODEX_OUTPUT_TAIL_LENGTH = 2000

/**
 * out.png 회수(readSalvageableOutput)에도 실패했을 때 codex 계정 홈의 `generated_images` 폴더에서
 * 마지막으로 회수를 시도한다. 그 회수 대상을 "이 실행이 시작된 시각 이후에 생성된 파일"로
 * 한정하기 위한 기준 시각 계산에서, 실행 시작 시각(spawn 직전 `Date.now()`)에서 이 값만큼 뺀다 —
 * 파일시스템 mtime과 프로세스 시각 사이의 미세한 오차를 흡수하기 위한 여유분이다.
 */
export const CODEX_GENERATED_IMAGES_START_SKEW_MS = 5000
/**
 * codex `generated_images` 루트 아래에서 png를 찾을 때 재귀적으로 내려갈 최대 깊이.
 * 실측 구조가 `<루트>/<uuid>/exec-<uuid>.png`(깊이 2)라 여유를 두고 3으로 잡는다.
 */
export const CODEX_GENERATED_IMAGES_MAX_DEPTH = 3

/**
 * 프레임 아트 안에서 릴 창(placeholder 초록/흰색 사각형)을 찾을 때 쓰는 기본 탐지 영역.
 * 바깥 여백(투명 배경)과 상단 마퀴/하단 몰딩을 피해 중앙 영역만 본다.
 *
 * 상수가 캔버스 포맷마다 갈리는 이유: **마퀴·받침에 주는 몫이 아트 규격마다 다르다.**
 * 정사각 규격(ART_DIRECTION v3/v4)은 마퀴 17%·받침 17%를 캔버스 세로에서 떼어 주고 창을
 * y 19-81%에 두지만, 세로 규격(v5, 1024x1536)은 같은 장식을 9.5%·9%로 줄이고 그만큼 창을
 * 세로로 연다(y 9.5-91%). 두 규격이 장식에 주는 비율 자체가 다르므로 종횡비 하나로 두 값을
 * 잇는 연속 공식은 존재하지 않는다 — 있는 척하면 두 점을 지나는 임의의 곡선이 된다.
 * 그래서 포맷별로 "그 규격이 선언한 창을 담는 영역"을 따로 적고, 고르는 일만 종횡비가 한다
 * (`frameWindowRegion`).
 *
 * `yMax`가 0.8이 아니라 0.95인 이유: 0.8은 v3/v4 규격이 창 아래를 y 0.81에 두는 것만 보고 잡은
 * 값인데, 생성기는 선언보다 아래까지 그린다. classic-777의 창은 실제로 y 0.855까지 내려와서
 * 0.8에 잘렸고, 그 결과 3x3 격자가 의도보다 7.6% 작게 그려지고 있었다. 0.85면 5팩 모두
 * 탐지값이 포화하지만(그 아래로 초록이 더 없다) 앞으로 나올 정사각 아트의 여유를 두고 0.95로 연다.
 * 받침 몰딩이 이 범위에 들어와도 초록/흰색이 아니고, 설령 있어도 "가장 큰 연결 성분" 하나만
 * 고르므로 창을 이길 수 없다.
 */
export const FRAME_WINDOW_REGION_SQUARE = { xMin: 0.05, xMax: 0.95, yMin: 0.1, yMax: 0.95 } as const
/**
 * 세로 캔버스(v5) 전용 탐지 영역. 창이 x 2-98% / y 9.5-91%까지 열려 있어 정사각용
 * 0.05-0.95 / 0.1-0.8을 그대로 쓰면 좌우와 아래가 잘린다(아래만 11%, 셀 −11%).
 * 생성기가 선언보다 크게 그리는 경우(classic-777 실측: 선언 81% → 실제 85.5%)를 흡수하도록
 * 선언 창보다 각 변에서 3-4%p 더 연다. 마퀴/받침의 안쪽 절반은 이 영역에 들어오지만,
 * 탐지는 "가장 큰 연결 성분" 하나만 고르므로 캔버스의 78%를 덮는 창을 이길 장식은 없다.
 */
export const FRAME_WINDOW_REGION_PORTRAIT = { xMin: 0.01, xMax: 0.99, yMin: 0.05, yMax: 0.96 } as const
/** 연결 성분 탐지용 다운샘플 배율. 4면 가로세로 4픽셀당 1개만 본다. */
export const FRAME_WINDOW_DOWNSCALE = 4
/** 이 알파값 이하 픽셀은 이미 투명하다고 보고 색상 판정에서 뺀다. */
export const FRAME_WINDOW_ALPHA_THRESHOLD = 10
/** 초록 판정 하한: g가 이 값보다 커야 한다. */
export const FRAME_WINDOW_GREEN_MIN_GREEN = 140
/** 초록 판정 마진: g가 r/b보다 이만큼 더 커야 한다. */
export const FRAME_WINDOW_GREEN_MARGIN = 50
/** 흰색 판정: r,g,b 모두 이 값보다 커야 한다. */
export const FRAME_WINDOW_WHITE_MIN_CHANNEL = 235
/** 탐지한 바운딩 박스를 이미지 폭의 이 비율만큼 사방으로 늘린다 (안티에일리어싱 초록 테두리 포함). */
export const FRAME_WINDOW_EXPAND_RATIO = 0.01
/** 창을 뚫을 때 둥근 모서리 반경 = 이미지 폭 x 이 비율. */
export const FRAME_WINDOW_CORNER_RADIUS_RATIO = 0.02
/** 창 경계 페더링 반경(px). */
export const FRAME_WINDOW_FEATHER_PX = 2

/**
 * 허브 공통 기본 팔레트와 기본 버전. `theme.json` 계약의 일부라 `@tgslot/game-sdk`가 갖고 있고
 * 여기서는 재수출만 한다 — 팔레트 기본값이 두 군데로 갈라지면 렌더러와 생성기가 어긋난다.
 */
export { THEME_DEFAULT_PALETTE, THEME_DEFAULT_VERSION } from '@tgslot/game-sdk'

/** sprite sheet 셀 콘텐츠 바운딩 박스를 구할 때, 이 알파값 이하 픽셀은 "빈 배경"으로 본다. */
export const SHEET_CONTENT_ALPHA_THRESHOLD = 10
