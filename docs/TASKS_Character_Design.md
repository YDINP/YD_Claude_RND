# TASKS: Arcane Collectors 캐릭터 디자인

> **관련 PRD**: PRD_Character_Design.md
> **최종 수정**: 2026-01-28

---

## 진행 상태 요약

| 단계 | 상태 | 진행률 |
|------|------|--------|
| Phase 1: PRD/문서 작성 | ✅ 완료 | 100% |
| Phase 2: SSR 캐릭터 | 🔄 진행중 | 0% |
| Phase 3: SR 캐릭터 | ⏳ 대기 | 0% |
| Phase 4: R 캐릭터 | ⏳ 대기 | 0% |
| Phase 5: 후처리 | ⏳ 대기 | 0% |

---

## Phase 1: 문서 및 기획 [완료]

### Task 1.1: 기존 문서 분석 ✅
- [x] docs/character-design/README.md 분석
- [x] ArcaneCollectors/docs/character_prompts.md 분석
- [x] ArcaneCollectors/src/data/characters.json 분석
- [x] 두 캐릭터 세트 비교 (원본 vs 신화)

### Task 1.2: PRD 작성 ✅
- [x] PRD_Character_Design.md 작성
- [x] 아트 스타일 가이드라인 정의
- [x] 등급/속성/클래스 시스템 정의
- [x] 컬러 팔레트 표준화

### Task 1.3: 프롬프트 템플릿 작성 ✅
- [x] Stable Diffusion 공통 프롬프트
- [x] Midjourney 공통 프롬프트
- [x] DALL-E 3 공통 프롬프트
- [x] 네거티브 프롬프트 표준화

---

## Phase 2: SSR 캐릭터 (5성) - 3명

### Task 2.1: 아르카나 (Arcana) - 불/마법사
- [ ] 기본 정보 및 외형 설명 확정
- [ ] 시그니처 포즈 결정
- [ ] Stable Diffusion 프롬프트 작성
- [ ] Midjourney 프롬프트 작성
- [ ] DALL-E 3 프롬프트 작성
- [ ] 이미지 생성 (Civitai/로컬)
- [ ] 배경 제거 및 후처리
- [ ] 게임 에셋으로 저장

**우선순위**: 🔴 높음
**예상 산출물**: arcana_idle.png, arcana_happy.png, arcana_skill.png

### Task 2.2: 레온하르트 (Leonhardt) - 빛/전사
- [ ] 기본 정보 및 외형 설명 확정
- [ ] 시그니처 포즈 결정
- [ ] Stable Diffusion 프롬프트 작성
- [ ] Midjourney 프롬프트 작성
- [ ] DALL-E 3 프롬프트 작성
- [ ] 이미지 생성
- [ ] 배경 제거 및 후처리
- [ ] 게임 에셋으로 저장

**우선순위**: 🔴 높음
**예상 산출물**: leonhardt_idle.png, leonhardt_happy.png, leonhardt_skill.png

### Task 2.3: 셀레네 (Selene) - 암흑/궁수
- [ ] 기본 정보 및 외형 설명 확정
- [ ] 시그니처 포즈 결정
- [ ] Stable Diffusion 프롬프트 작성
- [ ] Midjourney 프롬프트 작성
- [ ] DALL-E 3 프롬프트 작성
- [ ] 이미지 생성
- [ ] 배경 제거 및 후처리
- [ ] 게임 에셋으로 저장

**우선순위**: 🔴 높음
**예상 산출물**: selene_idle.png, selene_happy.png, selene_skill.png

---

## Phase 3: SR 캐릭터 (4성) - 5명

### Task 3.1: 로제 (Rose) - 물/힐러
- [ ] 프롬프트 작성
- [ ] 이미지 생성
- [ ] 후처리

**우선순위**: 🟡 중간

### Task 3.2: 카이 (Kai) - 바람/전사
- [ ] 프롬프트 작성
- [ ] 이미지 생성
- [ ] 후처리

**우선순위**: 🟡 중간

### Task 3.3: 루나 (Luna) - 불/궁수
- [ ] 프롬프트 작성
- [ ] 이미지 생성
- [ ] 후처리

**우선순위**: 🟡 중간

### Task 3.4: 누아르 (Noir) - 암흑/마법사
- [ ] 프롬프트 작성
- [ ] 이미지 생성
- [ ] 후처리

**우선순위**: 🟡 중간

### Task 3.5: 아리아 (Aria) - 빛/힐러
- [ ] 프롬프트 작성
- [ ] 이미지 생성
- [ ] 후처리

**우선순위**: 🟡 중간

---

## Phase 4: R 캐릭터 (3성) - 7명

### Task 4.1: 핀 (Finn) - 물/전사
- [ ] 프롬프트 작성
- [ ] 이미지 생성
- [ ] 후처리

### Task 4.2: 미라 (Mira) - 바람/궁수
- [ ] 프롬프트 작성
- [ ] 이미지 생성
- [ ] 후처리

### Task 4.3: 테오 (Theo) - 불/마법사
- [ ] 프롬프트 작성
- [ ] 이미지 생성
- [ ] 후처리

### Task 4.4: 에바 (Eva) - 빛/힐러
- [ ] 프롬프트 작성
- [ ] 이미지 생성
- [ ] 후처리

### Task 4.5: 렉스 (Rex) - 암흑/전사
- [ ] 프롬프트 작성
- [ ] 이미지 생성
- [ ] 후처리

### Task 4.6: 아이비 (Ivy) - 물/마법사
- [ ] 프롬프트 작성
- [ ] 이미지 생성
- [ ] 후처리

### Task 4.7: 맥스 (Max) - 바람/전사
- [ ] 프롬프트 작성
- [ ] 이미지 생성
- [ ] 후처리

**우선순위**: 🟢 낮음 (SSR/SR 완료 후)

---

## Phase 5: 후처리 및 통합

### Task 5.1: 이미지 후처리
- [ ] 배경 제거 (remove.bg / rembg)
- [ ] 크기 조정 (512x512 / 256x256)
- [ ] 파일명 표준화
- [ ] 압축 최적화

### Task 5.2: 게임 통합
- [ ] ArcaneCollectors/src/assets/characters/ 폴더 정리
- [ ] characters.json에 이미지 경로 추가
- [ ] 게임 내 표시 테스트

### Task 5.3: 문서 업데이트
- [ ] 최종 프롬프트 문서화
- [ ] 이미지 생성 히스토리 기록
- [ ] 베스트 프랙티스 정리

---

## 작업 체크리스트

### SSR (5성) - 총 3명
| 캐릭터 | 속성 | 클래스 | 상태 |
|--------|------|--------|------|
| 아르카나 | 불 | 마법사 | ⏳ |
| 레온하르트 | 빛 | 전사 | ⏳ |
| 셀레네 | 암흑 | 궁수 | ⏳ |

### SR (4성) - 총 5명
| 캐릭터 | 속성 | 클래스 | 상태 |
|--------|------|--------|------|
| 로제 | 물 | 힐러 | ⏳ |
| 카이 | 바람 | 전사 | ⏳ |
| 루나 | 불 | 궁수 | ⏳ |
| 누아르 | 암흑 | 마법사 | ⏳ |
| 아리아 | 빛 | 힐러 | ⏳ |

### R (3성) - 총 7명
| 캐릭터 | 속성 | 클래스 | 상태 |
|--------|------|--------|------|
| 핀 | 물 | 전사 | ⏳ |
| 미라 | 바람 | 궁수 | ⏳ |
| 테오 | 불 | 마법사 | ⏳ |
| 에바 | 빛 | 힐러 | ⏳ |
| 렉스 | 암흑 | 전사 | ⏳ |
| 아이비 | 물 | 마법사 | ⏳ |
| 맥스 | 바람 | 전사 | ⏳ |

---

## 파일 구조

```
ArcaneCollectors/
├── src/
│   ├── assets/
│   │   └── characters/
│   │       ├── ssr/
│   │       │   ├── arcana/
│   │       │   │   ├── idle.png
│   │       │   │   ├── happy.png
│   │       │   │   └── skill.png
│   │       │   ├── leonhardt/
│   │       │   └── selene/
│   │       ├── sr/
│   │       │   ├── rose/
│   │       │   ├── kai/
│   │       │   ├── luna/
│   │       │   ├── noir/
│   │       │   └── aria/
│   │       └── r/
│   │           ├── finn/
│   │           ├── mira/
│   │           ├── theo/
│   │           ├── eva/
│   │           ├── rex/
│   │           ├── ivy/
│   │           └── max/
│   └── data/
│       └── characters.json
└── docs/
    ├── PRD_Character_Design.md
    ├── TASKS_Character_Design.md
    └── character_prompts_v2.md
```

---

## 이미지 생성 워크플로우

### Step 1: 프롬프트 준비
1. PRD에서 캐릭터 설명 확인
2. 공통 프롬프트 템플릿 복사
3. 캐릭터 고유 요소 추가
4. 네거티브 프롬프트 확인

### Step 2: 이미지 생성
1. Civitai Generate 또는 로컬 ComfyUI 사용
2. Pony Diffusion V6 XL 모델 선택
3. 설정: 1024x1024, DPM++ 2M Karras, 30 steps, CFG 7
4. 3-5회 생성 후 최적 이미지 선택

### Step 3: 후처리
1. 배경 제거 (rembg / remove.bg)
2. 크기 조정 (512x512)
3. PNG 최적화
4. 파일명 표준화 (캐릭터명_표정.png)

### Step 4: 통합
1. 에셋 폴더에 저장
2. characters.json 업데이트
3. 게임 내 테스트

---

## 진행 기록

### 2026-01-28
- [x] 기존 캐릭터 문서 분석 완료
- [x] PRD_Character_Design.md 작성 완료
- [x] TASKS_Character_Design.md 작성 완료
- [x] 상세 프롬프트 문서 작성 완료

---

**문서 버전**: 1.0
**최종 수정**: 2026-01-28
