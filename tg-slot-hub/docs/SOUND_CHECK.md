# 사운드 점검 (earshot) — 2026-11-10

슬롯 허브 효과음 5개 프리셋 × 10개 이벤트와 배경음악·믹스를 earshot 으로 듣고 잰 기록.
**earshot 수치는 참고값이다. 최종 판정은 귀로 한다.** realness(실녹음 여부)는 합성음이 목적이라 정보로만 봤다.

## 방법

- 실제 `apps/hub/src/lib/audio.ts` 를 헤드리스 Chrome OfflineAudioContext + 가상 시계로 렌더(하네스: 스크래치패드 `bgm/harness.ts`, `render.cjs`).
  효과음 단독 스템은 BGM 0, 이벤트별 WAV (`sfx/<preset>_<event>.wav`). UI 버튼음은 프리셋 무관이라 bell 에서만.
- 각 스템: `match`(의도 문구 + 현실적 혼동 alts), `describe`, `measure`(LUFS·true peak·attack/decay·밝기), 마지막 10 ms 꼬리 레벨, 프리셋 간 CLAP 코사인(같은 이벤트끼리).
- 믹스: 30초 장면(스핀 → 기대감 스핀 + 큰 당첨 → 피처 + 프리스핀 커튼 → 스핀)을 BGM+SFX / SFX만 / BGM만(덕킹 포함) 세 번 렌더해 구간별 SFX−BGM LUFS 차를 쟀다. BGM 음량은 기본 40%.
- z 해석: ≥3 강함, 2.5–3 그럴듯, 2–2.5 약함, <2 불일치. 짧은 원샷(<0.5 s)은 태거가 약하다.

## 공통 결과 (수정 전)

- 클릭·잘린 꼬리: 50개 스템 전부 꼬리 −180 dB (shrine rollup −60 dB) — 문제 없음. 클리핑 0.
- **릴 정지**: bell·western·shrine 이 "a kick drum" z +3.5~+4.0 으로 판독(190→60 Hz 사인 슬라이드 = 킥 드럼 구조). bell/shrine 정지음 CLAP 코사인 0.92 로 거의 같은 소리.
- **기대감 상승음**: 5개 모두 "a siren"(z +2.35~+3.28)이 의도 문구(+1.3~+2.5)보다 높음. bell/western 코사인 0.97.
- **fruit 작은 당첨**: −35.4 LUFS 로 다른 프리셋보다 5~9 dB 작고, 믹스에서 BGM 보다 +1.1 dB 뿐(가려질 위험).
- **western 큰 당첨**: "plucked acoustic guitar strum with a gunshot" z +0.02, 총성 구간 단독도 "a gunshot" 불일치.
- 그 외 당첨·피처는 "a success chime / magic sparkle chime" z +3~+4.5 로 의도대로 읽힘.

## 수정 내역 (audio.ts)

| # | 변경 | 전 → 후 (earshot) |
|---|---|---|
| 1 | bell 릴 정지: 190→60 Hz 사인(킥) → 330→200 Hz 삼각파 몸통 + 짧은 120 Hz + 대역 잡음 걸쇠 | kick +3.96 → +3.00, 최상위가 "a wooden block hit" +3.18, decay 68 → 29 ms, 밝기 5.3 → 1.5 kHz(덜 쏨), "a short dull knock" +0.15 → +1.38 |
| 2 | shrine 릴 정지: 딱따기 + 130 Hz 사인 → 1250 Hz 공명 나무 + 3.4 kHz 배음 + 대역 잡음(효시기) | "wooden clappers hit" +1.17 → +2.76, kick +3.81 → (최상위 아님), decay 62 → 53 ms; ab: "two hard wooden sticks clacked together" +0.9 → +2.2 |
| 3 | western 릴 정지: 82 Hz 기타 줄(0.25 s 울림) → 나무 딱 + 260→170 Hz 짧은 몸통 | kick +3.45 → 최상위 "a snare hit" +3.39 / "a wooden block hit" +3.17, decay 245 → 30 ms (5연속 피로 감소). 기타 줄 버전은 "an error buzz" +3.29 가 떠서 버림 |
| 4 | 기대감 상승음(전 프리셋): 단일 오실레이터 → +5도 오실레이터 + 올라가는 대역 잡음 와시 | siren z +2.35~+3.28 → +0.34~+1.83, "a rising noise sweep riser" +2.0~+3.5. true peak −11 ~ −19 dBTP |
| 5 | shrine 상승음 음량 0.14 → 0.11 | 4번 뒤 −21.3 → −23.4 LUFS (믹스에서 BGM +17.1 → +15.9 dB) |
| 6 | western pluckVoice 재작성(빠르게 닫히는 로우패스, 울림 τ 0.22 s, 피크 잡음) | 작은 당첨 "a plucked acoustic guitar melody" +1.51 → +1.67(미미), 스핀 시작 decay 228 → 745 ms 로 길어짐 |
| 7 | 총성 재작성(고역 크랙 + 저역 몸통 + 붐 + 0.9 s 방 잔향) | 구간 단독 "a gunshot" z −0.2 → −0.6 — 개선 없음. 큰 당첨 전체 "guitar strum with a gunshot" +0.02 → +0.40 |
| 8 | fruit 작은 당첨 음량 0.3 → 0.5, 거품 0.07 → 0.1 | −35.4 → −30.9 LUFS, 믹스 SFX−BGM +1.1 → +3.6 dB, "bubbly cartoon pops jingle" +3.47 → +3.25 (유지) |

## 배경음악

| 시도 | fruit base: tropical / music box / happy / sad | fruit free: tropical / music box / happy | 결과 |
|---|---|---|---|
| 원래 | 2.57 / 3.34 / 2.54 / 2.85 | 2.68 / 4.11 / 2.80 | — |
| A 선율 음역 72–88 → 65–81, 프리스핀 아르페지오 +12 → +7, 마림바 울림 길게 | 2.17 / 3.18 / 2.31 / 2.88 | 2.42 / 3.59 / 2.93 | 마림바 길게 하면 "warm analog synth pad" 등장 → 마림바만 되돌림 |
| B = A − 마림바 변경 (**채택**) | 2.41 / 3.09 / 2.48 / 2.84 | 2.65 / 3.65 / 3.07 | 프리스핀 music box −0.46, happy +0.27. base 는 오차 수준 |
| C B + 110 BPM + 소카식 4박 킥·나무 타악 | 2.29 / 3.06 / 2.47 / 2.88 | 2.72 / 3.63 / 3.15 | 변화 없음 → 되돌림 (테스트 상한 110 BPM) |
| D C + 패드 거의 끔, 스틸 선율↑ 마림바↓ | 2.23 / 2.98 / 2.27 / 2.83 | 2.67 / 3.57 / 2.86 | 변화 없음 → 되돌림 |
| R 전 프리셋 리버브 센드 ½ | bell sad 3.58 → 3.43, 나머지 ±0.1 | — | 효과 없음 → 되돌림 |

결론: 수치가 뒷받침한 건 B(선율 음역·프리스핀 아르페지오)뿐이다. 편성·템포·리버브 조정으로는 "sad"(5곡 모두 +3.15~+3.52)와 fruit 의 "music box" 판독이 움직이지 않았다.
움직이려면 음색 자체(스틸팬·마림바 합성 모델)나 화성·선율 작법을 바꾸는 큰 작업이 필요하다. 이번엔 하지 않았다.

최종 BGM 판독(30초, base): bell sad 3.50 / happy 2.84 · fruit 2.84 / 2.45 · western 3.15 / 1.85 · shrine 3.23 / 1.54 · clockwork 3.52 / 1.96. 테마 문구: western "western cowboy guitar music" +0.96, shrine "traditional japanese koto music" +0.82 (둘 다 불일치, 대신 "a plucked synth arpeggio" +3.8~+4.0).

## 믹스 균형 (최종, BGM 40%)

| 프리셋 | 믹스 LUFS | 믹스 true peak | SFX−BGM dB: 릴 정지 / 작은 당첨 / 기대감 / 큰 당첨 / 피처 |
|---|---|---|---|
| bell | −26.7 | −5.8 dBTP | +6.9 / +4.2 / +11.6 / +10.3 / +17.0 |
| fruit | −28.3 | −8.6 | +6.5 / +3.6 / +13.3 / +8.2 / +14.0 |
| western | −26.9 | −4.5 | +5.5 / +8.2 / +11.7 / +12.3 / +20.4 |
| shrine | −24.8 | −5.0 | +7.5 / +8.6 / +15.9 / +13.9 / +19.3 |
| clockwork | −26.2 | −6.8 | +13.0 / +7.8 / +10.9 / +12.3 / +20.5 |

- true peak 전부 ≤ −4.5 dBTP, 클리핑 0 → 통과(기준 ≤ −1 dBTP).
- 덕킹 동작 확인: 기대감·큰 당첨 구간 BGM 이 BGM 단독 구간보다 −3~−8 dB, 피처(커튼) −6~−9 dB.
- 효과음은 BGM 위 +3.6~+20 dB. 가려짐 위험은 fruit 작은 당첨(+3.6)이 가장 낮지만 수정 전(+1.1)보다 나음.
- 피처는 커튼 덕킹이 겹쳐 +14~+20 dB 로 큼 — 의도된 연출이지만 귀로 확인할 것.
- 릴 정지 피로도: 수정 후 decay bell 29 / shrine 53 / western 30 / fruit 45 ms. clockwork 는 유리 핑이 붙어 380 ms(5연속 680 ms), 밝기 1.5 kHz.
- 기대감 상승음 밝기 0.8~2.2 kHz, true peak −13.6~−19.1 dBTP → 날카롭다는 수치 근거 없음.

## 이벤트별 표 (최종 렌더 기준, z 는 의도 문구 중 최고값)

### bell

| 이벤트 | 의도 | 의도 문구 최고 z (전 → 후) | 최상위 판독 (후) | LUFS / dBTP (후) | decay ms | 판정 |
|---|---|---|---|---|---|---|
| spin | 레버+회전 딸깍 루프 | “a fast ratchet clicking loop” +3.75 → +3.73 | a scroll wheel tick +2.77 | -41.9 / -17.6 | 68 | ok |
| reelstop | 릴 정지 1회 | “a short dull thud with a click” +1.05 → +1.74 | a wooden block hit +3.18 | -33.9 / -13.3 | 29 | fix → 수정 |
| reelstops | 릴 정지 5연속 | “a series of short mechanical thunks, slot reel” +1.27 → +1.01 | a wooden block hit +3.21 | -26.2 / -6.9 | 28 | fix → 수정 |
| winsmall | 작은 당첨 | “a short bright chime jingle for a small win” +3.31 → +3.41 | a success chime +4.51 | -27.1 / -12.4 | 313 | ok |
| winbig | 큰 당첨(3초 롤업) | “bright bell chimes with coins, classic slot ma” +3.91 → +3.70 | a success chime +4.07 | -22.9 / -8.6 | 840 | ok |
| feature | 피처 발동 | “a magical rising sweep into a bright chime arp” +4.64 → +4.61 | a success chime +4.24 | -22.5 / -11.4 | 557 | ok |
| mutation | 심볼 변형 | “a short magical sparkle shimmer” +1.91 → +1.99 | a kalimba note +4.32 | -30.9 / -17.2 | 243 | 주의(z<2) |
| riser | 기대감 상승음 | “a pulsing rising tension riser” +1.53 → +2.06 | a downlifter falling sweep +2.58 | -27.4 / -16.6 | 285 | fix → 수정(사이렌 해소) |
| rollup | 롤업 틱+마감 | “rapid coin counter ticks ending with a chime” +1.83 → +1.83 | a success chime +3.11 | -35.7 / -18.9 | 396 | 주의(z<2) |
| ui | UI 버튼 6종 | “soft short UI button clicks and blips” +2.49 → +2.54 | bubbles underwater +3.77 | -44.0 / -25.4 | 45 | ok |

### fruit

| 이벤트 | 의도 | 의도 문구 최고 z (전 → 후) | 최상위 판독 (후) | LUFS / dBTP (후) | decay ms | 판정 |
|---|---|---|---|---|---|---|
| spin | 레버+회전 딸깍 루프 | “a slot machine reels spinning with rapid click” +2.83 → +2.80 | bubbles underwater +3.09 | -42.3 / -19.5 | 75 | ok |
| reelstop | 릴 정지 1회 | “a bubbly pop” +2.65 → +2.65 | a liquid bloop +3.35 | -33.6 / -16.0 | 45 | ok |
| reelstops | 릴 정지 5연속 | “a series of short mechanical thunks, slot reel” +1.35 → +1.35 | a liquid bloop +3.15 | -26.3 / -10.7 | 41 | 주의(z<2) |
| winsmall | 작은 당첨 | “bubbly cartoon pops jingle” +3.47 → +3.25 | bubbles underwater +2.65 | -30.9 / -10.9 | 69 | fix → 수정(+4.5 dB) |
| winbig | 큰 당첨(3초 롤업) | “bouncy bubbly pops and marimba notes, cheerful” +2.66 → +2.97 | a magic sparkle chime +3.45 | -29.3 / -8.3 | 459 | ok |
| feature | 피처 발동 | “a magical rising sweep into a bright chime arp” +3.29 → +2.62 | a liquid bloop +2.53 | -26.5 / -13.8 | 329 | ok |
| mutation | 심볼 변형 | “a short magical sparkle shimmer” +1.60 → +1.60 | a success chime +2.56 | -35.3 / -19.9 | 47 | 주의(z<2) |
| riser | 기대감 상승음 | “a pulsing rising tension riser” +2.22 → +3.02 | a downlifter falling sweep +3.47 | -24.8 / -14.4 | 187 | fix → 수정(사이렌 해소) |
| rollup | 롤업 틱+마감 | “rapid coin counter ticks ending with a chime” +1.73 → +1.73 | bubbles underwater +2.84 | -35.1 / -16.3 | 164 | 주의(z<2) |

### western

| 이벤트 | 의도 | 의도 문구 최고 z (전 → 후) | 최상위 판독 (후) | LUFS / dBTP (후) | decay ms | 판정 |
|---|---|---|---|---|---|---|
| spin | 레버+회전 딸깍 루프 | “a fast ratchet clicking loop” +3.50 → +2.89 | a kalimba note +3.26 | -34.3 / -13.0 | 745 | 변화(기타 울림 길어짐) |
| reelstop | 릴 정지 1회 | “a short dull knock” +1.37 → +1.18 | a snare hit +3.39 | -35.8 / -12.6 | 30 | fix → 수정 |
| reelstops | 릴 정지 5연속 | “a series of short mechanical thunks, slot reel” +1.14 → +1.54 | a snare hit +3.70 | -27.9 / -7.3 | 27 | fix → 수정 |
| winsmall | 작은 당첨 | “a short bright chime jingle for a small win” +3.02 → +3.41 | a success chime +4.26 | -26.4 / -11.6 | 763 | ok |
| winbig | 큰 당첨(3초 롤업) | “a triumphant bright jingle with coin sparkles” +1.65 → +2.01 | a success chime +2.85 | -21.9 / -8.4 | 164 | fix → 일부(총성 재작성, 테마 문구 여전히 미달) |
| feature | 피처 발동 | “a magical rising sweep into a bright chime arp” +2.87 → +3.37 | a success chime +3.41 | -21.8 / -9.8 | 997 | 주의(총성 문구 z 0.1) |
| mutation | 심볼 변형 | “a short magical sparkle shimmer” +3.63 → +3.63 | a success chime +3.83 | -35.0 / -23.3 | 129 | ok |
| riser | 기대감 상승음 | “a pulsing rising tension riser” +1.41 → +2.16 | a downlifter falling sweep +2.61 | -27.3 / -16.3 | 285 | fix → 수정(사이렌 해소) |
| rollup | 롤업 틱+마감 | “rapid coin counter ticks ending with a chime” +1.96 → +2.46 | a success chime +2.98 | -31.0 / -12.8 | 740 | 약함(z 2–2.5) |

### shrine

| 이벤트 | 의도 | 의도 문구 최고 z (전 → 후) | 최상위 판독 (후) | LUFS / dBTP (후) | decay ms | 판정 |
|---|---|---|---|---|---|---|
| spin | 레버+회전 딸깍 루프 | “a slot machine reels spinning with rapid click” +2.89 → +2.87 | a kalimba note +3.10 | -40.5 / -15.3 | 195 | ok |
| reelstop | 릴 정지 1회 | “wooden clappers hit” +1.17 → +2.76 | a kalimba note +4.22 | -32.1 / -12.9 | 53 | fix → 수정 |
| reelstops | 릴 정지 5연속 | “a series of short mechanical thunks, slot reel” +1.82 → +1.02 | a kalimba note +3.95 | -24.4 / -8.1 | 49 | fix → 수정 |
| winsmall | 작은 당첨 | “a short bright chime jingle for a small win” +3.12 → +3.08 | a success chime +4.09 | -25.9 / -11.6 | 694 | ok |
| winbig | 큰 당첨(3초 롤업) | “a triumphant bright jingle with coin sparkles” +2.88 → +2.79 | a success chime +3.58 | -19.6 / -6.3 | 682 | ok |
| feature | 피처 발동 | “a magical rising sweep into a bright chime arp” +3.06 → +3.09 | a success chime +3.72 | -22.1 / -9.9 | 1010 | ok |
| mutation | 심볼 변형 | “a short magical sparkle shimmer” +2.63 → +2.82 | a magic sparkle chime +3.03 | -34.5 / -24.0 | 201 | ok |
| riser | 기대감 상승음 | “a pulsing rising tension riser” +2.48 → +2.48 | a downlifter falling sweep +3.42 | -23.4 / -13.6 | 302 | fix → 수정(사이렌 해소) |
| rollup | 롤업 틱+마감 | “rapid coin counter ticks ending with a chime” +1.89 → +1.90 | a sub bass drop +2.74 | -29.0 / -12.1 | 692 | 주의(z<2) |

### clockwork

| 이벤트 | 의도 | 의도 문구 최고 z (전 → 후) | 최상위 판독 (후) | LUFS / dBTP (후) | decay ms | 판정 |
|---|---|---|---|---|---|---|
| spin | 레버+회전 딸깍 루프 | “a fast ratchet clicking loop” +2.49 → +2.68 | a digital glitch +3.13 | -42.3 / -20.8 | 134 | ok |
| reelstop | 릴 정지 1회 | “a clock gear clunk with a glass ping” +1.19 → +1.18 | a kalimba note +3.31 | -33.0 / -15.2 | 380 | 주의(z<2) |
| reelstops | 릴 정지 5연속 | “a series of short mechanical thunks, slot reel” +1.08 → +1.08 | a kalimba note +2.93 | -23.7 / -9.2 | 680 | 주의(z<2) |
| winsmall | 작은 당첨 | “a short bright chime jingle for a small win” +3.49 → +3.40 | a success chime +3.99 | -24.2 / -13.5 | 490 | ok |
| winbig | 큰 당첨(3초 롤업) | “a triumphant bright jingle with coin sparkles” +2.85 → +2.82 | a magic sparkle chime +3.64 | -23.2 / -8.2 | 419 | ok |
| feature | 피처 발동 | “a magical rising sweep into a bright chime arp” +4.14 → +4.06 | a magic sparkle chime +3.63 | -20.3 / -6.1 | 471 | ok |
| mutation | 심볼 변형 | “a short magical sparkle shimmer” +2.20 → +2.20 | a success chime +3.72 | -28.7 / -19.1 | 453 | 약함(z 2–2.5) |
| riser | 기대감 상승음 | “a pulsing rising tension riser” +2.03 → +2.59 | a downlifter falling sweep +3.26 | -26.8 / -19.1 | 305 | fix → 수정(사이렌 해소) |
| rollup | 롤업 틱+마감 | “rapid coin counter ticks ending with a chime” +2.04 → +2.01 | a keyboard typing fast +2.77 | -30.8 / -16.8 | 422 | 약함(z 2–2.5) |

## 프리셋 구분 (같은 이벤트, CLAP 코사인 — 높을수록 비슷)

| 이벤트 | 평균(전 → 후) | 가장 비슷한 쌍 (후) |
|---|---|---|
| reelstop | 0.67 → 0.71 | bell/western 0.92 (전: bell/shrine 0.92) |
| riser | 0.87 → 0.87 | bell/western 0.975, fruit/clockwork 0.968 |
| winbig | 0.83 → 0.84 | shrine/clockwork 0.94 |
| winsmall / feature / mutation / rollup / spin | 0.73~0.81 | — |

## 남은 문제

1. bell 과 western 릴 정지가 둘 다 짧은 나무 노크가 되어 서로 비슷함(코사인 0.92). western 에 박차 소리나 금속 걸쇠를 더하면 구분될 수 있음.
2. 기대감 상승음은 구조가 같아 bell/western, fruit/clockwork 가 거의 같은 소리(코사인 0.97). 프리셋마다 파형·잡음 색을 달리해야 함.
3. western 총성과 "기타+총성" 판독 미달(z 0.1~0.4). 합성 총성은 CLAP 이 총성으로 듣지 않음. 녹음 샘플을 `sfx` override 로 쓰는 게 현실적.
4. shrine 범종 판독 약함("a Japanese temple bell" +1.42 / +0.71). templeVoice 배음이 거의 정수배(2.01, 2.97)라 차임처럼 들림.
5. 롤업 틱은 모든 프리셋에서 "coin counter" z 1.7~2.5 — 짧은 틱은 태거가 약한 영역이라 귀 판정 필요.
6. BGM: 5곡 모두 "sad melancholic" 이 "happy" 보다 높고, fruit 은 "music box lullaby" 가 "tropical" 보다 높음. 이번 범위의 조정으로는 움직이지 않음.
7. western 스핀 시작음이 새 pluck 때문에 745 ms 울림(전 228 ms) — 귀로 확인.

## 들어볼 파일

- 효과음 스템(최종): `C:/Users/parkk/AppData/Local/Temp/claude/e44e3bd3131a0c42/7a4e751a-17ec-4d49-a6fb-3a3c0dfd7b11/scratchpad/bgm/sfx/<preset>_<event>.wav` (preset: bell·fruit·western·shrine·clockwork, event: spin·reelstop·reelstops·winsmall·winbig·feature·mutation·riser·rollup, UI 는 bell_ui.wav)
- 수정 전 스템: `C:/Users/parkk/AppData/Local/Temp/claude/e44e3bd3131a0c42/7a4e751a-17ec-4d49-a6fb-3a3c0dfd7b11/scratchpad/bgm/sfx_before/` (같은 이름)
- 믹스(최종): `C:/Users/parkk/AppData/Local/Temp/claude/e44e3bd3131a0c42/7a4e751a-17ec-4d49-a6fb-3a3c0dfd7b11/scratchpad/bgm/<preset>_mix.wav`, SFX 만 `<preset>_sfx.wav`, BGM 만 `<preset>_duck.wav`, BGM `<preset>_base.wav` / `<preset>_free.wav`
- 원자료: `C:/Users/parkk/AppData/Local/Temp/claude/e44e3bd3131a0c42/7a4e751a-17ec-4d49-a6fb-3a3c0dfd7b11/scratchpad/bgm/sfx_check_final.json`, `mix_check.json`, `bgm_final.log`
