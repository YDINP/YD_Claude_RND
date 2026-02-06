# W2: 게임 데이터 Worker 가이드

## 개요
- **브랜치**: `arcane/w2-data`
- **폴더**: `D:\park\YD_Claude_RND-w2`
- **담당**: 게임 데이터 개편 (성격 시스템, 시너지, 장비 등)

---

## 파일 소유권

```
src/data/characters.json (mood 필드 포함)
src/data/synergies.json
src/data/equipment.json
src/data/items.json
src/data/stages.json
src/data/index.js
```

---

## 태스크 목록

### Task 2.1: 분위기(Mood) 시스템 데이터
- [✅] MoodSystem.js 구현 완료
- [✅] 9종 분위기 정의 (brave/fierce/wild/calm/stoic/devoted/cunning/noble/mystic)
- [✅] 9×9 분위기 상성 매트릭스 (배열 기반)
- [✅] 분위기-교단 보너스 정의

### Task 2.2: 캐릭터 데이터 개편
- [✅] characters.json에서 element 삭제, mood 필드로 변경 완료
- [✅] cult 필드 명시적 추가
- [ ] 신규 캐릭터 추가 (포세이돈, 하데스, 츠쿠요미, 카파 등)
- [ ] 캐릭터별 대사 추가

### Task 2.3: 시너지 데이터 개편
- [✅] synergies.json 전면 개편 완료
- [✅] 속성 시너지 제거
- [✅] 분위기 시너지 추가 (9종 기반)
- [✅] 특수 시너지 확장 (10개+)
- [✅] 교단 시너지 4인용 조정

### Task 2.4: 장비/아이템 데이터 확장
- [ ] equipment.json 확장 (81개 장비)
- [ ] items.json 확장 (소비 아이템)
- [ ] 등급별 균형 배분
- [ ] 신화 테마 유지

### Task 2.5: 스테이지 데이터 확장
- [ ] stages.json 확장 (5챕터 25스테이지)
- [ ] 초반 난이도 완화
- [ ] 에너지 소모량 설정
- [ ] 소탕 가능 여부 필드 추가

---

## 분위기(Mood) 시스템 참조

### 9종 분위기
| 분위기 | 이름 | 테마 색상 | 특징 |
|------|------|----------|------|
| brave | 열혈 | #E74C3C | 정면 돌파, 높은 공격력 |
| fierce | 격렬 | #FF5722 | 폭발적 데미지 |
| wild | 광폭 | #27AE60 | 본능적, 속도/연속 공격 |
| calm | 고요 | #3498DB | 분석적, 방어/회복 특화 |
| stoic | 의연 | #607D8B | 지속력/내구 |
| devoted | 헌신 | #E91E63 | 지원/버프 |
| cunning | 냉철 | #9B59B6 | 전략적, 크리티컬 특화 |
| noble | 고결 | #FFD700 | 균형잡힌 능력치 |
| mystic | 신비 | #F39C12 | 초월적, 특수 효과 특화 |

### 분위기 상성 (9×9 매트릭스)
배열 기반 상성 데이터는 MoodSystem.js에 정의됨
각 분위기마다 다른 8개 분위기에 대한 보정값 적용

### 분위기-교단 보너스
| 교단 | 최적 분위기 | 보너스 |
|-----|---------|-------|
| 발할라 | brave, fierce, wild | ATK +15% |
| 타카마가하라 | cunning, mystic | CRIT +10% |
| 올림푸스 | brave, noble, mystic | 스킬 데미지 +15% |
| 아스가르드 | calm, stoic, devoted | HP/DEF +15% |
| 요미 | cunning, calm | 디버프 효과 +20% |

---

## 시너지 참조

### 교단 시너지 (4인 조정)
| 동일 교단 | 효과 |
|----------|------|
| 2명 | ATK +10% |
| 3명 | ATK +15%, DEF +10% |
| 4명 (풀파티) | 모든 스탯 +20% |

### 분위기 시너지 (신규)
| 조합 | 효과 |
|-----|------|
| brave + fierce + wild | "전사의 분노" - ATK +20%, DEF -10% |
| cunning + calm | "냉철한 계산" - CRIT +15%, 쿨다운 -1 |
| mystic + Any | "신비의 가호" - 특수 효과 +10% |
| All Different (4종 이상) | "균형의 힘" - 모든 스탯 +10% |

### 특수 시너지 (확장)
| 이름 | 조합 | 효과 |
|-----|------|------|
| 북유럽의 황혼 | 오딘 + 토르 + 로키 | ATK/DEF +25% |
| 일본 삼종신기 | 아마테라스 + 스사노오 + 츠쿠요미 | 스킬 데미지 +30% |
| 올림푸스 삼신 | 제우스 + 포세이돈 + 하데스 | 전체 스탯 +20% |

---

## 커밋 예시
```
[W2][2.1] MoodSystem.js 구현 - 9종 분위기 정의
[W2][2.2] characters.json 개편 - mood 필드 추가, element 삭제
[W2][2.3] synergies.json 개편 완료 - 분위기 기반 시너지
```
