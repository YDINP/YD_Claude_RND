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

## 공용 사운드 담당 — 검수 소견 처리와 프리셋 구분 (2026-11-26)

검수 팀이 올린 사운드 소견 6건(FF-11·R12·F7·F12·F14·AC-08)을 처리하고, 게임 7종의 효과음·배경음을 earshot 수치로 서로 구별했다.
**수치는 참고값이고 최종 귀 판정은 사용자 몫이다.** 이번에도 귀로 듣지 않았다. 아래 "듣는 쪽이 확인할 것"에 귀 판정이 필요한 곳을 모았다.

렌더 방법은 위 "방법"과 같다(헤드리스 Chrome OfflineAudioContext + 가상 시계, 난수 고정). 스템은 이벤트별 WAV, 배경음은 20~50초 구간을 쟀다.
BGM 은 기본 음량 40%, 믹스는 같은 30초 장면. 하네스·스크립트는 저장소 밖 `D:/park/tgslot-wt/_qa/review-shared-sound/` 에 있다.

### 처리 요약

| 소견 | 조치 | 상태 |
|---|---|---|
| FF-11 candy·fruit 배경음이 거의 같다(CLAP 0.91) | candy 를 하우스풍 전자음 곡으로 다시 만듦(128bpm, 4박 킥·박수·뒷박 스탭·사각파 선율). **0.917 → 0.776** | 수치 해결, 귀 판정 필요 |
| FF-11 기대감 상승음 fruit/clockwork 0.968 | 프리셋마다 다른 소리를 깔도록 구조를 나눔(거품 사다리·태엽 톱니·방울뱀 꼬리·태고 연타·사탕 계단·스네어 롤). 6개 쌍 최대 0.991 → **0.854** | 수치 해결 |
| FF-11 작은 당첨이 BGM 에 가려짐(fruit +3.6 dB) | fruit 작은 당첨 −26.4 → −22.4 LUFS. 믹스에서 작은 당첨은 7종 모두 BGM 위 +4.7~+8.9 dB(전 최소 +3.6) | 해결 |
| FF-11 팝업·빅윈 오버레이 롤업 소리 없음 | `playCountUp(durationMs, tier)` / `stopCountUp()` 추가 — 오디오 시계에 틱+마감음을 미리 깐다. **호출은 범위 밖이라 아래 "연결할 곳" 필요** | 소리는 준비, 연결 대기 |
| R12 royal 이 classic-777 과 같은 소리 | royal 전용 효과음·배경음(브라스 라운지) 추가. **공용 타입 2줄과 theme.json 1줄이 필요**(아래) | 준비 완료, 켜기 대기 |
| R12 미스터리 공개음 주의(z 1.99) | 카드 뒤집기 + 시안빛 유리 반짝임으로 교체(`revealFlip`). bell 과 royal 이 같이 쓴다 | 해결(shared 없이도 적용) |
| F7 더블업 던지기·적중·실패 무음 | `playGambleToss/Win/Lose` + 프리셋별 레시피 7종. 서부는 금속 핑 / 나무 퉁. **호출 연결 필요** | 소리는 준비, 연결 대기 |
| F12 합성 총성이 총소리로 안 읽힘 | CC0 실제 녹음으로 교체(아래 출처). 합성 총성은 폴백으로 개선 | 해결 |
| F12 서부 확장음이 종소리 | 확장 와일드를 금속 슬램(충격 + 비정수 금속 배음 + 저역 몸통)으로 교체 | 해결 |
| F14 shrine 롤업 약함(z 1.9) | 틱에 동전 핑을 얹어 보니 1.91 로 오히려 낮아 레시피를 그대로 뒀다(같은 조건 재렌더 2.00 → 1.97, 변화 없음). 3초 숫자 올라가기(`playCountUp`)는 1.8. 짧은 틱은 태거 한계라 귀 판정 필요 | 수치 변화 없음, 귀 판정 |
| AC-08 확장과 승급이 같은 소리 | `playMutation('expandWild' \| 'upgrade' \| …)` 로 종류별 소리. clockwork 확장(빛 기둥)·승급(래칫 + 두 음) CLAP 코사인 **1.00 → 0.787** | 해결, 연결 필요 |

### 바뀐 파일

- `apps/hub/src/lib/audio.ts` — 레시피에 `anticipate`(프리셋 고유 기대감)·`gambleToss/Win/Lose`·`mutation(kind)` 추가. 새 공개 함수: `playGambleToss` `playGambleWin` `playGambleLose` `playCountUp` `stopCountUp` `playMutation(kind?)` `hasGunshotSample`. 새 프리셋 `royal`.
- `apps/hub/src/lib/audioSamples.ts` — 실제 녹음 총성(PCM16 32 kHz, 45 KB). 별도 청크라 서부 게임을 열 때만 내려받고(61 KB, gzip 40 KB), 프리셋을 떠나면 메모리에서 버린다.
- `apps/hub/src/lib/bgm.ts`·`bgmVoices.ts` — candy 곡·악기 재작성, royal 곡·악기, western(하모니카·밴조·88bpm)·shrine(62bpm·쇼 패드 강조) 조정.
- `apps/hub/src/lib/audio.test.ts`·`bgm.test.ts` — 새 소리·프리셋 테스트. hub 전체 577 테스트 통과, `pnpm -r typecheck` 통과, `build:demo` 통과.
- 기존 프리셋 이름·키는 그대로다. 레시피 인터페이스에 선택 필드만 더했다.

### 숨은 클릭 버그를 같이 고쳤다

기존 `tone`·`noise`·`pluck` 은 게인 노드를 만든 뒤 자동화를 시작 시각에야 0.0001 로 눌렀다. 그 사이 첫 한 샘플이 기본 게인 1 로 새어 나가서, 사각파·잡음 틱의 시작에 **한 샘플짜리 풀스케일 클릭**(최대 0.54)이 생겼다.
수정 전 렌더 기준선에서도 `clockwork_rollup`·`clockwork_spin`·`western_spin` 등에서 나왔다(`tail −180 dB` 점검은 꼬리만 봐서 못 잡았다). 게인을 먼저 0 으로 두도록 고쳐서 **전 스템 단일 샘플 스파이크 0개**. 기대감 소리의 게인도 같은 방식으로 고쳤다.

### 총성: 실제 녹음 (real-sound 절차)

| 항목 | 기록 |
|---|---|
| 선택 | Freesound #683175 「357 Magnum Revolver Gunshot with Tail」 — Shark_Anthony |
| 라이선스 | **CC0 1.0** (항목 페이지 라이선스란에 "Creative Commons 0", 2026-11-26 확인). 표기 의무 없음, 상업 이용 가능 |
| 후보(같은 날 같은 방식으로 CC0 확인) | #34708 「44_black_powder」(22초, 여러 발) · #683186 「357 Magnum Revolver Gunshot」(0.9초). #683175 가 꼬리 포함·앞소리가 깨끗해 채택 |
| 받은 파일 | 항목의 HQ 미리듣기 ogg(원본 WAV 아님), SHA-256 `9cb9821c5c2e8afa…1154` |
| 가공 | 주 폭발 4 ms 앞부터 0.7초, 모노, 32 kHz 16비트, 끝 120 ms 페이드, 피크 −1 dBFS. 가공본 SHA-256 `5d04ab6e…ea` |
| earshot 가공본 단독 | “a gunshot” **z +4.5 강함**(322개 어휘 중 1위) · realness “real or pro-produced” p_real 0.84. 24 kHz 가공본은 +3.2, 0.9초 가공본 +5.0 |
| 앱 안(마스터 컴프레서·BGM 없음) | 큰 당첨 앞 0.34초 구간 “a gunshot” **z +0.3 → +2.5**, 피처 +2.4. 실녹음이라 구간 realness 도 “real or pro-produced” 0.77~0.79 |
| 큰 당첨에서 총성이 묻히던 이유 | 동전 흩뿌리기가 0초부터 총성 위에 깔렸다. 흩뿌리기를 총성 뒤 0.34초로 늦추고 기타 쓸기도 같이 늦춤(첫 z +1.4 → +2.5) |
| 폴백 | 샘플이 아직 안 풀렸거나 실패하면 계산으로 만든 합성 총성(1.8 ms 크랙 + 28 ms 폭발 + 140→50 Hz 몸통 + 120/260 ms 반사)이 나온다 |

CC0 라 크레딧 줄은 필수가 아니지만 출처는 `audioSamples.ts` 머리말에 적었다. 미리듣기 ogg 가 원본이 아니므로 마음에 안 들면 원본 WAV 를 받아 같은 가공을 다시 하면 된다(Freesound 로그인 필요).

### 배경음 구분 (CLAP 코사인, 20~50초, 높을수록 비슷)

| 쌍 | 전 → 후 (기본곡) | 전 → 후 (라운드/free) |
|---|---|---|
| **candy – fruit** | 0.917 → **0.776** | 0.890 → 0.714 |
| candy – fruit 외 나머지 | ≤ 0.877 → ≤ 0.799(royal) | ≤ 0.872 → ≤ 0.813(royal) |
| western – shrine | 0.958 → **0.910** | 0.937 → 0.851 |
| fruit – clockwork | 0.883 → 0.883 | 0.904 → 0.904 (**남음**) |
| 7곡 전체 최대 쌍 | 0.958 → 0.910 (western/shrine) | 0.937 → 0.904 (fruit/clockwork) |

- candy 가 달라진 점: 빠르기 116 → **128 bpm**, 마림바·글로켄 → **사각파 선율 + 톱니 스탭**, 핑거 스냅 → **박수**, 킥이 2·4박 → **4박 전부**, 베이스가 박 위 → **뒷박**, 16분 신스 플럭 아르페지오, 라운드의 대선율은 마림바 → 높은 플럭. fruit(108bpm, 마림바·스틸드럼·셰이커·콩가)와 성격이 반대다.
- 기본 LUFS −31.2(전 −31.0), 라운드 −30.0. earshot 이 읽은 조성은 D 장조로 설계값과 같다. `bpm` 필드는 이번에도 읽히지 않았다(설계값 128).
- western – shrine 은 둘 다 뜯는 현악이라 CLAP 이 한 군으로 묶는다. western 은 하모니카 선율·밴조 아르페지오·88bpm 으로, shrine 은 62bpm·쇼 패드를 키워 갈랐고 0.910 까지 내렸다. 더 내리려고 shrine 아르페지오를 종소리로 바꿔 보니 western 과는 0.860 으로 떨어졌지만 clockwork 와 0.927 로 붙어서 되돌렸다(고토가 신사의 정체성).
- 최종 BGM LUFS(기본/라운드): bell −30.4/−29.4 · fruit −32.0/−30.5 · western −31.2/−30.7 · shrine −29.5/−29.2 · clockwork −31.2/−31.1 · candy −31.2/−30.0 · royal −31.0/−30.3. 단일 샘플 스파이크 0.

### 효과음 구분 (같은 이벤트끼리 CLAP 코사인, 프리셋 7개)

| 이벤트 | 평균 전 → 후 | 가장 비슷한 쌍 전 → 후 |
|---|---|---|
| spin | 0.767 → 0.763 | fruit/candy 0.955 → candy/royal 0.856 |
| reelstop | 0.794 → 0.777 | bell/western 0.921 → shrine/candy 0.888 (bell/western 0.887) |
| reelstops | 0.777 → 0.747 | bell/western 0.918 → 0.883 |
| winsmall | 0.831 → 0.795 | clockwork/candy 0.956 → bell/clockwork 0.912 |
| winbig | 0.853 → 0.805 | clockwork/candy 0.956 → shrine/clockwork 0.922 |
| feature | 0.781 → 0.740 | clockwork/candy 0.882 → shrine/royal 0.861 |
| mutation | 0.787 → 0.673 | western/clockwork 0.880 → clockwork/candy 0.874 |
| riser | 0.873 → 0.701 | fruit/candy 0.991 → shrine/clockwork 0.854 |
| rollup | 0.790 → 0.791 | western/shrine 0.891 → clockwork/royal 0.907 |
| gtoss·gwin·glose (신규) | — | 0.822 · 0.911(western/royal) · 0.824 |

- 0.90 을 넘는 쌍이 남은 곳: winsmall bell/clockwork 0.912·clockwork/royal 0.911·bell/royal 0.906, winbig shrine/clockwork 0.922·bell/shrine 0.901, rollup clockwork/royal 0.907, gwin western/royal 0.911. 전부 "짧은 맑은 차임" 계열이라 CLAP 이 한 군으로 본다. 귀로 확인이 필요하다.
- bell ↔ royal(= classic-777 ↔ royal-diamond-777): spin 0.81 · reelstop 0.78 · reelstops 0.70 · winsmall 0.91 · winbig 0.86 · feature 0.81 · mutation 0.85 · riser 0.62 · rollup 0.86. 배경음은 0.772. 지금은 둘이 같은 `bell` 이라 1.00.
- candy ↔ fruit 효과음: spin 0.96 → 0.77, riser 0.99 → 0.80, winsmall 0.81 → 0.66, winbig 0.85 → 0.74.

### 게임 7종 구분표

| 게임 | 소리 세트 | 배경음 가장 가까운 곡(기본, CLAP) | 효과음 성격 |
|---|---|---|---|
| classic-777 | bell | fruit 0.786 | 라운지 종·동전 |
| fruit-fiesta | fruit | clockwork 0.883 | 거품 팝·마림바 |
| royal-diamond-777 | **royal** (켜기 전엔 bell) | candy 0.799 | 브라스 스탭·다이아 유리·카드·심벌·팀파니 |
| sheriff-sixgun | western | shrine 0.910 | 기타 뜯기·권총·실녹음 총성·박차 |
| shiba-shrine | shrine | western 0.910 | 종·딱따기·방울·태고 |
| astral-clocktower | clockwork | fruit 0.883 | 톱니 틱·유리·래칫 |
| candy-cluster-pop | candy | royal 0.799 | 신스 플럭·팝핑 캔디·거품 팝 |

### 새 소리 earshot 판독 (의도 문구 z, 짧은 원샷은 태거가 약하다)

| 소리 | 의도 문구 | z |
|---|---|---|
| western 확장 와일드(금속 슬램) | “a heavy metallic slam impact” | +2.74 (전 종소리 3음) |
| clockwork 확장 와일드(빛 기둥) | “a rising shimmering light sweep with a bright chord” | +2.27 |
| clockwork 승급(래칫 + 두 음) | “a ratchet click followed by two rising chime notes” | +3.21 |
| bell 미스터리 공개(카드 뒤집기) | “a short magical sparkle shimmer” | 1.08 → **2.21** |
| royal 더블업 | 던지기 +2.2 · 적중 +4.6 · 실패 +3.4 | |
| western 더블업 | 동전 핑 +2.8 · 적중 +3.9 · 실패 +2.0(최상위 “a kick drum” = 낮은 퉁) | |
| 기대감 7종 “a pulsing rising tension riser” | bell 2.0 · fruit 2.0 · western 2.3 · shrine 2.3 · clockwork 2.0 · candy 1.3 · royal 1.9 | 전: 1.95~2.68 |
| 숫자 올라가기 3초 `playCountUp` | “rapid coin counter ticks ending with a chime” | bell 1.6 · fruit 1.9 · western 2.0 · shrine 1.8 · clockwork 2.1 · candy 2.2 · royal 1.9 |

- 기대감은 단순한 사이렌/스윕 대신 프리셋 고유 소리를 깔게 되면서 일부 프리셋의 "tension riser" 판독이 낮아졌다(candy 2.56 → 1.3, fruit 2.68 → 2.0). 그래서 모든 기대감 밑에 가는 스윕(`sweepRise`)을 같이 깔아 "오르는 소리"로 읽히게 했다. candy 는 여전히 낮다.
- 릴 정지 5연속의 “mechanical thunks” 문구 z 는 프리셋 성격(거품·종·유리)과 맞지 않아 0~1.2 로 낮다. 해당 소리는 각 프리셋의 의도 문구로 따로 읽어야 한다(fruit “a bubbly pop” 2.65).
- 롤업 틱 짧은 소리의 “coin counter” z 는 bell 1.3 · fruit 1.3 · candy 1.6 처럼 계속 낮다(태거 한계). 귀 판정 필요.

### 레벨·믹스 (30초 장면, BGM 40%)

| 프리셋 | 믹스 LUFS | true peak | SFX−BGM dB: 릴 정지 / 작은 당첨 / 기대감 / 큰 당첨 / 피처 | 덕킹 dB: 기대감 / 큰 당첨 / 피처 |
|---|---|---|---|---|
| bell | −27.6 | −5.5 | +3.5 / +6.0 / +7.8 / +11.7 / +22.5 | −3.7 / −5.0 / −13.0 |
| fruit | −28.8 | −5.9 | +5.9 / +5.8 / +9.8 / +11.7 / +20.8 | −3.6 / −4.8 / −11.2 |
| western | −27.1 | −7.4 | +4.4 / +6.6 / +10.0 / +14.5 / +21.8 | −5.4 / −4.7 / −11.6 |
| shrine | −26.1 | −6.2 | +3.6 / +4.7 / +6.2 / +15.5 / +22.2 | −3.1 / −4.6 / −12.7 |
| clockwork | −27.3 | −7.8 | +7.0 / +8.9 / +9.6 / +12.1 / +24.7 | −6.0 / −4.7 / −12.5 |
| candy | −27.8 | −7.4 | +8.4 / +6.7 / +12.9 / +14.2 / +20.1 | −7.4 / −7.8 / −12.8 |
| royal | −27.1 | −4.6 | +3.5 / +6.6 / +6.8 / +12.7 / +23.9 | −4.6 / −5.2 / −12.5 |

- 7종 모두 클리핑 0, true peak ≤ −4.6 dBTP(기준 ≤ −1). 작은 당첨은 BGM 위 +4.7 dB 이상(전 fruit +3.6). 가장 가려지기 쉬운 곳은 릴 정지(bell·royal·shrine +3.5~3.6 dB)다. 릴 정지는 짧은 딸깍이라 의도된 크기지만 귀로 확인할 것.
- 단독 스템 레벨(LUFS) 편차: 작은 당첨 −21.0~−27.9 → **−22.4~−24.9**, 큰 당첨 −19.0~−28.7 → **−19.0~−22.7**, 피처 −19.3~−25.5 → **−19.7~−23.9**. 기대감은 −26.0~−30.5.
- 서부 확장 슬램은 처음 −22.6 LUFS·−2.3 dBTP 로 너무 커서 −27.0·−6.7 로 낮췄다.

### 연결할 곳 (범위 밖 — 리드가 반영)

이 소리들은 만들어 뒀지만 호출은 `GameScreen.tsx`·팝업 컴포넌트 안이라 사운드 범위 밖이다. 아래를 넣어야 들린다.

| 위치 | 바꿀 것 |
|---|---|
| `GameScreen.tsx` `handleRendererEvent` 의 `mutation` 분기(약 L678) | `playMutation()` → `playMutation(event.mutation.type)` — 이것만으로 clockwork 확장/승급, 서부 슬램, royal 미스터리가 종류별로 난다 |
| `GameScreen.tsx` `handleGamblePick`(약 L1417) | 맨 앞 `setGambleFlip({ flipping: true … })` 다음에 `playGambleToss()`, 결과가 나온 뒤 `outcome === 'win'` 이면 `playGambleWin()`, `'lose'` 면 `playGambleLose()` (`'collected'` 는 무음) |
| `WinCelebrationOverlay.tsx`(약 L67 `useWinRollup(totalWin, timing.rollupMs)`) | 롤업이 시작할 때 `playCountUp(timing.rollupMs, tier)`, 건너뛰기·닫기에서 `stopCountUp()` 후 `playRollupEnd(tier)` |
| `RoundPopup.tsx`(약 L84~86 `useWinRollup(target, duration)`) | 같은 방식으로 `playCountUp(duration, tier)` |
| `packages/game-sdk/src/theme.ts` `SOUND_PRESETS` 와 `packages/renderer/src/types.ts` `SoundPreset` | 두 곳에 `'royal'` 추가. 그다음 `games/royal-diamond-777/theme/theme.json` 의 `sound.preset` 을 `"royal"` 로. 허브 쪽은 이미 `royal` 을 안다(`AudioPreset = SoundPreset \| 'royal'`, 공용에 들어가면 자동으로 같은 타입) |

다른 신작 팀이 `SOUND_PRESETS` 에 `deepsea` 등을 더하고 있어서 같은 줄에서 충돌한다. 합칠 때 `royal` 도 같이 넣으면 된다.

### 듣는 쪽이 확인할 것 (귀 판정)

1. candy 배경음이 fruit 과 확실히 다른지, 128bpm 하우스풍이 "캔디 팝" 분위기에 맞는지(CLAP 0.776 이지만 취향은 귀).
2. 서부 총성이 총소리로 들리는지, 큰 당첨에서 기타 쓸기와 박자가 어색하지 않은지. 서부 스핀 시작음이 745 ms 울리는 것도 확인(이전부터).
3. 서부 금속 슬램이 "쇠 소리"로 들리는지(CLAP 은 +2.7 로 약하게만 읽는다).
4. royal 브라스 라운지 배경음과 효과음이 classic-777 과 구별되는지, 카드 뒤집기 소리가 자연스러운지.
5. 기대감 6종이 "긴장이 오른다"로 들리는지(candy 계단 소리의 z 1.3 이 가장 불안).
6. 롤업 틱(bell·fruit·candy)이 코인 카운터처럼 들리는지, 릴 정지 5연속이 피곤하지 않은지.
7. winsmall·winbig 에서 CLAP 0.90 을 넘는 쌍(bell/clockwork/royal/shrine)이 귀로도 같은 소리인지.

### 들어볼 파일 (저장소 밖)

- 효과음 스템 `D:/park/tgslot-wt/_qa/review-shared-sound/final/<프리셋>_<이벤트>.wav` (프리셋: bell·fruit·western·shrine·clockwork·candy·royal / 이벤트: spin·reelstop·reelstops·winsmall·winbig·feature·mutation·riser·rollup·gtoss·gwin·glose·mut_expand·mut_upgrade·countup·countup2)
- 배경음 `final/bgm_<프리셋>_<base|free>.wav`, 믹스 `final/mix_<프리셋>_<mix|sfx|duck>.wav`
- 수정 전 기준선 `base/` (같은 이름, royal 은 없음), 총성 후보와 가공본 `dl/`
- 원자료 `final/_sfx_cos.json`·`_meas.json`·`_intent.json`·`_bgm_cos.json`·`_mix.json`, 브라우저 확인 스크린샷 `shots/smoke-*.png`
