# 슬롯 UX 편의기능 리서치 — 업계 관행 카탈로그 및 다음 라운드 로드맵

조사일 2026-09-03. Pragmatic Play/Play'n GO/NetEnt·Evolution/Hacksaw 등 실사행 슬롯 프로바이더,
Slotomania/DoubleDown Casino 등 소셜 카지노 앱, Hamster Kombat/Notcoin 등 텔레그램 미니앱을
웹 리서치로 조사. 정확한 수치가 공식 문서화되지 않은 항목은 "업계 관행 추정치"로 표기.

현재 tg-slot-hub 보유 기능(가상 코인 전용, 현금화 없음, 서버 권위): 도움말(페이테이블/페이라인/피처/공정성),
베팅 리스트 시트, 설정(언어/사운드/햅틱/모션감소), 탭·스페이스 릴 스킵, 승리 연출 루프, 프리스핀 자동진행,
갬블(더블업), 잭팟, 일일/4시간 보너스, 미션, 주간 리더보드, XP 레벨+베팅 상한, 스핀 속도(구현 중).

## 1. 오토플레이 (스핀 횟수 / 정지 조건 / 한도)

**프로바이더 관행:** Pragmatic Play 등은 스핀 횟수 지정 + 손실 한도(도달 시 정지) + 단일 승리 한도(초과 시 정지) +
보너스 진입 시 정지 옵션을 제공. 반면 영국 UKGC는 2021년 10월 31일부로 **실화폐 온라인 슬롯에서 오토플레이를
전면 금지**했다(플레이어가 손실 추적을 놓친다는 이유, 스핀 속도도 2.5초 이상으로 제한).
[Autoplay Feature in Slots](https://www.casinos.com/slot-features/autoplay),
[UKGC bans autoplay](https://sbcnews.co.uk/igaming/2021/02/02/ukgc-bans-online-slots-autoplay-and-quickspin-features/)

**우리 허브 적용 판단:** 가상 코인·현금화 없음이므로 UKGC 규제 대상이 아니며, 소셜 카지노들도 오토플레이를
표준으로 제공. 스핀 횟수(10/25/50/100) + 손실 한도 + 단일 승리 한도 + "보너스 트리거 시 정지"는 그대로 적용 가능.
다만 세션 편의 강화(§7 리얼리티 체크)와 짝지어 과몰입 방지 UX를 곁들이는 것을 권장.
**Effort:** M · **Priority:** P1

## 2. 퀵/터보 스핀 (현재 구현 중)

**관행:** 설정 톱니 아이콘 또는 릴 하단 아이콘으로 normal→quick→turbo 순환. 터보는 릴 애니메이션·승리
연출을 단축/생략해 스핀 회전율을 높임. 오토플레이와는 별개 개념(터보=수동 스핀의 연출 속도, 오토플레이=자동 연속 스핀).
[Turbo Spin Features](https://www.3rconnect.com/turbo-spin-features-in-slot-games/),
[Turbo mode vs autoplay](https://www.casinowinnersclub.com/slot-auto-play-guide/)

**적용 판단:** 이미 진행 중인 작업과 일치. 아이콘은 거북이(normal)/토끼(quick)/번개(turbo) 등 속도 은유 아이콘 권장,
설정에 영구 저장(게임별이 아닌 전역).
**Effort:** (진행 중) · **Priority:** P0

## 3. 언제든 정지 (Stop Anytime)

**관행:** 오토플레이/프리스핀 진행 중에도 스핀 버튼 재탭 시 즉시 중단하고 현재 스핀만 마무리하는 것이 표준.

**적용 판단:** 프리스핀 자동진행 및 향후 오토플레이(§1) 모두에 "탭하면 이번 스핀 후 즉시 중단" 규칙 필수.
**Effort:** S · **Priority:** P1

## 4. 베팅 컨트롤 (프리셋 / 맥스 베팅 / 게임별 베팅 기억)

**관행:** 베팅 패널은 코인 값 × 베팅 레벨 조합이 표준이며, Pragmatic Play류는 단일 베팅 슬라이더로 단순화,
NetEnt류는 코인 값/레벨을 분리해 세밀 조정. 맥스 베팅 버튼은 스핀 버튼 근접 배치가 실험적으로 반응률이 높음.
[Bet level vs coin value](https://www.slotzo.com/blog/what-does-bet-level-mean-slot-coin-value-explained/)

**적용 판단:** 이미 베팅 리스트 시트가 있으므로, 프리셋 칩(최소/평균/최대) + "마지막 베팅 기억"(게임별 로컬 저장)
추가가 저비용 고효용. 맥스 베팅은 XP 레벨 상한과 연동되어 있으니 상한 초과 시 비활성 처리 필요.
**Effort:** S · **Priority:** P1

## 5. 바이피처 / 앤티벳 (가상 코인 맥락 평가)

**관행:** 실화폐 슬롯에서 바이피처는 베팅의 50~2000배로 보너스 라운드 즉시 진입, 앤티벳은 베팅의 +25%로
스캐터 확률을 2배로 올리는 방식. Gates of Olympus/Sweet Bonanza/도그하우스 메가웨이즈 등이 대표 사례.
[Bonus Buy Slots](https://slotcatalog.com/en/slot-features/buy),
[Pragmatic Play Bonus Buy FAQ](https://www.pragmaticplay.fun/en/how-to/faqs/bonus-buy-slots-how-do-they-work/)

**적용 판단:** 현금화가 없는 가상 코인 경제이므로 규제 이슈 없이 **코인 싱크(sink)**로 활용 가능 — 코인이
과잉 축적되는 파워 유저의 코인 소모처로 유용. 다만 RTP 감사 대상 지표가 늘어나므로(바이피처 전용 RTP 별도 검증
필요) 엔진/수학 작업량이 크다. 신규 기능이라기보다 "다음 웨이브"급 항목으로 분류 권장.
**Effort:** L · **Priority:** P2

## 6. 승리 연출 — 롤업 스킵 / 탭투수집 / 빅윈 화면

**관행:** 승리 카운터는 롤업(숫자 빠르게 증가) 방식이 표준이며, 탭/스핀 버튼 클릭 시 잔여 애니메이션 없이
최종값으로 즉시 점프. 빅윈 이상 등급은 전체 화면을 덮는 전용 연출로 전환. 상위 앱들은 스핀 종료~빅윈 화면
사이 약 500ms 지연을 둬 긴장감을 조성(업계 관행 추정).
[Big Win screen](https://gamixlabs.com/blog/ui-ux-design-iconography-tips-engaging-slot-machine-interfaces/)

**적용 판단:** `docs/REFERENCE_PRAGMATIC.md`에 이미 등급별 임계값·스킵 규칙이 정리돼 있어 별도 조사 불필요.
탭투수집(수동 확인 후 다음 스핀 진행)은 터보 모드에서는 생략, 노멀 모드에서만 유지하는 하이브리드 권장.
(2026-09-03 사용자 결정: 결과 연출 중 터치는 연출을 끊지 않고, 스핀 버튼만 다음 스핀으로 넘어간다. 상단 WIN 배너는 제거.)
**Effort:** (기존 문서 반영 완료) · **Priority:** P0(이미 커버)

## 7. 세션 정보 — 게임/라운드 히스토리, 세션 통계, 플레이 시간, RTP 표시, 리얼리티 체크

**관행:** 실화폐 규제 시장은 15/30/60분 간격 "리얼리티 체크" 팝업으로 누적 플레이 시간·손익을 강제 고지하고
계속/정지를 선택하게 한다. RTP는 게임 정보(i 버튼)에 상시 표기가 표준. 라운드 히스토리(최근 스핀별 베팅/결과)
제공도 일반적.
[Reality checks](https://www.igaming.com/igamingcare/reality-checks/),
[RTP display](https://www.racingpost.com/online-casino/articles/rtp-in-slots/)

**적용 판단:** 가상 코인이라도 장시간 몰입 방지 및 신뢰도 제고 차원에서 (a) 게임 정보 팝업 내 RTP % 상시 표기
(이미 페이테이블 도움말이 있으니 추가는 저비용), (b) 최근 20스핀 라운드 히스토리 시트, (c) 선택적 "60분 경과" 소프트
알림(강제 아님, 닫기 가능)을 권장. 리얼리티 체크는 강제형이 아닌 옵션형으로 설계하면 규제 이슈 없이 신뢰 신호로 작동.
**Effort:** M · **Priority:** P1

## 8. 사운드/음악 분리, 햅틱 (이미 구현)

이미 설정에 언어/사운드/햅틱/모션감소가 존재. 업계 표준과 일치하므로 추가 리서치 불필요.
**Effort:** — · **Priority:** — (완료)

## 9. 배터리 세이버 / 저품질 모드

**관행:** 모바일 게임 일반 관행으로 그래픽 품질 하향(파티클/그림자 감소), 프레임레이트 상한, 다크 모드(OLED
절전) 등이 배터리 절약에 기여한다는 것이 정설. 슬롯 게임 전용 사례는 문서화가 적어 일반 모바일 게임 관행을
차용한 추정치.
[Battery saving strategies](https://dzoneonline.com/how-to-save-battery-while-gaming-mobile/)

**적용 판단:** PixiJS 렌더러 특성상 파티클/글로우 이펙트 강도를 "저사양 모드" 토글로 낮추는 옵션은 저사양
기기·구형 스마트폰 대응에 유효. 모션감소 설정과 통합해 하나의 "간소화 모드"로 묶는 것을 권장(신규 토글
추가보다 기존 설정 확장이 저비용).
**Effort:** S · **Priority:** P2

## 10. 가로모드 지원

**관행:** 텔레그램 미니앱 2.0(2026)부터 풀스크린 모드에서 portrait/landscape 모두 지원, `lockOrientation`/
`unlockOrientation` API 제공. 다만 슬롯류는 세로 우선이 업계 표준(손가락 도달 범위, 한손 플레이).
[Telegram Mini Apps 2.0](https://telegram.org/blog/fullscreen-miniapps-and-more)

**적용 판단:** 현재 "버티컬 퍼스트" 설계 방침과 일치. 가로모드는 우선순위 낮음 — 굳이 지원하려면
`lockOrientation`으로 세로 고정을 명시하는 편이 오히려 UX 일관성에 유리. 신규 개발 불필요.
**Effort:** — · **Priority:** P3(불필요 — 세로 고정 유지 권장)

## 11. 한손/엄지 도달 (Thumb Zone) 컨트롤 배치

**관행:** 화면 하단 1/3 "엄지 존"에 스핀/베팅/오토플레이 버튼을 배치하는 것이 모바일 슬롯 업계 표준.
[Thumb zone design](https://www.onlinegamblingexperts.com/mobile-first-slot-game-ux-innovations/)

**적용 판단:** 기존 버티컬 릴 프레임 설계와 맞물려 하단 컨트롤 바 배치는 이미 자연스러운 구조. 신규 조사 불필요,
기존 레이아웃 검증만 필요.
**Effort:** S(검증만) · **Priority:** P2

## 12. 제스처 관행 — 스와이프 스핀 / 롱프레스 오토플레이

**관행:** 최신 모바일 슬롯 UX 트렌드로 릴 영역 하향 플릭(swipe down)으로 스핀 실행, 스핀 버튼 롱프레스로
오토플레이 설정 메뉴(라디얼 메뉴로 회전수 선택) 진입하는 패턴이 언급됨. 다만 이는 소수 트렌드 기사 기반이며
Pragmatic Play/NetEnt 등 메이저 프로바이더의 검증된 표준은 아님 — **업계 트렌드 추정, 낮은 신뢰도**.
[Mobile-first slot UX](https://www.onlinegamblingexperts.com/mobile-first-slot-game-ux-innovations/)

**적용 판단:** 탭 버튼이 이미 명확하고 오인식 위험(실수로 스와이프 시 의도치 않은 베팅)이 있어 **비권장**.
버튼 기반 UI를 유지하고, 롱프레스는 "오토플레이 설정 열기" 단축키 정도로만 제한적 채택 검토.
**Effort:** S · **Priority:** P3

## 13. 온보딩/튜토리얼 (첫 스핀 패턴)

**관행:** 게임 업계 FTUE(First-Time User Experience) 원칙은 (a) 한 번에 하나의 코치마크만, (b) 실제
플레이를 통한 학습(설명 화면보다 인터랙티브), (c) 점진적 공개(기능을 필요한 시점에 노출)로 요약됨.
[Coach marks & FTUE](https://alexiamandeville.medium.com/designing-a-good-game-tutorial-3c5dcbc50041)

**적용 판단:** 도움말 페이지가 이미 있으나 "찾아가서 보는" 방식이라 첫 진입 시 자동 노출 코치마크(스핀 버튼
→ 베팅 조절 → 오토플레이 순으로 1개씩, 스킵 가능)를 추가하면 신규 유저 이탈 방지에 기여. 신규 게임 출시 때마다
매번 반복하지 않도록 "허브 최초 1회"로 제한.
**Effort:** M · **Priority:** P1

## 14. 에러/재연결 처리 (스핀 진행 중 복구)

**관행:** 결과는 스핀 버튼 클릭 시점에 서버에서 이미 확정되며, 릴 회전은 시각 연출일 뿐. 연결이 끊기면
서버가 세션을 유지하고, 재접속 시 저장된 결과를 그대로 재생하거나 잔액에 반영하는 것이 표준. 프리스핀 등
멀티스텝 보너스 중 끊김 시 남은 횟수/누적 배수/현재 단계까지 복원.
[How slot platforms recover interrupted rounds](https://www.gleamworld.co.uk/how-online-slot-gaming-platforms-recover-interrupted-game-rounds/)

**적용 판단:** 이미 서버 권위 구조("클라이언트는 이미 받은 결과를 연출만 한다")와 정확히 일치. 재연결 시
"미완료 스핀 결과 재생" 처리 로직이 있는지만 확인 필요. 리서치 관점에서는 기존 아키텍처가 업계 표준을 이미 충족.
**Effort:** M(검증+보강) · **Priority:** P1

## 15. 알림/스트릭 (편의 목적으로만)

**관행:** 소셜 카지노(Slotomania/DoubleDown)는 로그인 스트릭, 시간별 무료 보너스, 앨범/컬렉션 완성 보상 등
15가지 이상의 무료 코인 획득 경로를 운영. 편의/리마인더 목적이 강함.
[Slotomania daily rewards](https://www.pokernews.com/free-online-games/social-casino-daily-rewards-guide.htm)

**적용 판단:** 이미 일일/4시간 보너스, 미션, 리더보드가 존재해 핵심은 커버됨. 텔레그램 봇 알림(예: "4시간
보너스 준비됨")은 순수 편의 리마인더로만 제한하고 압박형 문구는 지양.
**Effort:** S · **Priority:** P2

## 16. 접근성 — 모션감소 / 폰트 크기 / 색맹 친화

**관행:** WCAG 기준 색상만으로 정보를 전달하지 않고 패턴·텍스트를 병행해야 하며, `prefers-reduced-motion`은
OS 설정과 게임 내 설정을 병행 지원하는 것이 권장됨. 색맹 모드는 필수 접근성 항목으로 언급됨.
[Casino Game Accessibility WCAG 2.2](https://wizards.us/news/casino-game-accessibility-wcag-2-2-checklist/)

**적용 판단:** 모션감소는 이미 구현. 미구현 항목: (a) 폰트 크기 조절(UI 텍스트 확대), (b) 색맹 친화 모드
(당첨 강조에 색상 외 패턴/테두리 추가) — 당첨 하이라이트가 이미 프레임+글로우 방식이라 색맹 이슈는
낮은 편이나, 명시적 접근성 토글로 노출하면 신뢰도 신호가 됨.
**Effort:** M · **Priority:** P2

## 17. 데스크톱 키보드 단축키

**관행:** 텔레그램 데스크톱 앱에서도 미니앱이 풀스크린으로 구동 가능해졌으므로 데스크톱 사용자 비중이
존재. 스페이스바 스핀은 이미 구현. 업계 문서화된 표준 단축키 세트는 없음(대부분 마우스/터치 우선 설계).

**적용 판단:** 스페이스(스핀)에 더해 Esc(팝업 닫기), 숫자키 1~3(베팅 프리셋 선택) 정도만 저비용으로 추가
검토. 데스크톱 전용 심화 단축키는 우선순위 낮음.
**Effort:** S · **Priority:** P3

---

## 우선순위 로드맵 (P0/P1 우선)

| 우선순위 | 항목 | Effort | 비고 |
|---|---|---|---|
| P0 | 퀵/터보 스핀 | (진행 중) | 이미 착수됨 |
| P0 | 승리 연출 롤업 스킵/빅윈 | 완료 | REFERENCE_PRAGMATIC.md 반영됨 |
| P1 | 오토플레이(횟수+손실한도+단일승리한도+정지조건) | M | §1 |
| P1 | 언제든 정지(오토플레이/프리스핀 즉시 중단) | S | §3 |
| P1 | 베팅 프리셋 + 게임별 베팅 기억 | S | §4 |
| P1 | 세션 정보(RTP 상시표기+라운드 히스토리+선택적 시간 알림) | M | §7 |
| P1 | 첫 진입 코치마크 온보딩 | M | §13 |
| P1 | 재연결 시 미완료 스핀 복구 검증 | M | §14(기존 구조 검증) |
| P2 | 바이피처/앤티벳(코인 싱크) | L | §5, 다음 웨이브급 |
| P2 | 저사양/배터리 절약 모드(모션감소와 통합) | S | §9 |
| P2 | 엄지존 레이아웃 검증 | S | §11 |
| P2 | 봇 알림 리마인더(편의 한정) | S | §15 |
| P2 | 접근성 폰트크기/색맹모드 토글 | M | §16 |
| P3 | 가로모드 | — | 비권장, 세로 고정 유지 |
| P3 | 스와이프 스핀/롱프레스 제스처 | S | 낮은 신뢰도 트렌드, 비권장 |
| P3 | 데스크톱 확장 단축키 | S | 스페이스 외 저비용 항목만 |

**핵심 요약:** 기존 UX가 이미 업계 상위권 수준(도움말/설정/프리스핀/갬블/잭팟/미션/리더보드)을 커버하고
있어, 다음 라운드는 (1) 오토플레이 정식 구현, (2) 베팅 프리셋/기억, (3) 세션 정보 투명성(RTP·히스토리),
(4) 첫 진입 온보딩 네 가지에 집중하는 것을 권장한다. 바이피처는 가치는 크지만 RTP 수학 작업량이 커
별도 웨이브로 분리하는 것이 합리적이다.

## 인용 출처

- https://www.casinos.com/slot-features/autoplay
- https://sbcnews.co.uk/igaming/2021/02/02/ukgc-bans-online-slots-autoplay-and-quickspin-features/
- https://www.3rconnect.com/turbo-spin-features-in-slot-games/
- https://www.casinowinnersclub.com/slot-auto-play-guide/
- https://www.slotzo.com/blog/what-does-bet-level-mean-slot-coin-value-explained/
- https://slotcatalog.com/en/slot-features/buy
- https://www.pragmaticplay.fun/en/how-to/faqs/bonus-buy-slots-how-do-they-work/
- https://gamixlabs.com/blog/ui-ux-design-iconography-tips-engaging-slot-machine-interfaces/
- https://www.igaming.com/igamingcare/reality-checks/
- https://www.racingpost.com/online-casino/articles/rtp-in-slots/
- https://dzoneonline.com/how-to-save-battery-while-gaming-mobile/
- https://telegram.org/blog/fullscreen-miniapps-and-more
- https://www.onlinegamblingexperts.com/mobile-first-slot-game-ux-innovations/
- https://www.gleamworld.co.uk/how-online-slot-gaming-platforms-recover-interrupted-game-rounds/
- https://www.pokernews.com/free-online-games/social-casino-daily-rewards-guide.htm
- https://wizards.us/news/casino-game-accessibility-wcag-2-2-checklist/
- https://alexiamandeville.medium.com/designing-a-good-game-tutorial-3c5dcbc50041

> ⚠️ §12(제스처)는 메이저 프로바이더의 검증된 표준이 아니라 소수 트렌드 기사 기반 추정이며 비권장.
