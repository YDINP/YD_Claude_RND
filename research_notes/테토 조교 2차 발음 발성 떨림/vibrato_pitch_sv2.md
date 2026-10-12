# SV2 (2.1–2.2.x) 비브라토·피치 장식 제어 (Teto AI 2) — pitchControls, AI 비브라토, Expression Pad, 전이 형태, 레퍼런스 모사

조사 한계: dreamtonics 공식 매뉴얼(sv2.docs / dreamtonics.com / forum.dreamtonics.com / sv1.docs)은 WebFetch가 403이라 직접 열람하지 못했다. 그 내용은 검색 결과 요약, 중국 미러(dreamtonics.com.cn), 같은 저장소의 선행 조사(`research_notes/테토 조교 방법/synthv2_params_svp.md`, `research_notes/테토 화음 SV2 조교 고도화/sv2_features_workflow.md`)에서 가져왔고 각 항목에 신뢰도를 표시했다. 본 조사에서 SV2가 실제로 저장한 pitchControls 예시 파일은 로컬에서도 찾지 못했다(아래 첫 절).

## 1. pitchControls (Smart Pitch Control) JSON 형식, 절대/상대, pitchDelta·AI 피치와의 결합

### Takeaway
group.pitchControls[]는 `type` 판별 유니온이며 point는 `{type,pos,pitch,id}`, curve는 거기에 `points`(평탄화된 [시간오프셋, 반음오프셋] 쌍)가 붙는다. LibreSVIP 생성기 코드로 단위가 확인된다: `pos`=블릭, `pitch`=절대 MIDI 반음(센트/100), curve 점은 `pos`·`pitch` 기준 상대값. 컨트롤은 해당 시간 구간의 AI 생성 피치를 «덮어쓰고»(override), pitchDelta는 그 위에 더해진다. 실제 SV2 저장 파일의 pitchControls 덤프는 찾지 못했다(가장 큰 공백).

### Cited Findings
- 모델: `SVGroup.pitch_controls`는 `SVPitchControl` 리스트이며 `type_`("point"/"curve")으로 구분된다. 공통 필드 `pos:int`, `pitch:float`, `id`(별칭 id_value). curve는 `SVBasePoints`를 상속해 `points`가 JSON에서는 평탄한 쌍 배열이고 내부에서는 `SVPoint(offset, value)`. 파라미터 곡선(`SVParamCurve`)은 `mode`가 linear/cubic/cosine/sigmoid — [LibreSVIP svp/model.py](https://github.com/SoulMelody/LibreSVIP/blob/main/libresvip/plugins/svp/model.py) (WebFetch 요약, 신뢰도 높음·2차 요약)
- 생성 코드: `base_pitch/100.0`을 `pitch`로, 각 점은 `offset = ticks_to_position(p.x) - base_position`, `value = (p.y - base_pitch)/100.0`; `pos`는 곡선 시작 위치, `id`는 `str(len(pitch_controls)+1)` — [LibreSVIP synthv_generator.py (raw)](https://raw.githubusercontent.com/SoulMelody/LibreSVIP/main/libresvip/plugins/svp/synthv_generator.py) (신뢰도 높음). 즉 **pitch는 절대 MIDI 번호(반음) 기준 앵커, points의 value는 앵커 대비 상대 반음**.
- 같은 생성기: 센트 곡선에서 y == -100 인 점은 구간 끊김 표식이고, 구간마다 curve 하나를 만든다. SV 2.0 이상 타깃(project version 182)에서는 pitchDelta를 쓰지 않고 pitchControls 곡선으로 피치를 낸다 — 같은 출처 및 [options.py](https://github.com/SoulMelody/LibreSVIP/blob/main/libresvip/plugins/svp/options.py) (선행 조사 인용)
- 공식 스크립팅 API: `PitchControlCurve`는 앵커 `getPosition()`(블릭, 그룹 시간 오프셋 기준), `getPitch()`(반음, 그룹 피치 오프셋 기준), `getPoints()`는 [time, value] 쌍(time=앵커 상대 블릭, value=앵커 상대 반음), `getValueAt(time)`은 보간값, `setPoints/setPitch/setPosition`, since 2.1.0. 앵커는 GUI에 보이지 않고 점들 bounding box 중심 «보통». 보간 방식은 문서에 명시되지 않음 — [PitchControlCurve](https://resource.dreamtonics.com/scripting/PitchControlCurve.html)
- 같은 문서: 곡선은 NoteGroup 안의 시간 구간에서 «생성된 피치를 덮어쓴다(overrides the generated pitch)» — [PitchControlCurve](https://resource.dreamtonics.com/scripting/PitchControlCurve.html)
- Pitch Deviation(pitchDelta)은 AI 생성 피치와 Smart Pitch Controls 양쪽과 합산된다(검색 요약) — [SV2 Pitch 매뉴얼](https://sv2.docs.dreamtonics.com/en/pitch) (403, 검색 요약 경유; 선행 조사도 동일 결론)
- 이 저장소의 앱 저장 파일 전수 스캔(recovery, 69개 .svp, version 187/196): pitchControls가 채워진 파일은 0개, 키는 전부 빈 `[]`. 즉 로컬에도 실물 예시가 없다. 노트 attributes에는 `evenSyllableDuration, muted, dF0VbrMod`만 나타났다(expValueX/Y 없음 = 한 번도 GUI에서 패드를 움직이지 않은 상태) — 로컬 측정(`C:\Users\parkk\AppData\Roaming\Dreamtonics\Synthesizer V Studio 2\recovery`)
- 위에서 SV2.1.2는 모든 그룹에 9개 파라미터 키(`pitchDelta, vibratoEnv, loudness, tension, breathiness, voicing, gender, toneShift, mouthOpening`)와 `"vocalModes": {}`, `"pitchControls": []`를 쓴다 — 선행 조사 `synthv2_params_svp.md` §1 (로컬 앱 저장 파일 근거)
- 점 하나(point) 형식 `{"type":"point","pos":..,"pitch":..,"id":..}`의 단독 예시는 LibreSVIP 모델 설명에서만 확인(실파일 예시 아님).

### Inferences
- 구현용 curve 예시(추정, LibreSVIP 의미론 기반): 노트 MIDI 60, 시작 `pos=P`에서 비브라토를 그린다면 `{"type":"curve","pos":P,"pitch":60.0,"id":"1","points":[0,0, dt1,+0.5, dt2,-0.5, ...]}` (points는 평탄한 [offset, value] 쌍). 센트→반음은 /100, 시간→블릭 변환은 파이프라인이 노트에 쓰는 것과 동일 눈금.
- pitchControls는 «그 구간 AI 피치 대체»이므로 비브라토를 컨트롤 곡선으로 그리면 AI 비브라토·AI 전이가 그 구간에서는 사라진다. 반면 pitchDelta 사인파는 AI 비브라토 위에 더해져 이중 비브라토가 된다 → 사인을 쓸 때는 `dF0VbrMod=0`(이미 kit.py 'sine' 모드가 하는 방식)이 필수. 컨트롤 곡선은 구간 경계에서 AI 피치와의 접합점(점프) 처리가 필요하다.
- 어느 쪽이 더 자연스러운가: 직접 비교한 출처는 없다. 공식 방침은 «Rigid + 컨트롤 포인트 = V1 Manual Mode 같은 일정한 비브라토»(1.5절)이므로, 기계적으로 정확한 모사는 Rigid+컨트롤 곡선, AI 질감 유지는 `dF0VbrMod`+Vibrant 쪽이 합리적이라는 추론이다(미검증).

### Gaps
- SV2.1+가 저장한 실제 pitchControls JSON 덤프(포럼·깃허브)는 찾지 못함. 실물 확인 방법: GUI에서 노트 하나에 Smart Pitch Control 곡선을 그린 뒤 저장하고 diff(로컬 recovery 폴더에서 바로 확인 가능).
- `pos`가 그룹 상대 블릭인지 절대 블릭인지(메인 그룹 오프셋 0이면 동일), `id` 고유성 요건, 곡선 보간 알고리즘(선형/큐빅)은 미확인.
- pitchControls와 pitchDelta의 정확한 합산 순서(전자가 AI를 대체한 뒤 후자가 더해진다는 설명은 요약 수준).

## 2. AI 비브라토 동작과 dF0VbrMod / vibratoEnv, SV2의 비브라토 속도·깊이·시작 제어

### Takeaway
SV2에는 V1의 노트별 비브라토 수치(깊이·주파수·위상·시작·페이드)가 없다. AI가 긴 노트에 알아서 비브라토를 넣고, 사용자는 (a) 노트별 Vibrato Modulation=`attributes.dF0VbrMod`(0~2, 기본 1), (b) 시간축 Vibrato Envelope=`vibratoEnv` 파라미터(0~2 배율), (c) 표현 패드, (d) Smart Pitch Control에서 점/곡선 선택 후 «리사이즈 핸들»로 깊이·속도를 조절한다. AI 비브라토의 길이 임계값·지연은 문서화되어 있지 않다.

### Cited Findings
- Manual Mode는 V2에서 폐지, V1에서 수치로 지정하던 비브라토는 Smart Pitch Controls에서 깊이·주파수를 직관적으로 편집 — [Dreamtonics 마이그레이션 가이드(.cn 미러)](https://www.dreamtonics.com.cn/?p=3556); 요약 경유 [SV2 prev-version-changes](https://sv2.docs.dreamtonics.com/en/prev-version-changes)
- 2.1.0: 포인트 모드 재설계, 영역 선택 시 생성된 피치 곡선을 따라 컨트롤 포인트 자동 생성; 여러 점/곡선을 선택하면 리사이즈 핸들이 나타나 피치 벤드·비브라토의 «깊이와 속도»를 즉시 조절 — [Recording Magazine](https://www.recordingmag.com/news/synthesizer-v-studio-2-pro-2-1-0-out-now/), [Sonic State](https://sonicstate.com/news/2025/06/17/synthesizer-v-studio-2-pro-updated/), [KVR](https://www.kvraudio.com/news-print.php?id=64457)
- 길이가 긴 노트의 비브라토량은 V2에서 도입된 X/Y 패널이 표현성과 비브라토 변조를 함께 조절 — [Sound On Sound 리뷰](https://www.soundonsound.com/reviews/dreamtonics-synthesizer-v-studio-2-pro?amp)
- Vibrato Modulation(노트 속성 `dF0VbrMod`): 0.00~2.00, 기본 1.00; Sing 모드에서만 유효. Vibrato Envelope(Parameter 패널)는 시간에 따른 비브라토 세기 — [Notes Panel](https://sv2.docs.dreamtonics.com/en/notes-panel), [Base Parameters](https://sv2.docs.dreamtonics.com/en/parameters) (선행 조사 §2 인용; 403으로 직접 열람 못함)
- 스크립팅 `Note.getAttributes`: `dF0VbrMod`(pitch vibrato modulation, since 1.9.0b2), `expValueX/Y`(expression pad parameter X/Y, since 2.1.1), 값 범위 설명 없음. 숫자 속성은 노트가 NoteGroupReference 기본값을 쓰면 NaN — [Scripting: Note](https://resource.dreamtonics.com/scripting/Note.html)
- LibreSVIP 모델: `dF0VbrMod`는 베이스 속성, `expValueX/Y`와 `pF0Vbr`, `dF0Jitter`는 `SVNoteAttributes`; `tF0VbrStart/Left/Right, dF0Vbr, fF0Vbr`는 V1 키이며 None이면 DEFAULT_VIBRATO_* 폴백 — [LibreSVIP model.py](https://github.com/SoulMelody/LibreSVIP/blob/main/libresvip/plugins/svp/model.py)
- V1 전용 키(V2 보이스에서 무시/비노출): `tF0Offset, tF0Left, tF0Right, dF0Left, dF0Right, tF0VbrStart, tF0VbrLeft, tF0VbrRight, dF0Vbr, pF0Vbr, fF0Vbr, tNoteOffset, exprGroup, dur, alt` (공식 Scripting 표기 "Version 1 only"). V1 기본값 표(선행 조사 인용): 포르타멘토 0.07s, 비브라토 시작 0.25s, 좌우 페이드 0.2s, 깊이 1.0반음, 5.5Hz, 위상 0 — 선행 조사 `synthv2_params_svp.md` §2, §5 (2차)
- 포럼 사용자 증언(요약 경유): V1의 전역 비브라토 제어가 V2에는 없고, V2 비브라토는 단순 사인 LFO에 묶여 있지 않아 보인다(기억 기반 발언) — [forum t/8112 (검색 요약)](https://forum.dreamtonics.com/t/am-i-missing-something-simple-global-vocal-vibrato-control-as-in-sv-1/8112), 신뢰도 낮음
- 스크립트로 비브라토를 그릴 때는 Vibrato Modulation을 0으로 두라는 조언(둘이 복합됨) — [Expressive Mapper Pro 포럼 스레드 (검색 요약)](https://forum.dreamtonics.com/t/script-expressive-mapper-pro-3-v3-6-1-auto-tuning-harmonies-chords-0-0-6/8326), 신뢰도 중
- 이 저장소 구현 사례: `synthv-kit/tune.py`는 `dF0VbrMod = 0 if 노트 길이 < period or not vib else clip(vib/35, 0, 2)`(원곡 측정 비브라토 진폭(cent)/35)로 노트별 AI 비브라토 양을 지정, 'sine' 모드는 AI를 끄고 사인 합성 — 로컬 `ben_suno/vocalo-ch/synthv-kit/tune.py` 88–97행, 54행. 검증 범위: `vibratoEnv` 0–2, 선행 조사는 안전 범위 0–1.5 권고.

### Inferences
- «깊이는 dF0VbrMod, 시간 모양은 vibratoEnv, 속도(Hz)는 직접 제어 불가» — 속도(주파수)를 지정하려면 컨트롤 곡선/pitchDelta 사인이 유일하다(GUI의 핸들이 속도를 조절한다는 보도는 곡선 점을 시간축으로 늘리는 조작으로 추정).
- AI 비브라토 발생 임계 길이·지연은 미문서. 이 저장소가 `d < period`(period는 비브라토 주기)일 때 0으로 끄는 것은 합리적 가드이지 공식 규칙은 아니다. 실측하려면 렌더 F0에서 노트 길이별 비브라토 존재 여부를 측정해야 한다.

### Gaps
- AI 비브라토의 길이 임계값·시작 지연·평균 주파수(Hz)·진폭은 어떤 출처에도 없음. dF0VbrMod=1일 때의 cent 진폭도 미공개 → 렌더 후 F0 측정으로 얻어야 함.
- Notes 패널에 «속도/위상» 컨트롤이 있는지: 확인되지 않음(공식 요약상 노트별 컨트롤은 Vibrato Modulation 하나).
- 2.2.x 변경 로그는 열람 못함.

## 3. Expression Pad 모서리(Vibrant/Refined/Raw/Rigid)의 비브라토·전이 영향, expValueX/Y 수치

### Takeaway
네 모서리의 질적 정의는 공식 문서에 있으나 `expValueX/Y`의 수치 범위·부호는 어디에도 없다. Rigid는 평탄 피치+노트 경계의 작은 under/overshoot만 남기고 비브라토가 사라지며 AI 리테이크 영향도 받지 않는다. 같은 저장소의 선행 조사가 이미 이 항목을 정리했고, 본 조사에서 새로 추가된 수치 근거는 없다.

### Cited Findings
- Vibrant: 더 표현적·깊은 비브라토. Refined: 주류 취향에 맞는 안정적·숙련된 느낌(다양성은 낮음). Raw: 매우 동적, 피치 보정 감소, 음정 이탈 가능성 증가. Rigid: 평탄, 노트 경계 부근에만 미세 변동, AI 리테이크 영향 없음; V2 보이스 전용 — [SV2 Notes Panel](https://sv2.docs.dreamtonics.com/en/notes-panel), [Pitch](https://sv2.docs.dreamtonics.com/en/pitch) (선행 조사 `sv2_features_workflow.md` §2 인용)
- Rigid 컨트롤 포인트는 V1 Manual Mode 슬라이더처럼 동작: «안정적인 진동 속도의 비브라토, 명확한 노트 전이, 정밀하게 제어되는 피치 오프슈팅». Rigid는 «각 노트 시작과 끝에 작은 언더슈트/오버슈트»를 만들고, Rigid와 다른 모드 사이를 보간할 수 있다 — [Dreamtonics 마이그레이션 가이드(.cn 미러)](https://www.dreamtonics.com.cn/?p=3556)
- 마이그레이션 가이드의 Pitch Deviation 이전 절차: Pitch Deviation이 있는 노트를 Rigid로 바꾸고 → Trace Pitch into Control Points로 변환 → Pitch Deviation 제거 후 Smart Pitch Controls로 편집 — 같은 출처
- 테토 실사례: kenchan(2025-11-29) 重音テトAI 2 커버는 표현 컨트롤을 ストレート(Rigid) 쪽으로 «중간까지만» 이동(완전 Rigid면 비브라토가 사라짐), 일부 노트만 Smart Pitch로 수정 — [kenchan note](https://note.com/kenchan21/n/nfa459d01256e) (선행 조사 인용, 원문 재열람 안 함)
- 일본어 UI: デフォルト(중심)·ダイナミック(Vibrant)·リファイン(Refined)·アクティブ(Raw)·ストレート(Rigid) — [ja/notes-panel](https://sv2.docs.dreamtonics.com/ja/notes-panel) (선행 조사 인용)
- 스크립팅 `expValueX/Y`는 since 2.1.1, 범위 명시 없음 — [Scripting: Note](https://resource.dreamtonics.com/scripting/Note.html) (본 조사에서 재확인)
- 로컬 파일: 69개 저장본 어디에도 expValueX/Y 키가 없다(패드 미조작 시 attributes에 기록되지 않음 = 기본값이 «NaN/키 없음») — 로컬 측정. 이 저장소 kit.py 204행 주석도 «Rigid(expValueX/Y)는 범위 미확인이라 아직 안 쓴다»고 기록.

### Inferences
- 패드 좌표는 정사각 [-1,1]² 같은 형태일 가능성이 높으나 추정일 뿐이다. 확정 방법: GUI에서 노트 4개를 각각 4모서리 끝까지 끌고 저장 → `attributes.expValueX/Y` 읽기(10분 작업, 가장 비용 대비 효과가 큰 확인).
- 모서리 보간 가능 + 스크립트 속성이 연속값이므로, Rigid와 Default 사이 ~50%가 «비브라토는 줄이되 완전히 죽이지 않는» 값일 것이다(kenchan 사례와 일치).

### Gaps
- expValueX/Y 수치 범위·축 방향, 모서리 값, Vibrant가 비브라토 길이·깊이를 구체적으로 몇 % 키우는지.

## 4. 전이(しゃくり, フォール, ポルタメント) 형태: 하드 스텝 vs 슬라이드, 노트 끝 글리산도·하강 억제

### Takeaway
SV2에는 V1의 노트별 포르타멘토 길이/깊이 컨트롤(tF0Left/Right, dF0Left/Right)이 없다. 전이는 AI가 만들고, 형태 제어 수단은 Expression Pad(Rigid=명확한 전이+미세 오버슈트), Vocal Mode 블렌드의 pitch 레벨, Smart Pitch 점/곡선(Rigid와 함께)이다. 노트 끝의 AI 하강 글리산도는 공식 해결 스위치가 없고, 포럼 보고된 대응은 컨트롤 포인트·Rigid 근처+리테이크·수동 수정이다.

### Cited Findings
- V1 전용 포르타멘토/오버슛 키(`tF0Left/Right`, `dF0Left/Right`)는 V2 보이스에서 UI 비노출 — 1·2절 출처. V2에서는 Manual Mode 폐지로 «기본 피치 생성 알고리즘은 항상 존재» — [마이그레이션 가이드(.cn)](https://www.dreamtonics.com.cn/?p=3556)
- Rigid: 평탄 피치+노트 시작/끝의 작은 under/overshoot; «Rigid 모드의 컨트롤 포인트는 명확한 노트 전이를 만든다» — [마이그레이션 가이드(.cn)](https://www.dreamtonics.com.cn/?p=3556); 선행 조사에서 인용된 [Pitch 매뉴얼](https://sv2.docs.dreamtonics.com/en/pitch)은 "Rigid quadrant generates only flat pitch curves, 기계적 소리 또는 개인 스타일의 피치 가능"(검색 요약 경유)
- V2 보이스가 노트 끝에 큰 하강 글리산도를 붙이는 경향 보고, 대응: 피치 컨트롤 포인트, Rigid 근처+리테이크, 펜 수동 수정; 일부 사용자는 해결 못함 — [forum t/4400](https://forum.dreamtonics.com/t/4400) (선행 조사 인용, 원문 미열람)
- 화음용으로 Rigid+낮은 비브라토 권고, 단 «Rigid로 바꿔도 평균 피치가 이상보다 높다»는 버그 보고와 PitchPerfect.js 우회 — [forum t/7788](https://forum.dreamtonics.com/t/7788), [t/1637](https://forum.dreamtonics.com/t/1637) (선행 조사 인용)
- 피치를 모든 것 고정: Modify → Trace Pitch into Control Points로 생성 곡선을 컨트롤 점으로 굳히면 보이스 변경·재렌더에도 모양이 유지되고 점을 편집해 꼬리 하강을 수정할 수 있다 — [Sonic State](https://sonicstate.com/news/2025/06/17/synthesizer-v-studio-2-pro-updated/), [마이그레이션 가이드(.cn)](https://www.dreamtonics.com.cn/?p=3556)
- 최근 릴리스에서 Reset Pitch가 노트 위 pitch control 객체도 제거하도록 변경(검색 요약; 버전 불명) — [검색 요약](https://www.dreamtonics.com.cn/?p=3556)
- 歌唱 F0 변동의 정의(모사 목표 정의에 쓸 수 있음): 오버슈트=노트 변화 후 목표를 넘어서는 편향, 프리퍼레이션=노트 변화 직전 반대 방향 편향. 프로 가수 1명·아마추어 3명 측정에서 오버슈트 extent 11%(프로, 아마 13–18%), 지속 126ms(프로, 아마 163–223ms), 프리퍼레이션 extent 9.8%·119ms(프로) — [Saitou et al., Interspeech 2009](https://www.isca-archive.org/interspeech_2009/saitou09_interspeech.pdf) (원문 PDF 추출 확인, 표 1; extent %의 기준(음정 단차 대비로 추정)은 본문 확인 못함)
- 「しゃくり/フォール」를 SV2에서 구현하는 방법에 대한 일본어 1차 출처는 검색에서 나오지 않았다(검색 결과에 구체 절차 없음).

### Inferences
- 하드 스텝(슬라이드 없음)을 만들려면: 해당 노트 Expression Pad를 Rigid로 + 컨트롤 곡선을 노트 경계에서 수직에 가깝게(수 ms 폭) 배치. 곡선 점 간격이 AI 평탄화 대신 «그린 그대로» 재생되므로 경계 점 두 개(앞 노트 끝 pitch, 뒤 노트 시작 pitch)를 5–10ms 간격으로 두면 거의 계단이 된다(미검증, 합리적 추정).
- しゃくり = 노트 시작 직전~직후에 –0.5~–2반음에서 목표로 올라가는 곡선(오버/언더슈트가 아닌 의도된 접근), フォール = 노트 말미 100–400ms 동안 –1~–3반음 하강. 둘 다 Rigid + 컨트롤 곡선으로 «덮어쓰기»하는 것이 유일하게 결정적인 방법이다. 수치는 아래 5절 레퍼런스 측정으로 정하는 것이 맞다(임의 수치 금지).
- AI의 말미 하강을 막는 방법: (1) 해당 구간을 컨트롤 곡선으로 평탄하게 덮어쓴다, (2) 패드를 Refined/Rigid 쪽으로, (3) 리테이크 재시도. 후보 (1)이 결정적.

### Gaps
- V2 전용 노트별 «포르타멘토 길이»에 해당하는 스위치가 없음을 확정할 공식 문장(부정 사실)은 못 찾음; V1-only 목록에 포함된 것이 근거.
- フォール/しゃくり의 SV2 일본어 튜토리얼, 말미 하강의 정량 데이터.
- 컨트롤 곡선의 최소 시간 해상도(수 ms 점 간격이 유지되는지).

## 5. 레퍼런스 가수 모사: 비브라토 측정(rate/extent/onset)과 재현, 피치 임포트 워크플로

### Takeaway
SV2에 외부 F0를 직접 가져오는 공식 임포트는 없다. 현실적 경로는 «F0 추출 → 노트 기준 상대 cent → pitchDelta 또는 pitchControls(curve) JSON으로 직접 작성»이며 이 저장소 kit.py의 mimic 루프가 이미 pitchDelta로 하고 있다. 비브라토 파라미터는 문헌값(4–8Hz, 20–150cent, 프로 약 6.3Hz/65cent)을 사전분포로 쓰되 곡별 실측으로 대체한다.

### Cited Findings
- 가수 비브라토 문헌값: 프로 4–8Hz 일반, 5–6Hz 선호; 폭(extent) 20–150cent — 리뷰 기반 검색 요약 (원 리뷰 직접 열람 안 함, 신뢰도 중). Saitou 2009 측정: 프로 6.3Hz(분산 1.3)·65cent(분산 9.5), 훈련된 아마추어 4.8–5.3Hz·49–57cent, 훈련 전 41–48cent. 훈련은 폭과 안정성은 개선했으나 속도(rate)는 개선하지 못했다 — [Saitou et al., Interspeech 2009](https://www.isca-archive.org/interspeech_2009/saitou09_interspeech.pdf) (PDF 직접 추출, 표 1, 신뢰도 높음). 비브라토 정의 4–7Hz 준주기 FM — 같은 논문
- 지각 기여도 순위: 비브라토 > 가창 포먼트 > 오버슈트 > 프리퍼레이션 — 같은 논문 초록/결론
- 측정 도구: VibratoScope(오픈소스 Python, 비브라토 rate/extent(cent) 등, 기본 3–9Hz 대역필터) — [검색 결과: science.ecosyste.ms](https://science.ecosyste.ms/projects/37213) (요약만, 신뢰도 중)
- VocaListener(AIST 나카노·고토): 목표 가창의 F0·파워를 추정해 합성 파라미터를 반복 갱신하며 모사하는 시스템; 오버슈트·프리퍼레이션·비브라토를 분리 모델링한 관련 연구가 같은 연구실 계열 — [VocaListener 프로젝트](https://staff.aist.go.jp/t.nakano/VocaListener), [Saitou 2009]. 세부 추정 알고리즘은 확인 못함
- Ohishi 등은 2차 선형계 대신 가우시안 프로세스로 F0 동역학 파라미터 추정 — [ISCA Interspeech 2010](https://www.isca-archive.org/interspeech_2010/ohishi10_interspeech.html) (검색 요약)
- SV2 쪽 임포트: Melodyne/Praat 연동 문서는 없음. 커뮤니티 워크플로는 Praat TextGrid로 타이밍·F0 분석 후 노트 중앙값을 계산해 SynthV로 내보내는 것이었고, 곡선 수동 복사는 매우 힘들다고 보고(검색 요약) — [forum.synthesizerv.com/t/topic/10189](https://forum.synthesizerv.com/t/topic/10189/29)
- SV2.1.1부터 스크립트(JS/Lua)가 pitch control points/curves를 읽고 쓸 수 있다 → 외부 F0를 곡선으로 주입하는 스크립트 가능. 커뮤니티 «Controls Generator» 스크립트(Manual Mode 스타일 피치 곡선 생성)가 존재 — [Dreamtonics 2.1.1 안내(Sonic State 요약)](https://sonicstate.com/news/2025/06/17/synthesizer-v-studio-2-pro-updated/), [forum t/7912](https://forum.dreamtonics.com/t/controls-generator-script-manual-mode-style-pitch-curve-in-studio-2/7912/2) (403이라 코드 열람 불가)
- 또한 2.1.x의 «Trace Pitch into Control Points»는 보이스 변경 시 피치 유지용 — [Sonic State](https://sonicstate.com/news/2025/06/17/synthesizer-v-studio-2-pro-updated/)
- 이 저장소: `kit.py mimic`은 원곡 리드와 렌더를 비교해 pitchDelta·loudness를 누적 보정(감쇠 계수)하는 루프 — 로컬 `ben_suno/vocalo-ch/synthv-kit/tune.py` 7행

### Inferences
- 구현 규칙(파이프라인용, 추정 포함):
  1. 원곡 리드 F0(예: pyin/CREPE/RMVPE) → 노트 경계로 분할 → 노트별 중심 cent 제거 → 잔차에서 3–9Hz 대역필터(VibratoScope 방식)로 비브라토 성분 분리.
  2. 노트별 rate(Hz, 자기상관/Hilbert), extent(cent, half 기준), onset(진폭 포락선이 정상치의 50%에 도달하는 시간), 사이클 수 추출. 노트 길이가 1주기+onset 미만이면 비브라토 없음 처리.
  3. 재현 방식 A(AI 질감 유지): `dF0VbrMod = clip(measured_extent / AI_extent_at_1, 0, 2)`. AI_extent_at_1은 모르므로 렌더 F0를 측정해 곡별로 보정(현재 kit의 /35는 그런 경험값으로 보임, 근거 없는 상수이므로 검증 필요). 속도·onset은 맞출 수 없다.
  4. 재현 방식 B(정밀 모사): 패드 Rigid(또는 Rigid~Default 50%) + `dF0VbrMod=0` + pitchControls curve에 [시간, 반음] 쌍으로 측정 F0 잔차(평활화)를 그대로 넣는다. 속도·onset·전이(しゃくり/フォール)까지 한꺼번에 재현되므로 «VocaListener식 직접 복사»에 가장 가깝다. 대가는 AI 자연스러움 상실, 구간 경계 접합.
  5. 평가: 렌더 F0 vs 원곡 F0의 노트별 rate/extent 오차를 지표로 한 반복(기존 mimic 루프를 vibrato 항으로 확장).

### Gaps
- VocaListener의 정확한 비브라토 추정식, VibratoScope 원 논문/레포 직접 열람.
- 비브라토 onset 지연의 문헌 수치(찾지 못함; Saitou의 preparation은 onset과 다른 개념).
- SV2에서 외부 F0를 pitchControls로 가져오는 공개 스크립트·변환기(발견 못함; LibreSVIP는 pitch curve→pitchControls 변환을 구현하므로 코드 재사용이 가능한 유일한 공개 구현).
