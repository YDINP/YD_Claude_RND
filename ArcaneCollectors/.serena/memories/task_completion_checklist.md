# ArcaneCollectors - 작업 완료 시 체크리스트

## 필수 확인 사항

### 1. 빌드 확인
```bash
npm run build
```
- 빌드 오류 없이 완료되는지 확인
- `dist/` 폴더 생성 확인

### 2. 개발 서버 확인
```bash
npm run dev
```
- 브라우저에서 게임이 정상 로드되는지 확인
- 콘솔에 JavaScript 오류 없는지 확인

### 3. 코드 품질 (수동)
- import 경로가 올바른지 확인 (`.js` 확장자 포함)
- 새 모듈 추가 시 해당 `index.js` (barrel export)에 등록
- 새 Scene 추가 시 `gameConfig.js`의 `scene` 배열에 등록
- 새 시스템 추가 시 `systems/index.js`에 export 추가
- 새 컴포넌트 추가 시 `components/index.js`에 export 추가
- 새 데이터 파일 추가 시 `data/index.js`에 import/함수 추가

### 4. 데이터 일관성
- JSON 데이터 변경 시 유효한 JSON 형식 확인
- 캐릭터 ID, 스킬 ID 등 참조 정합성 확인
- `gameConfig.js`와 `constants.js` 간 상수 일관성 확인

### 5. 저장 시스템 호환성
- SaveManager의 데이터 구조를 변경한 경우 마이그레이션 로직 확인
- `SAVE_KEY`, `VERSION` 갱신 필요 여부 확인

### 6. 린터/포매터 없음
- 프로젝트에 eslint/prettier가 설정되어 있지 않으므로 수동으로 스타일 일관성 유지
- 2 spaces 들여쓰기
- 기존 코드 스타일과 일치하도록 작성
