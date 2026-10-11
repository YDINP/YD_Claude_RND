# SV2(2.0~2.2.x) 자연스러운 AI 보컬 기능과 숙련 조교자 워크플로 — 重音テトAI 2 중심

> 조사일 2026-10-11. 신뢰도 표기: [공식] Dreamtonics 매뉴얼·릴리스 노트·블로그 / [판매사] AHS / [리셀러] Eclipsed Sounds(Dreamtonics 보이스 판매사) / [커뮤니티] 포럼·note·블로그(개인 의견).
> sv2.docs.dreamtonics.com 은 WebFetch에서 403이 나서 curl(브라우저 UA)로 원문을 받아 읽었다. 페이지 목록은 wiki.js GraphQL로 확인했다: home, pianoroll, notes-panel, voice-panel, parameter-panel, ai-retakes, vocal-modes, phonemes, pitch, parameters, rap, doubling, effects-panel, prev-version-changes, project, limitation 등.

## 1. SV Studio 2 릴리스 노트: 2.1.x / 2.2.x에서 바뀐 것

### Takeaway
2.1.0은 Pitch Control Points 모드를 재설계했다(영역 선택 시 자동 트레이스, 리사이즈 박스로 깊이·속도 조절). 2.1.1은 스크립트 API에 `expValueX/Y`·`phonemes[]`·리테이크를 노출했다. 2.1.2는 V1 프로젝트를 가져올 때 Tension을 리셋하지 않고 «근사값으로 매핑»하도록 바꿨다. 2.2.0은 Unison·합창·Effects·스케일과 함께 그룹 단위 «자음(obstruent) 강도·길이 슬라이더 2개»를 추가했다. 2.2.1은 회귀 수정 릴리스다. 사용자가 언급한 변환 대화상자 옵션 이름(“Convert Manual mode to Rigid/Stable”, “Convert Pitch Deviation into Control Curves”, “Reset Phoneme Strength”, “Remap Tension parameters”)은 공식 문서에서 문구 그대로는 찾지 못했다. 다만 각 옵션의 근거가 되는 공식 권장 사항은 확인했다.

### Cited Findings
- **2.1.0 (2025-06-17) [공식]** Pitch Control Points 모드 재설계: “Automatically trace pitch curves into control points when selecting an area”, “Show a resizing box after selecting multiple points”. 그 밖에 Ctrl+D 노트 복제, Alt+드래그 복제, 피아노롤 스냅 토글, 노트 생성·드래그 시 사인 톤, Pro Tools ARA, 임포트 오디오 템포 감지, 무효 음소 경고 아이콘, “Updated script bindings to support smart pitch controls”, 노트 사이 작은 틈을 표시하는 silence indicator 재디자인 — [Dreamtonics 2.1.0](https://dreamtonics.com/synthesizer-v-studio-2-1-0-final-update/)
- 2.1.0 블로그 본문: 새 시스템은 “automatically generates control points following pitch curves, and allows for quick adjustment of depth and speed for pitch bends and vibratos via intuitive resizing handles” — [Dreamtonics 2.1.0](https://dreamtonics.com/synthesizer-v-studio-2-1-0-final-update/)
- **2.1.1 (2025-07) [공식]**
  - `Note.getAttributes()/setAttributes()`에 `expValueX, expValueY, muted, evenSyllableDuration, languageOverride, phonesetOverride, phoneme` 속성이 추가됐다.
  - `RetakeList`·`NoteGroup.getRetakes()`, `TrackMixer`, `vocalModeParams`(getVoice/setVoice), `SV.getComputedPitchForGroup()`, 그룹·노트 뮤트가 추가됐다.
  - “Reset Pitch now also removes pitch control objects over the selected note.”
  - 스페인어에서 cl 입력 시 경고가 뜨던 문제를 고쳤다.
  - 출처: [Dreamtonics 2.1.1](https://dreamtonics.com/synthesizer-v-studio-2-1-1-final-update/)
- **2.1.2 (2025-10-10) [공식]**
  - “When importing a version 1 project, instead of resetting the tension parameter, map the values to their near-equivalents in version 2.” 사용자가 말한 “Remap Tension”의 실체로 보인다.
  - 노트 최소 길이를 스냅 단위의 절반으로 바꿨다.
  - 버그 수정 두 건: “audio artifacts when the tension parameter is close to maximum”, “audio artifacts when the strength of a plosive/affricate is raised from 0 to a positive value in the phoneme timing panel”.
  - 스크립트 패널(커스텀 UI)이 추가됐다.
  - 출처: [Dreamtonics 2.1.2](https://dreamtonics.com/synthesizer-v-studio-2-1-2-final-update/)
- **2.2.0 (2026-01-15. 노트 본문 표기는 “January 15th, 2025”지만 게시일이 2026-01-15라 오타로 보인다) [공식]**
  - Unison(최대 16성, Spacing)과 합창 보이스 전용 Notes 패널 슬라이더(타이밍·피치 tightness)가 추가됐다. Unison을 소그룹·개별 보이스로 나누는 우클릭 명령도 들어갔다.
  - Effects 패널(spatialization·EQ·compression·reverb)과 Room Sound가 추가됐다.
  - 그룹별 음계(Scale) 표시, MusicXML 임포트, 렌더 캐시가 추가됐다. 렌더 캐시는 프로젝트를 재저장해야 켜진다.
  - 렌더 패널에 트랙 gain/pan·이펙트 바이패스 옵션이 생겼다.
  - **“Added two sliders to the Voice panel to modulate the strength and duration of all obstruent consonants within a group.”**
  - 그룹 오른쪽 경계를 넘는 노트는 출력음이 아니라 노트 자체를 자른다.
  - 출처: [Dreamtonics 2.2.0 / Choir 발표](https://dreamtonics.com/choir-voice-collections/)
- Voice 패널 매뉴얼은 이 기능을 “Consonant Adjustment: You can adjust the strength and length of consonants (plosives and fricatives) for an entire note group at once.”라고 설명한다 — [SV2 매뉴얼 Voice Panel](https://sv2.docs.dreamtonics.com/en/voice-panel)
- **2.2.1 (2026-03-02) [공식]**
  - 렌더 스레드 수 설정이 추가됐다.
  - 그룹 병합 시 “use the voice parameters from the group with more notes”.
  - 음소 타이밍 패널에서 음소를 0.01s 미만으로 줄일 수 없게 했다.
  - Windows P/E 코어 CPU의 성능 저하, Unison 싱어가 빠지는 문제, 트랙 복제 후 렌더 캐시가 충돌하는 문제를 고쳤다.
  - 출처: [Dreamtonics 2.2.1](https://dreamtonics.com/synthesizer-v-studio-2-pro-2-2-1/)
- **V1 프로젝트 변환 [공식]** V1 .svp를 V2에서 열면 “a project conversion dialog will appear to optimize various parameters for version 2”. 옵션 목록은 매뉴얼(en/ja project 페이지)에 없다 — [SV2 매뉴얼 Project](https://sv2.docs.dreamtonics.com/en/project), [Changes Since Version 1](https://sv2.docs.dreamtonics.com/en/prev-version-changes)
- **Pitch Deviation 변환 절차 [공식]** “first change all notes with a Pitch Deviation drawn over the top into Rigid mode. Then, apply ‘Trace Pitch into Control Points’ to effectively convert the Pitch Deviation into pitch control points. Finally, remove the pitch deviation” — [Dreamtonics Upgrade Migration Guide (2025-03-21)](https://dreamtonics.com/synthesizer-v-studio-2-pro-upgrade-migration-guide/)
- **V1 프로젝트 가져오기 후 권장 [공식]** AI 리테이크는 리셋하라(같은 take 번호라도 V1과 V2 결과가 다르다). 보컬 모드는 줄여라(V2에서는 너무 세진다). Breathiness·Tension은 다른 균형으로 맞추거나 “in some cases completely switching off the standard parameters” — [Migration Guide](https://dreamtonics.com/synthesizer-v-studio-2-pro-upgrade-migration-guide/)
- [리셀러] “Tension and Breathiness have much stronger effects, and so adjustments should be reduced”. 파라미터는 기본값 쪽으로 되돌리라고 한다 — [Eclipsed Sounds SV2 정보](https://eclipsedsounds.com/pages/synthesizer-v-studio-2)
- **Trial·기능 제한 [공식]** 에디터를 구매하지 않았고 체험이 끝나면 «feature-limited mode»로 실행된다. 이때 “Vocal Modes, AI Retakes, Expression Pad, Phoneme Timing Panel, Parameter Panel, Smart Pitch Controls, and Dictionary Function will be disabled”. 트랙은 1개로 제한된다. 렌더 내보내기는 가능하다 — [SV2 매뉴얼 Limitation](https://sv2.docs.dreamtonics.com/en/limitation)

### Inferences
- 사용자가 본 변환 옵션 네 개는 공식 권장 절차와 1:1로 대응하는 것으로 보인다.
  - “Rigid/Stable로 변환”은 Manual Mode를 대체한다.
  - “Pitch Deviation → 컨트롤 커브”는 Rigid → Trace → 편차 삭제 절차에 해당한다.
  - “Remap Tension”은 2.1.2의 동작 변경에 해당한다.
  - “Reset Phoneme Strength”는 V1의 음소 길이·강도 배율이 V2 음소 타이밍 패널과 호환되지 않기 때문에 있을 개연성이 크다(추정).
- 프로젝트 영향: 메모리상 에디터 체험판이 10/23경 끝난다. 그 뒤에는 보컬 모드·리테이크·Expression Pad·음소 타이밍·Parameter 패널·Smart Pitch가 **모두 무효**가 된다. 따라서 .svp에 써넣은 이 값들이 렌더에 반영되지 않는다. 자동 파이프라인 결과가 갑자기 «밋밋해지는» 원인이 될 수 있다.
- 2.2.0의 그룹 단위 자음 강도·길이 슬라이더는 빠른 템포에서 자음이 어지러운 문제를 한 번에 줄이는 1차 수단이다. 다만 아래 4절의 포럼 논의에 따르면 리듬이 앞당겨지는 문제는 이 슬라이더로 해결되지 않는다.

### Gaps
- 변환 대화상자의 정확한 옵션 문구·기본 체크 상태·동작은 공식 문서에 없다. 실물 대화상자 캡처로 확정해야 한다.
- 2.0.x 마이너 릴리스(2.0.1~2.0.3)의 노트는 개별 확인하지 못했다. 포럼에 2.0.3이 언급된다.
- 2.2.0 베타 포럼 글(forum.dreamtonics.com/t/7211)은 열람하지 못했다.

## 2. Expression Pad(expValueX/Y)의 원리, Rigid/Stable의 의미, 덜 흔들리게·더 표현력 있게 만드는 법

### Takeaway
Expression Pad는 노트별 XY 패드다. 중앙(Default)과 네 모서리가 있다: 좌상 Vibrant, 우상 Refined, 우하 Raw, 좌하 Rigid. 일본어 UI에서는 순서대로 ダイナミック·リファイン·アクティブ·ストレート다. 모서리 사이 보간도 가능하다. Rigid는 «평평한 피치 + 노트 경계의 작은 언더·오버슛»을 만들고 AI 리테이크의 영향을 받지 않는다. 이 모서리는 V2 보이스 전용이다. V1 호환 보이스에서는 같은 자리가 Stable(V1의 낮은 expressiveness와 비슷)이다. 흔들림을 줄이려면 Rigid/Refined 쪽으로, 표현을 키우려면 Vibrant/Raw 쪽으로 옮기고 리테이크를 돌린다.

### Cited Findings
- [공식] 네 모서리 정의:
  - Vibrant: “more expressive… deeper vibrato”.
  - Refined: “aligns more closely with mainstream preferences… stable and skillful… less suitable for producing varied or dynamic patterns”.
  - Raw: “highly dynamic… internal processing like pitch correction is reduced… increases the possibility of off-pitch results”.
  - Rigid: “flat… only slight fluctuations near note boundaries… the pitch curve is unaffected by AI Retake”.
  - 출처: [SV2 매뉴얼 Notes Panel](https://sv2.docs.dreamtonics.com/en/notes-panel), [Pitch](https://sv2.docs.dreamtonics.com/en/pitch)
- [공식, 일본어판] 일본어 UI 명칭: デフォルト(중심)・ダイナミック(좌상)・リファイン(우상)・アクティブ(우하)・ストレート(좌하) — [SV2 매뉴얼 ja/notes-panel](https://sv2.docs.dreamtonics.com/ja/notes-panel)
- [공식] Rigid 모드에서 컨트롤 포인트는 V1 Manual Mode 슬라이더처럼 동작한다: “vibratos with a stable rate of oscillation, clearly defined note transitions, and precisely controlled pitch offshootings.” “It’s even possible to interpolate between the Manual Mode-like behavior under ‘Rigid’ mode with the more natural dynamics from other modes” — [Migration Guide](https://dreamtonics.com/synthesizer-v-studio-2-pro-upgrade-migration-guide/)
- [공식] Rigid는 “create small undershoots or overshoots at the beginning and end of each note”. V1 호환 보이스는 “a Stable mode instead, which is more similar to ‘low expressiveness’ settings in version 1” — [Migration Guide](https://dreamtonics.com/synthesizer-v-studio-2-pro-upgrade-migration-guide/)
- [공식, 문서 내 모순] Pitch 페이지는 V1 보이스에 대해 “the Rigid quadrant is provided instead”라고 쓰고, prev-version-changes·Migration Guide는 “Stable”이라고 쓴다. 포럼 사용자도 V1 보이스에서 Rigid 대신 Stable이 보인다고 확인했다 — [Pitch](https://sv2.docs.dreamtonics.com/en/pitch) vs [Forum t/2656](https://forum.dreamtonics.com/t/2656)
- [공식] Expression Pad는 노트의 모든 take에 공통으로 적용된다: “changing the Expression Control will affect both takes” — [AI Retakes](https://sv2.docs.dreamtonics.com/en/ai-retakes)
- [공식] V1의 Expressiveness·Enhancement는 Expression Pad로 재설계·대체됐고, 리테이크 없이도 쓸 수 있다 — [Changes Since Version 1](https://sv2.docs.dreamtonics.com/en/prev-version-changes)
- [공식] 스크립트 속성 `expValueX`, `expValueY`(“expression pad parameter X/Y”, since 2.1.1)가 있다. 수치 범위·부호는 문서화되지 않았다. 같은 객체에 `dF0VbrMod`(비브라토 변조)와 `phonemes[]`의 `leftOffset/position/activity/strength`가 있다 — [Scripting Manual: Note](https://resource.dreamtonics.com/scripting/Note.html)
- [공식] 비브라토 변조(Vibrato Modulation)는 0.00~2.00, 기본 1.00이다. 시간에 따른 비브라토 세기는 Parameter 패널의 Vibrato Envelope로 그린다 — [Notes Panel](https://sv2.docs.dreamtonics.com/en/notes-panel), [Base Parameters](https://sv2.docs.dreamtonics.com/en/parameters)
- [리셀러] V1 자동 피치 느낌을 원하면 “Refined” 모서리가 가장 가깝다. 평평한·수동형 피치는 Rigid(SV2 보이스) 또는 Stable(SV1 보이스)을 쓴다 — [Eclipsed Sounds](https://eclipsedsounds.com/pages/synthesizer-v-studio-2)
- [커뮤니티, 테토 실사례] kenchan(2025-11-29)의 重音テトAI 2 커버 설정:
  - 피치는 AI 리테이크 기반으로 잡고, 表現コントロール은 ストレート 쪽으로 **중간까지만** 당겼다. 완전 ストレート에서는 비브라토가 사라지기 때문이다.
  - 일부 노트만 Smart Pitch 포인트로 수정했다.
  - Mini 150%(최대) + Power 50%.
  - “UTAUとSynthVの中間の歌い方”를 얻었다고 평가했다.
  - 출처: [kenchan note](https://note.com/kenchan21/n/nfa459d01256e)
- [커뮤니티] 스타일 평가(이름은 V2 초기·일부 문서 기준 Vibrant/Refined/Stable/Raw):
  - Stable: 감정은 적고 피치는 안정적이다. 직접 조교하고 싶은 사람에게 맞다.
  - Refined: 감정이 적당하고 피치가 안정적이라 다루기 쉽다.
  - Vibrant: 과해지기 쉽다.
  - Raw: 생목에 가깝지만 음정이 엇나가 리테이크·수동 수정이 필요하다.
  - 출처: 검색 요약 기반 [note 시ーラ](https://note.com/hip_okapi7412/n/nb26c12081d4f), 원문 미열람
- [커뮤니티] sleepfreaks: 「ストレート」는 피치·리듬을 안정시키고 비브라토를 줄인다. 「アクティブ」는 사람 같은 흔들림과 라이브감을 더한다. 보이스 패널로 전체 방향을 정한 뒤 사비 첫머리 같은 요점 프레이즈에만 Pad를 쓰라고 권한다 — [Sleepfreaks SV2 가이드](https://sleepfreaks-dtm.com/synthesizer-v-studio-2-pro/article/)
- [커뮤니티, 화음 관련] 4성부 블렌드에서는 «Expression을 Rigid 쪽으로 + 비브라토 슬라이더를 낮추라»는 조언이 나왔다. “Going towards ‘Rigid’ will lock the pitch in tighter”. 한 아카펠라 제작자는 V2의 «artistic flair»가 너무 강해 화음용으로는 V1 Manual Mode로 돌아갔다고 했다 — [Forum t/7788](https://forum.dreamtonics.com/t/7788)
- [커뮤니티, 화음 경고] Pitch를 리셋하고 Rigid로 바꿔도 «평균 피치가 이상보다 높아» 화음이 틀어진다는 버그 보고가 있다(2.0.3에서도 지속). 우회책으로 `egonelbre/SynthV2-Scripts` PitchPerfect.js(완전 음정 강제)가 공유됐다 — [Forum t/1637](https://forum.dreamtonics.com/t/1637)
- [커뮤니티] V2 보이스는 노트 끝에 큰 하강 글리산도를 붙이는 경향이 있다. 대응은 피치 컨트롤 포인트, Rigid 근처 + 리테이크, 펜 수동 수정. 일부 사용자는 해결하지 못해 V2를 BGV에만 쓴다 — [Forum t/4400](https://forum.dreamtonics.com/t/4400)

### Inferences
- 덜 흔들리게: 해당 노트를 Refined(자연스러움 유지) 또는 Rigid 쪽으로 보낸다. Rigid는 비브라토가 사라지므로 중간 보간이 필요하다. 그다음 `dF0VbrMod`를 낮추고 Smart Pitch 포인트로 목표 음정을 고정한다. Smart Pitch는 리테이크보다 우선한다(3절).
- 더 표현력 있게: Vibrant/Raw로 옮긴 뒤 Pitch 리테이크를 여러 번 돌려 고른다. Raw는 음정 이탈 위험이 있으므로 화음 파트에는 부적합하다.
- 화음(하모리) 트랙은 Rigid~Refined 쪽에 비브라토를 낮게 두는 것이 커뮤니티의 일관된 방향이다. 리드는 Default~Vibrant를 쓴다. 평균 피치 편향 버그 보고가 있으므로 렌더 후 F0의 평균 cent 오차를 측정해 검증할 가치가 있다.

### Gaps
- `expValueX/Y`의 수치 범위·축 방향(예: −1~1, 좌하 = (−,−)?)은 공식·커뮤니티 어디에도 없다. GUI에서 한 번 저장한 .svp를 diff해서 확정해야 한다.
- 2026 기준 영어 UI가 Rigid인지 Stable인지 명칭 혼재의 최종 상태는 미확인이다. V2 보이스에서는 Rigid가 맞다.

## 3. AI 리테이크: 숙련자가 take(피치·타이밍·음색 seed)를 쓰는 법

### Takeaway
V2 리테이크 버튼은 네 개다: All·Pitch·Timing·Timbre. Default take는 «안정적인» 쪽이라, 몇 번 리테이크해야 더 동적이고 자연스러운 take가 나온다는 것이 공식 입장이다. Smart Pitch 포인트는 리테이크보다 우선하고, Expression Pad·보컬 모드는 모든 take에 공통이다. 숙련자는 수동 편집 전에 리테이크부터 돌린다. 순서는 피치 take를 먼저 고르고 그다음 음색·타이밍이다. 노트별로 골라 붙이고, 같은 프레이즈의 다른 take를 겹쳐 더블링에도 쓴다.

### Cited Findings
- [공식] All = 피치·타이밍·음색을 한꺼번에, Pitch = 피치 커브, Timing = 음소 타이밍·길이(음소 타이밍 패널에서 확인), Timbre = 음색과 발음. “Crop to Active Takes”로 쓰지 않는 take를 지운다 — [AI Retakes](https://sv2.docs.dreamtonics.com/en/ai-retakes), [Notes Panel](https://sv2.docs.dreamtonics.com/en/notes-panel)
- [공식] “the default take tends to produce a stable vocal sound, several retakes can increase the likelihood of generating a dynamic and natural take.” Retaking “All” “can produce more noticeable changes compared to Version 1” — [Changes Since Version 1](https://sv2.docs.dreamtonics.com/en/prev-version-changes)
- [공식] “Since Smart Pitch Controls takes priority over AI Retake, retaking pitch will always generate a pitch curve that passes through the Smart Pitch Controls.” Rigid 노트의 피치는 리테이크의 영향을 받지 않는다 — [AI Retakes](https://sv2.docs.dreamtonics.com/en/ai-retakes), [Notes Panel](https://sv2.docs.dreamtonics.com/en/notes-panel)
- [공식, 스크립트] 리테이크는 “different seeds for duration, pitch, and timbre parameters”이며 `Note.getRetakes()`(2.1.1+)로 접근한다 — [Scripting Manual: Note](https://resource.dreamtonics.com/scripting/Note.html)
- [리셀러] “Use retakes to make adjustments before making manual changes”. Pitch 리테이크는 영향이 크고 문맥 의존적이다. Timing 리테이크는 «humanization이나 발음 조정»에 쓴다. Timbre 리테이크는 음색과 발음을 함께 바꾸고 이번 버전에서 훨씬 강해졌다. 발음 타이밍 전반은 «먼저 Timing 리테이크로» 손대는 것이 가장 효율적이라고 한다 — [Eclipsed Sounds](https://eclipsedsounds.com/pages/synthesizer-v-studio-2)
- [커뮤니티, SV1 1.7 시절이지만 원칙은 유효] 피치 take를 먼저 정하고 그 위에서 음색 take를 만들면 피치 움직임을 유지한 채 분위기만 바꿀 수 있다. 고음에서는 take에 따라 가성 여부가 갈리기도 한다. 하트 표시는 관리용일 뿐 확률에 영향이 없다고 Kanru Hua가 밝혔다 — [DTMステーション(2022)](https://www.dtmstation.com/archives/57272.html)
- [커뮤니티] SV2 실무 흐름: 노트 선택 → 「すべて」로 take 생성 → 노트별로 take 이름을 클릭해 교체 → 메인과 비교해 구간별 최선을 채택한다. 더블링은 트랙 복제(그룹 비링크) 후 리테이크하고 볼륨을 낮춘다. 노트·보이스 패널 값은 take 사이에 유지된다 — [Sleepfreaks](https://sleepfreaks-dtm.com/synthesizer-v-studio-2-pro/article/)
- [커뮤니티] 불만: Pad를 바꾸면 모든 take가 함께 바뀐다. 우회책은 «작업용 트랙»에 프레이즈를 비링크 복제해 실험하는 것이다 — [Forum t/2645](https://forum.dreamtonics.com/t/2645)
- [커뮤니티] 2.2 Unison은 추가 성부를 «또 다른 take처럼» 렌더한다고 사용자가 해석했다(공식 확인 아님) — [Forum t/8360](https://forum.dreamtonics.com/t/8360)
- [커뮤니티, SV1 시절 반론] «안 나오는 가챠를 계속 돌리느니 직접 피치를 그리는 게 빠르다» — [セブヶ崎詠人 note(2022, SV1 1.6.1)](https://note.com/aaaaa_hachinana/n/na1fd54749f7a)

### Inferences
- 권장 순서: (1) 보컬 모드·Pad로 방향 고정 → (2) 프레이즈 단위 Pitch 리테이크 3~5회 후 노트별 선택 → (3) 리듬·발음이 어색한 노트만 Timing 리테이크 → (4) Timbre 리테이크 → (5) 그래도 안 되는 지점만 Smart Pitch 포인트로 고정. 포인트는 리테이크보다 우선하므로 마지막에 둔다.
- 자동 파이프라인에서는 take seed를 여러 개 만든다. 렌더 결과를 레퍼런스(원곡 F0·onset)와 비교해 노트별로 고르는 «take 탐색 루프»가 공식 권장(Default take = 안정, 리테이크 = 동적)과 맞는다.
- 하모리 파트는 메인과 다른 take를 쓰면 자연스러운 더블 효과가 난다. 반대로 음정 정렬이 중요하면 Rigid(리테이크 무시)로 고정한다.

### Gaps
- 리테이크 seed가 결정적인지(같은 seed → 같은 결과, 렌더 재현성)는 문서화되지 않았다.
- 숙련 일본인 조교자의 V2 리테이크 활용 수치(몇 회, 어떤 기준)는 찾지 못했다.

## 4. 음소 타이밍·강도 편집: 그루브용 자음 조정과 일본어 전형 조정

### Takeaway
V2에서는 음소 타이밍 패널에서 경계를 드래그해 길이·타이밍을, 가로선을 상하로 움직여 강도를, 일부 자음은 삼각형으로 파열 타이밍·강도를 직접 편집한다. 공식은 «노트를 쪼개 자음만 넣는» V1식 기법을 비권장으로 바꿨다(품질 저하·오발음 위험). 원칙은 모음 시작이 노트 시작에 맞고 자음은 그 앞에 놓이는 것이다. 다만 정량화된 일본어 노트에서 s·z·k·ts 자음이 박보다 일찍 들어가 «달리는» 느낌이 나는 것이 V2 기본 출력의 티라는 지적이 있다. 숙련자는 프레이즈 끝 2~3노트를 중심으로 자음을 «늦추거나 늘려» 포켓에 앉힌다.

### Cited Findings
- [공식] 음소 경계를 드래그해 길이·타이밍을, 가로선 상하로 강도를, 일부 자음은 삼각형 드래그로 파열(plosive) 타이밍·강도를 바꾼다. 파열 편집은 V1 호환 보이스에서 불가하다 — [SV2 매뉴얼 Pronunciation](https://sv2.docs.dreamtonics.com/en/phonemes)
- [공식] V2 모델은 음악적 문맥을 고려해 음소 타이밍을 생성하므로 “adjustment methods such as splitting notes and fixing phoneme length will no longer be recommended” — [Changes Since Version 1](https://sv2.docs.dreamtonics.com/en/prev-version-changes)
- [공식] “notes containing consonants (except breaths) may cause quality degradation, even mispronunciations” — [Migration Guide](https://dreamtonics.com/synthesizer-v-studio-2-pro-upgrade-migration-guide/)
- [공식] 노트 사이에 틈을 두면 자음 발음 시간을 확보하기 어려워 오히려 부자연스러워진다. “make sure to join adjacent notes tightly together and leave a clear space between phrases” — [Pronunciation](https://sv2.docs.dreamtonics.com/en/phonemes)
- [공식] 노트 패널 “Evenly Split Note Into Syllables”: 켜면 한 노트 안의 여러 음절 모음 길이를 균등하게 하고, 끄면 자동 배분한다 — [Notes Panel](https://sv2.docs.dreamtonics.com/en/notes-panel)
- [공식] 스크립트 per-phoneme 속성 `leftOffset`(왼쪽 경계 오프셋), `position`, `activity`, `strength` — [Scripting Manual: Note](https://resource.dreamtonics.com/scripting/Note.html)
- [공식] 2.2.0에서 그룹 전체 obstruent 자음의 강도·길이 슬라이더가 추가됐다. 2.2.1부터 음소는 0.01s 미만으로 줄일 수 없다 — [2.2.0](https://dreamtonics.com/choir-voice-collections/), [2.2.1](https://dreamtonics.com/synthesizer-v-studio-2-pro-2-2-1/)
- [커뮤니티, 2026-02] ayatof의 글:
  - 그리드에 맞춘 노트에서 s, z, k, ts 같은 날카로운 자음이 일찍 들어와 박보다 앞서 느껴진다(일본어에서 특히). 이것이 “default/untouched Synthesizer V output”의 티라고 한다.
  - 작성자의 실제 방법은 자음을 «늦추거나(시작 지연) 오히려 늘리는» 것이다. 특히 «브레스 직전 프레이즈 끝 2~3노트»를 살짝 늦추면 사람 같아진다고 한다.
  - Voice 패널의 Duration 슬라이더로 자음을 줄이면 오히려 더 기계적·급해진다고 반론했다.
  - 출처: [Forum t/7571](https://forum.dreamtonics.com/t/7571)
- [커뮤니티] 같은 스레드 반론: «모음 시작이 노트 시작에 맞고 자음은 앞 모음 꼬리에 놓이는 것이 규칙»(Mechie). Duration 슬라이더로 줄이라는 제안(ZLY_CZLOWIEK)도 있었다 — [Forum t/7571](https://forum.dreamtonics.com/t/7571)
- [커뮤니티, SV1 기반 원리] 일본어 자음은 노트 직전에 울린다. 자음을 «빠르고 짧게» 하면 앞으로 쏠려 재촉하는 창법이, «늦고 길게» 하면 タメ가 있는 창법이 된다. 자음 길이는 우선 50% 정도로 맞추고 거기서 판단하면 편하다 — 검색 요약 기반 [十竜 note 音素編 #05](https://note.com/hiryukaoku/n/naa7cde074691), 원문 미열람
- [커뮤니티, SV1] 40mP: 마구 입력한 「し」를 sh 95%/i 20%로 해 끊는 맛을 냈다. 자음이 균일하게 길면 기계적으로 들린다 — [サンレコ 40mP(2022)](https://www.snrec.jp/entry/special/vocalo-p_chapter3-7)
- [커뮤니티] 순서 제안: 모음·자음 길이와 크기(발음) → 텐션 → 브레스 → 톤 시프트(가성) → 라우드니스 — 검색 요약 기반 [白乃秋 note](https://note.com/shiranoaki/n/nfa084b755e98), 원문 미열람
- [커뮤니티, 테토 V2] kenchan은 음소 타이밍 패널에서 자음·모음의 타이밍·길이·강도를 조정했다(한 음절의 자음·모음 강화, 두 음절 사이 간격 조정). 스타카토는 아포스트로피와 cl로 냈다 — [kenchan note](https://note.com/kenchan21/n/nfa459d01256e)
- [커뮤니티] 스타카토·끊는 맛은 다음 노트 가사 앞에 `'`를 붙여 성문폐쇄를 넣어 만든다. 노트 사이 짧은 틈은 메워라 — [Sleepfreaks](https://sleepfreaks-dtm.com/synthesizer-v-studio-2-pro/article/)

### Inferences
- 그루브 조정의 기본값: «모음 = 박» 원칙을 유지한다. 빠른 템포·정량화 구간에서 s/sh/ts/k가 앞서 들리면 해당 자음의 왼쪽 경계(`leftOffset`)를 뒤로 당겨 늦춘다. 프레이즈 끝 2~3노트는 약간 늦게 둔다. 전 구간 일괄 단축(Voice 패널 Duration)은 «자음이 어지러운 문제»에는 유효하지만 «리듬이 앞서는 문제»에는 역효과일 수 있다.
- 일본 조교자 관습(SV1 기원)인 «자음 빠르고 짧게 = 앞으로 쏠림, 늦고 길게 = タメ»는 V2 패널에서도 그대로 쓸 수 있는 표현 수단이다. 노트 분할로 하던 일은 V2에서는 패널 드래그로 대체한다.
- 자동 파이프라인 검증 지표: 렌더 onset(자음 시작)과 박 그리드 사이 오프셋 분포. 원곡 보컬의 자음 onset 분포와 비교하면 «달리는» 경향을 정량화할 수 있다.

### Gaps
- 일본어에서 자음별 권장 ms 수치를 담은 V2 공식·전문가 자료는 찾지 못했다.
- `leftOffset/position/activity/strength`의 단위·범위는 문서화되지 않았다(GUI 저장 diff로 확정 필요).

## 5. 숙련 조교자의 워크플로(일본어·영어 커뮤니티)와 프로 체크리스트

### Takeaway
V2 시대의 공통 흐름은 다음과 같다.
1. 노트·가사 정리(노트 사이 붙이고 프레이즈 사이는 띄움)
2. 그룹을 섹션별로 나눠 보컬 모드로 음색 방향 설정(파라미터보다 우선, 최대로 들어 보고 줄이기)
3. Expression Pad로 노트·프레이즈 표현 방향 설정
4. AI 리테이크(피치 → 타이밍 → 음색)로 고르기
5. 남는 문제만 Smart Pitch 포인트·음소 타이밍 패널로 수정
6. Tension·Breath·Tone Shift·Loudness·Mouth Opening 자동화는 «약하게»
7. 귀로 최종 확인

그리고 «기본 출력이 이미 좋으니 수정에는 목적이 있어야 한다». 캐릭터(어두 시작·어미·비브라토 성격)를 먼저 정의하고 곡 전체에서 일관되게 적용하라는 것이 영어권 조언이다.

### Cited Findings
- [공식] 보컬 모드는 음색뿐 아니라 발음·피치에도 영향을 준다. “using Vocal Modes tends to result in more natural and ideal sounds compared to adjusting Parameters such as tension or breath.” 그룹 단위로 설정하고, 곡 안에서 바꾸려면 그룹을 나누거나 Parameter 패널에서 자동화한다. 자동화에서는 pitch/timbre/pronunciation 개별 비율을 조정할 수 없다 — [Vocal Modes](https://sv2.docs.dreamtonics.com/en/vocal-modes), [Changes Since Version 1](https://sv2.docs.dreamtonics.com/en/prev-version-changes)
- [공식] Voice 패널 보컬 모드 슬라이더는 5% 단위다. “+”를 누르면 pitch·timbre·pronunciation을 개별 설정할 수 있다 — [Voice Panel](https://sv2.docs.dreamtonics.com/en/voice-panel)
- [공식] Base Parameters 설명:
  - Tension: 낮으면 부드럽고 높으면 긴장된다.
  - Breathiness: 너무 높으면 노이즈, 너무 낮으면 먹먹하다.
  - Tone Shift: 가성 바로 아래 음역에서 올리면 가성처럼 들린다.
  - Mouth Opening: 모음의 입 벌림.
  - Voicing: 낮추면 속삭임.
  - Vibrato Envelope: 시간축 비브라토 세기.
  - 출처: [Base Parameters](https://sv2.docs.dreamtonics.com/en/parameters)
- [공식] 피치를 고정한 채 보이스를 교체할 때는 Modify → Parameters → Trace Pitch into Control Points — [Pitch](https://sv2.docs.dreamtonics.com/en/pitch)
- [판매사] 重音テト(SV2) 정보:
  - 2025-11-27 발매, 성원(声のもと)은 小山乃舞世.
  - 보컬 스타일 7종: Joyful / Cute / Power / Mellow / Low / Mini / Rock.
  - 교차언어로 영·중·광동·스페인·한국어를 지원하며 V1 에디터에서는 쓸 수 없다.
  - 출처: [AHS 重音テト SV2](https://www.ah-soft.com/synth-v/teto2/)
- [커뮤니티, 테토] 스타일 평가:
  - Joyful/Cute/Power/Mellow는 SV1과 비슷하다.
  - Low는 신규로 변화가 가장 크고 Downer 계열의 어두운 톤이다.
  - Mini는 신규로 아이 같은 음색이며 Cute보다 변화가 훨씬 크고 UTAU 테토에 가깝다.
  - Rock은 신규로 Power와 비슷하지만 다이내믹 변화가 크고 록다운 버릇이 있다. 지속적인 힘은 Power가 더 안정적이다.
  - 모드 최대값은 150%(Mini 150% 사용).
  - 출처: [kenchan note](https://note.com/kenchan21/n/nfa459d01256e)
- [커뮤니티] 보컬 스타일은 우선 최대로 해서 성격을 듣고 줄인다(사비에서 최대는 너무 셌다는 예). 파라미터보다 스타일을 먼저 쓴다. 그룹을 병합하면 보이스 패널 설정이 리셋되니 주의한다 — [Sleepfreaks](https://sleepfreaks-dtm.com/synthesizer-v-studio-2-pro/article/). 단 2.2.1부터는 병합 시 «노트가 많은 그룹의 파라미터»를 쓴다 — [2.2.1](https://dreamtonics.com/synthesizer-v-studio-2-pro-2-2-1/)
- [커뮤니티] Smart Pitch는 피치가 들뜬 구간에 더블클릭으로 포인트를 추가한다(예: 3점). 과보정은 기계적이니 커브가 아니라 귀로 판단한다. 보이스 패널·표현을 바꾼 뒤에는 피치가 다시 변하므로 재확인한다 — [Sleepfreaks](https://sleepfreaks-dtm.com/synthesizer-v-studio-2-pro/article/)
- [커뮤니티, 영어] “Start with this question: What’s wrong with the default tuning? Manually altering the default tuning needs a purpose… think about the start of notes, end of notes and character of vibrato (speed, width, delay of onset and ending)… Have a definition… be consistent through your song.” 피치선은 노트 중앙 부근을 지나 비브라토가 위아래로 고르게 분포하도록 한다 — [Forum t/7226](https://forum.dreamtonics.com/t/7226)
- [커뮤니티] V2에서 비브라토 시작 지연·세기는 Vibrato Envelope 레인 + 마스터 비브라토 슬라이더로, 음 사이 이동 속도는 Pitch Control Curves 모드로 제어한다(V1 Manual Mode 대체) — [Forum t/1445](https://forum.dreamtonics.com/t/1445)
- [커뮤니티, SV1 기반 수치] 비브라토 5.5~8.0 Hz, 깊이는 반음 이내. 오버슛은 대략 반음 이하. 한 음을 «시작·안정(しゃくり)·지속(비브라토)·끝으로의 움직임·끝» 다섯 부분으로 설계한다. 비브라토 남용을 금지한다 — [セブヶ崎詠人 note(2022)](https://note.com/aaaaa_hachinana/n/na1fd54749f7a)
- [커뮤니티, SV1] 40mP: Tension 자동화로 A멜로는 낮게(부드럽게), 사비는 높게(힘 있게) 둔다. Breath를 올리고 Tension을 내리면 가성 느낌이 난다. «가사가 들리는 것»을 최우선으로 한다 — [サンレコ 40mP](https://www.snrec.jp/entry/special/vocalo-p_chapter3-7)
- [커뮤니티] 브레스는 파라미터(전체 기식량)와 `br` 음소(숨 노트) 두 갈래로 다룬다. 더 리얼하게 하려면 브레스 분리 트랙을 쓴다 — 검색 요약 기반 [サンレコ 江夏正晃](https://www.snrec.jp/entry/PR/technique/synthesizerv_2401_2), 원문 미열람

### Inferences — 프로 체크리스트(합성)
1. 노트: 인접 노트는 틈 없이, 프레이즈 사이는 명확히 띄운다. 자음 전용 분할 노트를 쓰지 않는다(V2 비권장).
2. 보컬 모드: 섹션별 그룹. 최대로 들어 보고 줄인다. 필요하면 pitch/timbre/pronunciation을 분리한다. Tension·Breath는 기본값 가까이 두고 모드가 부족할 때만 쓴다.
3. Expression Pad: 리드는 Default~Vibrant, 하모리는 Refined~Rigid 쪽. 완전 Rigid는 비브라토를 없애므로 중간값을 쓴다.
4. 리테이크: 수동 편집 전에 돌린다. Pitch → Timing → Timbre 순서로 노트별로 고른다.
5. Smart Pitch: 리테이크로 안 되는 지점만 쓰고 포인트는 최소화한다. 피치선은 노트 중앙, 오버슛 ≤ 반음.
6. 비브라토: 롱톤 뒤쪽에만 쓰고 Vibrato Envelope로 지연·페이드인한다. 모든 롱톤에 똑같이 주지 않는다.
7. 자음: 빠른 곡은 2.2 Voice 패널 자음 슬라이더로 전체를 정리한다. 앞서 들리는 s/ts/k와 프레이즈 끝은 패널에서 늦춘다.
8. 브레스: 프레이즈 앞 `br`, 숨 빠지는 롱톤 끝은 Breath·Voicing 자동화.
9. 확인: 커브가 아니라 귀로 듣는다. 보이스 패널·Pad를 바꾼 뒤에는 피치를 재확인한다.

### Gaps
- 이름 있는 일본인 숙련 조교자(예: 유명 P)의 **SV2 전용** 단계별 워크플로 1차 자료는 찾지 못했다. 찾은 자세한 일본어 강좌(十竜·セブヶ崎·40mP)는 대부분 SV1(2022~2023) 기준이다.
- YouTube 튜토리얼은 이번 조사에서 확인하지 않았다.
- Reddit r/SynthesizerV는 API 차단으로 열람하지 못했다.

## 6. 부자연스럽게 만드는 실수와 탐지법

### Takeaway
반복적으로 지적되는 실수는 일곱 가지다. 자동 파이프라인에서는 대부분 F0·onset 측정으로 탐지할 수 있다.
- 피치를 과하게 그리기(기계적)
- V1식 노트 분할·Pitch Deviation 사용(V2에서 품질 저하)
- 보컬 모드·Tension·Breath 과다(V2에서 효과가 더 셈)
- 비브라토 과다·균일
- 노트 사이 짧은 틈
- 정량화 그리드에서 자음이 앞서 들리는 «달림»
- V2 특유의 어미 하강 글리산도·음 사이 스윕 방치

### Cited Findings
- 과보정은 기계적이다. 짧은 틈은 부자연스러운 소리를 낸다. 그룹 밖 노트는 소리가 나지 않는다 — [Sleepfreaks](https://sleepfreaks-dtm.com/synthesizer-v-studio-2-pro/article/)
- 노트 분할과 자음 노트는 품질 저하·오발음을 부른다. Pitch Deviation은 V2에서 «완전히 다른 피치 커브 위에 더해져» 맞지 않을 수 있다 — [Migration Guide](https://dreamtonics.com/synthesizer-v-studio-2-pro-upgrade-migration-guide/)
- 노트 사이에 틈을 두면 자음 시간을 확보하지 못한다 — [Pronunciation](https://sv2.docs.dreamtonics.com/en/phonemes)
- V2 보컬 모드와 Tension·Breath는 V1보다 강하다 — [Migration Guide](https://dreamtonics.com/synthesizer-v-studio-2-pro-upgrade-migration-guide/), [Eclipsed Sounds](https://eclipsedsounds.com/pages/synthesizer-v-studio-2)
- Tension 최대 근처의 아티팩트, 파열·파찰 강도를 0에서 올릴 때의 아티팩트는 2.1.2에서 수정됐다. 그 이전 버전에서는 주의가 필요하다 — [2.1.2](https://dreamtonics.com/synthesizer-v-studio-2-1-2-final-update/)
- 비브라토 남용을 금지한다. 비브라토가 마지막 롱톤에만 있다고 단정하지 않는다 — [セブヶ崎詠人 note(SV1)](https://note.com/aaaaa_hachinana/n/na1fd54749f7a)
- 정량화 노트에서 자음이 일찍 들어가는 것은 «손대지 않은 SV 출력»의 티다 — [Forum t/7571](https://forum.dreamtonics.com/t/7571)
- V2 보이스의 어미 하강 글리산도와 음 사이 스윕(합창 뱅크는 최대 8분음표 앞에서 미끄러짐). 대응은 Rigid + 비브라토 슬라이더 조정 + 피치 포인트, 어두에 `'` 성문폐쇄, 노트 사이 미세한 틈 등이다(마지막은 공식 «틈 금지» 권고와 상충) — [Forum t/4400](https://forum.dreamtonics.com/t/4400), [Forum t/8360](https://forum.dreamtonics.com/t/8360)
- Rigid에서도 평균 피치가 높게 나온다는 보고가 있다(화음 틀어짐) — [Forum t/1637](https://forum.dreamtonics.com/t/1637)
- 스케일 기반 과도한 수동 «완벽 음정»은 자연스러운 편차를 없앤다(PitchPerfect.js 작성자 본인의 단서) — [Forum t/1637](https://forum.dreamtonics.com/t/1637)

### Inferences — 탐지법(자동화 가능)
- 피치 과보정·평탄화: 렌더 F0의 노트 내 표준편차가 0에 가깝거나(로봇) 원곡 대비 지나치게 작은지 본다.
- 스쿱·글리산도 과다: 노트 시작·끝 100~200 ms의 F0 편차(cent)가 반음을 넘는 노트의 비율을 센다.
- 비브라토 과다·균일: 롱톤별 비브라토 rate/extent의 분산이 0에 가까운지(모두 같은지), extent가 ±50 c 이상인지 본다.
- 하모리 음정 편향: 노트별 평균 cent 오차의 부호가 한쪽으로 치우치는지 본다(t/1637 버그 패턴).
- 리듬 달림: 자음 onset − 박 그리드 오프셋의 평균이 음수로 치우치는지(특히 s/ts/k) 본다.
- 자음 어지러움: 빠른 구간에서 자음 길이가 노트 길이에서 차지하는 비율이 과도한지 본다.
- 틈: 인접 노트 간격 > 0이면서 프레이즈 경계가 아닌 곳을 찾는다.

### Gaps
- «스쿱이 너무 많다·비브라토가 과하다»의 정량 기준(cent·ms)을 제시한 V2 전용 신뢰 자료는 없다. 위 수치는 SV1 시절 개인 블로그 기준이다.

## 7. 일본어 특이사항: 장음·っ·ん·무성화·조사 は/へ, 음소 오버라이드

### Takeaway
음소는 노트 위 음소 영역을 더블클릭해 편집한다(Tab/Ctrl+Tab으로 이동). 가사 칸에 `.` 접두사 + 공백 구분 음소를 넣어 직접 지정할 수도 있다. 사전(Dictionary) 패널에 등록하면 그룹 전체에 적용된다. `-`는 앞 음소를 잇고, `'`는 성문폐쇄(cl)를 넣는다. 조사 は/へ는 w a / e로 바꾼다. ん은 뒤따르는 음에 따라 N/n/m 등을 쓴다. っ는 cl, 무성화는 «자음만 남기기» 방식이 커뮤니티 관습이다(대부분 SV1 시절 자료).

### Cited Findings
- [공식] 음소 편집은 노트 위 음소를 더블클릭해서 한다. Tab은 다음 노트, Ctrl+Tab은 이전 노트, Enter는 확정, Esc는 취소. 사전 패널 등록은 그룹 전체에 적용된다. 리셋은 우클릭 → [Reset] → [Reset Phonemes] — [Piano Roll](https://sv2.docs.dreamtonics.com/en/pianoroll)
- [공식] “To use the words as phonemes in the lyrics directly, enter "." at the beginning of the words, followed by the phonemes separated by a space.” `[ - ]: Continues the previous phoneme.` `[ ' (cl) ]: Placing an apostrophe ' before a lyric inserts a glottal stop… useful when you want to separate a vowel from the previous phoneme.` — [Piano Roll](https://sv2.docs.dreamtonics.com/en/pianoroll)
- [공식] 2.1.0부터 무효 음소를 입력하면 음소 영역에 경고 아이콘이 뜬다 — [2.1.0](https://dreamtonics.com/synthesizer-v-studio-2-1-0-final-update/)
- [공식] 2.1.0에서 「ゑ」「ゐ」 같은 고어 문자 가사에서 렌더가 멈추던 문제가 수정됐다 — [2.1.0](https://dreamtonics.com/synthesizer-v-studio-2-1-0-final-update/)
- [공식] 노트별 언어 오버라이드(Notes 패널)와 스크립트 `languageOverride/phonesetOverride`가 있다 — [Notes Panel](https://sv2.docs.dreamtonics.com/en/notes-panel), [Scripting: Note](https://resource.dreamtonics.com/scripting/Note.html)
- [공식] 발음이 마음에 들지 않으면 Timbre(발음 포함)·Timing 리테이크를 먼저 시도한다 — [Pronunciation](https://sv2.docs.dreamtonics.com/en/phonemes)
- [커뮤니티, 비공식 위키·SV1 기반, 검색 요약]
  - cl = 작은 っ. 성문폐쇄 계열 소리도 내므로 모음 앞에 두면 목을 닫았다 여는 어택이 된다. 소리를 한 번에 끊고 싶을 때는 sil보다 cl이 낫다.
  - ん은 N(기본·성문 쪽), n(s·t 앞), m(ま·ば행 앞)으로 구분해 쓴다.
  - 조사 は/へ는 w a / e로 수동 변경한다.
  - 무성화는 전용 기호가 없어 «자음만 울리는» 방식으로 처리한다.
  - 출처: [Synthesizer V 일본어 비공식 위키 발음의 조정](https://synthesizer-v.fandom.com/ja/wiki/%E7%99%BA%E9%9F%B3%E3%81%AE%E8%AA%BF%E6%95%B4), [十竜 音素編 #02](https://note.com/hiryukaoku/n/n63399ad5919e). 원문은 402/미열람이라 검색 요약 수준이므로 재확인이 필요하다.
- [커뮤니티] 한 노트에 여러 가나를 넣으면 «의도하지 않은 리듬으로 발음될 수 있다». 원칙은 한 노트에 한 가나이고, 늘이기는 `-`로 한다 — [Sleepfreaks](https://sleepfreaks-dtm.com/synthesizer-v-studio-2-pro/article/)
- [커뮤니티, 테토 V2] 원곡의 스타카토감을 내려고 가사 앞 아포스트로피와 cl을 적절히 넣었다 — [kenchan note](https://note.com/kenchan21/n/nfa459d01256e)

### Inferences
- 장음(ー)은 별도 노트에 `-`로 이어 붙이는 것이 V2 권장(분할 대신 연속 기호)과 맞는다. 한 노트 내 여러 음절은 Evenly Split 설정으로 배분을 제어한다.
- 조사 は/へ/を는 형태소 분석으로 조사를 판별해 `.w a` / `.e` / `.o`로 자동 치환하는 전처리 규칙으로 만들 수 있다(を의 기본 처리는 미확인).
- 무성화(です의 す, ～ました의 し 등)는 V2 모델이 문맥상 자동 처리할 가능성이 있다. 다만 자료가 없다. 렌더 후 해당 모음 구간의 유성(voicing) 여부를 측정해 판단하고, 필요하면 Voicing 파라미터를 낮추거나 음소를 자음만 남게 바꾼다.

### Gaps
- V2(2.x) 일본어 음소 세트의 공식 목록(Phoneme Reference List)은 이번에 열람하지 못했다. 매뉴얼에 링크로만 언급된다.
- V2에서 は/へ 조사를 자동 처리하는지(문맥 인식 여부), 무성화 자동 처리 여부, ん 이음(異音) 자동 선택 여부를 공식·실험 자료로 확인하지 못했다.
- 十竜·비공식 위키 원문이 402/미열람이라 정확한 기호(N\ 등 V2 표기 포함)는 재확인이 필요하다.
