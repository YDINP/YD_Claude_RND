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
