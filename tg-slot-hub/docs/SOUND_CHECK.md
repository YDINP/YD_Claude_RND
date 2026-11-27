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
## hanbok-night-market 사운드 (S 레인) — 2026-11-26

`hanbok` 프리셋의 전용 레시피(`HANBOK_RECIPE`), 말판 전용 효과음 10종, 전용 BGM(`HANBOK`)을 earshot 으로 듣고 잰 기록. **수치는 참고값이고 최종 귀 판정은 사용자 몫이다.** realness 는 합성음이 목적이라 정보로만 봤다(`winbig` p_real 0.004, BGM 0.23 — 둘 다 «likely code-synthesized», 의도대로).

### 방법

- 실제 `audio.ts`·`bgm.ts`·`bgmVoices.ts` 를 esbuild 로 한 덩어리로 묶어 헤드리스 Chrome 의 OfflineAudioContext 로 렌더했다. `Math.random` 은 고정하고 `setTimeout`/`setInterval`/`performance.now` 는 가상 시계로 바꿔서, 렌더가 매번 같은 소리를 낸다(스템 이벤트마다 6초 칸, 말판 이벤트는 4초 칸).
- 스템·하네스는 저장소 밖 `D:/park/tgslot-wt/_qa/new-b-sound/`(`setup.js`·`entry.ts`·`build.mjs`·`run.mjs`, 분석 `analyze.py`·`intent.py`·`peak.py`·`mixcheck.py`). 앞 절의 사운드 점검 하네스는 스크래치패드에서 사라져 새로 만들었고, 기존 프리셋 6개를 같은 방식으로 다시 렌더해 앞 절 값이 재현되는지 먼저 확인했다(shrine `winbig` −19.0 LUFS / −6.6 dBTP, 앞 절 −19.6 / −6.3).
- 비교 대상: 같은 이벤트를 bell·fruit·western·shrine·clockwork·candy 로 새로 렌더. 코사인은 earshot 의 CLAP 임베딩(`vocab.embed_files`)에서 직접 계산했다.
- 믹스는 30초 장면(스핀 → 기대감 + 큰 당첨 → 피처 + 커튼 → 스핀)을 합본 / 효과음만 / 음악만(효과음 음량 0, 덕킹은 그대로) 세 번 렌더했다. BGM 음량은 기본 40%.
- 태거 어휘에 한국 악기가 없다. 가야금·해금·꽹과리는 «kalimba / success chime / music box» 같은 가장 가까운 소리로 읽힌다 — 그래서 아래 «의도 문구 z»가 낮은 것은 소리가 틀렸다는 뜻이 아니라 태거가 이 악기들을 모른다는 뜻일 수 있다. 짧은 원샷(<0.5 s)은 태거가 더 약하다.

### 효과음 (평조 오음 G A B D E, G4~E6)

| 이벤트 | 소리(설계) | 의도 문구 최고 z | 최상위 판독 | LUFS / dBTP | decay ms |
|---|---|---|---|---|---|
| spin | 가야금 글리산도 5음 + 낮은 딸깍 루프 | “a quick ascending glissando of plucked zither strings” +3.07 | a magic sparkle chime +3.58 | −29.5 / −16.1 | 565 |
| reelstop | 장구 채편 «덕»(다섯째 릴은 궁편 «쿵» 겹침) | “a short hand drum slap” +3.42 | a snare hit +4.53 | −33.0 / −12.3 | 22 |
| reelstops | 릴 정지 5연속 | “a series of short hand drum hits ending with a deeper thump” +2.72 | a kick drum +3.91 | −26.7 / −5.8 | 82 |
| winsmall | 장구 «덩» + 가야금 3음 + 엽전 | “a short bright plucked string jingle” +1.55 | a success chime +3.46 | −20.4 / −9.6 | 707 |
| winbig | 해금 활 긋기 스웰 + 꽹과리 + 가야금 상행 | “a bowed fiddle swell with a brass gong hit and falling coins” +0.14 | a success chime +2.98 | −19.7 / −7.9 | 461 |
| feature | 꽹과리 «갱 갱 갱개갱» + 징 스웰 | “a metallic gong rhythm with a low gong rumble” +1.46 | a kalimba note +2.74 | −20.1 / −6.4 | 725 |
| mutation | 가야금 하모닉(이 게임은 안 씀) | — | — | −33.8 / −20.7 | 146 |
| riser | 낮은 톱니파 + 징 저음 맥놀이 층 | “a low rising drone with a pulsing vibrato” +2.14 | a downlifter falling sweep +3.47 | −24.6 / −10.2 | 183 |
| rollup | 가야금 하모닉 «팅»(오음계 상행) + 징 | “a few high plucked string pings then a gong” −0.02 | a success chime +2.56 | −26.1 / −11.8 | 232 |

- 클릭·잘린 꼬리: 효과음·말판 스템 37개 전부 마지막 소리 끝이 −84.6 dBFS 이하(가장 큰 것 `hop3`), 클리핑 0.
- true peak 는 전부 −5.2 dBTP 이하(가장 큰 `goal`). **−1 dBTP 이하 충족.**
- 레벨은 기존 프리셋 범위 안에 맞췄다(winbig −19.7: shrine −19.0 / western −21.6, winsmall −20.4: candy −21.0 / shrine −23.3, feature −20.1: shrine −20.7 / clockwork −19.7, reelstops −26.7: shrine −26.3 / candy −24.1).

### 말판 전용 효과음 (`playYutToss` 등 10종, 말판 화면의 `boardSfx.ts` 가 직접 부른다)

| 항목 | 결과 |
|---|---|
| 윷 결과음 도→모 | 스펙트럼 피크 392.2 → 440.2 → 494.0 → 587.4 → 659.2 Hz, **단조 증가**. 단위 테스트(`audioHanbok.test.ts`)도 같은 증가를 확인. 가장 큰 소리는 늘 제 음 하나(꽹과리·«한 번 더» 반짝은 더 작다) |
| 배수 슬라이드 0→4 | 493.7 → 587.4 → 659.2 → 784.1 → 880.0 Hz, 단조 증가. 레벨 −25.4 ~ −24.8 LUFS 로 고르다 |
| 말 건너기 0→5 | 494.4 → 524.0 → 555.9 → 589.6 → 625.1 → 662.5 Hz(반음씩), 12칸에서 멈춘다 |
| 윷 착지 | 납작한 면이 위로 나온 가락은 밝고 짧게, 둥근 면은 둔하고 길게(모=5는 넷 다 둔함). 가락 간격 34·36·54 ms. earshot 은 130 ms 안의 네 번을 둘로 묶어 읽는다(onset 2개) — 네 번인지는 귀로 확인할 것 |

| 스템 | LUFS / dBTP | earshot 판독 |
|---|---|---|
| yuttoss | −31.5 / −13.9 | “a stick whooshing through the air” z +4.61 (강함), 최상위 “a fast whoosh” +4.71. 처음에는 단번에 터지는 잡음이라 “a snare hit +5.04”로 읽혔고, 서서히 차오르는 swell 로 바꿔 해결 |
| yutland(1~5) | −26.2 ~ −25.4 / −9.8 | 최상위 “a digital glitch” +2.66 — 짧은 연속 딱딱 소리라 어휘에 맞는 말이 없다. “rapid wooden clicks” +1.9. 귀 판정 필요 |
| yutcall(1~5) | −24.6 ~ −23.8 / −10.0 ~ −10.7 | “a single plucked zither note ringing” +2.85 (그럴듯) |
| hop(0~5) | −31.1 ~ −30.7 / −9.4 ~ −10.8 | 최상위 “a wooden block hit” +4.43 |
| coin | −28.8 / −17.4 | “a short metallic coin jingle” +1.64 (약함), 최상위 kalimba / chime |
| mult(0~4) | −25.4 ~ −24.8 / −16.0 ~ −17.5 | 최상위 “a success chime” +2.61, 두 번째 “an alarm clock beeping” +2.49 — 해금 슬라이드가 비프처럼 읽히는 위험, 귀 판정 필요 |
| trap | −26.5 / −10.3 | 최상위 “a kick drum” +3.78 (쿵이 가장 커서) |
| fork | −26.3 / −14.5 | 최상위 “a success chime” +3.77 |
| goal | −17.6 / −5.2 | 최상위 “a kalimba note” +3.46. 가장 큰 소리(결승 클라이맥스), 음악 덕킹 2.6초 |
| summary | −20.0 / −9.1 | 최상위 “a success chime” +4.20, 음악 덕킹 1.4초 |

### 프리셋 구분 (같은 이벤트 CLAP 코사인, hanbok vs …)

기준: 기획서 «같은 이벤트의 CLAP 코사인 hanbok↔shrine ≤ 0.90, hanbok↔candy ≤ 0.90» (기존 프리셋끼리 평균 0.77~0.87, 최고 0.96~0.99).

| 이벤트 | shrine | candy | 가장 비슷한 프리셋 |
|---|---|---|---|
| spin | 0.65 | 0.55 | shrine 0.65 |
| reelstop | 0.67 | 0.71 | western 0.75 |
| reelstops | 0.72 | 0.76 | bell 0.83 |
| winsmall | **0.89** | 0.75 | shrine 0.89 |
| winbig | 0.84 | 0.74 | western 0.89 |
| feature | 0.71 | 0.54 | shrine 0.71 |
| mutation | 0.83 | **0.90** | candy 0.90 (이 게임은 안 씀) |
| riser | 0.83 | 0.87 | western 0.89 |
| rollup | 0.70 | 0.85 | bell·candy 0.85 |

- 9개 이벤트 모두 shrine·candy 와 0.90 이하(작은 당첨 shrine 0.89, 안 쓰는 mutation candy 0.90 은 경계).
- 처음 렌더는 기대감 상승음이 fruit 0.96 / candy 0.95 였고, 톱니파로 바꾸니 bell 0.96 / western 0.94 가 됐다. 상승음은 레시피 안에서 파라미터만 바뀌는 공통 구조(주음 + 5도 + 올라가는 대역 잡음)라 어떤 파형을 써도 0.90 아래로 잘 안 내려갔다. 그래서 `Recipe.riserLayer`(레시피가 징 저음 맥놀이 층을 얹는 훅)를 더하고, 음역도 낮추고(196→392 Hz) 필터를 어둡게(1 kHz)·떨림을 느리게(4 Hz) 했더니 전부 0.82~0.89 가 됐다.
- 작은 당첨은 «가야금 3음 + 엽전»만으로는 shrine 0.91~0.92 여서 장구 «덩»을 앞에 붙이고 가야금 음을 G·D·G 로 넓혀 0.89 가 됐다.

### BGM (굿거리 12/8, 점4분 = 80, 평조 G 오음, 가야금 분산화음 + 해금 선율 + 거문고 + 장구 장단 + 4마디마다 징)

| 항목 | hanbok | 비교 |
|---|---|---|
| 기본 LUFS (20~50초) | **−31.3** (목표 −30~−32 충족) | shrine −29.6 / candy −31.0 / western −31.2 |
| 말판 변주 LUFS | **−30.0** (목표 −30~−31 충족) | shrine −29.3 / candy −30.1 |
| true peak | −14.2 / −13.7 dBTP, 클리핑 0 | shrine −14.8 / −14.7 |
| CLAP 코사인 hanbok_base vs shrine_base / shrine_free | **0.863 / 0.843** (목표 ≤ 0.92) | candy_base 0.826, western_base 0.907, fruit 0.812, clockwork 0.758, bell 0.587 |
| CLAP 코사인 hanbok_free vs shrine_base / shrine_free | **0.911 / 0.917** (목표 ≤ 0.92, 경계) | western_free 0.939(요구 밖이지만 가장 높다), candy_free 0.816 |
| base ↔ free | 0.888 | candy 0.93 |
| “traditional Korean folk music with plucked zither and drums” | base +3.19, free +3.59 | shrine_base +2.61 |
| “traditional Asian plucked string music with a bowed fiddle melody” | base +4.00, free +3.36 | shrine_base +2.74 |
| “happy upbeat cheerful” / “sad melancholic” | base +2.95 / +2.52, free +2.27 / +2.53 | shrine_base +1.30 / +2.86 |

- 변주(말판): 자진모리 느낌으로 ×1.35(80 → 108), 악기를 두 음 올리고, 꽹과리가 박마다 짚고, 선율이 해금에서 대금으로 바뀐다(`Kit.freeVoices`). 단위 테스트(`bgmHanbok.test.ts`)가 12/8 박 위치(덩·기덕·더러러가 박의 3분할 자리)·징 4마디 간격·변주 +2 반음·×1.35·꽹과리 박을 확인한다.
- 처음 렌더는 기본 −37.4 / 변주 −34.4 LUFS 였다. 키트 `gain` 을 2배로 올려 기본을 맞췄고, 변주가 +3 dB 더 큰 것은 꽹과리 믹스와 대금 선율 음량을 낮춰 −30.0 으로 맞췄다.
- 짚어 둘 점: 변주는 western 변주와 가장 닮았다(0.939). 둘 다 «숨 섞인 관악 + 뜯는 현 + 박 타악»이라 CLAP 이 같은 군으로 묶는 것으로 보인다. **구분은 귀로 확인이 필요하다.**

### 믹스 균형 (30초 장면, BGM 40%)

| 항목 | hanbok | 비교(shrine) |
|---|---|---|
| 믹스 LUFS / true peak | −25.3 LUFS / −5.4 dBTP, 클리핑 0 | −25.9 / −6.5 |
| SFX−BGM dB: 릴 정지 / 작은 당첨 / 기대감 / 큰 당첨 / 피처 | +9.4 / +13.5 / +16.6 / +14.3 / +28.9 | +5.1 / +5.9 / +12.8 / +16.8 / +23.1 |
| 덕킹 | 기대감 −4.7 dB, 피처(커튼) −12.3 dB | −4.4 / −13.7 |

- 이 장면은 첫 30초라 BGM 이 도입 편성(마디 0~9, 선율 없음)이어서 SFX−BGM 이 shrine 보다 커 보인다. 전체 편성(−31.3 LUFS) 위에서는 릴 정지가 그보다 약 4 dB 작아진다 — 기존 프리셋과 같은 조건이다.
- 큰 당첨 구간 덕킹이 −0.9 dB 로만 나온 것은 같은 장면 안에서 편성이 달라(선율·아르페지오가 막 들어오는 마디) 비교가 어긋난 것이다. 덕킹 동작 자체(−6 dB, 커튼 −14 dB)는 프리셋과 무관한 공용 코드이고 `audio.test.ts` 가 확인한다.

### 브라우저 확인 (개발 스택, 헤드리스 Chrome 430×932·390×844)

디버그 프리셋 «말판 100배+»를 진입부터 요약·받기·복귀 클립·큰 당첨 연출까지 끝까지 돌리며 `BaseAudioContext.createOscillator/createBufferSource` 호출을 시간순으로 셌다. AudioContext 는 `running`, 콘솔 오류는 리소스 404 두 건뿐(개발 서버가 파비콘에 404 를 주는 것으로 보이며 소리와 무관). 초당 노드 생성: 진입 직후(피처 «갱»과 징) 111, 윷 던지기·착지·결과·말 이동 구간 35~90, 결승(요약 직전) 208, 이후 11~26(요약·복귀·큰 당첨, 배경음 포함). 말판 중 변주 BGM 으로 바뀌고 복귀 때 기본으로 돌아오는 것은 `useBoardBonus` 의 `bgmModeTransition` 호출과 `bgmHanbok.test.ts`(변주에서만 대금) 로만 확인했고, 귀로는 확인하지 못했다.

### 남은 문제

1. 태거 어휘에 한국 악기가 없어 가야금·해금·꽹과리 판독이 약하다(작은·큰 당첨, 피처, 롤업의 의도 문구 z < 2). 소리가 의도와 다른지는 귀로만 가린다.
2. 윷 착지(딱딱딱딱)가 “a digital glitch”, 배수 슬라이드가 “an alarm clock beeping”(두 번째)로 읽힌다 — 어색하게 들리면 가장 먼저 의심할 곳.
3. 말판 변주 BGM 이 western 변주와 0.939 로 가깝다. 귀로 구분이 안 되면 변주의 꽹과리·장구 비중을 더 키우거나 대금을 쓰는 구간을 늘린다.
4. 합성음이라 realness 는 «code-synthesized». 녹음 샘플로 바꾸려면 `theme.json` 의 `sfx` override 를 쓴다.
5. 12/8 흔들림(박 안의 3분할)은 earshot 이 bpm 을 읽지 못해(앞 절의 candy 때와 같다) 수치로는 확인하지 못했고, 시퀀서 단위 테스트의 음 위치로만 확인했다.

### 들어볼 파일

- 효과음 스템: `D:/park/tgslot-wt/_qa/new-b-sound/wav/hanbok_<spin|reelstop|reelstops|winsmall|winbig|feature|mutation|riser|rollup|ui>.wav`, 말판 `board_hanbok_<yuttoss|yutland1~5|yutcall1~5|hop0~5|coin|mult0~4|trap|fork|goal|summary>.wav`
- BGM·믹스: `wav/bgm_hanbok_base.wav`, `bgm_hanbok_free.wav`(각 50초), `wav/mix_hanbok_mix.wav`(합본)·`mix_hanbok_sfx.wav`·`mix_hanbok_duck.wav`
- 기준 프리셋 스템: 같은 폴더 `<preset>_<event>.wav`, `bgm_<preset>_<base|free>.wav`
- 원자료: `final_sfx.txt`·`final_board.txt`·`final_bgm.txt`·`final_mix.txt`·`final_intent.txt`·`final_peak.txt`, 스펙트로그램 `spec/`
## idol-stage-live 사운드 (사운드 레인) — 2026-11-26

`idol` 프리셋의 효과음 레시피(`IDOL_RECIPE`)·무대 룰렛 소리 6종·배경음(`BGM_STYLES.idol`, `IDOL_KIT`)을 earshot 으로 듣고 잰 기록. 방법은 위와 같다(실제 `audio.ts`를 헤드리스 Chrome OfflineAudioContext + 가상 시계로 렌더, 하네스 `D:/park/tgslot-wt/_qa/new-c-sound/run.mjs`·`analyze.py`, BGM 40%). **수치는 참고값이고 최종 귀 판정은 사용자 몫이다.** 합성음이 목적이라 realness 는 보지 않았다.

### 무엇을 만들었나

| 파일 | 내용 |
|---|---|
| `apps/hub/src/lib/audio.ts` | `IDOL_RECIPE`(스핀 시작·릴 정지·작은/큰 당첨·피처 진입·심볼 변형·롤업 틱·마감), 기대감 상승음 위에 겹치는 **손뼉 롤**(`Recipe.riserExtra`, 기대감이 끝나면 함께 멈춘다), 룰렛 소리 `playRouletteTick/Land/Light/Zoom/Summary`, 가장 큰 순간용 깊은 덕킹(`duckBgmDeepFor`) |
| `apps/hub/src/lib/rouletteSfx.ts` | 룰렛 큐(`entry·light·tick·land·zoom·summary·exit`) → 위 소리를 잇는 싱크. `rouletteCues.ts` 의 기본 싱크가 이것이다 |
| `apps/hub/src/lib/bgm.ts` · `bgmVoices.ts` | `IDOL`(128bpm E장조, 4박 킥·오프비트 코드 스탭·16분 펄스 아르페지오·하우스 베이스·손뼉 백비트·신스 리드) · `IDOL_KIT` |
| `packages/game-sdk/src/theme.ts` · `packages/renderer/src/types.ts` | `sound.preset` 에 `'idol'` 추가 |

기존 프리셋·함수 이름은 그대로다(덧붙임뿐). 테스트: `audio.test.ts`(idol 전 이벤트·룰렛 소리·손뼉 롤 정리), `bgm.test.ts`(idol 악보), `rouletteSfx.test.ts`(큐 → 소리 연결), `theme.test.ts`(프리셋 열거).

### 합성 함성은 읽히지 않아 손뼉 롤로 바꿨다 (기획서 §9-1의 대체 규칙)

기획서는 «함성»(대역 잡음 + 8Hz 떨림)을 진입·앙코르·대상에 썼다. 합성한 함성은 CLAP 이 군중으로 듣지 못했다(아래는 «a crowd cheering» z).

| 시도 | z | 최상위 판독 |
|---|---:|---|
| 1차: 모음 공명대 잡음 + 8Hz 떨림 + 톱니 목소리 4줄 | −0.58 | a quick swipe / a fast whoosh |
| 2차: 목소리 8줄(음높이·모음 제각각) + 박수 덩어리 + 숨소리 | −0.70 | a quick swipe / an uplifter sweep |
| 변형 9종 실험(박수만·목소리만·웅성임·높은 «우» 10줄 등) | −0.5 ~ +0.9 | uplifter / downlifter / cloth whipping |
| 손뼉 롤·무작위 박수 14~30개/초·휘파람 얹기 | +0.4 ~ +1.5 («applause» −0.3 ~ +2.3, 손뼉 3번이 +2.28) | glitch / balloon squeak (휘파람은 풍선 소리로 읽혀 뺌) |

기획서 대체 규칙(«함성을 빼고 손뼉 롤로»)대로 **함성을 없애고 손뼉 롤**(`clapRoll`: 간격이 줄며 커지는 손뼉 n번)로 바꿨다. 손뼉 한 번은 «a hand clap» 으로 읽히기 때문이다(+3.3). 도움말·화면 문구에 «함성»을 쓰지 않는다.

### 효과음 (최종 렌더, idol)

z 는 의도 문구 두 가지 중 높은 쪽. 짧은 원샷(<0.5 s)은 태거가 약하다.

| 이벤트 | 레시피 | 의도 문구 최고 z | 최상위 판독 | LUFS / dBTP | 판정 |
|---|---|---|---|---|---|
| spin | 신스 상승 스윕(톱니+로우패스 열림) + 3kHz 래칫 루프 | “a fast ratchet clicking loop” +2.26 | a digital glitch +2.99 | −42.8 / −18.9 | 약함 |
| reelstop | **손뼉**: 대역 잡음 세 겹(8·9ms 어긋남) + 꼬리 + 3kHz 핑, 릴마다 대역 +6% | “a hand clap” +3.26 | a snare hit +3.95, a hand clap +3.26 | −30.3 / −12.4 | 강함(**킥 아님**) |
| reelstops | 손뼉 5연속 | “five quick hand claps” +4.49 | a snare hit +3.96 | −28.7 / −7.7 | 강함 |
| winsmall | 신스 브라스 3음 장조(A5·C#6·E6) + 별빛 핑 | “three rising synthesizer brass notes” +2.49 | a success chime +3.55 | −21.4 / −9.6 | 그럴듯 |
| winbig | 상승 스윕 → 크래시·서브 드롭 → 4박 킥 + 오프비트 베이스·하이햇 + 손뼉 + 코드 스탭(A·F#m·D·E) → 마지막 코드 | “a pop music celebration jingle” +2.56 (“an upbeat EDM stinger” +1.98) | a success chime +2.38 | −20.8 / −4.4 | 그럴듯 |
| feature(진입) | 손뼉 롤이 빨라지며 상승 스윕이 차올라 0.9초에 킥 + 크래시 + 코드 | “synth brass chord stabs” +2.75 (“a crowd cheering” −0.1) | a success chime +2.01 | −19.8 / −8.4 | 그럴듯 |
| mutation | 사각파 핑 2개 + 고역 잡음 | “a few quick high synth pings” +2.35 | a kalimba note +3.34 | −32.4 / −17.8 | 약함(원샷) |
| riser | 삼각파 기대감 상승음 + **손뼉 롤 가속**(0.34→0.1초 간격) | “a rising noise sweep” +0.99 | a success chime +2.66, a police siren +2.19 | −27.7 / −16.2 | **불일치** |
| rollup | 하이햇 틱 + 마감 브라스 | “rapid coin counter ticks ending with a chime” +0.88 | a success chime +3.22 | −27.2 / −5.6 | **불일치**(다른 프리셋도 z 1.7~2.5 대) |

- 꼬리 −240 dB(스템 끝을 무음 직전에서 잘랐다), 클리핑 0, 전 스템 true peak −4.4 dBTP 이하.
- 기대감 상승음은 3가지 파형·음높이를 비교했고 현재 값이 가장 높았다(+0.99 / +0.50 / +0.66). 5개 프리셋도 같은 구조에서 «siren»으로 읽혔던 영역이라 귀 판정이 필요하다.

### 무대 룰렛 소리 (6종)

`rouletteSfx.ts` 싱크가 큐에 따라 부른다. 같은 재료(손뼉·브라스·킥·코인 차임)다.

| 큐 | 소리 | 의도 문구 최고 z | 최상위 판독 | LUFS / dBTP | 판정 |
|---|---|---|---|---|---|
| tick(칸 경계) | 2.8kHz 사각파 8ms + 고역 딸깍, 느려질수록 450Hz 낮아지고 커짐 | “a roulette wheel clicking” +3.46 | a ratchet clicking +3.01 | −37.9 / −16.7 | 강함 |
| land 코인 | 레트로 «띠링»: 사각파 1.32kHz 짧게 → 5도 위 1.98kHz 길게 | “a retro video game coin pickup” +5.44 | a success chime +2.82 | −25.1 / −15.1 | 강함 |
| land 코인(불 켜진 칸) | 위 + 반음 위 핑 2개 | +5.29 | a kalimba note +2.79 | −24.9 / −13.5 | 강함 |
| land 한 단계 위로 | 상승 스윕 + **탐 필 4타**(0.12초부터 0.14초 간격, 음정 하강) + 크래시, 곧이어 줌 «웅»(130→55Hz) | “a drum fill with a rising sweep” +3.71 | a snare hit +3.35 | −25.3 / −12.5 | 강함 |
| land 앙코르 | 손뼉 롤 5번(0.17초에서 빨라짐) | “five hand claps getting faster” +2.57 | a snare hit +2.94, a hand clap +2.47 | −28.8 / −11.3 | 그럴듯 |
| land 대상 | 킥 + 크래시 + A 코드 5음 브라스(1.1초) + E 코드 + 손뼉 롤 10번 + 별빛 핑 + **음악 깊게 덕킹(2.2초)** | “a triumphant brass fanfare” +2.91 | a success chime +2.71 | −18.0 / −6.5 | 그럴듯 |
| light(점등) | 사인 «휭» 120ms, 점등마다 반음씩 올라감(기본 1.5kHz) | “a magic sparkle chime” +2.30 | bubbles underwater +2.73 | −27.6 / −16.3 | 약함(원샷) |
| zoom | 130→55Hz 사인 + 로우패스 잡음 | “a deep whoomp” +2.33 | a kick drum +3.92 | −29.9 / −14.5 | 약함(낮은 쿵이 의도) |
| summary 큰 판 | 킥 + 크래시 + 코드 둘 + 손뼉 롤 6번, 음악 덕킹 2.2초 | “a triumphant fanfare” +3.61 | a success chime +2.47 | −19.6 / −5.5 | 강함 |
| summary 작은 판 | 손뼉 둘 + 코인 차임 | “two hand claps then a retro coin chime” +0.94 | a success chime +3.11 | −26.3 / −15.8 | 불일치(차임으로 읽힘, 의도한 조용한 마감) |

- 틱은 칸 경계마다 불리고(최소 25ms 간격은 `StageRoulette`가 거른다), 회전 동안 음악을 −6 dB 로 낮춰 둔다(틱이 꺼질 때쯤에만 덕킹을 이어 붙여 타이머를 매 틱 다시 걸지 않는다).
- 처음 음량에서는 틱의 적분 LUFS 가 덕킹된 BGM 보다 5.4 dB 낮고 점등은 +0.1 dB 라 BGM 에 묻혔다. 틱 약 3배·점등 약 3배로 올렸다(아래 룰렛 장면 믹스는 올린 뒤 수치).

### 기존 프리셋과 구분 (같은 이벤트, CLAP 코사인 — 낮을수록 다름)

| 이벤트 | idol vs 가장 비슷한 프리셋 | 기존 프리셋끼리 평균/최대 |
|---|---|---|
| spin | 0.85 (candy) | 0.77 / 0.96 |
| reelstop | **0.52** (western) | 0.79 / 0.92 |
| reelstops | **0.48** (western) | 0.78 / 0.92 |
| winsmall | 0.89 (bell·western) | 0.83 / 0.96 |
| winbig | 0.76 (bell·western) | 0.85 / 0.96 |
| feature | 0.72 (bell) | 0.78 / 0.88 |
| mutation | 0.86 (bell) | 0.79 / 0.88 |
| riser | 0.88 (fruit·candy) | 0.87 / 0.99 |
| rollup | 0.89 (bell) | 0.79 / 0.89 |

기준(< 0.90)을 전부 넘겼다. 가장 가까운 winsmall·rollup·riser 는 «짧은 상승 음계/틱»이라 모델이 같은 군으로 묶는다. **귀 확인이 필요하다.**

### 배경음 (128 bpm, E 장조, 4박 킥 신스팝)

| 항목 | idol | 비교 |
|---|---|---|
| 기본 LUFS (20~50초) | **−31.1** (목표 −30~−32 충족) | candy −31.0, fruit −32.0 |
| 룰렛(free) 변주 LUFS | **−30.2** | candy −30.1 |
| true peak | −15.5 / −15.3 dBTP, 클리핑 0 | |
| “happy upbeat cheerful” z | +2.78(기본) / +3.25(룰렛) | “sad melancholic” +1.32 / +1.55 (기존 5곡은 sad 가 happy 보다 높았다) |
| “EDM house music” z | +1.00 / +0.80 | 합성 BGM 은 장르 문구에 안 읽힌다 |
| 가장 비슷한 기존 곡 (CLAP 코사인) | candy_free 0.864, candy_base 0.828, fruit_base 0.814 | 기준 < 0.90 충족 |
| 기본 ↔ 룰렛 코사인 | 0.971 | |
| 동시에 울리는 음(시뮬레이션) | 기본 26 / 룰렛 36 | candy 33/35, fruit 36/46, bell 33/43 (상한 32, 패드·베이스·킥은 상한을 넘겨도 친다) |

- 룰렛 변주: 반음 위(+1), 아르페지오 음역 +7반음, 16분 하이햇, 8마디마다 손뼉 롤 필인(하프타임 빌드업은 마디 끝 필인으로 구현했다).
- 템포는 128 이라 `bgm.test.ts` 의 «라운지 범위» 상한을 120 → 130 으로 올렸다.

### 믹스 균형 (30초 장면, BGM 40%)

| 항목 | 결과 |
|---|---|
| 믹스 | −26.1 LUFS, true peak **−4.0 dBTP**, 클리핑 0 |
| SFX−BGM dB | 릴 정지 **+3.6** / 작은 당첨 +10.9 / 기대감 +10.8 / 큰 당첨 +17.8 / 피처 +23.3 |
| 덕킹 | 기대감 −7.4, 큰 당첨 −8.2, 피처(커튼) −12.5 dB (조용한 구간 −30.6 LUFS 대비) |

### 룰렛 장면 믹스 (룰렛 BGM 변주 위, 31초)

진입 → 점등 6 → 회전(틱) → 코인 → 위로 → 회전 → 앙코르 → 대상 → 요약 한 판. 믹스 −26.1 LUFS, true peak −6.8 dBTP, 클리핑 0.

| 구간 | SFX−BGM LUFS | SFX 피크 − BGM 피크 | BGM 덕킹 (조용한 구간 대비) |
|---|---:|---:|---:|
| 진입 | +18.1 | +16.5 | −7.6 |
| 점등 6개 | +3.9 | +3.0 | −1.7 |
| 회전(틱) | −1.7(틱은 드물어 적분 LUFS 가 낮다) | **+6.0** | −6.2 |
| 코인(불) | +6.0 | +4.0 | −1.2 |
| 위로 | +6.4 | +5.8 | −1.6 |
| 앙코르 | +2.2 | +7.0 | −0.5 |
| 대상 | +21.2 | +14.0 | −9.0 (깊은 덕킹 2.2초) |
| 요약(큰 판) | +15.0 | +11.0 | −4.4 |

### 브라우저 확인 (개발 스택, 헤드리스 Chrome 430×932 · 390×844)

룰렛 진입 → 룰렛 3회전 → 요약 → 복귀 → 빅윈까지 끝까지 돌렸다. AudioContext 가 `running` 이고, 효과음·배경음이 노드를 계속 만들었으며(배경음 초당 약 34개), 콘솔 오류는 favicon 404 뿐이다. 데모 빌드(`vite build --mode demo`)도 통과한다.

### 남은 문제 · 귀로 확인할 것

1. riser(+0.99)·rollup(+0.88)은 CLAP 이 의도 문구로 읽지 못한다(5개 기존 프리셋도 비슷). 손뼉 롤이 기대감 소리 위에 자연스럽게 얹히는지 귀로 확인.
2. «함성»은 합성으로 만들지 못해 빠졌다. 콘서트 분위기가 부족하면 실녹음 샘플을 `sfx` override 로 넣는 게 현실적이다(라이선스 확인 필요).
3. 진입(feature)·대상·요약 큰 판의 코드가 서로 비슷한 브라스 음색이라 연속으로 들으면 같은 계열로 들릴 수 있다(진입 → 회전 → 대상 순서로 청취).
4. 룰렛 틱 8ms 사각파는 회전 초반(초당 30개 이상)에 날카롭게 들릴 수 있다. 느낌이 거칠면 시작 vol 만 낮추면 된다(`playRouletteTick`).
5. earshot 이 가장 높게 읽은 건 대부분 «success chime»이다(브라스·코인 차임이 차임으로 묶인다). 의도 문구 z 는 참고만.
6. 룰렛 `exit` 큐(퇴장 클립 시작)는 통합 QA(2026-11-26)에서 연결했다 — 연출이 끝나면(`StageRoulette` 감독 `done`) 한 번 쏘고 UI «close» 소리가 난다(`rouletteSfx.ts`). 퇴장 클립·BGM 커튼 덕킹과 겹치니 귀로 확인할 것.

### 파일

- 효과음 스템: `D:/park/tgslot-wt/_qa/new-c-sound/wav/idol_<spin|reelstop|reelstops|winsmall|winbig|feature|mutation|riser|rollup|ui>.wav`, 룰렛 `idol_<rtick|rland_coin|rland_lit|rland_stepup|rland_encore|rland_grand|rlight|rzoom|rsummary_big|rsummary_small|rentry>.wav`
- BGM·믹스: `wav/bgm_idol_base.wav`, `bgm_idol_free.wav`, `mix_idol_mix.wav`, `mix_idol_sfx.wav`, `mix_idol_duck.wav`, 룰렛 장면 `rmix_idol_mix.wav`(`_sfx`·`_duck`)
- 원자료: `final_intent.txt`, `final_measure.txt`, `final_cos.txt`, `final_bgm.txt`, `final_mix.txt`, `final_rmix.txt`, 함성 실험 `exp_*.wav`(저장소 밖)

## 개선안 1번 — 당첨 단계(베팅 대비 배수)별 소리 (2026-11-27, 레인 A)

`playWinBand`(audio.ts, 새 레시피 키 없음). under = 소리 없음, small = 기존 `winSmall`, good = `winSmall` 0.9초 + 3음 오름, great = `winSmall` 1.4초 + 5음 오름 + `tickEnd`, big(10배 이상) = 기존 `playWin(tier)`. 10개 프리셋 전부 가상 시계 오프라인 렌더(`D:/park/tgslot-wt/_qa/improve-A/sound/run.mjs`, 실제 audio.ts 를 그대로 돌림) 후 `earshot measure --light`로 쟀다.

| 프리셋 | under | small 길이 / 피크 dBFS / LUFS | good | great | big(기존) |
|---|---|---|---|---|---|
| bell | 디지털 무음(-240 dBFS) | 1.036s / -11.5 / -23.6 | 1.134s / -10.2 / -22.3 | 1.415s / -10.0 / -23.7 | 3.240s / -8.0 / -21.9 |
| fruit | 디지털 무음(-240 dBFS) | 0.675s / -8.1 / -22.4 | 1.091s / -8.1 / -23.4 | 1.356s / -8.1 / -24.8 | 3.191s / -5.9 / -22.0 |
| western | 디지털 무음(-240 dBFS) | 1.488s / -13.3 / -24.3 | 1.488s / -12.8 / -24.8 | 1.788s / -12.8 / -23.6 | 3.600s / -7.5 / -22.0 |
| shrine | 디지털 무음(-240 dBFS) | 2.176s / -9.1 / -23.3 | 2.176s / -8.1 / -23.1 | 2.576s / -8.0 / -21.8 | 3.284s / -6.5 / -19.0 |
| clockwork | 디지털 무음(-240 dBFS) | 1.236s / -14.0 / -23.1 | 1.236s / -12.5 / -21.9 | 1.546s / -12.3 / -22.0 | 3.261s / -10.4 / -20.0 |
| candy | 디지털 무음(-240 dBFS) | 0.688s / -12.9 / -23.9 | 1.122s / -12.3 / -23.7 | 1.451s / -11.8 / -25.0 | 3.489s / -7.4 / -22.7 |
| royal | 디지털 무음(-240 dBFS) | 1.336s / -14.4 / -24.2 | 1.336s / -13.4 / -24.1 | 1.526s / -14.2 / -23.4 | 3.256s / -4.7 / -21.9 |
| deepsea | 디지털 무음(-240 dBFS) | 1.276s / -10.1 / -22.5 | 1.276s / -10.2 / -22.4 | 1.586s / -10.2 / -20.9 | 3.824s / -6.1 / -24.2 |
| hanbok | 디지털 무음(-240 dBFS) | 1.476s / -9.8 / -19.7 | 1.476s / -9.5 / -19.5 | 1.476s / -9.0 / -19.9 | 3.141s / -8.0 / -19.7 |
| idol | 디지털 무음(-240 dBFS) | 0.936s / -9.5 / -21.4 | 1.081s / -9.6 / -21.3 | 1.346s / -9.6 / -19.7 | 4.443s / -4.0 / -20.8 |

- 확인된 것: under 는 10개 프리셋 모두 디지털 무음, 길이는 small ≤ good ≤ great < big 순(모든 프리셋), 피크는 big 이 가장 크다. 단위 테스트(`audio.test.ts`)도 프리셋마다 under·none·big 은 노드 0개, small < good < great 순으로 노드가 늘어남을 검사한다.
- 한계: western·shrine·clockwork·royal·deepsea·hanbok 은 `winSmall` 꼬리가 길어 small 과 good 길이가 같다(hanbok 은 great 도 같다). 오름 음은 꼬리 안에 들어가서 길이로는 안 갈리고 음 개수로만 갈린다. 귀로 «좋은 당첨»이 «당첨»과 구별되는지 확인할 것.
- 모든 판정은 참고값이다. **최종 귀 판정은 사용자 몫이다.**


## volcano-forge 사운드 (사운드 레인) — 2026-11-27

`forge` 프리셋의 효과음 레시피·화로 줄 전용 소리 11종·배경음을 earshot 으로 듣고 잰 기록. 방법은 위와 같다(실제 `audio.ts`를 헤드리스 Chrome OfflineAudioContext + 가상 시계로 렌더, 하네스 `D:/park/tgslot-wt/_qa/new-a-sound/run-forge.mjs`·`analyze_forge.py`·`intentforge.py`·`mixforge.py`, BGM 40%). **수치는 참고값이고 최종 귀 판정은 사용자 몫이다.** 합성음이 목적이라 realness 는 보지 않았다.

### 무엇을 만들었나

| 파일 | 내용 |
|---|---|
| `apps/hub/src/lib/audioForge.ts` | `forge` 레시피(풀무 바람 스핀·쇠 «탁» 릴 정지·모루 «깡» 당첨·화르륵+톱니 화음 큰 당첨/피처·모루 기대감 북 `riserExtra`)와 전용 소리 `ForgeCues`(연쇄 강조·팝·낙하·불씨 튐·불씨 도착·숨쉬기·화로 가득·정산·정산 틱·모루 기대감·프리스핀 추가) |
| `apps/hub/src/lib/audio.ts` | `forge` 인스턴스·`RECIPES.forge`, `playForgeEmberSpark/EmberLand/Breath/Full/Settle/SettleTick/AnvilTease/Retrigger`. 프리셋이 forge 일 때 `playCascadePop`·`playCascadeDrop` 이 forge 소리로 대신 낸다(캔디 소리 불리지 않음) |
| `apps/hub/src/lib/bgmForge.ts` · `bgmVoices.ts` · `bgm.ts` | `FORGE`(104bpm, A 믹솔리디안) · `FORGE_KIT`(뮤트 톱니·사각 선율, 둥근 북, 모루 핑, 셰이커) · `BGM_STYLES.forge` |
| `apps/hub/src/hooks/useForgeRail.ts` · `GameScreen.tsx` | 연출 레인이 임시로 쓰던 캔디 소리(`playLadderUp`·`playFeature`·`playOrderComplete`·`playOrderTick`)를 forge 전용 소리로 교체. 프리스핀 재발동은 `playForgeRetrigger` |
| `packages/game-sdk/src/theme.ts` · `packages/renderer/src/types.ts` | `sound.preset` 에 `'forge'` 추가 |

기존 프리셋·함수 이름은 그대로다(덧붙임뿐).

### 기획서와 달라진 점

- 모루 «깡»은 기획서의 배음비 1 : 2.76 : 5.40 만으로는 CLAP 이 «kalimba/glass ting»으로 읽어서, 어긋난 비정수 배음(1 : 2.32 : 3.74 : 5.12) + 때리는 순간의 대역 잡음(3.1kHz) + 고역 잡음을 더해 거칠게 했다. 그래도 «anvil/hammer» 문구는 z +2 이하다(아래).
- 쇠 «탁»(릴 정지)은 90Hz 몸통 대신 78→52Hz 사인 + 2.2kHz 짧은 비정수 핑 + 고역 잡음으로 바꿨다. 90Hz/1.3kHz 안은 shrine 의 공명 나무 정지음과 코사인 0.91~0.94 로 너무 가까웠다.
- 롤업 틱·마감은 사인 핑 대신 낮은 삼각파 «틱» + 쇠 «탁» + 모루 한 번으로 바꿨다(deepsea 롤업과 0.90 → 0.85).
- 배경음: 아르페지오 악기를 빼고 패드를 키웠다(candy 기본곡과 0.918 → 0.893). 선율은 사각+톱니 짧은 금관풍으로 썼다.

### 효과음 (최종 렌더, forge)

z 는 의도 문구 중 높은 쪽. 짧은 원샷(<0.5 s)은 태거가 약하다.

| 이벤트 | 레시피 | LUFS / dBTP | 최상위 판독 | 의도 문구 z |
|---|---|---|---|---|
| spin | 풀무 바람 + 낮은 쿵 | −41.0 / −19.9 | a digital glitch | −1.06 (불일치) |
| reelstop | 쇠 «탁» | −25.5 / −3.9 | a wooden block hit +3.2 | 약함 |
| winsmall | 탁 + 모루 두 번 | −24.8 / −10.1 | a kalimba note | +1.95 |
| winbig | 화르륵 → 모루 N번 → 톱니 화음 → 불꽃 | −23.8 / −8.7 | a stutter glitch transition | +0.4 (불일치) |
| feature | 풀무 두 번 → 불길 → 톱니 3화음 스탭 | −28.0 / −10.7 | a wooden block hit | +0.8 |
| mutation | 쇠 탁 + 낮은 모루 + 장작 | −27.9 / −12.2 | kalimba | +2.0 |
| riser | 낮은 톱니 상승음 + 북 두 번 반복 | −24.9 / −12.6 | a downlifter | +1.6 |
| rollup | 쇠 틱 + 마감 모루 | −30.4 / −10.4 | a kalimba note | +1.6 |

- 꼬리 −240 dB, 클리핑 0, 이벤트 전부 true peak −3.3 dBTP 이하(기준 ≤ −1).
- **earshot 은 합성 모루·풀무를 «anvil»·«bellows»·«furnace»로 읽지 못한다.** 금속 소리는 kalimba/glass ting/success chime, 바람·불길은 glitch/whoosh 로 읽혔다(앞선 프리셋 구간과 같은 한계). 의도 일치 여부는 귀로 판단해야 한다.

### 화로 줄 전용 소리

| 소리 | 내용 | LUFS / dBTP |
|---|---|---|
| 연쇄 강조 `hl0~hl5` | 모루 «깡», 단계마다 온음씩 상승(6단) + 팝 «치익» | −23 / −7 |
| 낙하 | 75Hz «쿵» | −28.8 / −7.5 |
| 불씨 튐 | 장작 «탁탁» 4알 | −39.4 / −16.8 (짧은 질감이라 작다) |
| 불씨 도착 | 짧은 «훅» + A 단조 펜타토닉 4단(440·523·587·659Hz) | −26.4 / −9 |
| 숨쉬기(3칸) | 62Hz 웅웅 3회(1.5Hz) | −27.4 / −12.6 |
| 화로 가득 | 풀무 2회 → 불길 → 톱니 3화음 스탭(음악 2.4초 덕킹) | −27.8 / −9.3 |
| 정산 ×N | 망치 3연타 «깡깡깡» 상행 | −21.8 / −5.9 |
| 정산 틱 | 쇠 «틱» | −31.4 / −8.3 |
| 모루 2/3개 | 60Hz 북 한 번 / 두 번 + 용암 드론 | −31.1 / −27.1 |
| 프리스핀 추가 | 모루 «깡» 두 음 + 불길 | −23.8 / −10.1 |

### 기존 프리셋과 구분 (같은 이벤트, CLAP 코사인 — 낮을수록 다름)

기존 9개 프리셋(bell·fruit·western·shrine·clockwork·candy·deepsea·hanbok·idol)과 비교.

| 이벤트 | forge vs 가장 비슷한 프리셋 |
|---|---|
| spin | 0.76 (shrine) |
| reelstop / reelstops | 0.86 (shrine) / 0.86 (shrine) |
| winsmall | 0.83 (hanbok) |
| winbig | 0.83 (deepsea) |
| feature | 0.79 (deepsea) |
| mutation | 0.81 (hanbok) |
| riser | 0.89 (hanbok) |
| rollup | 0.81 (deepsea) |

기준(≤ 0.90) 충족, 최대 0.89(riser). 전용 소리는 기존 대표 소리(승리·피처·변형·릴 정지·빅윈)와 최대 0.86(정산 틱 vs shrine 릴 정지).

### 배경음 (104 bpm, A 믹솔리디안)

| 항목 | forge |
|---|---|
| 기본 LUFS (20~50초) | −30.8 (목표 −30~−32) / 프리스핀 −30.0 |
| true peak | −18.8 / −19.1 dBTP, 클리핑 0 |
| 가장 비슷한 기존 곡 (CLAP 코사인) | candy_base 0.893, shrine_base 0.896(기준 ≤ 0.90 충족) |
| 기본 ↔ 프리스핀 | 0.82 |
| 프리스핀 변주 | +2반음, 4% 빠르게(공용 테스트가 프리스핀 변주는 더 빨라야 한다고 요구), 16분 셰이커 + 모루 핑 8분 + 톱니 대선율 |

### 믹스 균형 (30초 장면, BGM 40%)

| 항목 | 결과 |
|---|---|
| 일반 장면 | −28.4 LUFS, true peak −2.3 dBTP, 클리핑 0. SFX−BGM: 릴 정지 +4.7 / 작은 당첨 +6.5 / 기대감 +13.2 / 큰 당첨 +14.5 / 피처 +14.9 |
| 덕킹 | 기대감 −6.7, 큰 당첨 −7.8, 피처 −11.8 dB |
| 화로 줄 한 판(20초) | −25.9 LUFS, true peak −2.9 dBTP. SFX−BGM: 릴 정지 +2.0 / 팝·낙하 +4.2 / 불씨 +6.4~+11.1 / 숨쉬기 +3.4 / 화로 가득 +10.4 / 정산 +14.6 / 큰 당첨 +10.2 |

릴 정지(+2.0)와 숨쉬기(+3.4)는 BGM 에 가까워 묻힐 수 있다. 귀로 확인할 것.

### 브라우저 확인 (개발 스택, 헤드리스 Chrome 390×844)

프리스핀 진입(모루 4개 → «프리스핀 8회» 팝업 → 쇳물 클립 → 프리스핀 배경), 라운드 진행(불씨·화로 줄), 종료 팝업(획득·베팅의 ×N·최종 화로·화로 가득 횟수·최고 한 판)과 forge 빅윈 스킨(망치·검 파티클, 불꽃 빛줄기)을 확인했다.

### 남은 문제 · 귀로 확인할 것

1. earshot 이 모루·풀무·불길을 의도대로 읽지 못한다. «깡»이 종처럼 맑게 들리는지, 충분히 거친 쇠로 들리는지.
2. 스핀 시작(풀무 바람)이 −41 LUFS 로 작다. 릴 회전 루프에 묻히지 않는지.
3. 불씨 튐(장작 탁탁)은 매우 작은 질감이다. 안 들려도 연출에는 영향이 없다.
4. 릴 정지가 5연속에서 날카롭지 않은지(밝기 약 3.7kHz).
5. 기대감 북(60Hz)이 작은 스피커에서 들리는지.

### 들어볼 파일

- 화로 가득 `wav/forge_full.wav`, 정산 망치 `wav/forge_settle.wav`, 연쇄 강조 `wav/forge_hls.wav`, 한 판 전체 `wav/forge_round.wav`
- 배경음 `wav/bgm_forge_base.wav`, `wav/bgm_forge_free.wav`
- 믹스 `wav/mix_forge_mix.wav`, 화로 줄 장면 `wav/rmix_forge_mix.wav`
- 위치: `D:/park/tgslot-wt/_qa/new-a-sound/wav/` (저장소 밖)

## greenhouse-garden 사운드 (`garden` 프리셋) — 2026-11-28

`garden` 프리셋의 기본 레시피 9종, 정원 전용 소리 6종, 전용 BGM(base·free)을 earshot 으로 잰 기록. **수치는 참고값이고 최종 귀 판정은 사용자 몫이다.**
코드는 `apps/hub/src/lib/audioGarden.ts`(레시피·정원 전용 소리), `bgmGarden.ts`(악보), `bgmVoices.ts`의 `GARDEN_KIT`(악기), `gardenSfx.ts`(이벤트 → 소리 표)다. `audio.ts`는 import 한 줄·`garden` 생성 한 줄·`RECIPES.garden` 한 줄·위임 export 6개만 더했고, `game-sdk`의 `SOUND_PRESETS`·renderer `SoundPreset`에 `'garden'`을 추가했다.
방법은 앞 절들과 같다(실제 `audio.ts`를 헤드리스 Chrome OfflineAudioContext + 가상 시계로 렌더, 스템별 `measure`·CLAP 코사인, 30초 장면 믹스는 BGM 40% 기본 음량). 비교 대상은 앞 절 렌더(bell·fruit·western·shrine·clockwork·candy·hanbok)와 kraken-cove(deepsea)·idol-stage-live(idol) 스템이다.

### 소리 설계 (유리 온실의 흙·잎·물: 나무 칼림바·대나무 윈드차임·하프 글리산도·잎 바스락)

| 이벤트 | 소리 | 다른 프리셋과 다른 점 |
|---|---|---|
| 팝(`pop`) | 칼림바 한 음 + 잎 바스락. 단계마다 F 장조 펜타토닉(F4~C6) 한 칸 위, 9단계 상한 | 종·마림바가 아니라 나무 혀 + 금속 혀 배음(x5.4) |
| 낙하(`drop`) | 흙 «톡» 90→54 Hz | 아주 작게(-41 LUFS) |
| 성장(`grow`) | 대나무 윈드차임 4음 상행(새 한 변이 클수록 시작음이 위) + 흙 터짐 저역 + 덮개 나무 톡(최대 6번으로 묶음) | |
| 씨앗 개화(`bloom`) | 하프 글리산도 + 맑은 한 음. 배율 1~3 / 4~9 / 10 이상 = 새싹·봉오리·꽃, 꽃이면 피리 두 음과 배경음 덕킹 0.9초 | 배율이 클수록 높고 길다 |
| 햇살(`sun`) | 따뜻한 패드 스웰(F·A·C) + 높은 칼림바 트릴. 씨앗이 한 등급 올랐으면 칼림바 두 음이 먼저 | 덕킹 1.2초 |
| 물방울(`waterDrop`) | 퐁 두 겹(피치 하강). 지금 화면 이벤트에는 연결하지 않았다 | |
| 스핀 시작 | 잎 바스락 + 대나무 4음 | 팝·딸깍 대신 |
| 릴 정지 | 낮은 톡(180→100 Hz) + 작은 나무 소리 | |
| 작은 당첨 | 칼림바 3음 + 잎 + 낱알 흩뿌림 | |
| 큰 당첨 | 레인스틱 → 하프 글리산도(등급이 오를수록 길다) → 피리 화음 → 낱알 | |
| 피처 | 레인스틱 + 흙 부풀음 + 대나무 6음 상행 + 하프 | |
| 기대감 | 칼림바 낱알이 점점 빨라지며 음계를 오름 + 아래서 부푸는 사인(98→247 Hz). 공용 사이렌형 스윕 대신 `anticipate` 사용 | 기존 8종과 가장 멀다(코사인 0.39~0.57) |

### 기본 레시피 (같은 이벤트끼리 CLAP 코사인, 높을수록 비슷)

| 이벤트 | 최대(상대) | 비고 |
|---|---|---|
| spin | 0.81 (shrine·hanbok) | |
| reelstop / reelstops | 0.86 / 0.89 (deepsea / fruit) | 짧은 원샷은 어느 프리셋끼리나 비슷하다 |
| winsmall | 0.88 (clockwork) | |
| winbig | 0.91 (deepsea) | **0.90 목표 초과** |
| feature | 0.91 (deepsea) | **초과** |
| mutation | 0.92 (hanbok) | 이 게임은 쓰지 않는다. hanbok 쪽 mutation 이 -33 LUFS 의 거의 무음이다 |
| riser | 0.57 (idol) | |
| rollup | 0.89 (deepsea) | |

- 기존 9개 프리셋끼리의 최대 쌍은 이벤트별 0.89~0.99다(spin 0.96, riser 0.99). garden 의 전체 최대 0.917 은 그 분포 안이고, 기획의 «≤0.90»은 winbig·feature 의 deepsea 쌍(0.91)과 mutation(사용 안 함)에서 못 맞췄다. deepsea 도 «물방울 → 파도 → 큰 화음» 구조라 겹치는 것으로 본다. 더 내리려면 큰 당첨 구조 자체를 바꿔야 해서 멈췄다.
- 레벨(LUFS): spin -31.4 · reelstop -31.6 · winsmall -20.6 · winbig -22.6 · feature -21.4 · mutation -25.5 · riser -29.1 · rollup -26.8. 처음 만든 소리는 winbig -29.4 로 다른 프리셋(-19~-24)보다 8dB 작아서 볼륨을 올렸다. true peak 는 전부 -7.5 dBTP 이하, 클리핑 0, 마지막 소리 끝(10ms) 무음.
- 정원 전용 소리(LUFS / dBTP): pop0 -25.5/-11.0 → pop8 -22.4/-10.9(단계가 오를수록 커지고 밝아짐) · drop -41.4 · grow5~7 -28.2~-27.4/-12.0 · bloom0 -24.4 · bloom1 -22.7 · bloom2 -22.6/-11.1(길이 0.72→1.26 s) · sun0 -25.0 · sun2 -25.7 · water -33.9.

### 배경음 (92 bpm, F 장조, 셔플 8분, 칼림바 아르페지오 + 부드러운 피리 선율 + 브러시 셰이커 + 손으로 뜯는 낮은 베이스, 기본 꺼짐)

- free(정원 프리스핀): +2반음(G), 1.04배 빠르게, 대나무 윈드차임 대선율, 16분 셰이커. 악보 데이터만 `bgmGarden.ts`에 있고 `bgm.test.ts`의 구조 검사(정렬·마디 안·음역 24~100)를 통과한다.
- LUFS(20~50초): base -32.4 / free -30.0, true peak -18.9 / -18.7. 밝기(중심주파수 Hz): base 505 / free 739.
- 코사인(20~50초, base): bell 0.71 · hanbok 0.85 · idol 0.73 / candy 0.90 · clockwork 0.88 · shrine 0.92 · fruit 0.92 · deepsea 0.92 · **western 0.95**. base ↔ free 0.926.
- **«≤0.90» 목표는 못 맞췄다.** CLAP 이 뜯는 현악·칼림바 배경음을 한 군으로 묶기 때문이다(앞 절의 western – shrine 0.958 → 0.910 이 같은 현상, 기존 7곡 최대 쌍도 0.91). 믹스 비중을 타악·피리·대선율 쪽으로 옮겨 western 0.945 → 0.953 으로 오히려 조금 올랐다 — 음색보다 «뜯는 현 + 느슨한 박» 구조가 지배한다. 더 내리려면 편성을 크게 바꿔야 해서 귀 판정으로 넘긴다.

### 믹스 (30초 장면, BGM 40%)

- 합본 -26.3 LUFS, true peak -7.5 dBTP, 클리핑 0.
- 효과음 − 배경음(dB): 릴 정지 +7.6 · 작은 당첨 +12.8 · 기대감 +13.9 · 큰 당첨 +20.2 · 피처 +28.5. 덕킹: 기대감 −5.6 · 큰 당첨 −5.0 · 피처 −12.9 dB.

### 귀로 확인할 것 (earshot 이 못 가르는 것)

- 칼림바 팝이 9단계까지 올라가며 «꽃이 하나씩 터지는» 진행감으로 들리는지, 연쇄 중 마지막 단계가 귀를 찌르지 않는지(8단계 -22.4 LUFS).
- 성장 소리(윈드차임 + 흙 쿵 + 덮개 톡)가 판이 넓어지는 느낌과 맞는지, 빠름·터보에서 겹쳐 시끄럽지 않은지.
- 씨앗 개화의 새싹·봉오리·꽃 세 등급이 귀로 구별되는지.
- 큰 당첨이 deepsea(0.91)와 같은 소리로 들리지 않는지, 기대감 낱알이 «곧 터진다» 긴장으로 들리는지.
- BGM 이 western·shrine 과 같은 곡처럼 들리지 않는지(0.92~0.95).
- 최종 귀 판정은 사용자 몫이다.

### 파일 (저장소 밖)

- 하네스·분석: `D:/park/tgslot-wt/_qa/new-b-sound/garden/{setup.js,entry.ts,build.mjs,run.mjs,analyze.py,mixcheck.py}`, 측정 로그 `final_sfx.txt`·`final_bgm.txt`·`final_mix.txt`.
- 스템·믹스: `.../garden/wav/garden_<spin|reelstop|reelstops|winsmall|winbig|feature|mutation|riser|rollup|ui>.wav`, 정원 전용 `cue_<pop0|pop3|pop6|pop8|drop|grow5|grow6|grow7|bloom0|bloom1|bloom2|sun0|sun2|water>.wav`, BGM `bgm_garden_{base,free}.wav`(50초), 믹스 `mix_garden_{mix,sfx,duck}.wav`.
