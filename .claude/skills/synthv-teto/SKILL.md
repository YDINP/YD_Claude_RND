---
name: synthv-teto
description: Synthesizer V Studio 2 Pro 로 카사네 테토 AI 2 를 조교(튜닝)·제어한다. Suno 곡을 테토로 다시 부르게 하는 synthv-kit 파이프라인(분리→박→가사 정렬→채보→.svp→렌더→박 보정→모사 루프)과 조교 지식(보컬 모드 프리셋, しゃくり·フォール·비브라토·語尾息, .svp 키·범위, V1 전용 키 금지). 다음 상황에서 사용 - 테토/보카로/SynthV 조교, .svp 생성·수정, 보컬 모드 블렌드, 원곡 보컬 모사, SynthV 렌더 자동화. 예시 - "이 곡 테토로 조교해줘", "사비를 더 건방지게", "원곡 보컬에 더 가깝게", "SynthV 렌더 돌려줘"
---

# SynthV 2 · 카사네 테토 AI 2 조교

도구: `ben_suno/vocalo-ch/synthv-kit/` — `kit.py`(파이프라인), `tune.py`(조교 규칙·검사기·모사 루프), `sv_render.ps1`(마우스 없는 렌더).
근거 보고서: `reports/테토 조교 방법.md` (신뢰도 A 공식·로컬 저장본 / B 연구 / C 실천 다수 / D 단일 사례 / E 추론).

## 철칙
- **마우스·키 주입 금지.** 렌더는 `sv_render.ps1`(UIA Invoke)만. 사용자가 열어 둔 SynthV 창은 닫지 않는다 — 새 파일명으로 렌더하면 그 창은 건드리지 않는다.
- **수정마다 렌더 → `score`/`measure` 수치 확인 → 사용자에게 들려준다.** 숫자가 좋아도 최종 판정은 귀.
- SynthV 에는 명령줄 렌더·외부 API 가 없다. 스크립트(JS/Lua)는 GUI 안에서만 돈다 → .svp JSON 을 직접 쓴다.
- 실측으로 맞춘 부분은 건드리지 말 것: grid(템포 일치도·드럼 위상), align/MMS, rhythm·grid_dp(같은 줄 레가토 + 줄 끝 숨 — «끊김»/«툭툭 안 남» 균형), harmony(리드와 다른 음만), RENDER_LAG_FIX, correct 1회(2회는 넘침).
- **SynthV 2.2.1 은 겹친 노트·길이 0 이하 노트·끝<시작 그룹 참조가 있으면 열자마자 접근 위반으로 죽는다.** .svp 를 손으로 고쳤으면 저장 전에 `tune.guard(d)` 를 거친다(build·correct·mimic 은 자동). 강제 종료 뒤 뜨는 «Auto Recovery» 창은 오른쪽 버튼이 Cancel 이고, `sv_render.ps1` 이 알아서 닫는다.
- 테토 에디터는 체험판(~2026-10-23 만료) — 상업 업로드 전 활성화 확인.

## 파이프라인 (곡 폴더 `vocalo-ch/<곡>/synthv*/`, `song.json` 하나)
```bash
PY=../../../.venv-mir/Scripts/python.exe; K=../../synthv-kit/kit.py; W=$(cygpath -w $PWD)
$PY $K sep && $PY $K grid && $PY $K align        # 분리(RoFormer) · 박(beat_this) · 가사 정렬(MMS)
$PY $K build x.svp                                 # 표현 모드 조교 포함
powershell -NoProfile -ExecutionPolicy Bypass -File ../../synthv-kit/sv_render.ps1 -Svp "$W\x.svp" -RenderDir "$W\render" -Prefix x -Close
$PY $K correct x.svp xb.svp && <렌더 xb> && $PY $K score xb.svp
$PY $K tune xb.svp 3                               # 모사 루프: xb_m0(얼림) → m1 → m2 → m3, tune_log.json
```
렌더 1회 ≈ 25초(3분 곡). `tune 3` ≈ 2분.

## 두 모드 — 섞지 않는다
| | 표현 모드 (`build`) | 모사 모드 (`tune`/`mimic`) |
|---|---|---|
| 목표 | 테토다운 노래, AI 피치 존중 | 원곡(Suno) 보컬의 음정·강약을 그대로 |
| 쓰는 키 | ref `voice.vocalModeParams`, `attributes.dF0VbrMod`, 규칙 pitchDelta·loudness·breathiness | `pitchDelta`·`loudness` 잔차 누적 |
| AI 비브라토 | 켬(긴 음만, 1박 미만 0) | 끔(`dF0VbrMod 0`) — 기저 곡선이 움직이면 수렴 안 함 |
| 노트 타이밍 | correct 가 맡음 | 안 건드림(이중 보정 금지) |

모사 루프 실측(いい子症候群 v14b, 3회): 피치 MAE 36.2→**7.2 cent**, 0.75반음 일치 67.8→**84.0%**, 음량 MAE 7.44→**2.95 dB**, 음량 상관 0.08→0.77. 이득은 2회차에 가장 크다(VocaListener 와 같은 양상). 박 흩어짐은 19→26ms 로 조금 늘었다(원곡 37ms). 렌더는 결정적(같은 .svp 두 번 → 차이 −56dB).
주의: 모사는 Suno 의 버릇(분리 잔여·떨림)까지 옮긴다. 원곡이 정답이 아닐 땐 표현 모드로 끝내거나 감쇠를 낮춘다(`mimic src dst 0.5`).

## song.json 조교 키
| 키 | 뜻 · 기본값 |
|---|---|
| `modes` | 섹션 접두어 → `{모드: 0~150}` 또는 프리셋 이름 `"downer"`·`"utau"`·`"bratty"` 또는 `{"preset": "utau", "Rock": 30}` |
| `style.vibrato` | 섹션 → 세기(35 = AI 기본 1.0배 → `dF0VbrMod` = 값/35, 최대 2). 0 끔 |
| `style.vibrato_mode` | `"ai"`(기본) / `"sine"`(옛 방식: AI 끄고 5.5Hz 사인 합성 — 정확한 Hz 가 필요할 때만) |
| `style.scoop_cents` | しゃくり 깊이, 기본 −100. 줄 첫 음 + 3반음 이상 뛰는 강박 긴 음. 길이 1/32음(40~100ms), BPM≥140 이면 ½ |
| `style.fall_cents` | フォール, 기본 −80, 줄 끝 긴 음 마지막 60ms(빠른 곡 30ms) |
| `style.tail_breath` | 語尾息, 기본 +0.25 breathiness (줄 끝 긴 음 마지막 150ms) |
| `style.tension` · `style.breath` | 섹션 → 상수. 테토 AI 2 는 Tension 반응이 약하다 — ±0.3 안에서만, 음색은 모드로 |
| `rap` | 기본 비움. Suno 랩은 대개 음정 있는 랩 → `musicalType: rap` 이 음을 굴려 음치(0.75반음 일치 45% vs 일반 노트 87%). 진짜 말하는 랩에만 |

## 테토 AI 2 보컬 모드 (2025-11 발매, 7종)
| 모드 | 소리 | 쓰임 |
|---|---|---|
| Joyful · Cute | 효과 작음 | 벌스 밝게 |
| Power | 효과 큼, 절규는 부족 | 사비 |
| Mellow | 효과 큼, 문장 끝 숨 늘어남 | 브리지·아웃트로, 위스퍼 대용(+breathiness) |
| Low | 나른·어두움, 믹스에서 먹먹 | 다운너 |
| Mini | 높고 아이 같음 = UTAU 테토에 가장 가까움, 믹스에서 얇음 | UTAU 풍 |
| Rock | Power 보다 두껍고 거침, 강약 큼 | 보카록 사비 |

프리셋(`tune.PRESETS`): `downer` = Joy120/Cute5/Power130/Mellow130/Low140/Rock115 + Loud+8·Br+0.3·Gen+0.1·ToneShift−100 (陰影電設, D) · `utau` = Mini150+Power50 (kenchan, D) · `bratty` = Mini120+Rock45+Cute20 (E, 들어보고 고칠 것).
히트곡(テトリス·メズマライザー)의 테토 조교 수치는 공개된 게 없다 → «정답 파라미터» 대신 모사 루프를 쓴다.

## .svp 규격 (SV2.1.2, version 187)
- 4분음표 = 705,600,000 blick. 곡선 = 그룹 `parameters.<키>.points` = `[t, v, t, v, …]`(그룹 기준 blick), `mode: "cubic"|"linear"`.
- 범위(`tune.RANGES`, A): pitchDelta ±1200 cent · loudness −48~+12 dB · tension/breathiness/gender ±1 · voicing 0~1 · vibratoEnv 0~2 · 보컬 모드 0~150(API; GUI 다이얼 140 은 미확인). `tune.guard` 가 빌드·모사 때마다 잘라 준다.
- 노트 V2 속성 `attributes`: `dF0VbrMod`(0~2) · `expValueX/Y`(익스프레션 패드, 범위 미확인) · `phonemes[]` · `rTone`(−5~1)/`rIntonation`(±0.5, 랩) · `evenSyllableDuration` · `muted`.
- **V1 전용 키 금지**(테토 AI 2 에선 안 먹음): `tF0Offset tF0Left tF0Right dF0Left dF0Right tF0VbrStart tF0VbrLeft tF0VbrRight dF0Vbr pF0Vbr fF0Vbr tNoteOffset exprGroup dur alt` — `tune.guard` 가 오류로 막는다. SV2 에 비브라토 속도(Hz) 키는 없다.
- 그룹 기본값은 ref `voice`: `vocalModeInherited:false` + `vocalModeParams{모드:{pitch,timbre,pronunciation}}`, `paramLoudness/Tension/Breathiness/Gender/ToneShift`.
- 피치 컨트롤 `pitchControls[]`(2.1.0+), 구간 모드 자동화 `vocalModes{모드: 곡선}` — 앱 저장본 미확인, 아직 안 씀.

## 일본식 기법 → SV2 (수치는 출발값, 측정으로 덮어쓴다)
- しゃくり: 1/32~1/16음 동안 반음~온음 아래에서 (C). −50~−150c, 30~100ms (D).
- フォール: 줄 끝 −50~−100c, 20~80ms, 록에서 흔함 (D).
- 비브라토: 4~7Hz, 폭 50~200c (B, AIST). 긴 음·줄 끝만, 고속 보카록은 얕게.
- 語尾息: 마지막 100~200ms breathiness↑ loudness↓ (Mitchie M 원리, E).
- 브레스: 메인보다 −6~−12dB, 중요한 프레이즈 앞만 (D). 스타카토는 가사 앞 `'`(cl) (kenchan, D).
- 작업 순서: 음색(모드) 고정 → 강약·피치·비브라토 → 세부. SynthV AI 는 «더하기»가 아니라 «빼기»(과한 AI 장식 걷어내기).

## 미확인 — 사용자 GUI 저장본이 생기면 diff 로 확정
toneShift·mouthOpening 범위, expValueX/Y 범위·방향(Rigid = 왼쪽 아래), phonemes[] 단위, pitchControls 절대/상대, Gender 부호(매뉴얼 vs API 반대), 모드 최대 140 vs 150. 사용자 GUI 저장본은 `%APPDATA%\Dreamtonics\Synthesizer V Studio 2\recovery\` 에서 읽는다(마우스로 직접 만들지 말 것).
