# Pragmatic Play 슬롯 승리 연출 레퍼런스

Sweet Bonanza, Gates of Olympus, Big Bass Bonanza, Sugar Rush, Triple Tigers/Fire 88(클래식 3릴) 등을
웹 리서치로 조사한 결과. 정확한 ms 단위 수치는 프로바이더가 공식 문서화하지 않으므로,
검색으로 확인된 사실 + 업계 공통 관행을 결합한 **실무 추정치**임을 명시함. (조사일 2026-09-02)

## 1. 승리 연출 시퀀스 (라인형 게임 기준: Big Bass Bonanza, Triple Tigers 등)

- 릴 정지 → 전체 페이라인 동시 표시가 아니라, **당첨 라인을 하나씩 순차 하이라이트**하며 순환(cycle)하는 방식이 표준.
- 라인당 표시: 라인 번호(좌측 인디케이터) + 해당 라인 경로(심볼 연결선/프레임) + 금액 팝업.
- 라인 1개당 노출 시간은 약 1.2~2초 관찰됨(업계 공통, PP도 유사 범위로 추정).
- 동시 당첨 라인이 여러 개면 순환 루프를 계속하며, **다음 스핀 버튼을 누르면 즉시 스킵**하고 총 당첨액을 한번에 표시 후 다음 스핀 진행.
- 총 승리금은 승리 카운터에 **롤업(roll-up)** 방식으로 빠르게 증가하며 표시, 도착 시 짧은 사운드 큐 동반.
- 탭/클릭으로 카운트업 스킵 시 잔여 애니메이션 없이 최종값으로 바로 점프(모던 슬롯 공통 관행).

## 2. 승리 등급 및 임계값 (Big Win / Mega Win / Epic Win / Max Win)

공식 수치는 비공개. 다수 프로바이더(PP 포함 추정)가 공통으로 쓰는 **총 베팅액 대비 배수** 구간:

| 등급 | 배수(×총베팅) | 배너 스타일 | 코인/파티클 | 카운터 |
|---|---|---|---|---|
| Big Win | 10~19x | 중형 텍스트 배너, 확대 팝업 | 소량 코인 낙하 | 롤업 2~3초 |
| Mega Win | 20~49x | 큰 배너 + 배경 플래시 | 코인 샤워 중간 강도 | 롤업 3~4초 |
| Epic/Super Win | 50~99x | 풀스크린 배너, 화면 흔들림(shake) | 강한 코인 샤워 | 롤업 4~6초 |
| Max/Ultra Win | 100x+ | 풀스크린 + 불꽃/폭죽 이펙트 | 최대 강도, 색종이(confetti) | 롤업 6~8초 |

- 모든 등급에서 **화면 탭/스핀 버튼 클릭으로 즉시 스킵** 가능 (카운트업이 최종값으로 점프 후 다음 스핀 진입).
- Gates of Olympus류 텀블 게임은 멀티플라이어 오브가 누적되며 프리스핀 중 미터가 리셋되지 않음.
- Sugar Rush류는 당첨 위치에 멀티플라이어 스팟(2x 시작, 연속 텀블마다 배로, 최대 128x)이 남아 다음 매칭 시 즉시 적용.

## 3. 심볼 승리 애니메이션

- **스케일 펄스(scale pulse)**: 당첨 심볼이 살짝 커졌다 작아지는 바운스, 반복 루프(약 0.4~0.6초 주기).
- **글로우/프레임**: 당첨 심볼 테두리에 광택 프레임 또는 아웃라인 글로우, 라인 표시 중 유지.
- **샤인 스윕(shine sweep)**: 심볼 표면을 가로지르는 빛 반사 효과, 반복.
- **파티클 버스트**: 고가치 심볼은 터짐/폭발 파티클 동반(텀블형에서 특히 뚜렷).
- **캐릭터 애니메이션**: 최고가 심볼은 자체 모션(윙크, 흔들림 등) 별도 보유.
- **비당첨 심볼 딤(dim)**: 라인 하이라이트 중 배경 심볼을 어둡게(밝기 약 40~60%) 처리해 시선 집중.

## 4. 클래식 3릴 슬롯 특징 (Triple Tigers, Fire 88)

- Triple Tigers: 3릴 1페이라인, 프리스핀 없음, 고변동성, 심볼 9종. RTP 97.52/96.52/95.58% 버전.
- Fire 88: 3릴 7페이라인, 인게임 잭팟 최대 888×베팅, 저~중변동성.
- **페이라인 표시**: 라인 수가 적어 라인 인디케이터를 릴 좌측에 상시 노출하는 방식이 일반적. 범례(페이테이블)는 별도 팝업 버튼.
- **스핀 시작/정지**: 회전 시작은 즉각적, 정지는 좌→우 순차(릴당 약 0.1~0.2초 간격). 최고가 심볼 도달 시 정지 순간 강조 사운드.
- 심볼 수가 적은 만큼 당첨 시 라인 순환보다 **단일 라인 즉시 강조 + 카운터 롤업**이 빠르게 진행되는 경향.

## 5. 적용 제안 (tg-slot-hub 렌더러 파라미터)

| 항목 | 제안값 | 근거 |
|---|---|---|
| 라인 하이라이트 1개당 노출시간 | 1400ms | 업계 관행 1.2~2초 중간값 |
| 라인 간 전환(페이드) | 150ms | 부드러운 순환 전환 |
| 스핀 버튼으로 라인 순환 스킵 | 즉시 스킵, 총액 확정 표시 200ms 후 다음 스핀 | 모던 슬롯 공통 |
| 승리 카운터 롤업 속도 | 800~1500ms 내 도달(등급 낮을수록 짧게) | 등급별 표 |
| Big Win 임계값 | ≥ 10× totalBet | 업계 공통 하한선 |
| Mega Win 임계값 | ≥ 20× totalBet | 업계 공통 |
| Epic Win 임계값 | ≥ 50× totalBet | 업계 공통 |
| Max Win 임계값 | ≥ 100× totalBet | 업계 공통 |
| 배너 표시 시간 (Big/Mega/Epic/Max) | 2000 / 3000 / 4500 / 6500 ms | 탭으로 즉시 스킵 |
| 비당첨 심볼 dim alpha | 0.5 | 관행 40~60% 중간 |
| 당첨 심볼 글로우 | 브라스 골드 외곽 4~6px, 펄스 500ms | 팔레트 일관성 |
| 당첨 심볼 스케일 펄스 | 1.0 → 1.12 → 1.0, 500ms, 라인 표시 중 반복 | 관행 0.4~0.6초 |
| 릴 정지 간격(좌→우) | 120~180ms | 클래식 릴 리듬 |

## 참고 자료

- https://www.pragmaticplay.com/en/games/big-bass-bonanza-reel-action/
- https://www.racingpost.com/online-casino/slots/big-bass-bonanza/
- https://www.vegasslotsonline.com/pragmatic-play/triple-tigers/
- https://www.luckymobileslots.com/game-reviews/fire-88/
- http://galaxyofslots.com/gates-of-olympus
- https://www.slingo.com/blog/guides/understanding-tumble-mechanics-in-gates-of-olympus-1000/
- https://gamesreviews.com/slots/sugar-rush/
- https://londonlovesbusiness.com/slot-animations-and-sound-design-how-game-ux-changes-betting-behaviour/
- https://gamixlabs.com/blog/ui-ux-design-iconography-tips-engaging-slot-machine-interfaces/
- https://www.knowyourslots.com/ainsworth-slot-tip-stopping-the-win-count-up-without-spinning-the-machine-again/

> ⚠️ 위 임계값/타이밍 표는 프로바이더 공식 문서가 아닌 업계 관행 기반 추정치. 정밀 검증이 필요하면 데모 플레이 영상 프레임 분석 권장.
