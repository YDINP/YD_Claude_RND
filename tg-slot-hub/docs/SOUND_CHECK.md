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

## candy-cluster-pop 사운드 (H10·H11) — 2026-11-11

`candy` 프리셋의 전용 레시피(`CANDY_RECIPE`)와 연쇄·주문 카드 효과음 6종, 전용 BGM을 earshot 으로 듣고 잰 기록. 방법은 위와 같고 스템은 `candy_<이벤트>.wav`, BGM 은 BGM 40% 기본 음량으로 렌더했다. **수치는 참고값이고 최종 귀 판정은 사용자 몫이다.**

### 효과음 (G 장조 펜타토닉 2옥타브, G5~E7)

| 항목 | 결과 |
|---|---|
| 연쇄 팝 1→10단계 | 최대 스펙트럼 피크 866 → 979 → 1099 → 1319 → 1470 → 1752 → 1962 → 2178 → 2600 → 2912 Hz, **단조 증가**. 단위 테스트(`audio.test.ts`)도 같은 증가를 확인 |
| 사다리 상승음 0→6 | 988 → 1175 → 1318 → 1568 → 1760 → 1976 → 2349 Hz, 단조 증가 |
| 클릭·잘린 꼬리 | 13개 스템 전부 마지막 10 ms 꼬리 −180 dB, 클리핑 0 |
| true peak | 전 스템 −9.3 dBTP 이하(가장 큰 `chain` −9.4, `winsmall` −9.3). **−1 dBTP 이하 충족** |
| 믹스(30초 장면, BGM 40%) | −25.4 LUFS, true peak −7.4 dBTP, 클리핑 0 |

| 스템 | LUFS | dBTP | earshot 판독 |
|---|---|---|---|
| pops(10단계) | −28.6 | −10.6 | “rising short bubble pops in ascending musical notes” z +2.88 (그럴듯) |
| ladder | −26.1 | −12.3 | — |
| drop | −40.7 | −22.6 | 조용한 보조음(의도) |
| ordertick | −31.2 | −14.9 | “short marimba ticks” z +3.70 (강함) |
| ordercomplete | −20.7 | −9.7 | “a rubber stamp thud followed by three rising glockenspiel notes” z +3.25 (강함) |
| orderdeal | −35.3 | −19.0 | 조용한 보조음(의도) |
| chain(5단계+틱+완료+깔기) | −24.4 | −9.4 | “playful candy game sound effects with rising pops and chimes” z +2.42 (약함) |
| spin / reelstop / winsmall / winbig / feature / rollup | −44.7 / −32.3 / −24.6 / −26.9 / −19.2 / −21.6 | −20.6 ~ −9.3 | 레시피 공통 6종, 클릭 없음 |

### BGM (116 bpm, D 장조, 글로켄 선율 + 통통 신스 베이스 + 핑거 스냅)

| 항목 | candy | fruit(비교) |
|---|---|---|
| 기본 LUFS | **−31.6** (목표 −30~−32 충족) | −32.0 |
| 라운드 변주 LUFS | **−30.7** | −30.4 |
| true peak | −17.7 / −16.9 dBTP, 클리핑 0 | −17.1 / −15.4 |
| “happy upbeat cheerful” z | +3.25 (기본) | +2.45 |
| “bouncy synth bass pop music with glockenspiel and finger snaps” z | +3.70 | +4.28 |

- **fruit 와의 구분**: `ab`(candy vs fruit) CLAP 코사인 **0.91** — 모델은 둘을 거의 같은 소리로 듣는다(참고: 기존 fruit/clockwork 0.89, western/shrine 0.98). 측정 차이는 candy 가 더 밝다(중심 685 Hz vs 463 Hz). 튜닝 라운드를 3번 돌렸지만 0.92 → 0.91 로만 움직였다. 둘 다 밝은 팝·말렛 질감이라 CLAP 이 같은 군으로 묶는 것으로 보인다. **구분은 귀로 확인이 필요하다.**
- 라운드 변주(free): 반음 위(+1), 16분 하이햇, 마림바 대선율 추가. candy_base↔candy_free 코사인 0.93.
- BGM `bpm` 필드는 earshot 이 읽지 못했다(None). 설계값 116 이다.

### 파일

- 효과음 스템: `C:/Users/parkk/AppData/Local/Temp/claude/e44e3bd3131a0c42/7a4e751a-17ec-4d49-a6fb-3a3c0dfd7b11/scratchpad/bgm/sfx/candy_<pops|ladder|drop|ordertick|ordercomplete|orderdeal|chain|spin|reelstop|winsmall|winbig|feature|rollup>.wav`
- BGM·믹스: `C:/Users/parkk/AppData/Local/Temp/claude/e44e3bd3131a0c42/7a4e751a-17ec-4d49-a6fb-3a3c0dfd7b11/scratchpad/bgm/candy_base.wav`, `candy_free.wav`, `candy_mix.wav`, `candy_sfx.wav`(SFX만), `candy_duck.wav`(BGM만, 덕킹 포함)
- 원자료: `scratchpad/bgm/candy_sfx_check.json`

## kraken-cove 사운드 (`deepsea` 프리셋) — 2026-11-26

`deepsea` 프리셋의 기본 레시피 9종, 코인 리스핀 전용 소리 9종, 전용 BGM(base·free)을 earshot 으로 듣고 잰 기록. 방법은 위와 같다(실제 `audio.ts`를 헤드리스 Chrome OfflineAudioContext + 가상 시계로 렌더, 스템별 `match`·`describe`·`measure`·CLAP 코사인, BGM 40% 기본 음량의 믹스 렌더).
**수치는 참고값이고 최종 귀 판정은 사용자 몫이다.** 코드는 `apps/hub/src/lib/audioDeepsea.ts`(레시피·리스핀 전용 소리), `bgmDeepsea.ts`(악보), `bgmVoices.ts`의 `DEEPSEA_KIT`(악기), `respinSfx.ts`(이벤트 → 소리 표)다. `audio.ts`는 import 한 줄·`RECIPES.deepsea` 한 줄·위임 export 9개만 더했다.

### 소리 설계 (바닷속 보물 동굴: 물방울·소나·금화·종)

| 이벤트 | 소리 | 다른 프리셋과 다른 점 |
|---|---|---|
| 스핀 시작 | 대역 잡음 상승(450→2600 Hz) + 기포 «뽀글» 4개 | 팝·딸깍 대신 물속 질감 |
| 릴 정지 | 올라가는 기포음(360→700 Hz, 70 ms) + 작은 고음 «똑» | 킥 구조 아님. «bubble pop»으로 읽힘 |
| 작은 당첨 | 둥근 종(핸드팬결) 3음 + 물방울 3개 + 기포 흩뿌림 | 글로켄·마림바와 다른 정수 배음 계열(기음 + 살짝 어긋난 기음 + 2배음 + 3.02배음) |
| 큰 당첨 | 파도가 차오름(저역 잡음·사인 상승) → 마루에서 부서짐 → 종 화음 → 금화 쏟아짐 | 등급이 오를수록 화음 3→5음, 금화가 촘촘 |
| 피처 | 기포 휘익(300→3600 Hz) + 사인 상승 + 종 6음 상행 | |
| 기대감 | 삼각파 87→290 Hz, 2 Hz 느린 맥동 | 사이렌 아님(최상위 «uplifter sweep») |
| 코인 착지(진입 판) | 금화 «칭»(2.1 kHz·3.3 kHz 비정수 배음, 80 ms), 알마다 반음씩(7단) | |
| 빈 칸 회전 | 낮은 소나 «핑» 880 Hz + 메아리 2회 | |
| 코인 고정 | «철컥»(110→72 Hz 몸통 + 대역 잡음) + «칭». 한 라운드 안에서 고정마다 반음씩 오름(12단 = 정확히 1옥타브) | 진행감 |
| 횟수 리셋 | 소나 3음 상행(도·미·솔) | |
| 마지막 한 번 | 60 Hz 심장 박동 2타(+2배음으로 폰 스피커에서도 들림) | 긴장 |
| 촉수 감기 | 시작: 톱니 80→160 Hz 로우패스 슬라이드 + 거품 폭발 / 끝: «띠링» 2음(C6→G6) 확정음 | 게임의 얼굴 소리 |
| 보물 작은/중간/큰 | 종 화음 2/3/4음 + 금화 장식 1/2/3개(큰 것은 저역 상승 추가) | |
| 정산 틱 | 금화 «틱», 높이는 진행률 | 기획은 롤업 틱 재사용이었음 → 아래 «기획 대비» |
| 최고 보물 | 톱니 3화음 팡파르 4연타 + 심벌 잡음 + 종 | 2.2 s 배경음 덕킹 |

### 기본 레시피 9종 (스템별)

| 이벤트 | 의도 문구 최고 z | 최상위 판독 | LUFS / dBTP | decay ms | 기존 6개 프리셋과 최대 CLAP 코사인 |
|---|---|---|---|---|---|
| spin | “a bubbling underwater loop” +2.72 (그럴듯) | a water drop +3.04 | −39.4 / −18.4 | 157 | 0.85 (shrine) |
| reelstop | “a water droplet plink” +3.35 (강함) | a bubble pop +3.59 | −30.2 / −10.2 | 48 | 0.78 (fruit) |
| reelstops(5연속) | “a series of water droplet plinks” +2.92 | bubbles underwater +3.74 | −28.8 / −9.5 | 48 | 0.83 (fruit) |
| winsmall | “a small round bell arpeggio with bubbles” +3.20 (강함) | a magic sparkle chime +3.38 | −22.5 / −10.1 | 462 | 0.86 (bell·shrine) |
| winbig(3초 롤업) | “a wave crash with gold coins and bells” +1.88 (불일치) | a success chime +2.69, bubbles underwater +2.67 | −24.2 / −5.7 | 463 | 0.90 (western) |
| feature | “a rising underwater bubble whoosh into a round bell arpeggio” +3.03 (강함) | a success chime +3.82 | −20.4 / −9.1 | 419 | 0.89 (candy) |
| mutation | “a short magical bubble sparkle” +2.74 | a success chime +3.75 | −24.0 / −12.2 | 460 | 0.84 (clockwork·candy) |
| riser | “a slow deep pulsing underwater swell” +1.56 (불일치) | an uplifter sweep +3.51 / downlifter +3.44 (사이렌 아님) | −23.3 / −15.4 | 854 | 0.86 (shrine) |
| rollup | “rapid coin counter ticks ending with a chime” +2.05 (약함) | a kalimba note +3.04 | −23.4 / −10.0 | 400 | 0.90 (candy) |

- **목표 «candy·fruit·기존 프리셋과 같은 이벤트 CLAP 코사인 ≤ 0.90»**: 최대 0.903(큰 당첨·롤업·western/candy). 사실상 충족. 기존 프리셋끼리의 이벤트별 최대는 0.88~0.99라 비교 기준보다 낮다.
- 클릭·잘린 꼬리: 마지막 10 ms 꼬리 전 스템 −240 dB(무음), 클리핑 0, true peak 전부 −5.7 dBTP 이하(기준 ≤ −1).
- 큰 당첨은 «파도 + 금화»를 모델이 chime 으로 읽는다(의도 z 1.88). 롤업 틱은 짧은 틱이라 태거가 약한 영역이다(기존 프리셋도 1.7~2.5). **둘 다 귀 판정으로 넘긴다.**

### 코인 리스핀 전용 소리 (이벤트 → 소리는 `respinSfx.ts`)

| 렌더러 이벤트 | 소리 |
|---|---|
| `respinPulse`(진입 펄스, 코인마다) | 코인 착지 «칭», 알마다 반음 |
| `respinStart` | 피처 소리(`playFeature`) |
| `respinStep` start | 소나 «핑». 마지막 회차면 심장 박동 추가 |
| `respinStep` land(새 코인 없음) | 물방울 «똑»(릴 정지) |
| `respinStep` pin | 코인 고정음. 한 번에 두 코인이면 둘째를 90 ms 미룬다(반음 단계가 올라 겹치지 않게) |
| `respinStep` end | 남은 횟수가 **늘었을 때만** 소나 3음(처음 3회 상태에서 새 코인이 붙은 경우는 조용) |
| `columnWrap` start / end | 촉수 우웅 / «띠링» 2배 확정음 |
| `respinCollect` | 보물이면 크기별 종 화음, 숫자 코인이면 정산 금화 틱 |
| `respinTop` start | 최고 보물 팡파르 |

| 스템 | LUFS | dBTP | earshot 판독 |
|---|---|---|---|
| coinlands(8알 상행) | −24.5 | −10.5 | “eight gold coins clinking one after another rising in pitch” z +3.18 (강함) |
| sonar | −24.8 | −11.0 | “a soft sonar ping” z +2.77 (그럴듯) |
| pins(고정 13단) | −21.1 | −3.9 | “a metal clack followed by a gold coin ring, rising in pitch” z +1.55 (불일치, 최상위 kalimba note +2.94) |
| reset | −27.6 | −16.4 | “a three note ascending soft chime” z +3.32 (강함) |
| last(심장 박동) | −27.1 | −9.7 | “two deep heartbeat thumps” z +2.07, 최상위 **a kick drum +3.69** |
| wrap(시작+끝) | −23.7 | −9.4 | “a deep rumbling swell with bubbles then two bright rising dings” z +2.16 (약함), 최상위 liquid bloop +3.05 |
| 보물 작은 / 중간 / 큰 | −22.8 / −21.7 / −19.9 | −9.7 / −9.3 / −8.4 | 작은 +3.09(강함), 큰 +1.81(최상위 success chime +4.26) |
| settle(8틱) | −25.1 | −10.6 | 조용한 보조음(의도) |
| top(팡파르) | −23.2 | −6.2 | “a triumphant brass fanfare” z +2.07 (약함), 최상위 success chime +3.99 |
| respinround(한 라운드 5.85 s) | −23.5 | −5.2 | “a game round of sonar, coin clacks and bells” z +2.12 (약함) |

- **고정음 음높이**: 0 / 6 / 12단의 스펙트럼 피크 1800 / 2546 / 3600 Hz — **12단이 정확히 1옥타브**, 상한(12단)에서 멈춘다. 단위 테스트(`audio.test.ts`·`respinSfx.test.ts`)도 13단 단조 증가·상한 정지를 확인한다. 진입 판 코인 착지도 7단 단조 증가·상한 정지.
- 기존 대표 소리(candy winsmall·feature, bell winsmall, fruit mutation)와의 최대 코사인 ≤ 0.89.
- 클리핑 0, 꼬리 −240 dB(`respinround`는 5.85 s 구간 절단이라 −51.8 dB, 게임 소리 문제 아님), true peak 전 스템 −3.9 dBTP 이하.
- 심장 박동은 의도대로 «킥» 구조(62→42 Hz)라 모델이 kick 으로 읽는다. SOUND_CHECK 의 «킥 구조 금지»는 릴 정지에 대한 교훈이었고 여기서는 **긴장 연출용이라 의도한 구조**다. 귀로 확인할 것.

### 배경음 (96 bpm, D 믹솔리디안, 칼림바 아르페지오 + 둥근 종 선율 + 둥근 사인 베이스, 기본 꺼짐)

| 항목 | deepsea | 비고 |
|---|---|---|
| 기본(base) LUFS / dBTP | **−31.8** / −19.1 | 목표 −30~−32 충족 |
| 라운드 변주(free) LUFS / dBTP | **−31.4** / −19.1 | 클리핑 0 |
| 밝기 / 중심 주파수 | base 409 / 308 Hz → free 665 / 409 Hz | 기존 BGM(중심 330~657 Hz)보다 어둡다 |
| “calm underwater ambient music with soft round bells and kalimba” | **+4.24 (base) / +4.49 (free)** | fruit +3.81, candy +2.92 |
| “happy upbeat cheerful” | +1.69 | 느긋한 곡이라 낮은 게 맞다(fruit +2.85, candy +3.24) |
| 최상위 판독 | a music box melody +3.53 (base) | |
| **base ↔ free CLAP 코사인** | **0.967** | **목표 ≤ 0.93 미달.** 기존 프리셋은 bell 0.929 / candy 0.959 / western 0.962 / fruit 0.973 / clockwork 0.981 / shrine 0.983 |
| 가장 비슷한 기존 BGM | clockwork_base 0.943, fruit_base 0.923, (free: clockwork_free 0.948) | 둘 다 부드러운 말렛·패드 질감 |

- free(라운드) 변주: 두 반음 위, 아르페지오 한 옥타브 위(+12)·템포 1.06배, 박마다 둥근 북(심장 같은 맥), 16분 하이햇, 소나 핑 대선율. 악보는 `bgmDeepsea.ts`.
- 시도 기록: ① 변주를 크게(아르페지오 +5 → +12, 템포 1.04 → 1.06, 둥근 북, 하이햇 음량↑) 해도 0.972 → 0.967. ② 파도 잡음 타악(snare 자리의 저역 잡음 swell)을 더해 봤으나 0.968, fruit_base 와의 코사인이 0.923 → 0.933 으로 오히려 가까워져 **되돌렸다**. CLAP 이 «말렛 + 패드 계열의 느린 음악»을 한 군으로 묶는 것으로 보인다. **구분은 귀로 확인이 필요하다.**
- `bpm` 필드는 earshot 이 읽지 못한다. 설계값 96 이다.

### 믹스 (BGM 40% 기본 음량)

30초 장면(스핀 → 기대감 + 큰 당첨 → 피처 + 커튼 → 스핀): 믹스 −26.9 LUFS, true peak −5.8 dBTP, 클리핑 0.

| 구간 | 릴 정지 | 작은 당첨 | 기대감 | 큰 당첨 | 피처 |
|---|---|---|---|---|---|
| SFX − BGM (dB) | +3.6 | **+9.2** | +13.7 | +13.7 | +25.8(커튼 덕킹 겹침) |
| BGM 덕킹(조용한 구간 대비) | | | −4.5 | −4.9 | −13.9 |

코인 리스핀 장면(free BGM 위에 소나 → 고정 2개 + 리셋 → 마지막(심장) → 촉수 감기 → 보물 → 정산 틱 → 팡파르 → 큰 당첨, 20초): 믹스 −24.8 LUFS, true peak −4.8 dBTP, 클리핑 0.

| 구간 | 소나 | 코인 고정 | 마지막(심장) | 촉수 감기 | 보물 | 정산 틱 | 팡파르 | 큰 당첨 |
|---|---|---|---|---|---|---|---|---|
| SFX − BGM (dB) | +2.8 | **+5.4** | +7.5 | +6.1 | +6.0 | +4.4 | +14.6 | +13.5 |
| BGM 덕킹 | | | −2.9 | | | | −7.6 | −8.0 |

- 기획의 믹스 기준(작은 당첨 ≥ +3 dB, 코인 고정 ≥ +5 dB)을 충족한다. 소나(+2.8)는 회차마다 반복되는 배경 맥이라 일부러 낮게 뒀다.

### 기획 대비 바뀐 것

1. **정산 틱**: 기획은 «롤업 틱 레시피 재사용»이었으나 free BGM 위에서 −13.0 dB 로 완전히 묻혔다(틱 음량 0.05). 전용 금화 «틱»(`settleTick`, 음량 0.3)으로 바꿔 +4.4 dB 가 됐다.
2. **릴 정지**: 기획의 «사인 1200→420 Hz 하강»은 첫 렌더에서 “a digital glitch” +2.78 로 읽혔다. 실제 물방울 소리는 위로 휘므로 «올라가는 기포음 360→700 Hz + 고음 똑»으로 바꿨다 → “a bubble pop” +3.59.
3. **기대감**: 첫 렌더(사인 98→330 Hz)가 shrine 과 0.92 였다. 삼각파 87→290 Hz·맥동 2 Hz 로 낮춰 최대 0.86.
4. **큰 당첨**: 첫 렌더(종 아르페지오 중심)가 shrine 과 0.94 였다. 파도 → 마루 화음 → 금화 쏟아짐 구조로 바꿔 최대 0.90.
5. **베이스 8분 오스티나토**는 악보 구조(변주별 베이스 무늬 없음)상 free 전용으로 넣을 수 없어, free 에 «박마다 둥근 북»을 넣는 것으로 긴장을 대신했다.
6. **파일 구조**: 효과음은 `createDeepseaAudio(kit)` 팩토리(`audio.ts`의 `tone`·`noise`·`live`·덕킹을 넘겨받음)라 `audio.ts` 와 순환 import 가 없다. 악기는 `BgmVoices`의 `Kit` 타입이 비공개라 `bgmVoices.ts`의 `DEEPSEA_KIT`에 뒀다(`bgmDeepsea.ts`는 악보만).
7. **코인 착지 «칭»과 정산 틱**처럼 금화 소리를 공유하는 소리는 같은 `coin` 음색에서 나온다(음높이·음량만 다름).
8. **2차 QA(2026-11-26) 배선 변경**(새 레시피 없음, earshot 재측정 없음): 보물 코인이 **붙는 순간**에도 고정음 140 ms 뒤 그 단계의 종 화음(`tsmall|tmedium|tlarge`, 정산 때와 같은 소리)을 얹는다 — «보물 등장» 박자. 카운터 리셋음은 «남은 횟수가 늘었을 때»가 아니라 «새 코인이 붙을 때마다» 난다(이미 3회여도). 미뤄 둔 소리(둘째 고정음·보물 종)는 새 스핀·게임 이탈 때 취소된다.
9. **3차 QA(2026-11-26) 배선 변경**(새 레시피 없음, earshot 재측정 없음): 코인 리스핀 정산 뒤 빅윈 오버레이가 **무음**이던 것을 고쳤다. 일반 판의 큰 당첨 소리는 렌더러 `winTotal`에서 나는데, 리스핀은 그 이벤트 없이 오버레이가 먼저 떠서 «큰 당첨 → 롤업 틱 → 마감음»이 한 번도 울리지 않았다(계측: 리스핀 3판 win·rollup 노드 0개). 이제 오버레이의 롤업 박자(`onRollPhase`: 굴리기 시작 → 앉음, 탭 건너뛰기 포함)에 맞춰 `respinSfx.playRespinCelebration`이 같은 레시피(deepsea `winBig` 파도→종 화음→금화, 틱, 마감음)를 낸다. 축하 등급 → 소리 등급은 문턱이 같다(SURGE·BLAST·STORM·CATACLYSM = big·mega·epic·max). 트리거 판의 라인 당첨이 복귀 뒤 `winTotal`로 다시 와도 그 판은 **작은 당첨 소리**만 낸다(큰 당첨 두 번 방지). 브라우저 계측(2026-11-26): 리스핀 6판 모두 오버레이 순간 winBig 노드 212~392개 + 틱 + 마감음 1회, 라인 당첨이 같이 난 판(808 = 780 + 28)은 큰 당첨 1회 + 복귀 뒤 winSmall 10노드.

### 귀로 확인할 것 (earshot 이 못 가르는 것)

- base ↔ free BGM 이 충분히 다르게 들리는지(0.967), 기존 clockwork·fruit BGM 과 구별되는지.
- 코인 고정음의 «철컥»이 금속 걸쇠로 들리는지(모델 판독은 kalimba note).
- 심장 박동(마지막 한 번)이 긴장감으로 들리는지, 큰 당첨의 «파도 + 금화», 최고 보물 팡파르가 금관으로 들리는지(모델은 chime 으로 읽음).
- 한 번에 두 코인이 붙을 때 둘째 고정음 90 ms 지연이 어색하지 않은지.
- 보물 코인이 붙을 때 고정음 → 140 ms 뒤 종 화음이 «보물이 왔다»로 들리는지, 정산 때 같은 종이 다시 울려 중복으로 느껴지지 않는지.
- 빠름·터보에서 소나·고정음이 겹쳐 시끄럽지 않은지.
- 정산이 끝나고 빅윈 오버레이가 뜰 때 큰 당첨 소리가 정산 금화 틱 바로 뒤에 붙어 과하지 않은지, 복귀 뒤 라인 당첨의 작은 소리가 군더더기로 들리지 않는지.
- 최종 귀 판정은 사용자 몫이다.

### 파일

- 스템·믹스: `D:/park/tgslot-wt/_qa/new-a-sound/wav/deepsea_<spin|reelstop|reelstops|winsmall|winbig|feature|mutation|riser|rollup>.wav`, 리스핀 전용 `deepsea_<coinland|coinlands|sonar|pin0|pin6|pin12|pins|reset|last|wrapstart|wrapend|wrap|tsmall|tmedium|tlarge|settle|top|respinround>.wav`
- BGM: `.../wav/bgm_deepsea_base.wav`, `bgm_deepsea_free.wav`(50초, 측정은 20~50초). 믹스: `mix_deepsea_{mix,sfx,duck}.wav`, 리스핀 장면 `rmix_deepsea_{mix,sfx,duck}.wav`
- 하네스·분석 스크립트: `.../new-a-sound/{setup.js,run.mjs,analyze.py,intent.py,mixcheck.py,bgmmatch.py}`, 전체 측정 로그 `final_all.txt`
