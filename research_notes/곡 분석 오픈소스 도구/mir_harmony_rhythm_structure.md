# 오픈소스 MIR 도구: 화성·리듬·구조·악기·가사 (2026-10 기준 조사)

> 조사일 2026-10-09. 웹 조회 약 15회. 출처 없는 사전지식은 "Inferences"나 "Gaps"에만 두고, 그 사실을 표시했다.

## 1. 범용 툴킷 (librosa, Essentia, madmom, All-In-One, beat_this, BeatNet, Sonic Visualiser/Vamp)

### Takeaway
한 번에 비트·다운비트·BPM·구간 라벨(intro/verse/chorus/bridge/outro)을 뽑는 도구로는 **All-In-One(allin1, MIT)**이 가장 가깝다. 다만 Windows에서는 NATTEN을 소스 빌드해야 하고 madmom에도 의존한다. 비트·다운비트만 필요하면 **beat_this(CPJKU, ISMIR 2024, MIT)**가 순수 PyTorch라 설치가 가장 쉽다. **madmom**은 사실상 정지 상태(PyPI 마지막 릴리스 0.16.1, 2018)여서 최신 Python과 NumPy에서 설치 문제가 생긴다.

### Cited Findings
**All-In-One (mir-aidj/all-in-one, `pip install allin1`)**
- 출력은 BPM, beats, downbeats(마디 안 박 위치 1–4 포함), 기능 구간 경계와 라벨(intro/verse/chorus/bridge/outro 등)이다. JSON 또는 `AnalysisResult`로 받고, 선택적으로 100 FPS activation과 embedding도 나온다 — [GitHub mir-aidj/all-in-one](https://github.com/mir-aidj/all-in-one)
- 라이선스는 MIT다. 설치 요건은 PyTorch 별도 설치, NATTEN(Linux는 휠 제공, macOS는 자동 설치, **Windows는 소스 빌드 필요**), GitHub판 madmom, 선택 FFmpeg다 — [GitHub](https://github.com/mir-aidj/all-in-one)
- 내부에서 Demucs로 bass/drums/other/vocals 4 stem을 분리한 뒤 분석한다. `-k` 옵션을 주면 분리 결과를 보존한다 — [GitHub](https://github.com/mir-aidj/all-in-one)
- 성능: RTX 4090 + i9-10940X에서 `harmonix-all` 모델로 10곡(33분)을 73초에 처리했다. MP3 디코딩이 타이밍을 20–40 ms 밀 수 있어 WAV 입력을 권장한다 — [GitHub](https://github.com/mir-aidj/all-in-one)
- 저장소 통계는 커밋 38, 이슈 15, 별 855다. 릴리스 섹션은 비어 있다 — [GitHub](https://github.com/mir-aidj/all-in-one)
- 논문(Kim & Nam, WASPAA 2023, arXiv 2307.16425)은 비트·다운비트·구조 분할·라벨링을 하나의 모델로 함께 학습한다. 장거리 의존성은 dilated neighborhood attention이, 국소 의존성은 non-dilated attention이 맡는다. 입력은 source-separated spectrogram이다. Harmonix Set에서 네 과제 모두 SOTA이고 파라미터 수도 더 적다고 주장한다. 초록에는 구체 수치가 없다 — [arXiv 2307.16425](https://arxiv.org/abs/2307.16425)

**beat_this (CPJKU, "Beat This!", ISMIR 2024)**
- 비트와 다운비트를 추정하며 CLI와 Python API를 둘 다 제공한다. 기본값은 `dbn=False`이고, `--dbn`을 켤 때만 madmom이 필요하다 — [GitHub CPJKU/beat_this](https://github.com/CPJKU/beat_this)
- 설치는 PyTorch 2.0 이상과 `pip install tqdm einops soxr rotary-embedding-torch beat-this`로 끝난다. WAV 외 포맷에는 ffmpeg가 필요하다. GPU를 기본으로 쓰고 CPU로 폴백하며 `--float16`을 지원한다 — [GitHub](https://github.com/CPJKU/beat_this)
- 코드와 가중치 모두 MIT다(단 학습 데이터 일부는 저작권물이거나 제한적 CC). 기본 체크포인트 `final0`은 약 78 MB, 소형 모델은 약 8.1 MB다. 저장소 통계는 별 412, 커밋 245다 — [GitHub](https://github.com/CPJKU/beat_this)
- 논문은 DBN 후처리 없이 F1에서 SOTA를 넘었다고 주장한다. 반면 continuity metric은 더 낮고, 어렵거나 학습 데이터에 적은 장르에서는 여전히 실패한다고 스스로 밝힌다. 학습 데이터에는 솔로 악기, 박자 변화 곡, 템포 변화가 큰 클래식이 들어 있다 — [arXiv 2407.21658](https://arxiv.org/abs/2407.21658)

**madmom (CPJKU)**
- 코드는 BSD지만 **모델과 데이터 파일은 CC BY-NC-SA 4.0**이라 상업 이용은 Widmer 교수와 협의해야 한다. 모델이 git submodule이라 `git clone --recursive`가 필요하다. README의 Python 요구사항은 "2.7 또는 3.5+"로만 적혀 있고 3.12나 NumPy 2 언급은 없다 — [GitHub CPJKU/madmom](https://github.com/CPJKU/madmom)
- PyPI 릴리스는 0.16.1(2018-11-14)에서 멈춰 있다. piwheels 기준으로 2025-09에도 같다. 0.17은 dev 브랜치에만 있다 — [piwheels madmom](https://www.piwheels.org/project/madmom)
- "madmom < 0.17은 Python 3.10에서 에러"가 난다. 그래서 서드파티 패키지들은 특정 git 커밋에서 설치한다 — [PyPI nendo-plugin-loopify](https://pypi.org/project/nendo-plugin-loopify/0.1.0)
- 이슈 트래커에 NumPy 바이너리 비호환 에러("numpy.ndarray size changed … binary incompatibility")가 보고됐다 — [madmom issue mirror #527](https://git.tdem.in/CPJKU/madmom/issues/527)
- 대안으로 ONNX 포팅본 `madmom-onnx`가 PyPI에 있다 — [PyPI madmom-onnx](https://pypi.org/project/madmom-onnx/)
- 참고 논문 목록에 키 분류 CNN(ISMIR 2018), Deep Chroma 코드 인식(ISMIR 2016), 완전 합성곱 코드 인식(MLSP 2016)이 있다 — [GitHub](https://github.com/CPJKU/madmom)

**Essentia (MTG/UPF)**
- 사전학습 모델 카탈로그의 범주는 다음과 같다.
  - 장르: Discogs400/519, MTG-Jamendo genre 87
  - 무드: approachability, engagement, arousal/valence, danceability, aggressive/happy/party/relaxed/sad, MIREX 5 클러스터, MTG-Jamendo mood/theme 56
  - 악기: MTG-Jamendo instrument, loop instrument role, acoustic/electronic, **voice/instrumental, voice gender**, timbre, NSynth 4종
  - 기타: tonal/atonal, top50tags, MagnaTagATune, MSD
  - embedding: Discogs-EffNet, MAEST, OpenL3, VGGish, MSD-MusiCNN
  - 출처: [Essentia models](https://essentia.upf.edu/models.html)
- **TempoCNN**은 30–286 BPM을 256 클래스로 분류한다. 입력은 11,025 Hz이고 variant는 deepsquare-k16, deeptemp-k4, deeptemp-k16이다. 페이지에는 정확도 수치가 없다 — [Essentia models](https://essentia.upf.edu/models.html)
- 모델 페이지에 **키·코드 모델은 없다**(tonal/atonal만 있음). CREPE 피치 모델(360 bin, 20 cent)과 Spleeter 2/4/5 stem 분리 모델은 있다 — [Essentia models](https://essentia.upf.edu/models.html)
- MTG가 만든 모델은 모두 **CC BY-NC-SA 4.0**이고, 상용 라이선스는 별도 문의다 — [Essentia models](https://essentia.upf.edu/models.html)
- Essentia의 신호처리식 키 추정(EDMKey 4 프로파일, Gómez 기반 Basic)은 Freesound Loop Dataset 논문에서 벤치마크됐다. 같은 논문에서 madmom 템포 3종(COMB/ACF/DBN)도 비교했다 — [arXiv 2008.11507](https://arxiv.org/pdf/2008.11507)

### Inferences
- RTX 4070 Ti 12GB에서는 allin1(Demucs 포함)과 beat_this 모두 VRAM 여유가 충분할 것이다. 4090 수치로 미루어 곡당 수 초~10여 초로 추정한다. 실측은 없다.
- Windows에서 allin1을 쓰려면 NATTEN 소스 빌드(CUDA toolkit과 MSVC 필요)가 가장 큰 장애물이다. 따라서 WSL2(Linux 휠)가 현실적인 경로로 보인다.
- madmom은 Python 3.10 이상에서 PyPI판 대신 GitHub main을 `--no-build-isolation`으로 빌드하고 `numpy<2`로 고정하는 것이 일반적인 우회법이다. 일반 지식이며, 1차 출처로 확인하지 못했다.

### Gaps
- librosa(ISC 라이선스, beat_track/chroma 등)와 BeatNet(실시간 비트·다운비트)은 이번 조사 범위에서 1차 출처를 조회하지 못했다.
- Sonic Visualiser·Vamp(Chordino, QM plugins)의 현재 유지 상태와 Windows 빌드 상태를 확인하지 못했다.
- "Spotify-like features"(danceability/energy/valence)의 대응물로는 Essentia의 danceability·arousal/valence 모델이 확인됐다. 1:1 대체 도구는 조사하지 못했다.
- allin1·beat_this의 구체 F-measure 수치(논문 표)를 추출하지 못했다.

## 2. 코드 인식 (Chordino, BTC, ChordFormer, autochord, 2025–26 모델)

### Takeaway
실사용 가능한 대어휘(7th 등 포함) 오픈 가중치로는 여전히 **BTC(ISMIR 2019, MIT, 170 코드)**가 사실상 표준이다. ChordFormer(2025)와 의사라벨·증류(2026)는 논문 위주이고, 공개 가중치는 확인하지 못했다. autochord는 maj/min 24개+N만 지원하고 정확도 67%로 낮다.

### Cited Findings
- BTC는 CQT 입력 Bi-directional Transformer다. `--voca`로 maj/min 또는 대어휘를 고르고 `.lab`과 MIDI를 출력한다. 라이선스는 MIT이고 의존성은 PyTorch, librosa, pyrubberband, mir_eval, pretty_midi다. 학습 데이터는 Isophonics, Robbie Williams, UsPop2002다 — [GitHub jayg996/BTC-ISMIR19](https://github.com/jayg996/BTC-ISMIR19)
- 비공식 HF 패키징 `puar-playground/btc-chord`가 있다. 원본 가중치 그대로이고 대어휘 170 코드가 기본이며, `trust_remote_code`로 로드한다 — [HF btc-chord](https://huggingface.co/puar-playground/btc-chord)(검색 스니펫 기준)
- ChordFormer(arXiv 2502.11840, 2025-02)는 Conformer 기반이다. 재가중 손실과 구조화된 코드 표현으로 롱테일을 다루며, 대어휘에서 frame-wise +2%, class-wise +6%를 개선했다고 주장한다(저자 초록 기준) — [arXiv 2502.11840](https://arxiv.org/abs/2502.11840)
- DAFx-2026 논문(arXiv 2602.19778)은 BTC를 teacher로 써서 1,000시간 이상의 무라벨 음원에 의사라벨을 달고 student를 학습한 뒤 KD를 적용했다. 코드·가중치 공개는 확인하지 못했다 — [arXiv 2602.19778](https://arxiv.org/pdf/2602.19778)
- 2025-12 Edinburgh 보고서는 희귀 코드 성능이 낮고 pitch augmentation이 정확도를 올린다고 보고했다 — [arXiv 2512.22621](https://arxiv.org/abs/2512.22621v1)
- autochord는 NNLS-Chroma Vamp 특징 위에 Bi-LSTM-CRF(TensorFlow)를 올린 구조다. 25 클래스(maj/min 24+N)이고 테스트 정확도는 67.33%(Billboard 100곡)다. API는 `autochord.recognize('a.wav', lab_fn=...)`다 — [PyPI autochord](https://pypi.org/project/autochord); [ISMIR 2021 LBD](https://archives.ismir.net/ismir2021/latebreaking/000008.pdf)

### Inferences
- autochord가 NNLS-Chroma Vamp 플러그인에 의존하므로, Windows에서는 Vamp 플러그인 DLL 설치 문제가 생길 수 있다.
- 실무 파이프라인으로는 BTC(대어휘) + beat_this 비트 그리드에 코드 경계 스냅 + Essentia 키 추정이 합리적인 조합이다.

### Gaps
- Chordino의 정량 정확도(MIREX WCSR)와 BTC 논문의 WCSR 수치(일반적으로 maj/min 약 80%대, 대어휘 약 70%대 중반으로 알려짐)는 1차 출처로 확인하지 못했다.
- 2025–26년에 공개 가중치가 있는 새 SOTA 코드 모델은 찾지 못했다.

## 3. 키 추정 정확도, BPM 정확도, 반/배 템포 문제

### Takeaway
키와 BPM의 오픈 도구 간 동일 조건 비교 수치는 찾지 못했다. 키는 지표(정확 일치 vs MIREX 가중)에 따라 수치가 크게 달라지며, 최신 연구에서도 GiantSteps 정확 일치가 약 50%대인 사례가 있다.

### Cited Findings
- GiantSteps Key 테스트셋은 고신뢰 604 클립이다. MIREX 가중 점수는 5도·관계조 오류에 부분 점수를 준다. 한 벤치마크는 GiantSteps에서 exact 0.506, MIREX 0.626을 보고했다(다른 설정) — [arXiv 2604.10021](https://arxiv.org/pdf/2604.10021); [MARBLE arXiv 2306.10548](https://arxiv.org/pdf/2306.10548)
- Essentia TempoCNN의 출력 범위는 30–286 BPM이다 — [Essentia models](https://essentia.upf.edu/models.html)
- 한 개발자 블로그는 GiantSteps tempo에서 정확 BPM 42%에서 85%로 개선했다고 보고했다. 비동료심사 자료라 참고만 한다 — (검색 결과, [dev.to feed](https://dev.to/feed/dipak8080))

### Inferences
- 반/배 템포 오류는 비트 트래커 공통의 문제다. 그래서 평가에서는 보통 Acc1(±4%)과 Acc2(×2, ×½, ×3 허용)를 구분한다(일반 지식). 실무에서는 beat_this 비트 간격의 중앙값으로 BPM을 계산하고, 장르별 사전 범위(예: 70–180)로 접어 넣는 후처리가 필요하다.
- madmom 키 CNN(ISMIR 2018 "Genre-Agnostic Key Classification")은 madmom 패키지의 `key` 프로세서로 제공되는 것으로 알고 있다. 이번 조사에서 README로 직접 확인하지는 못했다.

### Gaps
- Essentia key 프로파일(edma, bgate, temperley 등)과 madmom CNN key를 동일 데이터셋에서 비교한 수치는 확인하지 못했다.

## 4. 악기 인식·태깅 (Essentia MTG-Jamendo, PANNs, CLAP, MERT, PaSST)

### Takeaway
즉시 쓸 수 있는 음악 전용 악기 태거로는 **Essentia MTG-Jamendo instrument(40 클래스, Discogs-EffNet 기반)**가 가장 간편하다. 다만 CC BY-NC-SA 4.0이다. 자유 라벨이 필요하면 LAION-CLAP의 music 체크포인트로 zero-shot을 할 수 있지만 악기 zero-shot 성능은 낮다(NSynth 26.1). MERT는 CC BY-NC 4.0으로 보이는 embedding 백본이다.

### Cited Findings
- MTG-Jamendo instrument는 40 라벨(accordion, bass, drums, guitar, piano, violin, voice, orchestra 등)을 가진다. 16 kHz 입력에 Discogs-EffNet embedding과 분류 헤드를 붙인 구조이고 백본 variant는 6종이다 — [Essentia models](https://essentia.upf.edu/models.html)
- Essentia에는 voice/instrumental과 voice gender 분류기도 있다 — [Essentia models](https://essentia.upf.edu/models.html)
- LAION-CLAP `larger_clap_music`은 음악 전용 학습 체크포인트로, HF zero-shot-audio-classification 파이프라인에서 쓸 수 있다 — [HF larger_clap_music](https://huggingface.co/another-blue/larger_clap_music); [HF clap-htsat-unfused](https://huggingface.co/laion/clap-htsat-unfused)
- 한 2026 논문의 zero-shot 표에서 LAION-CLAP은 NSynth(악기) 26.1이었다 — [arXiv 2606.04844](https://arxiv.org/pdf/2606.04844)
- LAION-CLAP 라이선스는 출처마다 다르다. 애그리게이터는 Apache-2.0, 깃허브 미러는 CC0-1.0으로 표기한다. 공식 모델카드로 확인해야 한다 — [awesome.ecosyste.ms LAION-AI/CLAP](https://awesome.ecosyste.ms/projects/github.com%2FLAION-AI%2FCLAP); [promptlayer larger_clap_general](https://www.promptlayer.com/models/largerclapgeneral)
- MERT 계열(m-a-p)은 미러와 리스팅에서 cc-by-nc-4.0으로 표기된다. MERT-v1-330M 자체의 라이선스는 직접 확인하지 못했다. 330M은 학습 데이터 16만 시간, 24층 1024차원이다 — [Gitee MERT-v1-95M mirror](https://portrait.gitee.com/modelee/MERT-v1-95M); [promptlayer mert-v1-330m](https://www.promptlayer.com/models/mert-v1-330m); [ICLR 2024 slides](https://iclr.cc/media/iclr-2024/Slides/17510.pdf)

### Inferences
- 악기 존재 여부를 판단하려면 Demucs stem별 RMS 에너지(보컬, 드럼, 베이스, 기타 등)와 Essentia instrument 태거를 함께 쓰는 편이 CLAP zero-shot보다 신뢰도가 높을 것이다.
- Essentia·MERT·madmom 모델이 모두 NC 라이선스이므로, 상업 서비스에서는 MIT인 beat_this, allin1, BTC를 중심으로 구성해야 한다.

### Gaps
- PANNs(AudioSet 527 클래스, 코드 MIT로 알려짐)와 PaSST의 라이선스·음악 악기 성능은 이번 조사에서 1차 출처를 확보하지 못했다.

## 5. 가사 전사·정렬 (Whisper / faster-whisper / WhisperX, 일본어·한국어)

### Takeaway
일본어 노래에 Whisper를 쓰면 CER이 약 40%로 높다. 또 **보컬 분리가 오히려 약간 악화**시킨 사례가 있다(39.7–43.8%). 그래서 가사 원문이 있을 때는 전사보다 **정렬(alignment)** 방식이 현실적이다. 분리는 주로 VAD나 구간 탐지 용도로 쓰는 것이 권장된다.

### Cited Findings
- IdolSongsJp(arXiv 2507.01349)의 Whisper CER은 마스터 음원 40.7%, HT-Demucs 분리 보컬 43.8%, 원본 리드 보컬 stem 39.7%였다. 즉 반주와 분리 열화에 대해서는 비교적 강건했다 — [arXiv 2507.01349](https://arxiv.org/pdf/2507.01349)
- Syed et al.(arXiv 2506.15514)은 source separation을 vocal activity detector로 써서 long-form 분할 경계를 잡는다. 이 방식이 Whisper 기본 long-form보다 WER이 낮았고, Jam-ALT long-form에서 학습 없이 오픈소스 SOTA를 냈다 — [arXiv 2506.15514](https://arxiv.org/pdf/2506.15514)
- Jam-ALT는 가독성을 고려한 가사 전사 벤치마크다 — [arXiv 2408.06370](https://arxiv.org/pdf/2408.06370)
- 커뮤니티 벤치마크(영/불/독/서, 비동료심사, 저자에 "Claude" 포함)에서는 Demucs 분리 + Whisper large-v3 + 언어 힌트가 WER 22.1%, CER 10.1%로 최고였다. 일본어는 포함되지 않았다 — [lyrics-bench](https://lyrics-bench.onrender.com/papers/paper.html)
- WhisperX는 faster-whisper(CTranslate2), wav2vec2 강제 정렬, pyannote 화자분리를 묶은 파이프라인이다. 단어 타임스탬프 오차는 100 ms 미만으로 보고된다 — [Fora Soft WhisperX article](https://www.forasoft.com/learn/ai-for-video-engineering/articles-ai/whisperx-diarization-word-level-timestamps)
- `lyric-align`(PyPI)은 알려진 가사 줄을 faster-whisper 세그먼트에 문자 유사도로 순방향 매칭한다(반복 후렴을 순서대로 소비). 문자 단위 비례 보간으로 karaoke `\k`와 LRC를 출력하고 보컬 분리 단계도 지원한다. 인트로나 간주에서 조용히 드리프트할 수 있다는 경고가 있다 — [PyPI lyric-align](https://pypi.org/project/lyric-align/)

### Inferences
- 일본어와 한국어 모두 공백 기반 단어 분할이 약하다(일본어는 공백 없음, 한국어는 어절 단위). 그래서 WhisperX word-level 정렬보다 문자 단위 또는 줄 단위 정렬이 안정적일 것이다.
- music 입력에서는 `condition_on_previous_text=False`로 반복 루프를 줄이는 것이 흔한 권장이다(검색 요약 기준, 1차 출처는 미확인).
- RTX 4070 Ti 12GB면 faster-whisper large-v3(fp16/int8)와 Demucs를 순차로 실행하는 데 무리가 없다.

### Gaps
- 한국어 노래 가사 전사의 CER/WER 벤치마크는 찾지 못했다.
- 일본어 노래에서 WhisperX 정렬 정확도를 정량 측정한 자료도 찾지 못했다.
- 전용 가사 정렬 연구 도구(예: 공개 가중치가 있는 lyrics-to-audio alignment 모델)는 조사하지 못했다.

## 6. 라이선스·활성도·Windows/RTX 4070 Ti 12GB 적합성·설치 난이도 요약

### Takeaway
설치 난이도는 beat_this(쉬움) < Essentia·BTC(보통) < madmom(Py3.10+에서 소스 빌드) < allin1(Windows는 NATTEN 소스 빌드 + madmom) 순이다. 상업 이용 가능성을 따지면 MIT인 beat_this, allin1, BTC만 깨끗하다. madmom 모델, Essentia 모델, MERT는 NC 계열이다.

### Cited Findings
| 도구 | 라이선스 | 활성도 | Windows/설치 메모 |
|---|---|---|---|
| allin1 | MIT — [GitHub](https://github.com/mir-aidj/all-in-one) | 커밋 38, 릴리스 없음 | Windows는 NATTEN 소스 빌드, madmom git 설치 필요 |
| beat_this | MIT(코드+가중치) — [GitHub](https://github.com/CPJKU/beat_this) | 커밋 245, CHANGELOG 있음 | pip + PyTorch만 필요, GPU/CPU 자동 선택 |
| madmom | 코드 BSD / 모델 CC BY-NC-SA 4.0 — [GitHub](https://github.com/CPJKU/madmom) | PyPI 0.16.1(2018)에서 정지 — [piwheels](https://www.piwheels.org/project/madmom) | Py3.10+ 에러, git 커밋 설치 — [nendo](https://pypi.org/project/nendo-plugin-loopify/0.1.0) |
| Essentia 모델 | CC BY-NC-SA 4.0 — [models](https://essentia.upf.edu/models.html) | 모델 카탈로그 유지 중 | (Windows pip 휠 여부는 미확인) |
| BTC | MIT — [GitHub](https://github.com/jayg996/BTC-ISMIR19) | 2019 코드 | PyTorch + librosa |
| MERT | CC BY-NC 4.0(계열 표기) — [Gitee](https://portrait.gitee.com/modelee/MERT-v1-95M) | — | HF transformers |
| autochord | (미확인) | 2021 | TensorFlow + NNLS-Chroma Vamp |

### Inferences
- Windows 네이티브 환경이라면 beat_this, Essentia TF 모델(가능할 경우), BTC, faster-whisper, Demucs 조합이 가장 마찰이 적다. allin1이 필요하면 WSL2를 쓰는 것을 권장한다.
- 12GB VRAM이면 위 모델 대부분(Demucs htdemucs, Whisper large-v3, MERT-330M 추론)을 순차 실행할 때 충분하다. 동시에 올리면 경합이 생길 수 있다.

### Gaps
- Essentia의 Windows 공식 pip 휠 제공 여부(역사적으로 Linux/macOS 중심)와 essentia-tensorflow의 Windows 지원 여부를 이번에 1차 출처로 확인하지 못했다.
- 각 저장소의 2026년 최근 커밋 날짜는 확인하지 못했다(페이지 캡처에 날짜가 없었음).
