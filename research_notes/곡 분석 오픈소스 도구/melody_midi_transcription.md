# 멜로디·피치 추출 및 오디오→MIDI 채보 오픈소스 도구 (2026-10 기준)

> 조사일 2026-10-09. 웹 검색·원문 fetch 16회 기준. 출처 없는 내용은 «추론» 또는 «공백»에 따로 적었다.
> 목적: 레퍼런스 곡의 보컬 멜로디를 Synthesizer V / Vocaloid / UTAU에서 다시 만들기.

## 1. 피치 트래커 (F0 곡선): CREPE, torchcrepe, RMVPE, FCPE, PESTO, SwiftF0, pYIN

### 요약
2025~2026 독립 벤치마크(pitch-benchmark)에서는 **SwiftF0와 RMVPE가 공동 1위권**(두 점수 차이는 통계적으로 갈리지 않음)이고 그 다음이 FCPE다. CREPE·torchcrepe·PESTO가 중위권, pYIN이 최하위다. 노래 보컬(특히 반주 섞인 소리)에는 RMVPE가 사실상 업계 표준이다. RMVPE는 ROSVOT·SOME 같은 보컬 채보기의 앞단으로 쓰인다. 다만 이 벤치마크의 말뭉치가 노래 전용인지는 확인하지 못했다.

### 출처 확인 내용
- **pitch-benchmark (lars76)**: pitch F1@50cent. 10개 말뭉치 × 8가지 열화 조건의 평균이며 깨끗한 원음은 제외했다.
  - SwiftF0 0.781 [95% CI 0.768–0.795], 179.6× 실시간 (CPU 1코어)
  - RMVPE 0.768 [0.752–0.783], 13.6×
  - FCPE 0.728, 27.8×
  - TorchCREPE 0.691, 0.4×
  - CREPE 0.689, 0.4×
  - PESTO 0.680, 20.0×
  - Praat 0.651, 525×
  - pYIN 0.506, 9.6×
  - 저장소 코드는 MIT, 데이터셋은 CC BY-NC-SA 4.0 (연구용 한정).
  - 원문: «SwiftF0 vs RMVPE 차이는 통계적으로 갈리지 않음».
  — [pitch-benchmark](https://github.com/lars76/pitch-benchmark)
- **SwiftF0 논문** (arXiv 2508.18440, 2025-08):
  - 파라미터 95,842개, CPU에서 CREPE보다 약 42배 빠름 (5초 오디오에 132.6ms, CREPE는 5508ms).
  - 정확도(HM): 깨끗한 원음 94.07, 10dB SNR 잡음 91.80. 같은 조건에서 CREPE 80.70 / 78.97, pYIN 85.27 / 79.99, PENN 89.23 / 59.87, BasicPitch 31.17 / 29.47.
  - 평가셋: Vocadito(노래), Bach10-mf0-synth, SpeechSynth.
  - 저자가 직접 만든 벤치마크라는 점에 유의.
  — [SwiftF0 arXiv](https://arxiv.org/html/2508.18440v1); 코드 [lars76/swift-f0](https://github.com/lars76/swift-f0); PyPI 패키지 [swift-f0](https://pypi.org/project/swift-f0/)
- **FCPE**: 코드 MIT, 공식 저장소 CNChTu/FCPE, PyPI `torchfcpe`.
  - 논문 수치: MIR-1K(노래 데이터셋) RPA 96.79%, RTX 4090에서 RTF 0.0062.
  - 2025-09 arXiv 2509.15140.
  - 가중치에는 별도 LICENSE-FCPE 파일이 붙어 배포되기도 한다.
  — [FCPE arXiv](https://arxiv.org/html/2509.15140v1); [depscope torchfcpe](https://mcp.depscope.dev/pkg/pypi/torchfcpe) (패키지 상태 점수 낮음); [HF RVC 번들](https://huggingface.co/licyk/rvc-model)
- **RMVPE**:
  - ROSVOT은 F0를 사전학습 RMVPE(Wei et al., 2023)로 뽑아 256단계로 양자화한다. — [ROSVOT 논문](https://arxiv.org/html/2405.09940v2)
  - SOME은 선택 사항으로 RMVPE 사전학습 모델을 넣으면 피치 추출이 좋아진다고 안내한다. — [openvpi/SOME](https://github.com/openvpi/SOME)

### 추론
- 반주가 섞인 곡에서 보컬 F0를 뽑는다면 «음원 분리 → RMVPE (또는 FCPE)» 조합이 가장 무난하다. RMVPE가 원래 반주 섞인 보컬용으로 설계됐고, RVC·DiffSinger 생태계 표준이기 때문이다.
- SwiftF0는 CPU 경량·잡음 강인성이 강점이다. RTX 4070 Ti 12GB에서는 위 도구 전부 VRAM 부담이 사실상 없다. 모두 모델이 작다(SwiftF0 약 96k 파라미터).
- CREPE·torchcrepe는 정확도 대비 속도가 크게 떨어진다(0.4× 실시간, CPU 기준). 2026년 기준으로는 RMVPE·SwiftF0·FCPE에 밀린 «구세대»로 보는 것이 타당하다.
- pYIN(librosa 내장)은 설치가 쉽지만 열화 조건에서 최하위다(0.506). 빠른 시제품용으로만 권한다.

### 공백
- RMVPE 원 저장소의 라이선스와 최근 업데이트 일자를 확인하지 못했다.
- CREPE(MIT로 알려짐), PESTO의 라이선스·활동성은 이번 조사에서 출처를 확보하지 못했다.
- pitch-benchmark의 10개 말뭉치 중 노래 데이터 비중을 확인하지 못했다. 노래 보컬에 한정한 순위는 따로 검증이 필요하다.

---

## 2. 노트 단위 보컬 채보: Basic Pitch, ROSVOT, VOCANO, SOME/GAME, MusicYOLO 등

### 요약
노래 보컬 → MIDI 노트에서 2026년 오픈소스 최선 후보는 둘이다.
1. **openvpi GAME**: SOME의 후속작, MIT. 반주·리버브가 섞인 보컬에도 강인하고, 다국어를 지원하며, 실수(소수) 피치를 출력한다.
2. **ROSVOT**: ACL 2024, 논문상 최고 성능. COnPOff F1 77.4.

Basic Pitch는 범용 다성 채보기라 보컬 F0 정확도가 낮다. VOCANO, MusicYOLO, TONY는 ROSVOT 논문 기준으로 이미 뒤처졌다.

### 출처 확인 내용
- **ROSVOT** (ACL 2024, arXiv 2405.09940, 저장소 RickyL-2000/ROSVOT)
  - F1(%) 표기는 COn / COnP / COnPOff 순서.
  - 깨끗한 입력 (M4Singer 등 합본 테스트셋):

    | 방법 | COn | COnP | COnPOff |
    |---|---|---|---|
    | TONY | 67.5 | 45.7 | 43.9 |
    | VOCANO | 75.8 | 58.0 | 50.2 |
    | MusicYOLO | 82.2 | 67.2 | 58.9 |
    | Yong et al. 2023 | 92.0 | 72.7 | 65.8 |
    | **ROSVOT** | **94.0** | **80.3** | **77.4** |

  - 잡음 입력에서는 ROSVOT 93.8 / 83.8 / 77.0.
  - 도메인 밖 MIR-ST500 (M4Singer로만 학습): ROSVOT 72.1 / 65.9 / 47.4. 비교 대상 Gu et al. 2023은 78.1 / 70.0 / 52.8로, 이 셋에서는 ROSVOT이 진다.
  - 도메인 밖 TONAS: ROSVOT 55.7 / 49.4 / 30.0.
  - 피치 앞단은 RMVPE.
  - 데이터셋 라이선스는 CC BY-NC-SA 4.0.
  — [ROSVOT arXiv](https://arxiv.org/html/2405.09940v2)
- **SOME** (openvpi, Singing-Oriented MIDI Extractor)
  - 라이선스: MIT.
  - 속도: i5-12400 CPU에서 약 9× 실시간, 3080Ti GPU에서 약 300×.
  - 실수(소수) MIDI 피치를 출력해 DiffSinger 분산 라벨링에 적합하다.
  - 학습 데이터 약 3시간으로 커스텀 학습이 가능하다.
  - 인터페이스: CLI(`infer.py`), Gradio webui, DiffSinger `transcriptions.csv` 일괄 처리(note_seq·note_dur 기입).
  - 요구 사항: Python 3.8 이상, PyTorch 2.1 이상, Dockerfile 제공.
  - README에 «베타, 하위 호환 보장 없음»이라고 적혀 있다.
  - 현재 README 상단에 «차세대 MIDI 추출기 GAME 공개» 공지가 있다. 즉 **SOME은 GAME으로 대체됨(구버전)**.
  — [openvpi/SOME](https://github.com/openvpi/SOME)
  - 중국어 데이터로만 학습돼 다른 언어에서는 성능이 떨어질 수 있다는 서드파티 데모 페이지의 언급이 있다. — [MVSEP 알고리즘 목록](https://de.mvsep.com/en/algorithms?page=3)
  - 포럼 사용자의 일화성 평가로 «수정은 최대 10% 정도»라는 말이 있다(벤치마크 아님). — [VI-Control 포럼](https://vi-control.net/community/threads/what-is-the-best-most-accurate-program-that-can-convert-audio-into-midi.134036/page-3)
- **GAME** (openvpi, Generative Adaptive MIDI Extractor)
  - 라이선스: MIT.
  - 방식: D3PM(이산 확산)으로 노트 경계를 생성한다. 품질과 속도를 트레이드오프로 조절할 수 있다.
  - 이미 아는 경계(가사 단어 경계)에 노트·피치를 맞추는 적응형 정렬을 지원한다.
  - 노이즈·리버브·반주가 섞인 분리 보컬에도 강인하다고 명시돼 있다.
  - 다국어: 언어를 선택하며, 비슷한 언어로 대체해도 된다.
  - 출력: `mid` / `txt` / `csv`. 데이터셋 정렬 모드에서는 note_seq·note_dur·note_slur를 기입한다.
  - ONNX 내보내기(opset 17 이상)와 CacheDiT 가속 문서가 있다.
  - 테스트 환경: Python 3.12, PyTorch 2.8, CUDA 12.9.
  - 기본 모델 약 50M 파라미터. **학습 시** GPU 메모리 약 20GB.
  — [openvpi/GAME](https://github.com/openvpi/GAME)
  - 메트릭 사이트 기준 데이터 시점은 2026-05-25이고 MIT다. — [oosmetrics GAME](https://oosmetrics.com/repo/openvpi/GAME)
- **Basic Pitch** (Spotify)
  - 라이선스: Apache-2.0.
  - PyPI 최신 안정판은 0.4.0이며, 크롤 시점 기준 «2년 전» 배포다. TS 포트의 마지막 push는 2023-05. 2025~2026 릴리스는 확인되지 않아 **활동 정체**로 보인다.
  — [Cloudsmith basic-pitch](https://cloudsmith.com/navigator/pypi/basic-pitch); [basic-pitch-ts](https://awesome.ecosyste.ms/projects/github.com%2Fspotify%2Fbasic-pitch-ts)
  - SwiftF0 벤치마크에서 단선율 F0 정확도 HM 31.17(깨끗한 원음)로 최하위였다. 노트 채보기를 F0 추정에 쓴 비교라는 점을 감안해야 한다. — [SwiftF0 arXiv](https://arxiv.org/html/2508.18440v1)
  - Slakh2100 Fno 0.43 (YourMT3+ 0.8456 대비). — [HyperAI Slakh 리더보드](https://hyper.ai/de/sota/tasks/music-transcription/benchmark/music-transcription-on-slakh2100)

### 추론
- 신스 보컬 재현 목적의 추천 파이프라인:
  1. 음원 분리로 보컬 stem 확보.
  2. GAME(또는 ROSVOT)으로 노트 MIDI 생성.
  3. RMVPE로 F0 곡선 추출.
  4. 신스 프로젝트에서 노트 위에 피치 편차(pitch deviation)를 입힌다.
- GAME은 SOME 공식 후속이고 다국어·반주 잔여에 강인하므로, 일본어·한국어 보컬에는 SOME보다 GAME이 우선이다.
- 추론만 한다면 50M 모델은 12GB GPU(RTX 4070 Ti)에서 충분할 것으로 본다. 20GB는 학습 기준 수치다.
- ROSVOT은 M4Singer(중국어) 중심으로 학습됐다. MIR-ST500(팝)에서 COnPOff 47.4라는 점에서, 실제 팝 음원에서는 노트 경계와 오프셋을 상당 부분 손봐야 한다고 예상된다.

### 공백
- VOCANO, MusicYOLO 저장소의 현재 활동성·라이선스를 확인하지 못했다. 다만 ROSVOT 표에서 이미 하위권이다.
- GAME 대 SOME 대 ROSVOT을 같은 셋에서 비교한 정량 벤치마크는 찾지 못했다. GAME README에는 수치가 없다.
- GAME의 정확한 첫 공개 일자를 확인하지 못했다(2025~2026 추정).
- 오픈소스 Melodyne 대체품(노트 블롭 편집 GUI)은 이번 조사에서 확정 출처를 얻지 못했다.

---

## 3. 다중 악기 채보: MT3, MR-MT3, YourMT3+, MuScriptor, Omnizart, 피아노·드럼·베이스·기타

### 요약
2024~2025의 오픈 SOTA는 **YourMT3+**(Slakh Fno 0.8456)였다. 2025 AMT Challenge 우승작(MIROS)도 YourMT3+ 프레임워크를 확장한 것이다. 2026-07에는 **MuScriptor**(Kyutai/IRCAM 계열 저자, ISMIR 2026, open-weight, 60M~1.3B)가 공개됐고, 실제 녹음 벤치마크에서 YourMT3+를 크게 앞선다고 보고했다. 드럼은 ADTOF가 대표 도구지만 CC BY-NC-SA라 비상업용이다.

### 출처 확인 내용
- **YourMT3+** (arXiv 2407.04822, 저장소 mimbres/YourMT3)
  - 최종 모델 YPTF.MoE+Multi가 Slakh에서 MT3·PerceiverTF를 능가했다. 11개 악기 클래스에서 우세했고, synth-pad만 PerceiverTF보다 약간 뒤졌다.
  - Multi F1은 program·onset·offset이 모두 맞아야 정답으로 치는 엄격한 정의다.
  — [YourMT3+ arXiv](https://arxiv.org/pdf/2407.04822)
  - Slakh2100 Fno 리더보드: YourMT3+ 0.8456, PerceiverTF 0.819, MT3(colab) 0.752, Jointist 0.6, MT3(원 논문) 0.57, Basic Pitch 0.43. MT3 수치는 재실행 여부에 따라 다르다. — [HyperAI](https://hyper.ai/de/sota/tasks/music-transcription/benchmark/music-transcription-on-slakh2100)
- **2025 AMT Challenge** (NeurIPS 2025 AI for Music 워크숍, arXiv 2603.27528)
  - 21팀 등록, 14팀 제출, 유효 제출 8팀 중 **MT3 베이스라인을 넘은 팀은 2팀뿐**이었다.
  - 우승 MIROS: YourMT3+ 구조에 MusicFM 인코더와 악기 그룹별 병렬 T5 디코더를 얹었다. 약 370M 파라미터, Slakh2100 multi F 0.83(대회 외 측정, 지표 설정이 달라 0.8456과 직접 비교 불가).
  - 남은 과제로 다성음과 음색 변이 처리가 지목됐다.
  — [AMT Challenge arXiv](https://arxiv.org/html/2603.27528v1); [NeurIPS 페이지](https://neurips.cc/virtual/2025/123792)
- **MuScriptor** (arXiv 2607.08168, v1 2026-07-09, v2 2026-08-03, ISMIR 2026)
  - 저자: Rouard, Krause, Roebel, Simon-Gabriel, Défossez.
  - 구조: decoder-only Transformer. 입력은 5초 멜 스펙트로그램(16kHz, 512 mel)이고, 출력은 MT3식 MIDI 토큰이다. 악기 지정 조건과 CFG(α=2)를 쓴다.
  - 학습: 합성 데이터 사전학습 → 실녹음 미세조정 → RL 후학습.
  - 크기: 60M / 100M / 300M / 1.3B.
  - 전체 테스트셋 F1 (1.3B, RL, α=1) vs YourMT3+:

    | 지표 | YourMT3+ | MuScriptor |
    |---|---|---|
    | Onset | 32.52 | 60.4 |
    | Frame | 45.54 | 73.3 |
    | Offset | 17.79 | 49.0 |
    | Drums | 41.4 | 50.2 |
    | Multi | 21.9 | 48.2 |

  - 평가셋: Bach10, Dagstuhl ChoirSet, PHENICX, RWC 등 실녹음 위주. Slakh·MAESTRO 수치는 없다. RWC-C·RWC-R의 Multi F1은 YourMT3+가 우세하다.
  - 보컬은 악기 그룹 중 하나로만 다룬다. Dagstuhl ChoirSet frame F1 80.7.
  - 코드·가중치는 github.com/muscriptor/muscriptor에 공개한다고 명시돼 있다. **가중치 라이선스는 미확인**.
  — [MuScriptor arXiv](https://arxiv.org/html/2607.08168v2)
- **ADTOF** (드럼): 저장소 MZehren/ADTOF는 **CC BY-NC-SA 4.0**(비상업)이다. PyTorch 포트 ADTOF-pytorch는 F-measure가 약 0.2% 낮다. — [ADTOF GitHub](https://github.com/MZehren/ADTOF)

### 추론
- 반주 편곡까지 MIDI로 뽑으려면 2026-10 현재 1순위는 MuScriptor다(라이선스 확인 후). 대안은 YourMT3+다(HF Space·Colab 데모가 있다고 알려짐, 이번 조사에서는 미확인).
- 1.3B 모델 추론이 12GB VRAM에 들어가는지는 확인하지 못했다. fp16이면 가중치만 약 2.6GB라 가능성은 높아 보인다.
- 다중 악기 채보는 실녹음에서 Multi F1이 20~50% 수준이다. 반주를 «정확히» 복원하기보다 코드·베이스 라인 초안용으로 보는 것이 현실적이다.
- 대회 결과처럼 유효 제출 8팀 중 2팀만 MT3를 넘었다는 점은, 일반 팝 음원 채보가 여전히 미해결 과제임을 보여 준다.

### 공백
- MT3 원본(Google), MR-MT3, Omnizart, ByteDance piano_transcription, Onsets and Frames, hFT-Transformer의 2026 기준 활동성·라이선스는 이번 도구 호출 한도 안에서 출처를 확보하지 못했다.
  - 사전 지식으로는 MT3 Apache-2.0, Omnizart MIT(장기간 업데이트 정체), ByteDance piano_transcription Apache/MIT 계열, hFT-Transformer(Sony) MAESTRO SOTA급으로 알려져 있으나 **미검증**.
- 베이스·기타 전용 채보기는 조사하지 못했다.
- MuScriptor 가중치 라이선스와 Windows 설치성을 확인하지 못했다.

---

## 4. 추출 결과 → Synthesizer V / UTAU / Vocaloid 프로젝트 변환 워크플로

### 요약
오디오에서 바로 .svp를 만드는 오픈소스 전용 도구는 찾지 못했다. 현실적인 경로는 둘이다.

- **A. Synthesizer V 내장 기능**: 오디오 트랙에서 «Extract Notes from Audio»(노트 감도, 반음 반올림, 피치 곡선 전사 옵션)를 쓴다.
- **B. 오픈소스 조합**: GAME/SOME으로 MIDI를 만든 뒤 **UtaFormatix3**(Apache-2.0, 웹앱)로 svp / ust / ustx / vpr / vsqx로 변환한다. 피치 곡선 변환도 지원한다.

### 출처 확인 내용
- **UtaFormatix3** (sdercolin/utaformatix3)
  - 라이선스: Apache-2.0.
  - Kotlin/JS + React 웹앱이며 호스팅판이 sdercolin.github.io/utaformatix3 에 있다.
  - 가져오기: svp, ust, vsqx(3/4), vpr, ustx, MIDI(VOCALOID·표준).
  - 내보내기: 같은 형식들. 단 vsqx는 v4만 내보낸다.
  - **피치 곡선**: USTX·UST·SVP는 가져오기와 내보내기 모두 지원한다. VSQ/VSQX/VPR/MID(V1)는 가져오기만 지원한다.
  - DiffSinger `.ds`는 언급이 없다.
  - 커밋 772회, 2026 저작권 표기.
  — [UtaFormatix3](https://github.com/sdercolin/utaformatix3)
- **Synthesizer V 내장 «Extract Notes from Audio»**: WAV 임포트 후 오디오 트랙에서 실행한다. 노트 감지 민감도, 반음 반올림, 피치 곡선을 노트에 옮기는 설정이 있다. — [VI-Control 포럼](https://vi-control.net/community/threads/dreamtonics-is-ai-but-not-generative.164761/page-2)
- **utaformatix-ts**: 보컬 신스 프로젝트 파일 범용 파서로, UTAU.js의 SVP 임포터 기반이다. 오디오가 아니라 프로젝트 파일끼리 변환하는 도구다. 현재 상태는 미확인. — [Hack Club devlog](https://stardance.hackclub.com/projects/17830/devlogs/7255)
- **SV-MCP**: AI 클라이언트가 스크립트 핸들러로 Synthesizer V를 조작하는 MCP 서버다. 오디오 임포트 기능은 없다. — [glama SV-MCP](https://glama.ai/mcp/servers/hhybertbhr)
- **SOME / GAME 출력**: 표준 MIDI와 DiffSinger 데이터셋 CSV(note_seq / note_dur / note_slur)다. GAME은 txt·csv도 출력한다. — [SOME](https://github.com/openvpi/SOME); [GAME](https://github.com/openvpi/GAME)

### 추론
- 노트에 더해 피치 곡선까지 재현하는 경로:
  1. RMVPE F0(Hz 시계열)와 GAME 노트를 얻는다.
  2. 노트 피치 대비 센트 편차를 계산한다.
  3. .svp JSON의 `pitchDelta` 파라미터 포인트로 직접 기록하는 자작 스크립트를 쓴다. 사용자 환경에는 이미 `D:\park\synthv\tools\make_svp.py`가 있다.
  4. 또는 UST/USTX 피치 곡선으로 만든 뒤 UtaFormatix로 svp에 넣는다.
- OpenUtau(ustx)를 중간 허브로 쓰면 UtaFormatix 피치 변환 경로를 탈 수 있다(가져오기·내보내기 모두 지원).
- Vocaloid(vpr) 쪽은 UtaFormatix가 피치를 «가져오기만» 하므로, 오디오→Vocaloid 피치 곡선 경로는 별도 수작업이나 스크립트가 필요할 것으로 보인다.

### 공백
- 오디오 F0를 svp `pitchDelta`로 바로 쓰는 공개 GitHub 스크립트는 검색으로 확인하지 못했다.
- Synthesizer V 2의 «Extract Notes from Audio»(Pitch Transfer 계열) 공식 문서 기준 상세와 정확도는 1차 출처를 확보하지 못했다(포럼 2차 출처만 있음).
- OpenUtau 내장 오디오→노트 기능, VOCALOID6 VOCALO CHANGER 등은 조사하지 못했다.
