# 데이터 기반 자동 조교: 레퍼런스 보컬(사람/Suno)의 표현을 SynthV·UTAU·VOCALOID 파라미터로 옮기기

(조사일 2026-10-09. 모든 사실 항목에 출처를 달았다. 출처를 찾지 못한 내용은 Inferences나 Gaps에 넣었다.)

## Q1. 기존 도구: 오디오에서 노트·피치·파라미터를 뽑아 보컬 신스로 넣는 도구

### Takeaway
SynthV Studio 2 Pro에는 Voice-to-MIDI("Extract Notes from Audio")가 내장되어 노트, 가사, 피치(옵션)까지 옮겨 준다. 다이내믹스·브레스·텐션은 옮기지 않으므로 서드파티 도구가 그 빈자리를 채운다. 이 용도에 가장 가까운 오픈소스는 wav2svp(SOME+RMVPE로 피치와 실험적 tension/breathiness를 SVP에 써 줌)와 openvpi의 GAME/SOME(노래→MIDI, 실수값 피치 출력)이다. VOCALOID 쪽은 VOCALO CHANGER가 파라미터를 추정하지 않고 음성 변환(음색만 교체) 방식을 쓴다.

### Cited Findings
**SynthV Studio 2 Pro (Dreamtonics)**
- SV2 Pro 매뉴얼은 피치 곡선을 «AI가 생성한 곡선»으로 다룬다. 생성 요소는 노트 음높이·길이·가사, Pitch Mode(Sing/Rap), Vocal Modes, Expression Pad, AI Retakes, Vibrato Modulation/Envelope다. 편집 수단은 Smart Pitch Controls(control points/curves)와 Parameter Panel의 Pitch Deviation이다 — [SV2 매뉴얼: Pitch](https://sv2.docs.dreamtonics.com/en/pitch)
- 같은 문서에 따르면 Pitch Deviation은 AI 생성 곡선과 Smart Pitch Controls 위에 «합산»되며, "주로 이전 버전과의 호환을 위해" 존재한다 — [SV2 매뉴얼: Pitch](https://sv2.docs.dreamtonics.com/en/pitch)
- SV2에서는 피치 곡선이 «항상 자동 생성»된다. 기계적이거나 직접 그린 피치를 원하면 Expression Pad의 **Rigid**(왼쪽 아래) 사분면을 쓴다. 이 사분면은 곡선을 평탄하게 만들어 노트 경계에만 약간의 흔들림을 남기고, AI Retake의 영향도 받지 않는다. 그 위에 Smart Pitch Controls를 얹는 방식이다. Rigid 사분면은 V2 보이스 전용이다 — [SV2 매뉴얼: Pitch](https://sv2.docs.dreamtonics.com/en/pitch)
- 매뉴얼은 "Tracing the Pitch Curve of Audio"를 이렇게 설명한다: "The Voice-to-MIDI Conversion feature can also reflect pitch curves when converting audio to notes." 다른 보이스로 바꾸면서 곡선을 유지하려면 [Modify] > [Parameters] > [Trace Pitch into Control Points]를 쓴다 — [SV2 매뉴얼: Pitch](https://sv2.docs.dreamtonics.com/en/pitch)
- Voice-to-MIDI 워크플로(2026-09-02 Dreamtonics 블로그): 클립 우클릭 → Extract Notes from Audio. 옵션은 Note Detection Sensitivity, 언어, "Round pitch to the nearest semitone", "Phonetic lyrics transcription", "Transfer pitch onto converted notes"다. dry 모노 보컬 입력을 권장한다. 숨이 섞인 발성과 넓게 벌린 모음에서는 일부 단어와 디테일을 놓쳤다는 사용기도 실려 있다 — [Dreamtonics 블로그: How to Convert Voice to MIDI with AI](https://dreamtonics.com/?p=4669)
- 같은 블로그는 이 기능이 반음 검출에 더해 "vocal cries, dynamic fluctuations, expressive details, and phonetics"까지 본다고 주장하지만, 벤더 마케팅이다 — [Dreamtonics 블로그](https://dreamtonics.com/?p=4669)
- Voice-to-MIDI는 Pro 에디션 기능이고 ARA 변형을 포함한다(리셀러 표기) — [Thomann 제품 페이지](https://www.thomann.nl/dreamtonics_synthesizer_v_studio2_pro_3voc.htm)
- 2.1.0에서 Pitch Control Points Mode가 개편되었다(영역을 선택하면 피치 곡선 궤적을 따라 control point가 자동 생성되고, 비브라토 깊이·속도 리사이즈 핸들이 붙는다). 2.1.1에서는 스크립트 API로 retakes, pitch control points/curves, vocal mode 세부 파라미터에 접근할 수 있게 되었다. 2.2.1(2026-03-02)에서는 Voice-to-MIDI 결과용 트랙을 자동 생성하도록 바뀌었다 — [Sonicstate](https://sonicstate.com/news/2025/06/17/synthesizer-v-studio-2-pro-updated/), [Dreamtonics 2.2.1](https://dreamtonics.com/?p=4287)
- 스크립트 Note API에서 피치 전이·비브라토 속성은 **V1 전용**이다. 해당 속성은 `tF0Offset/tF0Left/tF0Right`(초), `dF0Left/dF0Right`(반음), `tF0VbrStart/Left/Right`(초), `dF0Vbr`(반음), `pF0Vbr`(rad), `fF0Vbr`(Hz), `tNoteOffset`(초)다. V2용으로는 `dF0VbrMod`(비브라토 강도), `expValueX/Y`(Expression Pad, 2.1.1+), `phonemes[]`(leftOffset, position, activity, strength; 2.1.1+), `getDetune/setDetune`(센트, 2.1.1+), `get/setPitchAutoMode`가 있다 — [SynthV Scripting Manual: Note](https://resource.dreamtonics.com/scripting/ja/Note.html)
- 로컬 SV2 템플릿(`D:\park\synthv\tools\template_sv2.svp`)의 그룹 파라미터 키는 `pitchDelta, vibratoEnv, loudness, tension, breathiness, voicing, gender, toneShift, mouthOpening`이고, 각 키가 `{"mode":"cubic","points":[]}` 구조다. 시간 단위는 blick(4분음표 1개 = 705,600,000 blicks, `make_svp.py`)이다 — 로컬 파일 직접 확인(D:\park\synthv\tools)

**서드파티/오픈소스 (SynthV용)**
- **wav2svp**(SUC-DriverOld, MIT): SOME과 RMVPE를 기반으로 wav를 SVP로 바꾼다. MIDI를 자동 추출하고, pitch 데이터와 tension·breathiness(Experimental)를 함께 추출한다(`--extract_tension`, `--extract_breathiness`). 가사는 추출하지 못한다. WebUI/CLI, Python 3.10, cu118 PyTorch, Windows용 원클릭 패키지(go-webui.bat)를 제공한다 — [GitHub wav2svp](https://github.com/SUC-DriverOld/wav2svp)
- **real-voice**(hataori-p): SynthV Pro용 Lua 스크립트 모음. "Voice Copy" 개념으로, 실제 가수의 피치 곡선을 가져오고 음소·쉼 타이밍을 그 곡선에 맞춘다. Praat에서 피치를 준비하고(Convert/Smooth) "RV Load Pitch"로 불러온다. 작자 스스로 일부 운율 특징만 복사된다고("inaccurate") 밝힌다. Windows에서만 테스트되었고, 비영문 경로에서는 로드가 실패한다 — [GitHub real-voice](https://github.com/hataori-p/real-voice)
- 기타 SynthV 스크립트: cerulean999/synthv-scripts에는 "extract notes from audio"로 만든 노트용 Freeze Phonemes가 있고, avilesjf/synthv-scripts에는 Scale Pitch Deviation이 있다. 둘 다 오디오→피치 임포트 기능은 없다 — [cerulean999](https://github.com/cerulean999/synthv-scripts), [avilesjf](https://github.com/avilesjf/synthv-scripts)
- **LibreSVIP**: 여러 보컬 신스 프로젝트 포맷 간 변환기(MIT, pip 설치, OpenSVIP·Utaformatix3에서 영감). 이 조사에서는 pitchDelta 매핑 방식까지는 확인하지 못했다 — [PyPI libresvip](https://pypi.org/project/libresvip/1.0.7/)

**노래 전사 모델 (openvpi)**
- **GAME**(Generative Adaptive MIDI Extractor, MIT, 2026-08-29 갱신): SOME의 후속이다. 경계 추출을 D3PM(이산 확산)으로 해서 품질과 속도를 조절할 수 있다. 노트와 피치를 «주어진 경계에 맞춰» 적응시킬 수 있고, 잡음·리버브·반주가 섞인 분리 보컬에도 강건하다고 주장한다. 다국어를 지원하고, 경계·노트존재 임계값을 조절할 수 있으며, 피치를 부동소수로 출력한다. 실행은 `python infer.py extract <dir> -m model.pt --output-formats mid,txt,csv` — [GAME README(미러)](https://ohotnik.duckdns.org/openvpi/GAME), [openvpi 목록](https://oosmetrics.com/u/openvpi)
- **SOME**: 노래→MIDI. 자체 수치로 i5-12400 CPU에서 실시간의 9배, 3080Ti에서 300배 빠르다. 비정수 MIDI를 출력해 DiffSinger variance 라벨링에 적합하다. 베타이며, 공개 모델은 중국어로만 학습되었다 — [GitHub SOME](https://github.com/openvpi/SOME)
- SingMelody는 GAME을 기본 체크포인트로 쓴다. 정렬이 주어지면 음소 경계를 옮기지 않고 단어별 피치를 할당한다 — [HF SingMelody](https://huggingface.co/pymaster/SingMelody)

**OpenUtau / DiffSinger**
- openvpi DiffSinger는 pitch, energy, breathiness 등을 예측·제어하는 variance 모델을 갖고 있고, 배포 대상은 OpenUTAU와 DiffScope다. DiffSinger 렌더러는 OpenUtau 공식 저장소에 병합되었다 — [openvpi DiffSinger](https://github.com/ypatidisanastasis-tech/DiffSinger), [OpenUtau wiki](https://github.com/openutau/OpenUtau/wiki/Singer-Settings-and-Requirements)
- DiffSinger variance 정의(그대로 재사용 가능한 측정식):
  - energy = 전체 파형 RMS(dB). 현재는 비권장이고 voicing으로 대체되었다.
  - breathiness = 비주기 성분 RMS(dB).
  - voicing = 조화 성분 RMS(dB).
  - tension: 기본 하모닉 대비 전체 하모닉 비율 r = sqrt(RMS(H_full)² − RMS(H_base)²)/RMS(H_full)를 구한 뒤 T = log(r/(1−r))(역시그모이드)로 바꾼다.
  - energy와 breathiness/voicing은 동시에 켜지 않는다.
  - 피치 추출기는 parselmouth(기본), RMVPE("state-of-the-art NN-based ... for singing", 권장), harvest(가장 느리지만 깨끗한 녹음에서 정확)다.
  — [DiffSinger BestPractices](https://github.com/openvpi/DiffSinger/blob/main/docs/BestPractices.md)
- DiffSinger 변종 DiffSingerForTuneLab PR은 energy/breathiness/voicing/tension을 delta 모드(정규화 오프셋)와 absolute 모드(dB)로 편집하는 방식을 다룬다(PR은 닫힘) — [PR #2](https://github.com/KakaruHayate/DiffSingerForTuneLab/pull/2)

**VOCALOID**
- VOCALO CHANGER는 사용자가 부른 노래를 VOCALOID6 AI 보이스로 «변환»한다. 가사와 창법을 그대로 두고 음색만 바꾸는 방식이다. 플러그인판(VST3/AU/AAX)은 DAW 오디오 트랙에서 실시간으로 동작하고, 변환 후 pitch·dynamics를 조절할 수 있다 — [Yamaha 2023 발표](https://www.yamaha.com/en/news_release/2023/23101801/), [pianoandsynth](https://pianoandsynth.com/yamaha-vocalo-changer-music-production-tool-launched/)

### Inferences
- SV2 + V2 보이스(테토 SV2 포함)에서 «레퍼런스 피치를 그대로» 재현하는 가장 확실한 경로는 다음 둘이다. (a) Voice-to-MIDI에서 "Transfer pitch onto converted notes"를 켠다. (b) 노트를 Expression Pad Rigid로 두어 AI 곡선을 평탄화한 뒤, 목표 f0와 Rigid 곡선의 차이를 `pitchDelta`(센트)로 쓴다. V1 시절처럼 "Manual 모드 + tF0/dF0Vbr=0"으로 기본 전이를 끄는 방법은 V2 노트 속성에서 사라졌으므로 쓸 수 없다(스크립트 문서상 V1 전용).
- 다이내믹스(loudness)·브레스·텐션은 SV2 내장 기능이 옮겨 주지 않는다(확인한 문서 어디에도 언급 없음). 그래서 wav2svp식 외부 추출이나 직접 만든 파이프라인이 필요하다.
- Suno 생성 보컬은 반주와 리버브가 섞여 있다. 따라서 분리(예: 별도 stem 분리)를 거친 뒤 GAME/RMVPE처럼 «잡음 보컬에 강건»하다고 주장하는 모델을 쓰는 편이 합리적이다.
- DiffSinger의 tension·breathiness 정의는 SynthV의 tension·breathiness 파라미터와 같은 물리량이 아니다. 그래서 절대값을 그대로 옮기기보다 «상대 곡선(정규화 후 선형 매핑)»으로 쓰고, 렌더 측정 루프로 보정하는 것이 안전하다.

### Gaps
- SV2 Voice-to-MIDI가 피치를 `pitchDelta`로 쓰는지 Smart Pitch control points로 쓰는지 공식 문서에서 확인하지 못했다. 결과 .svp를 직접 열어 확인해야 한다.
- SVP의 `loudness`(dB 범위), `tension`/`breathiness`(−1..1 추정) 값 범위와 곡선 보간 의미를 공식 사양으로 확인하지 못했다(Dreamtonics가 SVP 포맷 사양을 공개하지 않은 것으로 보임).
- OpenUtau의 "Load rendered pitch" 및 DiffSinger variance 자동 채우기 동작을 다룬 문서는 이번 검색에서 찾지 못했다.
- Vocal Shifter, NNSVS의 기존 피치 임포트 기능은 조사하지 못했다.
- LibreSVIP의 SVP pitchDelta 변환 로직은 소스를 보지 않아 미확인이다.

## Q2. 알고리즘: f0→노트+pitchDelta, loudness, breathiness, tension, 비브라토, 타이밍

### Takeaway
표준 파이프라인은 다음 순서다: (1) 강건한 f0 추출(RMVPE/harvest) → (2) 강제 정렬이나 GAME 경계로 노트 경계 결정 → (3) 노트 번호는 구간 f0의 가우시안 투표(VocaListener 식 1) → (4) 잔차 = 목표 f0 − 신스 기본곡선을 pitchDelta로 기록 → (5) 조화/비주기 분해로 RMS(dB) 계열 곡선(loudness, breathiness, voicing, tension)을 산출 → (6) 렌더-측정-보정 반복. 비브라토는 f0를 저역통과해 «음정 성분»과 «변조 성분»으로 나누면 rate(Hz)와 extent(cent)를 얻는다.

### Cited Findings
- VocaListener 분석단: f0는 SWIPE로 구하고, 로그 스케일 MIDI 노트 단위(반음=1, 중간 C=60) 실수로 표현한다. 파워는 2048샘플 Hanning 창(≈46 ms), 프레임 시프트는 10 ms다. 노트 온셋과 길이는 가사 음소를 모노폰 HMM Viterbi로 정렬해 얻는다(일본어 형태소 분석으로 발음 추정) — [Nakano & Goto, SMC 2009](https://staff.aist.go.jp/m.goto/PAPER/SMC2009nakano.pdf)
- 노트 번호 추정: Note# = argmax_n Σ_t exp{−(n−F0(t))²/(2σ²)}, σ=0.33, t는 노트 구간 전체 — [SMC 2009](https://staff.aist.go.jp/m.goto/PAPER/SMC2009nakano.pdf)
- 음정 이탈 보정(off-pitch correction): 반음 간격 가우시안 빗(comb) 그리드를 유성 구간 f0에 피팅해 오프셋 Fd(0≤Fd<1)를 구한다. 피팅용 f0만 3 Hz 컷오프 FIR 저역통과로 평활해 overshoot·vibrato·preparation·fine fluctuation을 억제한다. 무음 구간과 1.8반음 넘는 도약은 평활 대상에서 제외한다 — [SMC 2009](https://staff.aist.go.jp/m.goto/PAPER/SMC2009nakano.pdf)
- 스타일 조정: f0와 Pow를 원본과 FIR 평활본 사이에서 내삽/외삽해 비브라토와 미세 요동을 강조하거나 억제한다. 비브라토 구간과 그 외 구간을 따로 조절한다 — [SMC 2009](https://staff.aist.go.jp/m.goto/PAPER/SMC2009nakano.pdf)
- 정렬 오류는 /w/ /r/(반모음·유음), /m/ /n/(비음) 주변에 몰린다. 후보 제시는 ΔMFCC 음색 요동이 큰 지점의 후보를 합성해 MFCC로 비교한 뒤 유사도 순으로 정렬하는 방식이다 — [SMC 2009](https://staff.aist.go.jp/m.goto/PAPER/SMC2009nakano.pdf)
- 실험 조건: 노트 속성 "No Vibrato", "0% Bend Depth"로 신스 자체의 피치 장식을 끈 상태에서 추정했다 — [SMC 2009](https://staff.aist.go.jp/m.goto/PAPER/SMC2009nakano.pdf)
- 추정 파라미터는 MIDI 기반이다(노트 번호, pitch bend, pitch bend sensitivity, expression/DYN) — [VocaListener2, ICASSP 2011](https://staff.aist.go.jp/m.goto/PAPER/ICASSP2011nakano.pdf)
- 음색 변화(VocaListener2): VocaListener1로 여러 가수 DB(하츠네 미쿠 + MIKU Append 6종)를 시간 동기 합성한다. 이어 STRAIGHT로 스펙트럼 포락을 구해(2045 bin → 80차 DCT) 프레임별 PCA(누적 기여율 ≥80%)를 하고, 전체에 다시 PCA를 걸어 3차원 음색 공간을 만든다. 사용자 궤적을 0–1로 정규화해 "timbre change tube" 안에 넣고, RBF 변분 보간으로 스펙트럼 변환면을 합성한다. 프레임은 1 ms다 — [ICASSP 2011](https://staff.aist.go.jp/m.goto/PAPER/ICASSP2011nakano.pdf)
- VocaListener2가 음색을 파라미터 추정 대신 신호처리로 다룬 이유: 음색 파라미터는 신스마다 달라 이식성이 없고(VOCALOID1과 2도 다름), 중간 음색(LIGHT와 SOLID 사이 등)은 기존 시스템으로 합성할 수 없다 — [ICASSP 2011](https://staff.aist.go.jp/m.goto/PAPER/ICASSP2011nakano.pdf)
- breathiness·voicing·tension의 측정식(조화/비주기 분해 기반 RMS dB, tension = 역시그모이드 하모닉비) — [DiffSinger BestPractices](https://github.com/openvpi/DiffSinger/blob/main/docs/BestPractices.md)
- RMVPE: 반주가 섞인 폴리포닉 음악에서 음원 분리 없이 보컬 피치를 직접 추정한다. RPA/RCA에서 기존 방법보다 우수하고, 모든 SNR 수준에서 강건하다고 보고한다(INTERSPEECH 2023) — [arXiv 2306.15412](https://arxiv.org/abs/2306.15412v2)
- 비브라토 분석은 대개 2단계다: f0 궤적 추정 → 주기 변조 검출과 파라미터화(rate, extent) — [Rossignol et al. DAFx](https://dafx.de/paper-archive/details/N2Kpz2NdMSLXkSnquj5qQw), [ISMIR 2016](https://archives.ismir.net/ismir2016/paper/000005.pdf)
- FDM(Filter Diagonalisation Method)은 짧은 프레임에서도 강건해 경계 검출에 유리하다. 비브라토 rate 정확도 >92.5%, extent 약 85%(박사논문 수치) — [Yang, QMUL PhD](https://qmro.qmul.ac.uk/xmlui/bitstream/123456789/24857/1/YANG_Luwei_Final_PhD_210417.pdf)
- VibE-SVC(2025)는 f0 곡선을 이산 웨이블릿 변환으로 분해해 비브라토 성분을 뽑는다 — [arXiv 2505.20794](https://arxiv.org/pdf/2505.20794)
- VibratoScope(Python)는 rate·extent(cent)·jitter·shimmer 등을 추출하고, pyin/Praat/HPS/REAPER를 지원한다. 비동료심사 프로젝트다 — [ecosyste.ms 항목](https://science.ecosyste.ms/projects/37213)

### Inferences (구현 설계안, Python/Windows)
- **f0**: 분리 보컬에 RMVPE를 10 ms(또는 5 ms) 프레임으로 돌리고, 유성 구간만 반음 실수 단위 m(t)=69+12·log2(f/440)로 변환한다.
- **노트/경계**: 가사가 있으면 강제 정렬(MFA 등)로 음절 경계를 잡고, 없으면 GAME 경계를 쓴다. 노트 번호는 VocaListener 식(σ=0.33) 또는 경계 내 f0 중앙값 반올림으로 정한다.
- **pitchDelta**: SV2 V2 보이스는 기본 곡선이 AI 생성이므로 "목표 f0 − 노트 음높이"를 그대로 쓰면 이중 장식이 된다. 해법은 (1) 노트를 Rigid로 두고 한 번 렌더해 신스 f0를 측정한 뒤, (2) delta = m_target − m_syn을 센트로 바꿔 pitchDelta에 누적한다(VocaListener 식 2). 2~4회 반복한다. 점은 10–20 ms 간격으로 찍고 무성 구간에서는 0으로 되돌린다.
- **loudness**: 레퍼런스와 렌더의 RMS(dB)를 구한다. 녹음 레벨 차이는 VocaListener처럼 전역 α(기준 렌더와의 제곱오차 최소화)로 정규화하고, 차이를 loudness 곡선(dB)에 누적한다. 신스 상한을 넘는 부분은 클리핑한다(VocaListener도 DYN=127 상한 때문에 완전 재현이 불가능했다고 적었다).
- **breathiness/tension**: WORLD(pyworld)의 aperiodicity나 조화/비주기 분해로 DiffSinger식 breathiness(비주기 RMS dB)와 tension(하모닉비 logit)을 구한다. 레퍼런스와 렌더의 차이를 SynthV −1..1 범위로 선형 스케일하고 반복으로 보정한다. 대안 지표는 H1−H2, 스펙트럼 기울기, HNR이다(이번 조사에서 1차 출처는 확인하지 못했다. 아래 Gaps 참조).
- **비브라토**: m(t)에서 3 Hz 저역통과 성분(VocaListener와 같은 컷오프)을 빼면 변조 성분이 남는다. 피크 간격으로 rate(Hz), 반진폭으로 extent(cent)를 얻는다. SV2에서는 pitchDelta에 그대로 싣거나, Smart Pitch Controls/`dF0VbrMod`로 근사한다.
- **자음 타이밍**: 강제 정렬로 얻은 음소 경계를 SV2 `phonemes[].leftOffset/position`(2.1.1+ 스크립트)이나 노트 온셋 이동으로 반영한다.

### Gaps
- H1−H2, 스펙트럼 기울기→tension 매핑, HNR→breathiness 매핑을 SynthV 파라미터와 정량 대응시킨 연구는 찾지 못했다.
- SynthV 내부의 tension·breathiness 음향 정의는 비공개다.
- 강제 정렬기(MFA 등)의 일본어 노래 정확도 수치는 이번 조사 범위 밖이다.

## Q3. 반복 «렌더→측정→보정» 루프 (analysis-by-synthesis)와 VocaListener 수치

### Takeaway
VocaListener(Nakano & Goto, AIST, SMC 2009)는 피치와 다이내믹스를 «신스로 렌더→f0·파워 측정→목표와의 차를 파라미터에 더함»으로 반복 갱신한다. 4회 반복 만에 피치 평균오차가 0.386→0.034반음(CV01, ≈3.4 cent), 파워 오차가 11.2→3.4 dB로 줄었다. 직접 매핑 방식(0.217반음, 13.65 dB)보다 훨씬 작다. 이 루프는 신스·보이스뱅크가 바뀌어도 강건하다는 것이 핵심이고, SynthV 자동 조교의 표준 설계로 그대로 쓸 수 있다.

### Cited Findings
- 피치 반복(식 2): Pb^(i+1)(t) = Pb^(i)(t) + (F0_org(t) − F0_syn^(i)(t)). 매 반복에서 PIT/PBS를 다시 구하되, PBS(벤드 감도)는 해상도를 위해 PIT가 표현 가능한 한 최소화한다 — [SMC 2009](https://staff.aist.go.jp/m.goto/PAPER/SMC2009nakano.pdf)
- 다이내믹스 반복(식 3): Db^(i+1)(t) = Db^(i)(t) + (α·Pow_org(t) − Pow_syn^(i)(t)). α는 DYN=64 렌더 파워와의 제곱오차를 최소화해 정한다. DYN↔실제 파워 관계는 DYN=0,32,64,96,127 다섯 번의 렌더로 사전 측정하고 그 사이를 선형보간한다. 목표 파워가 DYN=127 렌더 상한을 넘으면 완전 재현이 불가능하다 — [SMC 2009](https://staff.aist.go.jp/m.goto/PAPER/SMC2009nakano.pdf)
- 평가지표: err_f0 = (1/T_f)Σ|F0_org−F0_syn|(유성 프레임, 반음 단위), err_pow = (1/T_p)Σ|20log(αPow_org) − 20log(Pow_syn)|(dB) — [SMC 2009](https://staff.aist.go.jp/m.goto/PAPER/SMC2009nakano.pdf)
- 표 4(곡 No.07, RWC 대중음악 DB, 여성 가수):

  | 파라미터 | 조건 | 기존(직접매핑) | ×0 | ×1 | ×2 | ×3 | ×4 |
  |---|---|---|---|---|---|---|---|
  | Pitch [반음] | CV01(미쿠) | 0.217 | 0.386 | 0.091 | 0.058 | 0.042 | 0.034 |
  | Pitch [반음] | CV02(린) | 0.198 | 0.352 | 0.074 | 0.041 | 0.029 | 0.024 |
  | Dynamics [dB] | CV01 | 13.65 | 11.22 | 4.128 | 3.617 | 3.472 | 3.414 |
  | Dynamics [dB] | CV02 | 14.17 | 15.26 | 6.944 | 6.382 | 6.245 | 6.171 |

  오차는 반복마다 단조 감소했고, ×4가 가장 유사하다는 청취 소견도 있다. 다른 곡(No.16/54/55)도 유사하게 개선되었다(표 5) — [SMC 2009](https://staff.aist.go.jp/m.goto/PAPER/SMC2009nakano.pdf)
- 실험 A(가사 정렬): 166노트 중 경계 오류 8개(No.07), 128노트 중 3개(No.16). 상위 3개 후보 선택만으로 모두 수정되었다(수정 3회 이내) — [SMC 2009](https://staff.aist.go.jp/m.goto/PAPER/SMC2009nakano.pdf)
- 재추정 검증: CV01로 합성한 노래를 목표로 삼았을 때 추정 파라미터가 원래 파라미터와 거의 같았다. 따라서 «다른 보이스뱅크로 갈아타기» 용도로도 쓸 수 있다 — [SMC 2009](https://staff.aist.go.jp/m.goto/PAPER/SMC2009nakano.pdf)
- 파라미터는 10 ms마다 추정하고, 1 ms로 선형 보간해 VSTi로 공급한다 — [SMC 2009](https://staff.aist.go.jp/m.goto/PAPER/SMC2009nakano.pdf)
- 반복 추정은 신스 조건(다른 신스와 가수 DB)이 바뀌어도 강건하고, 반복 후 평균오차는 기존 접근보다 훨씬 작다. 같은 루프는 특허(US8244546B2)로도 등록되어 있다(동적 파라미터를 수렴할 때까지 반복) — [ICASSP 2011](https://staff.aist.go.jp/m.goto/PAPER/ICASSP2011nakano.pdf), [US8244546B2](https://patents.google.com/patent/US8244546B2/en)
- 관련 신경망 계열: StyleSinger(레퍼런스에서 음색·감정·발음·조음 스타일을 zero-shot 전이)와 arXiv 2606.17126(라벨 없이 미지의 레퍼런스에서 f0·에너지 곡선의 피치 스타일과 비브라토를 전이). 둘 다 신스 파라미터를 추정하지 않는 «모델 내부» 방식이다 — [StyleSinger](https://arxiv.org/abs/2312.10741), [arXiv 2606.17126](https://arxiv.org/html/2606.17126v1)
- 2015년 만다린 HNM 시스템: 실제 노래를 MIDI·가사와 정렬해 타이밍 편차를 표현 파라미터로 저장한다 — [arXiv 1502.04300](https://arxiv.org/pdf/1502.04300)

### Inferences
- SynthV에 적용할 때의 루프: (0) 노트·가사 확정(Rigid, vibrato 0) → (1) CLI나 스크립트로 렌더 → (2) RMVPE f0와 RMS 측정 → (3) DTW 없이 같은 타임라인에서 프레임 차분 → (4) pitchDelta와 loudness에 차를 더함(감쇠계수 0.7~1.0으로 진동 방지) → (5) 3~4회 반복. VocaListener 수치로 보면 2회차에 이득의 대부분을 얻는다(0.386→0.058).
- SV2는 피치를 AI가 생성하므로, VOCALOID와 달리 pitchDelta를 바꾸면 «기저 곡선»이 다시 흔들릴 수 있다. 피치를 고정하려면 반드시 Rigid 사분면을 쓰고, 렌더 결정성(같은 입력→같은 출력)을 먼저 확인해야 한다.
- SV2 렌더 자동화는 사용자 메모리에 따라 «렌더는 사용자가 GUI에서» 하도록 되어 있고, 데스크톱 자동조작 금지 원칙도 있다. 따라서 루프의 렌더 단계는 사용자가 export한 wav를 받아 측정·보정 .svp를 다시 만드는 «반자동» 형태가 현실적이다(이 점은 운영 제약에서 나온 추론이다).
- 음색(VocaListener2식)은 SynthV에서 신호처리로 다룰 수 없다. 그래서 tension/breathiness/gender/Vocal Mode 가중치를 «작은 탐색 공간»으로 잡고, 렌더-측정 비교(MCD 등)로 고르는 방식이 대안이다.

### Gaps
- VocaListener 표 5(다른 곡들)의 개별 수치는 텍스트 추출 범위 밖이라 옮기지 못했다.
- SV2 Pro의 커맨드라인/헤드리스 렌더 지원 여부는 확인하지 못했다(2.1.0의 ARA는 DAW 연동 기능이다).
- 2020년대에 SynthV를 대상으로 한 analysis-by-synthesis 논문은 찾지 못했다.

## Q4. 객관 평가지표: 렌더가 레퍼런스에 얼마나 가까운가

### Takeaway
기본 세트는 다음과 같다: F0 RMSE(cent, 유성∩유성 프레임), V/UV 오류율, F0 상관, 온셋/길이 편차(ms, RMSE), 파워/라우드니스 평균 절대오차(dB)와 상관, MCD(dB, DTW 또는 동일 타임라인)와 BAP 왜곡. VocaListener식 «평균 절대 f0 오차(반음)와 파워 오차(dB)»는 SynthV 조교 루프의 수렴 지표로 바로 쓸 수 있다. 다만 지표는 지각 품질과 직결되지 않으므로 청취 확인을 함께 해야 한다.

### Cited Findings
- XiaoiceSing은 Dur RMSE, Dur CORR, F0 RMSE, F0 CORR, MCD, BAPD(band aperiodicity distortion), V/UV error를 함께 보고하고 MOS로 보완한다 — [XiaoiceSing arXiv 2006.06261](https://arxiv.org/pdf/2006.06261)
- F0 RMSE의 단위는 논문마다 다르다(Hz, log-Hz, cent). SingNet은 로그 f0를 cent 스케일로 RMSE한다. 비교할 때는 단위와 기준 곡선(자연 f0 vs 악보 f0)을 확인해야 한다 — [SingNet arXiv 2505.09325](https://arxiv.org/pdf/2505.09325), [DAR SVS arXiv 1906.08977](https://arxiv.org/pdf/1906.08977)
- RMSE는 이상치에 민감하다. DeepA는 F0 RMSE 28.0 Hz 대 중앙 절대차 4.0 Hz를 보고했는데, 큰 오차의 원인은 V/UV 판정이 반대인 프레임들이었다. 따라서 V/UV 오류와 f0 오차를 분리하고 중앙값도 함께 보고하는 것이 좋다 — [DeepA arXiv 2110.06434](https://arxiv.org/pdf/2110.06434)
- V/UV 오류 = V/UV 플래그가 불일치하는 프레임 비율 — [Singing-Tacotron arXiv 2202.07907](https://arxiv.org/pdf/2202.07907), [arXiv 2512.14653](https://arxiv.org/pdf/2512.14653)
- MCD: 멜켑스트럼을 추출해 DTW로 정렬하고 최적 정렬 비용을 쓴다. 정답 길이(ground-truth duration)를 쓴 논문의 수치와는 비교할 수 없다 — [arXiv 2204.11806](https://arxiv.org/pdf/2204.11806), [Singing-Tacotron](https://arxiv.org/pdf/2202.07907)
- 도구: VERSA 툴킷(arXiv 2512.14653에서 사용), Amphion + pymcd(SingNet에서 사용) — [arXiv 2512.14653](https://arxiv.org/pdf/2512.14653), [SingNet](https://arxiv.org/pdf/2505.09325)
- VocaListener 지표: 유성 프레임 평균 절대 f0 오차(반음), 비영(非零) 파워 프레임 평균 절대 dB 오차(전역 레벨 α 정규화 후) — [SMC 2009](https://staff.aist.go.jp/m.goto/PAPER/SMC2009nakano.pdf)
- VocaListener2 음색 평가: 음색 공간에서 추정 결과와 정답 사이의 유클리드 거리(closed/open 조건) — [ICASSP 2011](https://staff.aist.go.jp/m.goto/PAPER/ICASSP2011nakano.pdf)
- 비브라토 평가 예: FDM은 rate 정확도 >92.5%, extent 정확도 ~85% — [Yang PhD](https://qmro.qmul.ac.uk/xmlui/bitstream/123456789/24857/1/YANG_Luwei_Final_PhD_210417.pdf)

### Inferences (권장 측정 세트, 루프 수렴 판정용)
- 피치: 공통 유성 프레임에서 cent MAE/RMSE와 중앙값, 1옥타브 오류 비율을 따로 센다. VocaListener 4회 반복 수준(≈2.4–3.4 cent MAE)이 «거의 완전 모사»의 기준점이다.
- 유성 판정: V/UV 오류율(분리 잡음과 리버브 꼬리 때문에 레퍼런스 쪽에 히스테리시스를 둔다).
- 타이밍: 강제 정렬로 구한 음소/노트 온셋 차이(ms)의 평균과 95퍼센타일.
- 다이내믹스: α 정규화 후 RMS dB MAE와 피어슨 상관. 또는 LUFS 단기 곡선 비교.
- 음색: MCD(동일 타임라인이므로 DTW 생략 가능), 비주기 성분 dB 차(breathiness), 하모닉비 logit 차(tension).
- 비브라토: 구간별 rate(Hz)·extent(cent) 차.
- Suno 레퍼런스는 분리 잔여물이 섞인 «오염된 정답»이다. 따라서 지표 하한이 0이 아님을 감안하고, 최종 판단은 청취로 한다.

### Gaps
- SynthV 렌더와 사람 레퍼런스 간 지표값과 MOS의 상관을 보고한 연구는 찾지 못했다.
- 지각 가중 피치 오차(예: 노트 정상부와 전이부 가중 분리)에 대한 표준 지표는 이번 조사에서 확인하지 못했다.
