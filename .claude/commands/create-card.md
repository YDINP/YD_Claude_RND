SnapWise MDX 카드 생성 파이프라인을 실행합니다.

**요청**: $ARGUMENTS

---

## 카드 생성 파이프라인

card-scenario → mdx-validator → [실패 시 재작성] → 최종 저장

---

## 실행 순서

### Step 1: 주제 분석 및 정보 추출

`$ARGUMENTS`에서 다음 정보를 파싱:
- **주제명**: 만들 카드의 개념/이론 이름
- **카테고리** (선택): `science | psychology | people | history | life | business | culture | origins | etc`
- **storyType** (선택, 기본: `fiction`)
- **difficulty** (선택, 기본: `1`)

카테고리가 명시되지 않은 경우 주제를 보고 가장 적합한 카테고리 판단.

### Step 2: 중복 확인

```
Glob으로 shortform-blog/content/{category}/*.mdx 검색
주제와 유사한 기존 파일이 있으면 사용자에게 알리고 진행 여부 확인
```

### Step 3: 카드 시나리오 작성

Task(subagent_type="card-scenario", model="sonnet") 호출:

```
아래 주제로 MDX 카드를 작성해줘:

주제: {주제명}
카테고리: {카테고리}
storyType: {storyType}
difficulty: {difficulty}

참조: shortform-blog/docs/FICTION-STORY-GUIDE.md

저장 경로: shortform-blog/content/{카테고리}/{slug}.mdx
(slug는 주제명을 영문 kebab-case로 변환)

다음 규칙을 반드시 준수:
1. 유효 StepType만 사용 (cinematic-hook, manga-scene, reveal-title, outro 등)
2. dialogue 스텝 사용 시 frontmatter characters 필수 정의
3. Title-Last: reveal-title 전까지 개념명 노출 금지
4. category는 9개 허용 목록에서만 선택
5. 스텝 수 10-16개 유지
6. 한국어로 작성
```

### Step 4: MDX 검증

Step 3 완료 후 Task(subagent_type="mdx-validator", model="haiku") 호출:

```
아래 파일을 7가지 규칙으로 검증해줘:
파일: {생성된 MDX 파일 경로}

R-01: StepType 유효성
R-02: characterId 참조 정합성
R-03: Title-Last 원칙
R-04: category 허용 목록
R-05: 스텝 수 경계값
R-06: frontmatter 필수 필드
R-07: manga-scene 패널 타입
```

### Step 5: 결과 처리

**ERROR 발생 시** (최대 2회 재시도):
```
card-scenario에 재작성 요청:
"validator에서 다음 오류가 발견됐습니다: {오류 목록}
해당 오류를 수정하여 MDX를 다시 작성해줘."
→ Step 4로 돌아가 재검증
```

**WARNING만 발생 시**:
```
파일 저장 완료 + WARNING 내용 사용자에게 안내
(수동 수정 여부는 사용자 판단)
```

**PASS 시**:
```
파일 저장 완료 + 성공 리포트
```

2회 재시도 후에도 ERROR 지속 시:
→ 현재 상태로 저장 + 수동 수정 요청

---

## 완료 보고 형식

```
✅ 카드 생성 완료

파일: shortform-blog/content/{카테고리}/{slug}.mdx
스텝 수: {N}개
validator: ✅ PASS / ⚠️ WARNING ({건수}건) / ❌ ERROR → 재시도 {N}회

WARNING 내용 (있을 경우):
- R-03: narration 스텝 2에서 "{키워드}" 발견 (Title-Last 권장)
```

---

## 사용 예시

```
/create-card 파블로프 조건반사 psychology
/create-card 매몰비용 business difficulty:2
/create-card 슈뢰딩거의 고양이 science storyType:fiction
/create-card 던바의 수 psychology
```
