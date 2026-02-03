# W2: 게임 데이터 Worker 가이드

## 개요
- **브랜치**: `arcane/w2-data`
- **폴더**: `D:\park\YD_Claude_RND-w2`
- **담당**: 게임 데이터 개편 (성격 시스템, 시너지, 장비 등)

---

## 파일 소유권

```
src/data/personalities.json
src/data/characters.json
src/data/synergies.json
src/data/equipment.json
src/data/items.json
src/data/stages.json
src/data/index.js
```

---

## 태스크 목록

### Task 2.1: 성격(Personality) 시스템 데이터
- [ ] personalities.json 생성
- [ ] 5가지 성격 정의 (Brave, Cunning, Calm, Wild, Mystic)
- [ ] 성격 상호작용 매트릭스
- [ ] 성격-교단 보너스 정의

### Task 2.2: 캐릭터 데이터 개편
- [ ] characters.json에서 element → personality 변경
- [ ] cult 필드 명시적 추가
- [ ] 신규 캐릭터 추가 (포세이돈, 하데스, 츠쿠요미, 카파 등)
- [ ] 캐릭터별 대사 추가

### Task 2.3: 시너지 데이터 개편
- [ ] synergies.json 전면 개편
- [ ] 속성 시너지 제거
- [ ] 성격 시너지 추가
- [ ] 특수 시너지 확장 (10개+)
- [ ] 교단 시너지 4인용 조정

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

## 성격(Personality) 시스템 참조

### 5가지 성격
| 성격 | 이름 | 테마 색상 | 특징 |
|------|------|----------|------|
| Brave | 용감 | #E74C3C | 정면 돌파, 높은 공격력 |
| Cunning | 교활 | #9B59B6 | 전략적, 크리티컬 특화 |
| Calm | 냉정 | #3498DB | 분석적, 방어/회복 특화 |
| Wild | 야성 | #27AE60 | 본능적, 속도/연속 공격 |
| Mystic | 신비 | #F39C12 | 초월적, 특수 효과 특화 |

### 성격 상호작용 (상성)
| 공격자 | 유리 대상 | 불리 대상 | 효과 |
|-------|----------|----------|------|
| Brave | Cunning | Calm | +20% / -20% |
| Cunning | Calm | Wild | +20% / -20% |
| Calm | Wild | Brave | +20% / -20% |
| Wild | Brave | Cunning | +20% / -20% |
| Mystic | 모든 성격 | - | +10% (고정) |

### 성격-교단 보너스
| 교단 | 최적 성격 | 보너스 |
|-----|---------|-------|
| 발할라 | Brave, Wild | ATK +15% |
| 타카마가하라 | Cunning, Mystic | CRIT +10% |
| 올림푸스 | Brave, Mystic | 스킬 데미지 +15% |
| 아스가르드 | Calm, Wild | HP/DEF +15% |
| 요미 | Cunning, Calm | 디버프 효과 +20% |

---

## 시너지 참조

### 교단 시너지 (4인 조정)
| 동일 교단 | 효과 |
|----------|------|
| 2명 | ATK +10% |
| 3명 | ATK +15%, DEF +10% |
| 4명 (풀파티) | 모든 스탯 +20% |

### 성격 시너지 (신규)
| 조합 | 효과 |
|-----|------|
| Brave + Wild | "전사의 분노" - ATK +20%, DEF -10% |
| Cunning + Calm | "냉철한 계산" - CRIT +15%, 쿨다운 -1 |
| Mystic + Any | "신비의 가호" - 특수 효과 +10% |
| All Different | "균형의 힘" - 모든 스탯 +10% |

### 특수 시너지 (확장)
| 이름 | 조합 | 효과 |
|-----|------|------|
| 북유럽의 황혼 | 오딘 + 토르 + 로키 | ATK/DEF +25% |
| 일본 삼종신기 | 아마테라스 + 스사노오 + 츠쿠요미 | 스킬 데미지 +30% |
| 올림푸스 삼신 | 제우스 + 포세이돈 + 하데스 | 전체 스탯 +20% |

---

## 커밋 예시
```
[W2][2.1] personalities.json 생성 - 5가지 성격 정의
[W2][2.2] characters.json 개편 - personality 필드 추가
[W2][2.3] synergies.json 개편 완료
```
