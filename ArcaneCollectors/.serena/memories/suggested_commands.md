# ArcaneCollectors - 개발 명령어

## 개발 서버 실행
```bash
npm run dev
# → Vite 개발 서버 (http://localhost:3000), 자동으로 브라우저 열림
```

## 프로덕션 빌드
```bash
npm run build
# → dist/ 폴더에 빌드 출력
```

## 빌드 미리보기
```bash
npm run preview
# → dist/ 폴더를 로컬 서버로 미리보기
```

## 의존성 설치
```bash
npm install
```

## Windows 시스템 유틸리티
```bash
# 디렉토리 목록 (PowerShell/Git Bash)
dir                    # PowerShell
ls                     # Git Bash

# 파일 찾기
dir /s /b *.js         # PowerShell 재귀 검색
find . -name "*.js"    # Git Bash

# Git 명령어
git status
git log --oneline -10
git diff
git add .
git commit -m "메시지"
```

## 참고사항
- **린터/포매터 미설정**: eslint, prettier 등 코드 품질 도구 없음
- **테스트 미설정**: 테스트 프레임워크 없음 (수동 브라우저 테스트)
- **빌드 검증**: `npm run build`로 빌드 오류 확인
- **Supabase**: 환경 변수 설정 필요 (`.env` 파일), 미설정시 LocalStorage 폴백
