/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API 서버 base URL. 기본값은 로컬 개발 api(8787) */
  readonly VITE_API_URL?: string
  /** 텔레그램 밖(브라우저)에서 개발할 때 mock initData 인증을 허용할지 여부. 'true'일 때만 활성화 */
  readonly VITE_DEV_MOCK_TMA?: string
  /** 설정 시트에 표시할 앱 버전. vite.config.ts가 package.json 버전으로 채워준다 (없으면 'dev') */
  readonly VITE_APP_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
