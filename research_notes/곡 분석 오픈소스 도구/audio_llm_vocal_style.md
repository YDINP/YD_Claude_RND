# 곡을 «듣고» 말로 설명하는 오픈 오디오-언어 모델 · 보컬 스타일/창법 분석 도구 (2026-10 기준)

> 조사일 2026-10-09. 대상 하드웨어: RTX 4070 Ti 12GB / RAM 61GB / Windows 11.
> 표기: 출처 링크가 붙은 것만 사실, "Inferences"는 추론, "Gaps"는 확인 못 한 것.

## Q1. 쓸 만한 오픈 웨이트 모델은 무엇이고, 각각의 라이선스·크기·상태는?

### Takeaway
2026년 말 «곡 설명» 최상위 오픈 웨이트는 NVIDIA **Music Flamingo**(8B, 비상업 전용)와 Alibaba **Qwen3-Omni-30B-A3B**(Instruct/Thinking/Captioner, Apache-2.0)다. 상업적으로 써도 되는 쪽은 Qwen 계열(Qwen2.5-Omni, Qwen3-Omni, Captioner)과 MiDashengLM이다. MU-LLaMA·LLark·SALMONN·MusiLingo 같은 2023~24 세대는 성능이 한참 밀려 역사적 기준선일 뿐이다.

### Cited Findings
**Music Flamingo (NVIDIA + UMD)**
- 개선된 Audio Flamingo 3 백본을 MF-Skills 데이터로 미세조정하고, MF-Think(음악이론 기반 CoT)로 콜드스타트한 뒤 GRPO 강화학습을 거쳤다. 화성·구조·음색·가사·문화적 맥락을 다루는 «이론 인지형» 캡션과 QA를 낸다 — [NVIDIA ADLR](https://research.nvidia.com/labs/adlr/MF)
- Qwen2.5-7B 디코더 + AF-Whisper 인코더 + MLP 어댑터, 총 8B, BF16. 30초 창 단위로 처리하며 «샘플당 10분 상한»(같은 카드의 Input 항목은 «최대 20분»이라 자체 모순). Transformers `AudioFlamingo3ForConditionalGeneration`로 로드한다. 테스트 하드웨어는 A100 80GB였고 지원 대상은 Linux의 A100/H100이다. 라이선스는 NVIDIA OneWay Noncommercial(비상업 연구 전용)이며 Qwen Research License와 OpenAI ToU 조건도 함께 붙는다 — [HF nvidia/music-flamingo-hf](https://huggingface.co/nvidia/music-flamingo-hf)
- 논문 arXiv 2511.10289(2025-11-13). 카드에는 «더 강한 새 체크포인트» `nvidia/music-flamingo-2601-hf`가 나왔다는 공지가 있고, vLLM 문서 예제가 이 체크포인트를 로드한다(max_model_len 4096, `<sound>` placeholder) — [HF card](https://huggingface.co/nvidia/music-flamingo-hf); [vLLM multimodal examples](https://docs.vllm.ai/en/stable/examples/generate/multimodal/)
- UMG가 Music Flamingo를 음악 발견 용도로 확장하는 NVIDIA 파트너십을 발표했다 — [MarketScreener](https://uk.marketscreener.com/news/universal-music-group-to-transform-music-experience-for-billions-of-fans-with-nvidia-ai-ce7e59dfdc8ff626)

**Audio Flamingo 3 (NVIDIA)**
- 라이선스: NVIDIA OneWay Noncommercial. 코드는 MIT이고 체크포인트는 비상업 전용 — [HF nvidia/audio-flamingo-3-hf](https://huggingface.co/nvidia/audio-flamingo-3-hf); [Space README](https://huggingface.co/spaces/manoskary/audio-flamingo-3/blob/main/README.md)

**Qwen3-Omni-30B-A3B (Instruct / Thinking / Captioner)**
- Captioner: Apache-2.0, 약 32B(MoE 30B-A3B), BF16. 별도 프롬프트 없이 음성·환경음·음악을 «저환각» 캡션으로 묘사한다. 입력은 추론 1회당 오디오 1개, 출력은 텍스트뿐이며 **30초 이하 클립을 권장**한다(긴 클립은 디테일 인지가 떨어진다고 명시). Transformers(소스 설치)와 vLLM(포크 소스 설치)을 지원하고, 예시 샘플링은 temp 0.6 / top_p 0.95 / top_k 20이다. 카드에 llama.cpp·LM Studio·Ollama·Jan용 양자화 변형 4개가 링크돼 있지만 비트수는 적혀 있지 않다 — [HF Qwen3-Omni-30B-A3B-Captioner](https://huggingface.co/Qwen/Qwen3-Omni-30B-A3B-Captioner)
- 음악 스타일·악기 같은 음악 요소를 식별한다 — [hyper.ai 튜토리얼](https://hyper.ai/en/tutorials/44645)

**Qwen2.5-Omni (3B / 7B)** — Apache-2.0. 7B AWQ판이 있다(Q3 참조) — [HF Qwen2.5-Omni-7B-AWQ](https://huggingface.co/Qwen/Qwen2.5-Omni-7B-AWQ)

**Qwen3.5-Omni (2026-04)**
- 공식 블로그 수치: Qwen3.5-Omni-Plus가 RUL-MuchoMusic 72.4, SongFormBench 81.1(Gemini-3.1-Pro는 59.6 / 75.6) — [Qwen blog](https://qwen.ai/blog?id=qwen3.5-omni); [기술 보고서 2604.15804](https://huggingface.co/papers/2604.15804)
- 오픈 웨이트 여부는 **출처끼리 충돌**한다. Wikipedia는 «독점, 챗봇·Alibaba Cloud에서만 제공»이라 쓰고 — [Wikipedia Qwen](https://en.wikipedia.org/wiki/Qwen) —, 제3자 리뷰는 «Light 변형은 HF 오픈 웨이트»라고 한다 — [buildfastwithai](https://www.buildfastwithai.com/blogs/qwen3-5-omni-multimodal-ai-review). 공식 출처로는 확인하지 못했다.
- `oqmtest1451/open-qwen-music-weights`는 **공식이 아닌** 제3자 음악 *생성* 모델(Qwen2.5-Omni-3B 기반)이다 — [HF](https://huggingface.co/oqmtest1451/open-qwen-music-weights)

**MiDashengLM-7B (Xiaomi)** — Dasheng 오디오 인코더 + Qwen2.5-Omni-7B Thinker 디코더. 학습 데이터가 전부 공개돼 있다. «범용 오디오 캡셔너»를 표방하며 BF16 변형을 권장한다 — [HF mispeech/midashenglm-7b-0804](https://huggingface.co/mispeech/midashenglm-7b-0804-fp32). Apache-2.0이라는 정보는 2차 보도뿐이다 — [implicator.ai](https://www.implicator.ai/chinas-xiaomi-unveils-open-source-voice-model-that-rivals-google-and-openai/)

**Kimi-Audio-7B(-Instruct) (Moonshot)** — Qwen2.5-7B 파생 코드는 Apache-2.0, 나머지 코드는 MIT. 1,300만 시간 이상으로 사전학습했다. Instruct판은 BF16 기준 9.77B 파라미터 — [HF Kimi-Audio-7B-Instruct](https://huggingface.co/moonshotai/Kimi-Audio-7B-Instruct)

**Step-Audio 2 mini (StepFun)** — MMAU 종합 73.2로 «오픈소스 E2E 음성모델 1위»라는 주장이 있다. 단일 중국어 애그리게이터 출처라 미검증 — [ai-bot.cn](https://ai-bot.cn/step-audio-2-mini/)

**음악 특화 인코더·구조 분석**
- MERT(v2 30s 존재) — [HF m-a-p/MERT-v2-30s](https://huggingface.co/m-a-p/MERT-v2-30s)
- MuQ / MuQ-MuLan(OpenMuQ): 반드시 24kHz 입력이어야 한다. Qwen3-Omni 보고서에서 MTG-Jamendo·MagnaTagATune 태깅의 «전문가 모델» 기준선으로 쓰였다 — [SongFormer 내 MuQ README](https://huggingface.co/spaces/ASLP-lab/SongFormer/blob/main/src/third_party/MuQ/README.md); [Qwen3-Omni 보고서](https://arxiv.org/abs/2509.17765)
- SongFormer(ASLP-lab): 곡을 intro/verse/chorus로 분할하는 음악 구조 분석기다. MuQ 표현을 30초·420초 창으로 융합한다. 체크포인트는 2025-09-30, 학습 코드는 10-03에 공개됐다. SongFormDB(1만 곡 이상)와 SongFormBench(300곡, CC-BY-4.0)도 함께 공개 — [arXiv 2510.02797](https://arxiv.org/html/2510.02797v2); [GitHub](https://github.com/aslp-lab/songformer); [SongFormBench](https://huggingface.co/datasets/ASLP-lab/SongFormBench)

### Inferences
- «곡 설명문 품질»만 보면 Music Flamingo(-2601)가 1순위다. 다만 비상업 라이선스라 YouTube 채널 수익화 파이프라인(YDIN·moonlit 등)에 결과물을 직접 쓰면 회색지대다. 내부 분석·참고용으로만 쓰고, 상업 파이프라인에는 Qwen3-Omni 계열을 쓰는 편이 안전하다.
- SongFormer는 «구간 라벨(타임스탬프)»을 주므로, LLM 설명을 구간별로 돌리는 전처리(구간 분할 → 30초 클립 → 캡셔너)에 맞다.

### Gaps
- MU-LLaMA·LLark·SALMONN·MusiLingo·LP-MusicCaps의 2026년 활동성과 라이선스는 이번 조사에서 따로 확인하지 못했다(구세대로 판단해 우선순위를 낮춤).
- music-flamingo-2601의 변경점(changelog)은 찾지 못했다.
- MiDashengLM의 Apache-2.0은 1차 출처(모델 카드 license 필드)로 확인하지 못했다.

## Q2. 음악 설명 품질 — 벤치마크와 환각 문제

### Takeaway
Music Flamingo 논문(2025-11)에서는 MuChoMusic 74.58, MMAU-Music 76.8, SongCaps 사람 평가 8.3/10, 가사 WER이 크게 개선돼 오픈 모델 중 최상위였다. Qwen3-Omni는 태깅·장르 분류(GTZAN 93.0)에 강하다. 다만 음악 QA 벤치마크는 «오디오 없이 텍스트만으로도 꽤 풀린다»는 문제가 있고, 실제 캡션에서는 «없는 화음·타악기를 지어내는 과잉 구체화»가 대표적인 환각이다.

### Cited Findings
- Music Flamingo vs 이전 최고(Table 1) — [arXiv 2511.10289](https://arxiv.org/html/2511.10289):
  - MMAU-Music test-full/mini: MF 76.83/76.35 vs AF3 73.95/74.47
  - MMAU-Pro-Music: MF 65.60 vs Gemini-2.5 Flash 64.90
  - MuChoMusic: MF 74.58 vs Qwen3-Omni 52.10
  - MMAR-Music: MF 48.66 vs Qwen2.5-Omni 46.12
  - SongCaps(사람/GPT5-coverage/GPT5-correctness): MF 8.3/8.8/8.0 vs AF3 6.5/6.7/6.2
  - MusicCaps(GPT5 점수): MF 8.8 vs Qwen3-Omni 7.2
  - GTZAN: 84.45, Medley-Solos 90.86, NSynth 악기 80.76
  - 가사 WER(↓): Opencpop(중국어) MF 12.9 vs GPT-4o 53.7 / Qwen2.5-Omni 55.7, MUSDB18(영어) MF 19.6 vs GPT-4o 32.7 / Qwen2.5-Omni 68.7
  - Music AVQA는 AF3(76.7)가 MF(73.6)보다 높다
  - (주의) 표 텍스트가 깨져 있어 일부 행과 모델의 대응은 레이아웃으로 추정했다
- 환각 정성 평가(같은 논문): MF의 주 실패 유형은 «과잉 구체화»(오디오에 없는 altered chord나 타악기를 덧붙임). Gemini 2.5 Pro는 장르 선입견형 환각이 가장 많고, GPT-4o는 환각은 적지만 덜 정밀하다. **Qwen3-Omni는 보컬이 분명한 곡 2개를 인스트루멘탈로 오분류**했다. MF-Skills 학습 캡션은 평균 451.65단어이고, 메타데이터에 «Vocal Character» 필드가 있다 — [arXiv 2511.10289](https://arxiv.org/html/2511.10289)
- Qwen3-Omni 보고서 Table 8(음악): RUL-MuchoMusic 52.0(Instruct)/52.1(Flash) vs AF3 47.6 / Gemini-2.5-Pro 49.4. GTZAN 93.0 vs CLaMP3 87.9 / Qwen2.5-Omni 81.7. MTG-Jamendo micro-F1: 장르 39.0, 무드 21.0(MuQ-MuLan 10.9), 악기 40.5, Top50 36.7. MagnaTagATune 44.3 — [arXiv 2509.17765](https://arxiv.org/abs/2509.17765)
- MuChoMusic: 문항 1,187개, 644곡. 원 논문(ISMIR 2024)에서는 오픈 모델 전반이 저조했고 Qwen-Audio(1세대)가 51.4% — [arXiv 2408.01337](https://arxiv.org/pdf/2408.01337)
- «Are you really listening?»: 오디오 없는 텍스트 LLM이 MuChoMusic에서 **최대 56.4%** 를 기록했다. 오디오 대신 가우시안 노이즈를 넣어도 LALM이 우연 수준보다 높게 나왔다. 기존 벤치마크는 지각보다 추론을 잰다는 결론 — [arXiv 2504.00369](https://arxiv.org/html/2504.00369v2)
- MMAU 원 논문 시점 오류 분석: 지각 오류(perceptual error)가 Qwen2-Audio-Instruct 오류의 55%, Gemini Pro 1.5 오류의 64%를 차지했다 — [MMAU homepage](https://sakshi113.github.io/mmau_homepage/)

### Inferences
- 벤치마크 점수(특히 MuChoMusic처럼 객관식인 것)만 보고 «잘 듣는다»고 믿으면 안 된다. 캡션은 「악기·장르·무드」는 꽤 맞고 「코드·세부 리듬·보컬 기법」에서 지어내기 쉬운 것으로 보인다. 그래서 BPM·키·구조는 신호처리 도구로 실측해 프롬프트에 «사실»로 주입하고, LLM에는 정성 묘사만 맡기는 하이브리드가 안전하다. 메모리에 있는 «레퍼런스 실측 BPM을 지시값으로» 원칙과도 맞는다.
- 보컬 유무 오분류(Qwen3-Omni) 사례가 있으므로, 보컬 묘사가 필요하면 먼저 음원 분리(Demucs 등)로 보컬 스템을 만들어 따로 넣는 편이 낫다(추론, 미검증).

### Gaps
- MMAU 공식 리더보드의 음악 하위 점수는 페이지에서 값이 렌더링되지 않아 수집하지 못했다.
- Kimi-Audio·MiDashengLM·Step-Audio의 음악 특화 점수를 1차 출처로 찾지 못했다.
- 보컬 «창법 묘사»의 정확도를 따로 평가한 벤치마크는 찾지 못했다.

## Q3. VRAM·양자화·실행 경로 (RTX 4070 Ti 12GB, Windows)

### Takeaway
12GB에 «그대로» 들어가는 건 Qwen2.5-Omni-7B AWQ(15초 기준 11.77GB, 아슬아슬)와 llama.cpp GGUF판 Qwen2.5-Omni 3B/7B다. Qwen3-Omni-30B-A3B는 Q4_K_M도 약 19GB라 MoE 전문가를 CPU RAM에 내리는 부분 오프로드가 필요하다(RAM 61GB라 가능은 하다). Music Flamingo 8B는 BF16이면 약 16GB+라 12GB에서는 4/8bit(bitsandbytes) 시도가 필요한데, 검증된 양자화판은 찾지 못했다.

### Cited Findings
- Qwen2.5-Omni-7B 공식 메모리 표(15s/30s/60s **비디오** 기준): BF16 31.11/41.85/60.19GB, **AWQ 11.77/17.84/30.31GB**. «RTX3080, 4080, 5070 등 저VRAM 장치»를 겨냥했고, 모듈을 필요할 때 로드하고 CPU로 내리는 오프로드가 들어 있어 원본보다 느리다. transformers v4.51.3-Qwen2.5-Omni-preview + autoawq 0.2.9 필요. Apache-2.0 — [HF Qwen2.5-Omni-7B-AWQ](https://huggingface.co/Qwen/Qwen2.5-Omni-7B-AWQ)
- llama.cpp(libmtmd) 오디오 입력 지원: Ultravox 0.5(1B/8B), Voxtral-Mini-3B, **Qwen2.5-Omni 3B/7B GGUF(ggml-org)**, 최신 master는 **Qwen3-Omni 30B-A3B Instruct/Thinking GGUF**와 Gemma 4(E2B/E4B)까지 지원한다. 오디오는 «highly experimental, 품질 저하 가능»으로 표시돼 있다. Qwen2-Audio는 결과가 매우 나빠 사전양자화 GGUF를 제공하지 않는다. `llama-mtmd-cli`와 `llama-server`의 /chat/completions로 사용 — [llama.cpp docs/multimodal.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md)
- llama.cpp b8769(4월 12일)에서 Qwen3-Omni·Qwen3-ASR 오디오가 추가됐다는 보도 — [creativeainews](https://www.creativeainews.com/blog/llama-cpp-audio-qwen3-omni-multimodal/)
- Qwen3-Omni-30B Q4_K_M ≈ 19GB(8k KV 포함, 제3자 추정), 24GB 카드 권장 — [bestllmfor.com](https://bestllmfor.com/catalog/qwen3-omni-30b/)
- Captioner 실사용 사례: RTX A6000 48GB — [hyper.ai](https://hyper.ai/en/tutorials/44645). FP16 약 72GB 추정 — [cloudprice](https://cloudprice.net/models/alibaba-qwen3-omni-30b-a3b-captioner). Qwen3-Omni 최소 24GB·권장 40GB 이상, OOM이면 bitsandbytes 권장 — [Spheron](https://docs.spheron.network/guide-to-deploy/llms/qwen3-omni-30b-a3b)
- Music Flamingo: VRAM 최소치는 미기재. 테스트는 A100 80GB, 지원 OS는 Linux로 표기 — [HF](https://huggingface.co/nvidia/music-flamingo-hf)
- Kimi-Audio-7B-Instruct 9.77B BF16(가중치만 약 20GB, 산술 추정) — [HF](https://huggingface.co/moonshotai/Kimi-Audio-7B-Instruct)

### Inferences
- **12GB 현실 경로(우선순위):**
  1. llama.cpp `llama-server` + Qwen3-Omni-30B-A3B GGUF(Q4) + MoE 전문가 CPU 오프로드(`--n-cpu-moe`/`-ot` 계열 옵션, 빌드별 이름 확인 필요). Windows 네이티브로 돌아가고 상업 사용도 가능하다. A3B라 CPU 오프로드에서도 속도가 실용적일 가능성이 높다(추론).
  2. Qwen2.5-Omni-7B GGUF(llama.cpp) 또는 AWQ(transformers). 오디오 30초 이하면 12GB 안에 든다(표가 비디오 기준이라 오디오만이면 더 적을 것으로 추정).
  3. Music Flamingo(-2601): WSL2 + transformers 4bit/8bit 로드 또는 vLLM. 공식 지원은 Linux/A100이라 Windows 네이티브는 비공식 영역이다.
- Qwen3-Omni-**Captioner**의 GGUF 양자화판이 카드에 링크돼 있으나, llama.cpp가 Captioner 아키텍처(인스트럭션 없는 캡션 모드)를 Instruct와 동일하게 처리하는지는 미확인이다.
- 사용자 환경상 ComfyUI·ollama가 VRAM을 점유하면 OOM이 난다(메모리의 «ollama VRAM 경합» 함정). 돌리기 전에 언로드할 것.

### Gaps
- Qwen3-Omni GGUF의 실측 12GB 부분 오프로드 속도·VRAM은 찾지 못했다.
- Ollama가 오디오 입력을 지원하는지(Captioner 카드가 Ollama 양자화를 링크하긴 함)는 확인하지 못했다.
- Music Flamingo의 AWQ/GGUF 양자화판 존재 여부를 확인하지 못했다.

## Q4. 창법·보컬 스타일 분석 도구 (가성·벨팅·비브라토·브레시, 음색 임베딩)

### Takeaway
«곡 하나를 넣으면 창법을 라벨링해 주는» 완성형 오픈 모델은 사실상 없다. 데이터셋은 VocalSet(17기법, 가성 없음)과 GTSinger(6기법: 믹스·가성·브레시·인두음·비브라토·글리산도, 음소 단위 라벨)가 기본이다. 비브라토는 분류 모델보다 «F0 곡선(RMVPE/CREPE) → 3~9Hz 대역 → rate·extent 계산»이 정답에 가깝다.

### Cited Findings
- VocalSet: 프로 가수 20명(여 9, 남 11), 17기법. 분류 연구에서는 흔히 10기법(belt, breathy, inhaled, lip trill, spoken, straight, trill, trillo, vibrato, vocal fry)을 쓰고, 공식 분할은 학습 15명 / 테스트 5명이다. 클래스 분포는 롱테일 불균형 — [arXiv 2206.12230](https://arxiv.org/pdf/2206.12230)
- GTSinger(NeurIPS 2024): 1,366곡, 가수 20명, 9개 언어, 6기법(mixed voice, falsetto, breathy, pharyngeal, vibrato, glissando), 음소 단위 라벨, 실제 악보 포함. 기법 인식기는 ROSVOT 기반이다. F1은 breathy 0.99, falsetto 0.96, vibrato 0.70, glissando 0.70이고, 교차언어에서는 여러 클래스가 떨어진다 — [arXiv 2409.13832](https://arxiv.org/html/2409.13832v8)
- 자기지도 프론트엔드(wav2vec2·WavLM 등)를 가창 이해(가수 식별·기법 분류 등)에 쓴 사례 연구 — [arXiv 2306.12714](https://arxiv.org/pdf/2306.12714)
- Vibrato-ai(Apache-2.0): 성부·창법·모음·음질 분류를 표방한다. v2.2 카드에 따르면 **비브라토 재현율이 거의 0**(0.25초 창에 5~7Hz 변조가 1~2주기만 들어감), falsetto/nasal/mixed/schwa 로짓은 학습 샘플 0(VocalSet에 가성 녹음이 없음), 기법 정확도 0.696으로 다수 클래스 기준선 0.704보다 낮다 — [HF Vibrato-ai/vibrato-v2](https://huggingface.co/Vibrato-ai/vibrato-v2); [v1](https://huggingface.co/Vibrato-ai/vibrato-v1)
- RMVPE: 혼합음원(폴리포닉)에서 보컬 피치를 직접 추출하도록 설계됐고 코드가 공개돼 있다 — [arXiv 2306.15412](https://arxiv.org/pdf/2306.15412)
- CREPE: 분리된 보컬에서 원시 피치 정확도 약 95.7%(MIR-1K) — [arXiv 1912.12609](https://arxiv.org/pdf/1912.12609)
- VibratoScope: 비브라토 rate·extent(cents)·jitter·shimmer·표본 엔트로피를 뽑는 파이썬 툴킷이다. GUI와 배치를 지원하고 pYIN·Praat·HPS·REAPER 피치를 쓴다(RMVPE/CREPE는 미지원) — [science.ecosyste.ms](https://science.ecosyste.ms/projects/37213)
- 비브라토 참고 범위: rate 5~7Hz(넓게 잡으면 3~9Hz), 오페라 extent 약 50~150 cents(peak-to-peak) — [VoceVista theory](https://www.vocevista.com/en/doc/theory-vibrato/)
- 비브라토 표현 제어(가창 음성 변환) 연구 2026 — [arXiv 2606.17126](https://arxiv.org/pdf/2606.17126)
- 대규모 상업 음반 비브라토 분석에 AI를 적용한 사례(Voice Foundation 2025 초록) — [voicefoundation.org](https://voicefoundation.org/view/2025-abstracts/entry/2833/)

### Inferences
- 실용 파이프라인: Demucs로 보컬 분리 → RMVPE(혼합음원)나 CREPE(분리 보컬)로 F0 추출 → 비브라토 rate/extent, 음정 이탈(cents), 글리산도·포르타멘토 길이를 통계화 → GTSinger로 학습한 분류기(공개 여부 미확인이라 직접 학습해야 할 수도 있음) 또는 Music Flamingo / Qwen3-Omni에 «보컬 스템만» 넣어 정성 묘사.
- 가성 검출은 VocalSet 기반 모델로는 불가능하다(가성 데이터 없음). GTSinger 기반으로 가야 한다.
- 이 수치들은 SynthV 조교값(비브라토 깊이·주파수, 피치 전이 시간)으로 거의 그대로 옮길 수 있다. SynthV 노트의 vibrato frequency(Hz)·depth(반음 단위) 파라미터에 rate와 extent/100을 대응시키면 된다(추론. SynthV 파라미터 단위는 이번 조사에서 확인하지 않음).

### Gaps
- GTSinger 기법 인식기 체크포인트의 공개 여부와 GTSinger 라이선스를 확인하지 못했다.
- 가수 음색 임베딩(가수 식별용 공개 체크포인트)은 따로 조사하지 못했다. MERT·MuQ 임베딩이나 화자 임베딩(ECAPA 등) 전용 사례는 미확인.
- 벨팅 전용 공개 분류기는 찾지 못했다(VocalSet의 belt 라벨로 직접 학습해야 함).

## Q5. Suno 프롬프트 / SynthV 조교 가이드로 쓰는 실전 워크플로·프롬프트

### Takeaway
오디오 LLM 설명을 그대로 Suno에 넣지 말 것. «실측(BPM·키·구조·비브라토 수치) + LLM 정성 묘사(음색·창법·악기·무드)»를 합친 뒤, 텍스트 LLM이 Suno 스타일 태그(약 200자)와 SynthV 파라미터 표로 변환하는 2단계 구성이 환각과 과잉 구체화를 줄인다.

### Cited Findings
- 근거가 되는 사실: Captioner는 30초 이하 권장, 프롬프트 없이 캡션 생성 — [HF Captioner](https://huggingface.co/Qwen/Qwen3-Omni-30B-A3B-Captioner). MF는 30초 창, 최대 10분 — [HF MF](https://huggingface.co/nvidia/music-flamingo-hf). 캡션의 대표 환각은 과잉 구체화이고, 보컬을 인스트루멘탈로 오분류하는 사례가 있다 — [arXiv 2511.10289](https://arxiv.org/html/2511.10289). SongFormer로 구간을 분할할 수 있다 — [GitHub](https://github.com/aslp-lab/songformer)

### Inferences (권장 워크플로, 미검증 설계안)
1. **구조**: SongFormer로 intro/verse/chorus 타임스탬프를 얻는다.
2. **실측**: BPM·키는 신호처리(librosa/essentia 등)로, 보컬은 Demucs 분리 후 RMVPE로 F0 → 비브라토·음역(최저/최고음)을 계산한다.
3. **정성 묘사**: 구간마다 30초 클립을 (a) 믹스 전체, (b) 보컬 스템으로 나눠 Qwen3-Omni(Instruct, llama.cpp) 또는 Music Flamingo에 넣는다. 프롬프트 예:
   - 믹스: "Describe this music clip for a producer. Separate into: genre/subgenre, tempo feel, instrumentation (list only instruments you clearly hear), production (mix density, reverb, sidechain, stereo width), mood. If unsure, say 'uncertain'. Do not guess chords."
   - 보컬 스템: "Describe only the singing voice: gender/register, timbre (breathy/bright/dark/nasal/raspy), technique per phrase (falsetto, mixed, belt, vibrato presence and speed, glissando, vocal fry), articulation, emotional delivery. Mark anything uncertain."
4. **사실 고정**: 2단계의 실측값으로 LLM 출력의 BPM·키 언급을 덮어쓴다(LLM 수치는 버린다).
5. **변환**: 텍스트 LLM에게 "Suno style prompt(쉼표 구분 태그, 200자 이내, 아티스트명 금지)"와 "구간별 지시(In the verses only…)"를 생성하게 한다. 메모리의 «Suno 프롬프트 구간 지정» 인사이트와 같은 방식이다. SynthV 쪽에는 구간별 비브라토 Hz·깊이, 피치 전이, 브레스·텐션 지시 표를 만든다.
6. 같은 클립을 temperature를 바꿔 2~3회 생성하고 **공통으로 나온 묘사만 채택**한다(환각 필터, 추론).

### Gaps
- 오디오 LLM 캡션 → Suno 프롬프트 변환 품질을 정량 검증한 공개 연구는 찾지 못했다.
- Music Flamingo가 «창법(가성/벨팅)» 단위 묘사를 얼마나 정확히 하는지는 정량 근거가 없다(논문은 «Vocal Character» 메타데이터 필드만 언급).
