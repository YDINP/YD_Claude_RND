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

/** 프로바이더 호출 실패 시 추가 재시도 횟수 (총 시도 = 이 값 + 1). */
export const RETRY_COUNT = 2
/** 재시도 백오프 기준 지연(ms). 지수적으로 증가한다. */
export const RETRY_BASE_DELAY_MS = 500

/** 원본 프로바이더 출력을 보관하는 폴더 이름 (`<gameDir>/art/<이 값>/<id>.png`). */
export const RAW_DIR_NAME = 'raw'

/** codex CLI 한 번 실행 상한(ms). 이미지 생성 1건에 1~3분 걸릴 수 있다. */
export const DEFAULT_CODEX_TIMEOUT_MS = 300_000
/** `codex login status`로 가용성을 확인할 때 쓰는 상한(ms). */
export const DEFAULT_CODEX_AVAILABILITY_TIMEOUT_MS = 10_000
/** codex 작업용 임시 폴더 접두사. `os.tmpdir()` 아래 `<이 값><asset id>-<랜덤6글자>`로 만들어진다. */
export const CODEX_TEMP_DIR_PREFIX = 'tgslot-codex-'
/** codex가 결과를 저장하도록 지시하는 파일 이름 (임시 폴더 안). */
export const CODEX_OUTPUT_FILENAME = 'out.png'
/** codex 실행 로그를 담는 파일 이름 (`-o` 옵션, 임시 폴더 안). */
export const CODEX_LOG_FILENAME = 'last.txt'
/** 실패 메시지에 붙이는 stdout/stderr 꼬리 최대 길이(문자 수). */
export const CODEX_OUTPUT_TAIL_LENGTH = 2000

/**
 * 프레임 아트 안에서 릴 창(placeholder 초록/흰색 사각형)을 찾을 때 쓰는 기본값.
 * 바깥 여백(투명 배경)과 상단 마퀴/하단 몰딩을 피해 중앙 영역만 본다.
 */
export const FRAME_WINDOW_REGION = { xMin: 0.05, xMax: 0.95, yMin: 0.1, yMax: 0.8 } as const
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
