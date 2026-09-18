# Factorio LLM 에이전트 리서치

조사: 2026-09-18. 전부 웹 검색/페치 기반이며 코드를 직접 확인한 것은 아니다.
신뢰도 표시를 그대로 옮긴다.

## 1. Factorio Learning Environment (arXiv:2503.09617) — 신뢰도 높음

### 지표
- **Production Score**: `PS(t) = Σ V(i)·(P_i − C_i)`. 아이템 가치는 복잡도
  배수 `α(n) = β^(n−2)` (β≈1.025, n=재료 개수)로 재료가 많을수록 지수적으로
  커진다. 상한 없음.
- **Milestones**: 신규 아이템 최초 생산 + 신규 기술 연구 완료. 탐색 폭과
  도달 복잡도를 동시에 잰다.

### 프론티어 모델 실측 (논문 본문. 리더보드 페이지는 비어 있었음)

| 모델 | Lab-play | Open-play PS | 마일스톤 |
|---|---|---|---|
| Claude 3.5 Sonnet | 21.9% (24개 중 7개) | 293,206 | 30 |
| GPT-4o | 16.6% | — | — |
| Deepseek-v3 | 15.1% | — | — |
| Gemini-2 | 13.0% | 나무상자 300개 수공예 퇴행 | — |
| Llama-3.3-70B | 6.3% | 54,998 | 26 |
| o3 (추론모델) | 7/24 — 추론력이 벽을 못 뚫음 | — | — |
| **인간 초보자** | **20/24** | — | — |

### 논문이 명시한 실패 유형 여섯

1. **공간 추론 결핍** — 엔티티를 너무 붙여 놓아 연결 공간이 안 남고,
   인서터 방향을 잘못 놓는다.
2. **에러 복구 한계** — 성공한 에피소드에서도 **56%의 스텝이 실행 에러**.
   개별 엔티티 실패만 보고 전체 토폴로지는 안 본다.
3. **퇴행적 디버그 루프** — GPT-4o 가 **동일 API 를 78스텝 연속** 잘못
   호출하고 매번 같은 에러를 받고도 전략을 안 바꿨다.
4. **기술 투자 부재** — Claude 만 꾸준히 연구했고 나머지는 소규모 생산에 그침.
5. **반복 개선 불가** — 초기 진전은 하지만 확장을 못 한다.
6. **근시안적 계획** — 즉흥 목표에 매몰(나무상자 300개를 100스텝에 걸쳐 수공예).

### API 모양
매 스텝 Python 프로그램을 합성해 REPL 에 제출하고 stdout/stderr 를 받는다.
조회 / 상태변경 / 자원 세 갈래로 23개. 관측은 stdout 뿐이라 에이전트가
일부러 print 해야 «본다». 이전에 얻은 엔티티 참조는 stale 해진다.

## 2. 관련 연구

- **Voyager** (arXiv:2305.16291, Minecraft) — 자동 커리큘럼 + 성장하는 스킬
  라이브러리 + 반복 프롬프팅. 스킬 라이브러리는 이식 가능. 커리큘럼은
  Factorio 에 기술트리가 이미 있어 우선순위 낮음.
- **General Modular Harness** (arXiv:2507.11633) — 지각·메모리·추론 3모듈.
  「매 턴 반성을 강제하는 메모리」가 반복 실수를 줄였다. 아래 3번의 «추론
  일지»와 독립적으로 같은 결론에 도달 — 교차검증됨.
- **Learning Abstractions for Hierarchical Planning** (arXiv:2602.00929) —
  🟡 초록 수준만 확인. Factorio 포함 여부 미확인.
- **DPBench** (arXiv:2602.13255) — 🔴 원문 수치 추출 실패. 단독 인용 금지.
- **AI Agents for System Engineering in Factorio** (arXiv:2502.01492) —
  포지션 페이퍼. 구체 설계 재료 없음.

## 3. 우리 문제 셋에 대한 선행 사례 — 가장 값진 자료

`github.com/clawdbotatg/factorio-agents` (커뮤니티 프로젝트, 동료검토 없음,
실전 로그 기반). 구조가 우리와 거의 같다 — RCON 헤드리스 서버, 여러
에이전트가 한 월드를 공유, 각자 로그를 남긴다.

### (A) 너비만 늘리고 사슬을 못 올린다 — **topology blindness**

> "models check individual entities, never the whole chain
> (source → belt → inserter → machine → out)"

해결: 개별 상태 조회를 믿지 말고 **여덟 스텝마다 전체 체인 감사**를 일정에
강제로 박는다. 체인 단위로 «입구부터 출구까지 실제로 흐르는가»만 본다.

### (B) 조건이 틀려 조용히 안 돈다 — **silent killer**

> "RCON 반환값은 액션이 '시작'했다는 뜻일 뿐 완료를 보장하지 않는다."
> "Warnings lie: drills report 'output blocked' while the furnace IS
> accepting — trust climbing inventory counts, not status strings."
> "Ground the brain or it hallucinates state."

해결: 상태 문자열 대신 **누적 카운터의 실제 증가**를 믿는다. 매 보고에
「게임 진실 체크리스트」를 강제 포함시키자 점수 하한이 5.5 → 20.7 로 올랐다.

**Claude Opus 4.1 오류 분류: 실패의 97.7%가 「게임 상태에 대한 잘못된 신념」,
구문 오류는 0%.** 「코드가 틀렸다」보다 「믿음이 틀렸다」를 먼저 의심하라.

### (C) 여러 에이전트의 자원·자리 경합 — **업계 미해결**

> "Multi-agent teams: zoning works via persona + home; role specialization
> (miner/logistics/power) **untested**."

FLE 공식도 v0.3.0 에 에이전트간 메시지 필드를 둔 것만 확인되고 충돌 회피
알고리즘은 미공개. **우리가 직접 설계해야 하는 영역이고, 여기서 만든 해법
자체가 기여점이 될 수 있다.**

### 그 밖의 구체 규칙

- **디버그 루프 차단** — 같은 실패가 N회 반복되면 강제로 전략 전환.
- **짧은 프로그램** — "10줄에서 실패하면 다시 뽑으면 되지만 90줄에서
  실패하면 계산이 통째로 버려진다." 평균 133줄짜리가 에러율 최고.
- **고정 3메시지 컨텍스트** — 시스템 프롬프트 + 누적 추론 일지 + 매 턴
  신선한 HUD(집계 스냅샷, per-tile 덤프 금지).
- **체크포인트/롤백** — 위험한 작업 전 저장, 실패하면 «고치기»가 아니라
  «복원».
- 공간 문제: "Every successful mitigation moved geometry OUT of the model" —
  A* 라우터, 배치 신서사이저, 포트-기하 표, 충돌 사전검사를 전부 코드로 뺐다.
  모델 F1 0.24 대 사람 0.76.
