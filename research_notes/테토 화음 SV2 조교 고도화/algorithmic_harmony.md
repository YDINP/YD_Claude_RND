# 알고리즘 보컬 화음(하모니) 자동 생성 — 규칙·파라미터·오픈소스

> 조사일 2026-10-11. 범위: 리드 멜로디(노트+가사+타이밍) + (오디오에서 추정한, 노이즈 있는) 코드 진행 → 자연스러운 화음 라인 1~2성부 → SynthV .svp 기입.
> 신뢰도 표기: [1차]=공식 문서·논문 원문 확인, [2차]=리뷰/소매점/포럼 요약, [검색요약]=검색 엔진 요약만 확인(원문 미열람).
> "Inferences" 절의 의사코드·수치는 출처가 아니라 조사 결과를 바탕으로 한 **설계 제안**이다.

## 1. 상용 하모나이저는 어떻게 음정을 고르나 (Scale / Chord / Shift / Notes 모드)

### Takeaway
상용 장비는 공통적으로 4계열 모드를 가진다 — ① 고정 반음 이동(Shift/Chromatic), ② 키·스케일 내 diatonic 음정(Scale), ③ 코드 톤에 붙는 Chord 모드("High = 리드 위 다음 코드 톤, Higher = 그다음 코드 톤"), ④ MIDI 노트 직접 지정. 리뷰어들은 "키만 주는 것보다 코드를 따라갈 때 화음이 더 좋게 들린다"고 평가한다. 내부 알고리즘(보이스 리딩·리듬 처리)은 어느 회사도 공개하지 않았다.

### Cited Findings
- TC-Helicon VoiceWorks 계열의 화음 모드는 Scale, Chord, Shift, MIDI Notes 4종 [2차] — [recording.org](https://recording.org/tags/tc-helicon-voiceworks); [Sound On Sound VoiceWorks 리뷰](https://www.soundonsound.com/reviews/tc-helicon-voice-works)
- Shift 모드는 음악을 분석하지 않고 고정 음정을 유지(효과용), Notes 모드는 각 화음 성부를 MIDI 건반으로 직접 연주 [검색요약] — [Sound On Sound](https://www.soundonsound.com/node/4916904)
- Chordal 모드는 "내장 코드 인식 알고리즘으로 코드 진행에 맞는 화음을 자동 생성"하며, HarmonyControl Guitar 액세서리가 기타 코드를 해독해 MIDI로 화음 처리기에 보낸다 [2차] — [Sound On Sound](https://www.soundonsound.com/node/4916904); [Equipboard](https://equipboard.com/items/tc-helicon-harmonycontrol-guitar)
- TC-Helicon Vocalist(Korg Pa4X 내장) Chord 타입의 성부 배치 옵션 정의: **Octave up/down** = 한 옥타브 위/아래 추종, **High** = "리드 위의 다음 코드 음정(예: 3도)", **Higher** = "그다음 코드 음정(예: 5도)". 음수 값은 리드 아래, 양수 값은 리드 위 성부. Scale 타입은 코드 입력 없이 Key+Scale만으로 동작 [2차, 원문 독일어 확인] — [Bonedo 워크숍](https://www.bonedo.de/artikel/workshop-korg-pa4x-serie-os-20-9-tc-helicon-vocalist/)
- Harmony-G XT: "3도·5도 위/아래, 옥타브 위/아래, 고유 Bass 음정" 중 선택, Higher+Low 등 조합 가능 [2차, 제품 설명] — [Bonedo Harmony-G XT](https://www.bonedo.de/artikel/tc-helicon-voice-harmony-g-xt/); [Bajaao 상품 페이지](https://www.bajaao.com/products/tc-helicon-voicetone-harmony-g-xt-vocal-effects-processor)
- VoiceTone H1: high / low / high+low 3가지 보이싱, "설정한 diatonic 스케일을 따르는 위/아래 2성부" [2차, 제품 페이지] — [TC-Helicon](https://www.tchelicon.com/en/products/0726-ABL)
- Sound On Sound VoiceLive Touch 2 리뷰: 키만 줘도 자동 화음이 되지만 "코드를 따라갈 수 있을 때 화음이 더 좋게 들린다" [2차] — [Sound On Sound](https://www.soundonsound.com/node/4903870)
- VoiceLive에서 C장조 설정 시 스케일 종류를 "Maj 2" 등으로 고르는 절차가 있음(같은 장조에도 스케일 변형이 여럿 = 특정 음에서 3도/4도 선택이 다른 테이블) [2차, 포럼 사용자의 매뉴얼 인용] — [recording.org 포럼](https://recording.org/forum-topic/recording-live-or-studio/tc-helicon-voicelive-rack)
- Antares Harmony Engine 모드: Fixed 또는 Scale Intervals(키와 성부 음정 설정), Chord Degrees / Chord Name(코드 단위로 지정, 전위·성부 음역 가변), Chord by MIDI(실시간 MIDI/녹음된 MIDI 트랙), MIDI Omni / MIDI Channel(성부별 노트 제어) [2차] — [mastering.com](https://mastering.com/harmony-engine/); [Synthtopia 2007](https://www.synthtopia.com/content/2007/06/26/antares-vocal-modeling-harmony-generator/)
- Waves Harmony: 곡의 키·스케일 자동 감지, 보이싱·비브라토·팬·성별 조정, MIDI 수동 화음. 별도 Key Detector(신경망, 근음+장/단조+후보 2개)가 Harmony v14+에 키를 전송. Key Detector 매뉴얼: "키 없이는 피치 플러그인이 어떤 음이 합법인지 자동으로 판단할 수 없다" [2차, 소매점·보도] — [Muziker Waves Harmony](https://www.muziker.lt/waves-harmony); [Music Connection](https://www.musicconnection.com/waves-ships-its-key-detector/); [Pro Audio Design](https://www.proaudiodesign.com/products/waves-key-detector)
- 상용 Vielklang은 단선율에서 4성부를 코드 보이싱·보이스 리딩 원리로 생성 [2차] — [Sound On Sound 2008](https://soundonsound.com/node/4909785)

### Inferences
- "Smart/diatonic" vs "chromatic"의 실체 = 위 ①(Shift=chromatic) vs ②③(Scale/Chord=smart). 파이프라인은 ③Chord 모드를 기본, 코드 신뢰도가 낮은 구간은 ②Scale 모드로 폴백하는 2단 구조가 상용 장비 구조와 일치한다.
- "High/Higher" 정의는 그대로 구현 가능: 리드 음 p, 현재 코드 톤 집합 C(옥타브 전개)에 대해 `high(p) = min{c ∈ C : c > p (+최소 간격)}`, `higher(p) = 그다음 c`. 리드가 코드 톤 위에 있으면 High는 3도 또는 4도(예: 리드=5음 → 위 근음 = 완전4도)가 자연스럽게 섞여, 평행 3도 일변도를 자동으로 피한다.
- VoiceLive "Maj 1/2/3" 같은 스케일 변형은 "같은 스케일 음 위에서 3도로 갈지 4도로 갈지"의 룩업 테이블 차이로 추정됨(미확인).

### Gaps
- Melodyne, Logic Pro, iZotope Nectar(Harmony 모듈), Eventide(H910/Quadravox 계열)의 음정 선택 규칙은 이번 조사에서 1차 자료를 찾지 못함.
- "Smart" 모드라는 명칭은 TC-Helicon 출처에서 확인되지 않음. Antares/TC-Helicon/Waves의 보이스 리딩·리듬 처리 알고리즘은 비공개. Harmony Engine·VoiceLive 매뉴얼 원문(PDF)은 403/미발견으로 미열람.

## 2. 단일 추가 성부의 보이스 리딩 제약과 DP/Viterbi 정식화

### Takeaway
실무 편곡 규칙은 "기본은 위 3도(또는 아래 4도), 코드와 부딪히면 그 음만 4도·6도·옥타브로 바꾸고, 가능하면 비어 있는 코드 톤에 착지"다. 선택 문제 자체는 Viterbi(DP)로 푸는 것이 표준 — Songsmith 등이 멜로디→코드 선택에서 Viterbi로 전체 불협 최소화를 한다. 단일 화음 성부용 공개 DP 구현은 못 찾았으므로 비용 함수는 직접 설계해야 한다.

### Cited Findings
- 편곡 실례(Ethan Hein): 기본 "멜로디 3도 위 1성부 + 4도 아래 1성부"로 시작 후 음별 수정. 멜로디가 두 음을 오가는 구간에서 3도 위 추종은 어색 → 6도·4도로 교체. F 위 3도 = A가 B♭ 코드와 "심하게 충돌" → B♭로 이동(=4도). C장 코드 위에서 스케일 3도가 틀린 경우 코드 질에 맞게 E♭→E로 수정. 낮은 성부는 "비어 있는 코드 톤에 떨어지므로 4도보다 3도가 나은 경우가 많다". 3도만 쌓이면 "same-y" → 4도로 공간감, 강조 구간은 옥타브 [2차, 저자 블로그 원문 확인] — [Ethan Hein](https://ethanhein.com/wp/2024/adding-vocal-harmony-to-a-tears-for-fears-song)
- 코드 톤 기준 선택 예: F장 코드 위 멜로디 A(3음) → 위 단3도 C(코드 5음) 또는 아래 장3도 F(근음) [2차] — [MasterClass](https://www.masterclass.com/articles/how-to-harmonize)
- 평행 3도 고정은 악기 코드와 맞지 않을 때가 있어 음정을 바꿔야 한다는 포럼 조언, 4도·3도·6도 위주의 단순 화음 [검색요약, 개별 스레드 원문 미확인] — [TalkBass](https://www.talkbass.com/threads/vocal-harmony-parts.1346088/); [Gearspace](https://gearspace.com/threads/improving-harmonies.795174/)
- Songsmith는 62개 이상 코드 후보 중 Viterbi로 "모든 코드 변화에 걸친 불협을 최소화"하는 진행을 고름; 저자들은 이 방식이 전이 코드를 놓친다고 비판 [1차 논문, 검색요약 경유] — [arXiv 2501.02642](https://arxiv.org/pdf/2501.02642)
- HMM+Viterbi로 보컬 멜로디용 코드 진행 생성, "수용 가능 진행" 정확도 89.381% 보고(학부 논문, 신뢰도 낮음) — [Univ. of Colombo 논문](https://dl.ucsc.cmb.ac.lk/jspui/bitstream/123456789/3916/1/Group04_final_thesis.pdf); Rochester 학생 프로젝트도 Viterbi로 코드 선택 후 MIDI 출력 — [Rochester ECE477](https://hajim.rochester.edu/ece/sites/zduan/teaching/ece477/projects/2018/ShengXu_AlbertPeyton_RyanBhular_ReportFinal.pdf)
- FlexChord(NUS 2025): 기존 다수 방법이 Viterbi(DP)로 최적 코드 결정, 그러나 종지·보이스 리딩 처리가 약하다고 지적, 학습 불필요 방식 제안 [검색요약] — [NUS icnmc2025](https://www.comp.nus.edu.sg/~leowwk/papers/icnmc2025.pdf)
- AAAI 4성부 화성 시스템: 보이스 리딩 규칙 대부분이 "피할 것" 목록이라 남은 후보 중 선택이 핵심 난제 [검색요약] — [AAAI](https://aaai.org/?p=85590)
- ISMIR 2011: 규칙 기반 화성 시스템이 학습 기반과 비슷한 성능 [검색요약] — [ISMIR 2011](https://archives.ismir.net/ismir2011/paper/000073.pdf)
- 최소 이동 비용 참조 구현: harmonia(PureScript)는 다음 코드로 "총 반음 이동 최소"로 보이스 리딩 — [Pursuit harmonia](https://pursuit.purescript.org/packages/purescript-harmonia); romanyh(music21 기반)는 RomanText 입력 화성을 보이스 리딩 비용 순으로 정렬해 출력 — [napulen/romanyh](https://github.com/napulen/romanyh)

### Inferences (설계 제안 — 출처 아님)
상태 = 각 리드 노트 i에서의 화음 음고 h_i 후보(리드 대비 −9..+9반음 중 스케일/코드 허용 음). Viterbi:

```python
# 후보 생성: 리드 p, 코드톤 집합 CT(pc), 스케일 SC(pc)
def candidates(p, chord, key, side=+1):   # side=+1 위, -1 아래
    out = []
    for iv in range(3, 10):               # 단3도~장6도 (2도/7도/유니즌 제외)
        h = p + side*iv
        if h % 12 in chord.tones or (h % 12 in key.scale and chord.conf < 0.5):
            out.append(h)
    if not out: out = [p + side*12]       # 폴백: 옥타브(또는 harmony 생략)
    return out

IV_PREF = {3:0.0, 4:0.0, 5:0.4, 8:0.3, 9:0.2, 7:1.0, 6:3.0, 12:0.8}  # |h-p| 반음 → 비용
def local_cost(h, p, chord, key, dur, strong):
    c  = IV_PREF.get(abs(h-p), 3.0)
    c += 0.0 if h%12 in chord.tones else (1.5*chord.conf + (0 if h%12 in key.scale else 3.0))
    c += 2.0*strong*(h%12 not in chord.tones)          # 강박·긴 음은 코드톤 강제
    c += range_pen(h, lo=key.lo, hi=key.hi)            # 테토 화음 음역
    return c
def trans_cost(h0, h1, p0, p1):
    leap = abs(h1-h0)
    c  = 0.15*leap + (2.0 if leap > 5 else 0) + (4.0 if leap > 9 else 0)
    if (h1-p1) % 12 in (0, 7) and (h1-h0)*(p1-p0) > 0 and (h0-p0) == (h1-p1):
        c += 5.0                                        # 평행 완전5도/8도
    if (h0-p0 > 0) != (h1-p1 > 0): c += 6.0             # 성부 교차
    if h1 == h0 and p1 != p0: c -= 0.3                  # 사선 진행(유지) 보너스
    return c
# 표준 Viterbi: D[i][h] = min_{h'} D[i-1][h'] + trans + local, 역추적
```
- 핵심 근거 매핑: "코드와 충돌 시 4도/6도로" = local_cost의 코드톤 항, "두 음 왕복 시 3도 추종 어색" = 유지(사선) 보너스, "3도 일변도 단조로움" = 4도/6도 비용을 0에 가깝게(완전 0은 아님).
- 아래 성부는 side=−1, 선호 음정은 3도/4도/6도 동일, 단 리드 아래 완전4도는 베이스 위가 아니므로 허용.
- 2성부일 때: 위·아래 성부를 독립 Viterbi 후 두 성부 간 유니즌·2도 충돌만 후처리로 수정하면 충분(단순).

### Gaps
- 단일 화음 성부 선택을 Viterbi로 정식화하고 가중치를 공개한 논문·코드는 찾지 못함. 위 가중치는 튜닝 시작점일 뿐이다.

## 3. 리듬 단순화 (짧은 음 병합, 코드 톤 유지, 빠른 음절 생략, 경과음에서 화음 탈락)

### Takeaway
이 주제는 1차 출처가 거의 없다. 실무 편곡 조언은 "음절·프레이즈마다 다르게 처리"와 "두 음 왕복 구간은 추종하지 말고 다른 음정/지속음" 정도만 확인된다. 구체 알고리즘은 설계해야 한다.

### Cited Findings
- 음절·프레이즈마다 다른 음정을 쓰고, 멜로디가 두 음 사이를 오가면 3도 평행 추종이 어색하므로 다른 음정(6도·4도)으로 처리 [2차] — [Ethan Hein](https://ethanhein.com/wp/2024/adding-vocal-harmony-to-a-tears-for-fears-song)
- CTnCTR 지표 정의에서 "다음 음과 2반음 이내인 비화성음"을 '적절한(proper)' 비화성음(경과·보조음)으로 따로 취급 — 즉 짧은 순차 비화성음은 정상으로 본다 [1차] — [Yeh et al., arXiv 2001.02360](https://arxiv.org/pdf/2001.02360)
- lag129/synthv-scripts: 8분음표 단위 타이밍 조작 Lua 유틸(노트 그리드 정렬에 참고 가능) [2차] — [DeepWiki lag129/synthv-scripts](https://deepwiki.com/lag129/synthv-scripts)

### Inferences (설계 제안)
```python
def simplify(lead_notes, chords, beat):
    out = []
    for n in lead_notes:
        short = n.dur < 0.5*beat                      # 8분음표 미만
        nct   = n.pitch%12 not in chord_at(n.on).tones
        step  = next_note and abs(next_note.pitch - n.pitch) <= 2
        if short and nct and step:                    # 경과·보조음 → 화음 생략,
            extend(out[-1], to=n.off) if out else None    # 앞 화음 음을 늘려 지속(사선 진행)
            continue
        out.append(n)
    # 같은 화음 음고가 연속이고 간격 < 0.25beat → 한 노트로 병합 (가사는 첫 음절 + '-'/'+' 연장)
    return merge_same_pitch(out, gap=0.25*beat)
```
- SynthV에서는 병합된 노트의 후속 음절을 `-`(연장)로, 혹은 화음 트랙만 "우·아" 같은 모음 패드로 바꿔 빠른 음절을 생략하는 선택지도 있음(가사 동기화가 필요한 코러스면 리드 가사 유지).
- 규칙 요약: (a) 강박·코드 변화 지점의 노트는 반드시 화음 생성, (b) 약박의 짧은 순차 비화성음은 앞 화음 지속, (c) 리드가 도약하는 짧은 장식음(しゃくり 성격)은 무시, (d) 코드 변경 시 지속음이 새 코드 톤이 아니면 그 시점에서 노트를 분할해 재선택.

### Gaps
- 상용 하모나이저(TC-Helicon 등)가 빠른 음절에서 화음을 끊는지/지속하는지에 대한 문서는 찾지 못함. 팝 보컬 편곡 교재의 정량 규칙(최소 음길이 등)도 미확인.

## 4. 불확실성 처리 (코드 추정 오류, 스케일 외 음·블루노트, 모달 믹스처)

### Takeaway
상용 업계의 정석은 "키를 모르면 합법 음을 정할 수 없다"는 전제 아래 키 감지 + (가능하면) 코드 추종이다. 코드 신뢰도 기반 폴백(Chord→Scale→생략/옥타브)은 출처가 직접 기술하진 않지만 상용 모드 구조에서 자연스럽게 나온다.

### Cited Findings
- 키 없이는 피치 플러그인이 합법 음을 판단 불가; Key Detector는 근음·장단조와 함께 **대안 후보 2개**를 제시 [2차] — [Pro Audio Design](https://www.proaudiodesign.com/products/waves-key-detector); [Music Connection](https://www.musicconnection.com/waves-ships-its-key-detector/)
- 키만 쓴 화음보다 코드 추종 화음이 더 좋게 들림 [2차] — [Sound On Sound](https://www.soundonsound.com/node/4903870)
- 스케일 기반 3도가 실제 코드 질과 맞지 않는 사례(C장 코드 위 E♭→E 수정) = 모달 믹스처/차용화음에서 Scale 모드가 틀리는 전형 [2차] — [Ethan Hein](https://ethanhein.com/wp/2024/adding-vocal-harmony-to-a-tears-for-fears-song)
- 코드 정답이 하나라고 가정하는 평가 자체가 문제 — 한 멜로디에 가능한 화성은 여럿 [1차] — [Yeh et al.](https://arxiv.org/pdf/2001.02360)
- Schoenberg regions·교회선법을 쓰는 멜로디 화성 시스템(조성 영역 전환 모델링) [검색요약] — [arXiv 2501.02642](https://arxiv.org/pdf/2501.02642)

### Inferences (설계 제안)
- 코드 추정기에서 프레임별 상위 k(2~3) 코드와 확률을 받아 **기대 비용** `E[c] = Σ_k P(chord_k)·local_cost(h|chord_k)`로 계산하면 단일 오추정에 강건해진다.
- 신뢰도 정책: conf ≥ 0.6 → Chord 모드, 0.3~0.6 → 코드톤 ∪ 스케일음 허용(코드톤 가산점), < 0.3 → Scale 모드 diatonic 3도(VoiceTone식), 리드가 스케일 외 음(블루노트 ♭3/♭7, 반음 경과)이면 → (a) 짧으면 화음 생략, (b) 길면 동일 반음 수 평행 이동(=Shift/chromatic 로컬 적용) 또는 옥타브.
- 리드 음 자체가 실제 코드 톤 정보: 길고 강박인 리드 음은 코드 톤일 확률이 높으므로 코드 확률 재가중에 사용(리드 음 pc를 포함하는 코드 후보 가중 ↑).
- 모달 믹스처: 코드 추정이 장조 키의 iv(단), ♭VI, ♭VII를 내면 그 구간 스케일을 코드 구성음으로 덮어써 Scale 폴백이 E♭/E 같은 오류를 내지 않게 한다.
- 최종 안전장치: 생성 화음과 리드의 동시 음정이 1·2·11반음(단2·장2·장7)이면서 길이 > 1/8박이면 해당 노트를 옥타브/생략으로 교체.

### Gaps
- 상용 장비가 코드 인식 실패 시 어떤 폴백을 쓰는지 공개 자료 없음. 블루노트 처리에 대한 1차 자료 미발견.

## 5. 오픈소스 프로젝트·스크립트 (차용 후보)

### Takeaway
SynthV/UTAU용 "화음 자동 생성" 오픈소스 저장소는 사실상 없다. 가장 가까운 것은 Dreamtonics 포럼의 Expressive Mapper Pro 3(화음 모드 포함, 코드 공개라고 주장)이며, 알고리즘 차용은 music21 기반 romanyh·harmonia 같은 보이스 리딩 코드와 DeepBach/Coconet 계열 연구에서 해야 한다. 우리 파이프라인은 .svp를 직접 쓰므로 스크립트 API보다 JSON 조작이 단순하다.

### Cited Findings
- Expressive Mapper Pro 3 (v3.6.1): SynthV Studio Pro 스크립트, "Auto-Tuning, Harmonies & Chords", Harmonies & Just Intonation 모드로 솔로를 듀엣/팝 콰이어로. 작성자가 베타/as-is, "코드는 완전 공개, 누구나 수정 가능"이라 설명 [검색요약 — 포럼 페이지는 403으로 원문 미확인] — [Dreamtonics 포럼](https://forum.dreamtonics.com/t/script-expressive-mapper-pro-3-v3-6-1-auto-tuning-harmonies-chords-0-0-6/8326)
- vi-control: "groupharmony" 스크립트(전조된 노트로 트랙 생성) 공유, 선택 노트를 반음 올리고 내리는 단순 스크립트; "SynthV는 코드를 모르므로 진짜 하모나이저엔 스케일/코드 입력이 필요", Band-in-a-Box로 화음 만든 뒤 MIDI 재임포트하는 우회법 [2차 포럼] — [vi-control p.3](https://vi-control.net/community/threads/synthesizer-v-scripting.137282/page-3); [vi-control SV2 p.29](https://vi-control.net/community/threads/synthesizer-v-studio-2.160492/page-29)
- SynthV 스크립트 API: JavaScript(ES5.1, Duktape)와 Lua 5.4 동일 API [1차] — [Dreamtonics Scripting Manual](https://resource.dreamtonics.com/scripting/); [SV2 문서 Scripts](https://sv2.docs.dreamtonics.com/en/scripts)
- OpenUtau 플러그인은 Phonemizer와 Batch Edit Macro, Core API로 노트·피치·비브라토 조작; 화음 플러그인은 발견 안 됨 [2차] — [OpenUtau](https://github.com/openutau/OpenUtau); [OpenUtau 문서](https://docsearch.algolia.com/mcp/docs/repo/openutau/openutau)
- romanyh: music21 기반, RomanText → 보이스 리딩 비용 순 정렬 화성 [2차] — [napulen/romanyh](https://github.com/napulen/romanyh)
- harmonia(PureScript): 최소 총 반음 이동 보이스 리딩(파이썬 이식 쉬움) — [Pursuit](https://pursuit.purescript.org/packages/purescript-harmonia)
- LaTeef: 코드 진행용 보이스 리딩 엔진, 앞선 코드에 따라 전위 선택, MIDI 출력 — [hockeymonday/LaTeef](https://github.com/hockeymonday/LaTeef)
- desanton/Harmonizer: 멜로디→코드 진행(C++/JS, macOS만 테스트) — [desanton/Harmonizer](https://github.com/desanton/Harmonizer)
- music21-mcp: harmonize_melody.py 포함(채점 방식 미검증) — [glama music21-mcp](https://glama.ai/mcp/servers/cclawton/music21-mcp)
- DeepBach: 바흐 코랄 생성, 다수 결과가 진짜 바흐와 구별 불가(청취 테스트) [2차] — [Pachet 사이트](https://www.francoispachet.fr/?p=4349)
- 비교 연구 Yeh et al.: 템플릿 매칭·HMM·GA·BiLSTM·MTHarmonizer 5종 멜로디 화성 모델 비교 [1차] — [arXiv 2001.02360](https://arxiv.org/pdf/2001.02360)

### Inferences
- 가져다 쓸 우선순위: (1) 자체 Viterbi(2절 의사코드, numpy만으로 충분) — (2) 보이스 리딩 비용 아이디어는 harmonia/romanyh — (3) 키/코드 처리에 music21(`key.analyze`, `harmony.ChordSymbol`)은 선택적. DeepBach/Coconet은 4성부 코랄용 학습 모델이라 팝 보컬 1~2성부·노이즈 코드 입력에는 과설계.
- Expressive Mapper Pro 3의 화음 로직은 포럼 로그인 후 직접 코드 확인 가치가 있음(Just Intonation 미세 피치 오프셋은 SynthV 피치 편차로 응용 가능).

### Gaps
- GitHub에서 SynthV 화음 생성 스크립트·OpenUtau 화음 플러그인은 찾지 못함. Coconet 원문·코드(Magenta)는 이번에 열람하지 않음.

## 6. 화음 품질 자동 평가

### Takeaway
표준 벤치마크는 없다. 실용적인 조합은 (a) Yeh et al.의 CTnCTR·PCS(정의가 명확해 그대로 이식 가능), (b) 평행 5도/8도 횟수, (c) 성부 교차·음역 이탈·도약 통계, (d) Plomp-Levelt 계열 거칠기(roughness)다.

### Cited Findings
- "멜로디 화성 과제에 표준화된 객관 지표가 현재 없다"; 정답 코드가 하나라는 가정 비판 [1차] — [Yeh et al.](https://arxiv.org/pdf/2001.02360)
- **CTnCTR** = (n_c + n_p)/(n_c + n_n). n_c=코드톤 멜로디 음 수, n_n=비코드톤 수, n_p=비코드톤 중 "바로 다음 음과 2반음 이내"인 적절한 비화성음 수 [1차] — [Yeh et al.](https://arxiv.org/pdf/2001.02360)
- **PCS**: 멜로디 음과 코드 각 구성음 간 음정 점수 — 유니즌·장/단3도·완전5도·장/단6도 = +1, 완전4도 = 0, 그 외 = −1; 16분음표 창마다 평균, 쉼표 제외 [1차] — [Yeh et al.](https://arxiv.org/pdf/2001.02360)
- **MCTD**: 멜로디 음 PCP(one-hot)와 코드 PCP를 Harte et al.(2006) 6차원 tonal space에 사영해 거리, 음길이 가중 평균 [1차] — [Yeh et al.](https://arxiv.org/pdf/2001.02360)
- 참고 수치(사람이 만든 화성): CTnCTR 0.74, PCS 1.42, MCTD 1.03 / 템플릿 매칭 0.91, 1.97, 0.83 — 규칙 기반이 오히려 "더 협화적"으로 나와 지표 최대화가 곧 자연스러움은 아님. 저자도 지표는 개발 추적용이지 품질 판정용이 아니라고 권고 [1차] — [Yeh et al.](https://arxiv.org/pdf/2001.02360)
- KAIST 코랄 화성 논문: 토큰 예측 오류율과 함께 **평행 5도/8도 발생 빈도**를 지표로 보고 [검색요약] — [KAIST](https://dspace.kaist.ac.kr/handle/10203/320583)
- Harrison & Pearce: 순간 협화(harmonicity)와 순차 협화 2종(spectral distance, voice-leading distance) [1차 논문, 검색요약 경유] — [arXiv 1807.00790](https://ar5iv.labs.arxiv.org/html/1807.00790)
- Plomp-Levelt 거칠기 기반 불협 비용으로 코드톤 샘플링(Princeton 2026 학위논문) [검색요약] — [Princeton PACM](https://www.pacm.princeton.edu/sites/default/files/2026-05/Isha%20Yerramilli-Rao.pdf)

### Inferences (설계 제안)
화음 1성부 평가용 지표 세트(전부 numpy로 구현 가능):
```python
metrics = {
  "harm_PCS":  mean(pcs(h, chord) over 16th grid),        # 화음 성부 vs 코드 (Yeh 정의)
  "lead_PCS":  mean(pcs_interval(abs(h-p)) over grid),     # 화음 vs 리드 동시 음정: 3/6도=+1, 4도=0, 2/7도=-1
  "CTnCTR_h":  ctnctr(harmony_notes, chords),
  "clash_rate": share of time |h-p|%12 in {1,2,11} and dur>1/8beat,   # 목표 < 2%
  "unison_oct_rate": share of time (h-p)%12 == 0,          # 목표 낮게(옥타브 강조 구간 제외)
  "parallel_P5_P8": count, "crossings": count,
  "mean_leap": mean |Δh|, "leap_gt5": count,               # 리드의 도약 통계와 비교
  "interval_hist": histogram of |h-p| (3도 일변도면 >80% → 단조로움 경고),
}
```
- 목표치는 "사람 편곡 화음"의 분포와 비교해야 하며(Yeh 권고), 원곡 Suno 보컬에서 분리한 실제 코러스 트랙이 있으면 그 분포를 기준선으로 쓰는 것이 가장 타당.

### Gaps
- 보컬 화음 1성부 전용(리드-화음 간) 지표를 정의·검증한 논문은 찾지 못함. Coconet/DeepBach 평가표의 Mean CC·CHE·MCTD 수치 비교(arXiv 2511.14600)는 원문 미열람.
