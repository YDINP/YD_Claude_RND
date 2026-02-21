SnapWise MDX 카드 대량 생성 파이프라인을 실행합니다.

**요청**: $ARGUMENTS

---

## 배치 카드 생성 파이프라인

card-batch-runner → 병렬 card-scenario (최대 5개) → 병렬 mdx-validator → 결과 집계

---

## 실행 순서

### Step 1: 입력 파싱

`$ARGUMENTS`에서 다음 정보를 파싱:

**입력 형식 A - 주제 목록 직접 제공:**
```
주제1, 주제2, 주제3 [category:카테고리]
```

**입력 형식 B - 개수 + 카테고리:**
```
{N}개 {카테고리}
```

**입력 형식 C - 카테고리 균형 자동 결정:**
```
균형 {N}개
```
→ 현재 카테고리별 카드 수를 분석하여 부족한 카테고리 자동 선정

### Step 2: card-batch-runner 위임

Task(subagent_type="card-batch-runner", model="sonnet") 호출:

```
아래 조건으로 대량 카드 생성을 오케스트레이션해줘:

{파싱된 주제 목록 또는 생성 조건}

실행 규칙:
1. 기존 카드와 중복 여부 사전 확인
2. card-scenario 에이전트 최대 5개 병렬 실행
3. 각 완성 카드를 mdx-validator로 검증
4. ERROR 발생 시 최대 2회 재시도
5. 결과 집계 후 배치 리포트 출력

참조:
- shortform-blog/docs/FICTION-STORY-GUIDE.md
- 허용 카테고리: science, psychology, people, history, life, business, culture, origins, etc
```

### Step 3: 결과 확인

card-batch-runner가 완료 리포트를 반환하면:
- 성공/실패 수 확인
- WARNING 항목 사용자에게 안내
- 생성된 파일 경로 목록 출력

---

## 완료 보고 형식

```
=== 배치 카드 생성 완료 ===

요청: {N}개 ({카테고리})
성공: {M}개
실패: {K}개

✅ 생성된 카드:
- content/{cat}/{slug1}.mdx  (validator: PASS)
- content/{cat}/{slug2}.mdx  (validator: PASS)
- content/{cat}/{slug3}.mdx  (validator: ⚠️ WARNING - Title-Last)

❌ 실패 카드:
- {주제명}: ERROR (R-01 미등록 StepType) — 재시도 2회 초과

카테고리 현황 변경:
{카테고리}: {이전}개 → {이후}개 (+{증가수})
```

---

## 사용 예시

```
# 주제 목록 직접 제공
/card-batch 인지부조화, 던바의 수, 확증편향 category:psychology

# 개수 + 카테고리
/card-batch 5개 science

# 카테고리 균형 자동 결정
/card-batch 균형 3개

# 혼합
/card-batch 매몰비용,손실회피 business difficulty:2
```
