# 오픈소스 음원 분리(Stem Separation) 도구 — 2026-10 기준

> 조사일 2026-10-09. 웹 조사 약 17회 호출. 확인되지 않은 항목은 Gaps에 따로 적었다. "(미검증/학습지식)" 표시는 출처로 확인하지 못한 배경 지식이다.

## Q1. 현재 SOTA 도구·모델은 무엇인가 (Demucs, RoFormer 계열, MDX-Net, UVR5, python-audio-separator, MSST, SCNet, Spleeter, Open-Unmix, 2025~2026 신규)

### Takeaway
2026년 기준 품질 1군은 **BS-RoFormer와 Mel-Band RoFormer 계열**(커뮤니티 가중치)과 **SCNet**이다. 이들은 ZFTurbo의 **Music-Source-Separation-Training(MSST)**, **python-audio-separator**, **UVR5 Roformer 베타 패치**로 로컬에서 돌린다. Demucs는 2025-01-01에 아카이브되었다. 지금은 "무난한 4·6스템 기본기" 정도이며, Spleeter와 Open-Unmix는 구세대 베이스라인이다. MVSep 리더보드 최상위(BS RoFormer 124 bands, BS PolarFormer, 2026-06~07)는 MVSep 자체 모델이라 공개 가중치인지 확인되지 않았다.

### Cited Findings
**RoFormer 계열 (현재 주력)**
- BS-RoFormer(ByteDance)의 구조: 밴드 분할 프론트엔드 → 밴드 내·밴드 간 Transformer → 밴드별 마스크. RoPE가 성능의 핵심이다. 이 모델로 SDX'23 MSS 트랙 1위를 했다(MUSDB18HQ + 추가 500곡 학습). MUSDB18HQ만으로 학습한 작은 모델은 평균 SDR 9.80 dB이다. — [arXiv 2309.02612](https://arxiv.org/abs/2309.02612), [ar5iv](https://ar5iv.labs.arxiv.org/html/2309.02612)
- Mel-Band RoFormer는 주파수 bin을 mel 스케일의 겹치는 서브밴드로 매핑한다. MUSDB18HQ에서 vocals·drums·other는 BS-RoFormer보다 좋다고 보고되었다(ISMIR 2023 LBD). — [arXiv 2310.01809](https://arxiv.org/html/2310.01809v1), [ISMIR LBD](https://ismir2023program.ismir.net/lbd_353.html)
- Mel-Band RoFormer의 첫 고품질 공개 가중치는 Kimberley Jensen이 냈다. 이후 Bas Curtiz, unwa, becruily, gabox 등이 파생 가중치를 공개했다. BS-RoFormer는 lucidrains 구현을 기반으로 하며, 두 번째 가중치 버전은 viperx가 준비했다. — [MVSep algorithms](https://mvsep.com/en/algorithms)
- Kimberley Jensen Mel-Band RoFormer HF 저장소의 라이선스 표기는 MIT이다(README는 비어 있음). — [HF KimberleyJSN/melbandroformer](https://huggingface.co/KimberleyJSN/melbandroformer)
- 한 Core AI 포트 기준으로 Kim Mel-Band RoFormer는 약 228M 파라미터이고, fp16 번들은 약 470 MB이다. — [HF mlboydaisuke/MelBandRoformer-Vocal-CoreAI](https://huggingface.co/mlboydaisuke/MelBandRoformer-Vocal-CoreAI)

**MSST — ZFTurbo/Music-Source-Separation-Training (학습·추론 허브)**
- MIT 라이선스, 약 1.6k stars, 630 commits. 지원 model_type: mdx23c, htdemucs, segm_models, torchseg, bs_roformer, mel_band_roformer, swin_upernet, bandit, bandit_v2, scnet, scnet_tran, scnet_masked, apollo, bs_mamba2, conformer, bs_conformer, dttnet. wxPython GUI(gui-wx.py)가 있다. — [GitHub ZFTurbo/MSST](https://github.com/ZFTurbo/Music-Source-Separation-Training)
- 2025년 신규 아키텍처는 **BSMamba2**(arXiv 2508.14556, 2025-08)이다. — [GitHub ZFTurbo/MSST](https://github.com/ZFTurbo/Music-Source-Separation-Training)

**python-audio-separator (nomadkaraoke) — pip로 쓰는 UVR 모델 래퍼**
- MIT 라이선스, 약 1.4k stars. 지원 형식: MDX(.onnx), VR(.pth), Demucs(.yaml), MDXC/RoFormer(.ckpt/.yaml). README에 SCNet 언급은 없다. — [GitHub nomadkaraoke/python-audio-separator](https://github.com/nomadkaraoke/python-audio-separator)
- 기본 모델 표기가 문서 안에서 엇갈린다. CLI 도움말은 `model_bs_roformer_ep_317_sdr_12.9755`, Python API 절은 `model_mel_band_roformer_ep_3005_sdr_11.4360`이다. 앙상블 프리셋으로 `vocal_balanced`, `karaoke` 등이 있다. — [같은 출처](https://github.com/nomadkaraoke/python-audio-separator)

**UVR5 (Anjok07/ultimatevocalremovergui) — Windows GUI**
- 최신 정식 릴리스는 v5.6이다(9/26, 에셋 타임스탬프로 보아 2023년으로 추정). v5.6에는 Demucs v1~v4, MDX23C, macOS MPS 지원이 들어갔다. **Roformer/SCNet/Bandit 지원과 DirectML(AMD/Intel)은 별도 "Beta Roformer" 빌드**(풀 설치본 또는 패치)로 나왔다. — [UVR releases](https://github.com/Anjok07/ultimatevocalremovergui/releases)

**Demucs (Meta)**
- **2025-01-01 아카이브(읽기 전용)**. 저자가 Meta를 떠나 유지보수가 끝났고, 중요한 버그 수정만 adefossez/demucs 포크에서 받는다. 코드는 MIT이고 약 10.4k stars이다. 마지막 뉴스는 2023-02(SDX23 지원)이다. — [GitHub facebookresearch/demucs](https://github.com/facebookresearch/demucs)
- MUSDB HQ 테스트 SDR: htdemucs 9.00 dB, htdemucs_ft 약 9.0 dB(4배 느림). 9.20 dB는 미공개 sparse 변형의 수치이다. htdemucs_6s는 guitar/piano 스템을 추가하지만 저자 표현으로 "guitar는 괜찮고, piano는 bleeding·artifact가 많다". mdx_extra는 MDX 챌린지 Track B 2위였다. — [같은 출처](https://github.com/facebookresearch/demucs)

**SCNet**
- Sparse Compression Network(arXiv 2401.13276). 추가 데이터 없이 MUSDB18-HQ 평균 9.0 dB(drums 10.51 / bass 8.82 / other 6.76 / vocals 9.89)이다. SCNet-large는 평균 9.69(드럼 10.98 / 베이스 9.49 / other 7.44 / vocals 10.86)이고, MoisesDB 235곡을 추가하면 base 모델이 9.25가 된다. CPU 추론 시간은 HT Demucs의 48%이다. 공식 코드는 starrytong/SCNet이다. — [arXiv 2401.13276](https://arxiv.org/pdf/2401.13276), [arXiv html](https://arxiv.org/html/2401.13276v1)
- 표의 SCNet-large 열 순서(avg/drums/bass/other/vocals)는 검색 스니펫을 보고 추정한 것이다. — 위 출처

**Spleeter / Open-Unmix (구세대)**
- Spleeter: MIT. 2026년 집계 기준으로 아카이브되지 않았고, 마지막 push는 2025-04-02, conda 2.2.1은 2025-03-25이다(서드파티 집계라 GitHub에서 직접 확인하지는 못함). — [ecosyste.ms](https://summary.ecosyste.ms/projects/358219), [anaconda deezer-research](https://anaconda.org/deezer-research)
- Open-Unmix: 2019년에 PyTorch 레퍼런스 베이스라인으로 나왔다. 2025~2026 활동은 확인되지 않았다. — [science.ecosyste.ms](https://science.ecosyste.ms/projects/2457)

**2025~2026 신규**
- MVSep 리더보드 최상위는 "BS Roformer 124 bands (MVSep.com)"(2026-07-10)와 "BS PolarFormer 124 bands"(2026-06-13)이다. 이름으로 보아 MVSep 자체 학습 모델이다. — [MVSep multisong leaderboard](https://mvsep.com/quality_checker/multisong_leaderboard?sort=vocals)
- 2025-11 arXiv에 실시간·저지연 MSS 논문(DTTNet 기반)이 나왔다. SDR 기록 경신이 아니라 지연 시간 최적화가 목적이다. — [arXiv 2511.13146](https://arxiv.org/pdf/2511.13146)
- StemSplit의 HF 컬렉션 "Music Source Separation Toolkit 2026"(2026-05 갱신)은 BS-RoFormer를 현 SOTA로 부른다. 다만 이 업체의 자체 벤치에 BS-RoFormer는 아직 들어 있지 않고, 그 벤치의 최고 보컬은 htdemucs_ft 9.19 dB이다(벤더 자료이므로 신뢰도 낮음). — [HF StemSplitio](https://huggingface.co/collections/StemSplitio/music-source-separation-toolkit-2026)
- BS-RoFormer SW 6-stem(vocals/bass/drums/guitar/piano/other)은 GGUF·ONNX 비공식 변환본이 돌고 있다. 원 업스트림 공개처는 확인하지 못했다. — [HF studio409/BSRoformer-SW-6Stem-GGUF](https://huggingface.co/studio409/BSRoformer-SW-6Stem-GGUF), [ComfyUI TS_MusicStems](https://comfy.icu/node/TS_MusicStems), [openmirlab/bs-roformer-infer](https://github.com/openmirlab/bs-roformer-infer)

### Inferences
- 실무 스택 권장: **MSST(학습·추론 허브, 신규 아키텍처 가장 빠름)** 또는 **python-audio-separator(pip 한 줄, UVR 모델 자동 다운로드)**. GUI가 필요하면 UVR5 + Roformer 베타 패치를 쓴다.
- Demucs는 아카이브됐지만 MIT이고 안정적이어서 "4스템 한 번에" 용도의 폴백으로는 여전히 쓸 만하다.
- Spleeter와 Open-Unmix는 품질 면에서 은퇴로 보는 게 맞다(outdated).

### Gaps
- BS-RoFormer 논문의 MUSDB18HQ 스템별 SDR 표는 가져오지 못했다(HTML 404). (미검증/학습지식) 추가 데이터를 쓴 BS-RoFormer는 평균 약 11.99, 보컬 약 12.7 dB 수준으로 기억한다. 원문 Table 확인이 필요하다.
- starrytong/SCNet 저장소 라이선스는 확인하지 못했다.
- MSST와 python-audio-separator의 최신 릴리스·커밋 날짜는 페이지에 표시되지 않아 미확인이다.

## Q2. SDR 수치 — 보컬 최고, 악기(기타·피아노·신스) 최고는?

### Takeaway
MVSep Multisong 기준 보컬 최고는 **BS-RoFormer 계열, 약 12.3 dB**(MVSep 자체 2026 모델)이다. 공개 가중치 중에서는 viperx BS-RoFormer ep_317(파일명 SDR 12.97, 측정 세트 불명확)과 Kim/파생 Mel-RoFormer가 표준이다. 기타·피아노는 **BS-RoFormer SW**가 각각 9.05와 7.83으로 1위이고, htdemucs_6s 피아노(2.23)를 크게 앞선다. 신스·키·오르간은 MVSep에 모델은 있지만 공개 SDR이 없다.

### Cited Findings
- MVSep Multisong 보컬 SDR 상위(원본 스템 기준 행 제외): BS Roformer 124 bands 12.33(2026-07-10) / 같은 모델 High Fullness 12.31 / BS RoFormer 앙상블 12.26 / BS PolarFormer 124 bands 12.02(2026-06-13) / MVSep Ensemble 11.93(2025-06-28) / BS Roformer 11.89(2025-07-20) / sami-bytedance-v.1.1 11.82. 순위는 3시간마다 재계산되고, 지표로 SDR·SI-SDR·bleedless·fullness 등을 함께 쓴다. — [MVSep multisong leaderboard](https://mvsep.com/quality_checker/multisong_leaderboard?sort=vocals)
- 주의: 이 리더보드 값은 MUSDB18-HQ가 아니라 MVSep 자체 **Multisong** 데이터셋에서 잰 것이다. MUSDB 수치(약 9~10 dB대)와 직접 비교할 수 없다. — [같은 출처](https://mvsep.com/quality_checker/multisong_leaderboard?sort=vocals)
- 기타: BS Roformer SW(6 stems) Guitar 9.05. htdemucs_6s 기타는 "so-so"이고 수치는 없다. — [MVSep algorithms](https://mvsep.com/en/algorithms)
- 피아노(MVSEP Piano 검증셋): BS Roformer SW 7.83 > SCNet+Mel 앙상블 6.19 > SCNet Large 5.89 > MelRoformer(viperx) 5.67 > MDX23C 5.59 > Demucs4HT 6s 2.23. — [MVSep algorithms](https://mvsep.com/en/algorithms)
- 드럼(MVSEP Drums): MelBand+SCNet XL+BS SW 앙상블 14.35 > BS Roformer SW 14.11 > SCNet XL 13.42 > MelBand 12.76 > HTDemucs4 12.04. DrumSep 4스템 MelBand: kick 22.22 / snare 17.09 / toms 15.86 / cymbals 11.87. — [MVSep algorithms](https://mvsep.com/en/algorithms)
- 베이스(MVSEP Bass): SCNet XL+BS SW 14.87 > BS Roformer SW 14.62 > SCNet XL 13.81 > HTDemucs4 12.52 ≈ BS Roformer(구) 12.49. — [MVSep algorithms](https://mvsep.com/en/algorithms)
- Other: BS Roformer SW 8.71(Multisong), Demucs4 HT ft 5.74. 신스·키·오르간·로즈 모델은 MVSep에 있으나 SDR은 공개되지 않았다. — [MVSep algorithms](https://mvsep.com/en/algorithms)
- MUSDB18-HQ 학술 수치(추가 데이터 없음): htdemucs 9.00, SCNet 9.0, SCNet-large 9.69, BS-RoFormer(소형) 9.80. — [Demucs](https://github.com/facebookresearch/demucs), [SCNet](https://arxiv.org/pdf/2401.13276), [BS-RoFormer](https://arxiv.org/abs/2309.02612)

### Inferences
- 곡 분석 1단계 권장 조합: 보컬/반주 분리는 BS-RoFormer(viperx ep_317) 또는 Mel-RoFormer(Kim/becruily/gabox). 이어서 반주에서 드럼·베이스·기타·피아노를 뽑을 때는 **BS-RoFormer SW 6-stem**, 폴백은 htdemucs_ft/6s.
- MVSep 최상위 모델은 웹 서비스 전용일 가능성이 높아서, 로컬 기준 최고치는 리더보드 1위보다 약 0.3~0.5 dB 낮다고 보는 게 안전하다(추정).

### Gaps
- BS-RoFormer SW의 원 공개처와 라이선스는 미확인이다(비공식 GGUF/ONNX 페이지는 MIT 언급).
- 신스·키보드 전용 공개 모델의 SDR은 찾지 못했다.

## Q3. 라이선스(코드·가중치), 활동성, Stars

### Takeaway
코드는 대부분 MIT이다(MSST, audio-separator, Demucs, Spleeter). **가중치는 제각각**이다. Kim Mel-RoFormer는 HF에 MIT 표기, anvuew 디리버브는 **GPL-3.0**이고, 상당수 커뮤니티 가중치는 라이선스 표기가 없다. 상업적으로 쓰려면 가중치별로 확인해야 한다.

### Cited Findings
| 프로젝트 | 코드 라이선스 | Stars | 활동성 | 출처 |
|---|---|---|---|---|
| ZFTurbo/MSST | MIT | 약 1.6k | 활발(BSMamba2 2025-08 등 추가) | [GitHub](https://github.com/ZFTurbo/Music-Source-Separation-Training) |
| python-audio-separator | MIT | 약 1.4k | 활발(PyTorch 2.13+ 요구 문구) | [GitHub](https://github.com/nomadkaraoke/python-audio-separator) |
| Demucs | MIT(가중치 별도 표기 없음) | 약 10.4k | 2025-01-01 아카이브 | [GitHub](https://github.com/facebookresearch/demucs) |
| UVR5 GUI | 페이지에 표기 없음 | — | 정식 v5.6(2023 추정), Roformer 베타 패치 | [Releases](https://github.com/Anjok07/ultimatevocalremovergui/releases) |
| Spleeter | MIT | — | 마지막 push 2025-04-02 | [ecosyste.ms](https://summary.ecosyste.ms/projects/358219) |
| Kim Mel-RoFormer 가중치 | MIT(HF 표기) | — | — | [HF](https://huggingface.co/KimberleyJSN/melbandroformer) |
| anvuew dereverb Mel-RoFormer | GPL-3.0 | — | — | [HF](https://huggingface.co/anvuew/dereverb_mel_band_roformer) |
- Medley Vox(다중 가수 분리): 원저자는 가중치를 공개하지 않았다. Cyru5가 학습한 가중치를 퍼블릭 도메인으로 공개했다. — [MVSep algorithms](https://mvsep.com/en/algorithms)

### Inferences
- 내부 분석 용도(배포 안 함)라면 GPL 가중치도 문제가 적다. 분석 결과물을 앱에 내장해 배포한다면 GPL과 미표기 가중치는 피하는 게 맞다.

### Gaps
- UVR5 GUI 코드 라이선스(저장소 LICENSE, 학습지식으로는 MIT로 기억)는 이번 조사에서 확인하지 못했다.
- viperx BS-RoFormer, becruily/gabox/unwa 가중치의 라이선스는 미확인이다.

## Q4. Windows + RTX 4070 Ti 12GB에서의 요구사항, 설치 난이도, 속도

### Takeaway
12GB VRAM이면 Demucs와 RoFormer 추론 모두 충분하다(Demucs 기본값 약 7GB). 가장 쉬운 경로는 **UVR5 exe(C: 드라이브 설치 권장) + Roformer 베타 패치**, 스크립트화에는 **`pip install "audio-separator[gpu]"`**가 좋다. RTX 기준 곡당 처리 시간의 공식 벤치마크는 찾지 못했다.

### Cited Findings
- audio-separator GPU 설치: `pip install "audio-separator[gpu]"`. CUDA 11.8/12.2를 지원하고, `--env_info`로 가속 여부를 확인한다. torch와 onnxruntime-gpu를 재설치해야 할 수 있고, ONNX Runtime 때문에 CUDA 11 라이브러리를 함께 깔아야 하는 경우도 있다. FFmpeg는 별도로 설치한다. 긴 파일은 `--chunk_duration`. DirectML에서는 Roformer가 CPU로 폴백한다(NVIDIA에는 무관). — [GitHub audio-separator](https://github.com/nomadkaraoke/python-audio-separator)
- UVR5 v5.6: Windows 10 이상, **C:\ 드라이브에 설치하라는 권고**(보조 드라이브는 불안정). 앱 내 업데이트와 패치 설치가 가능하다. — [UVR releases](https://github.com/Anjok07/ultimatevocalremovergui/releases)
- Demucs: GPU RAM 최소 3GB, 기본 인자로 약 7GB. 메모리가 부족하면 `--segment 8`이나 `PYTORCH_NO_CUDA_MEMORY_CACHING=1`. HT 모델의 segment 상한은 7.8초이다. htdemucs_ft는 htdemucs보다 4배 느리다. — [GitHub demucs](https://github.com/facebookresearch/demucs)
- Mel-RoFormer 기본 chunk는 352800 샘플(8초, 학습 길이와 같음)이다. num_overlap을 올리면 경계 아티팩트는 줄지만 시간이 늘고, 8을 넘길 필요는 없다. README의 "40GB GPU 필요"는 학습 기여 섹션에 있는 문구라 추론 요구사항이 아닐 가능성이 크다. — [Mel-Band-Roformer-Vocal-Model 미러](https://forgejo.us2.navan.dev/github/Mel-Band-Roformer-Vocal-Model)
- SCNet의 CPU 추론 시간은 HT Demucs의 48%이다. — [arXiv 2401.13276](https://arxiv.org/pdf/2401.13276)

### Inferences
- 4070 Ti 12GB에서는 Mel/BS-RoFormer(약 228M 파라미터 급) fp16/fp32 추론이 기본 chunk(8초)로 무리 없이 돈다고 판단한다. 곡당 대략 수십 초~1분대로 추정하지만 실측이 필요하다.
- ollama나 ComfyUI와 VRAM 경합이 생기므로(사용자 로컬 환경 메모) 분리 작업 중에는 다른 GPU 프로세스를 내려 두는 게 좋다.

### Gaps
- RTX 40 시리즈에서 곡당 처리 시간과 피크 VRAM을 잰 신뢰할 만한 공개 벤치를 찾지 못했다. 직접 실측해야 한다(num_overlap 2와 8 비교, nvidia-smi 피크 기록).

## Q5. 리드/백킹 보컬, 디리버브·디에코, 카라오케 모델

### Takeaway
리드/백킹 분리는 **BS-RoFormer 카라오케 모델**이 최고이고(MVSep 팀 모델 리드 10.41), 공개 가중치로는 anvuew BS-RoFormer(10.22), frazer & becruily(10.10), gabox/becruily/aufr33&viperx Mel-RoFormer(9.4~9.85)가 있다. UVR VR 카라오케(6.4~6.7)와 MDX-B Karaoke(8.28)는 구세대이다. 디리버브는 anvuew Mel-RoFormer 3종(GPL-3.0)이 대표적이다.

### Cited Findings
- MVSEP Karaoke 리드 SDR: BS Roformer(MVSEP Team) 10.41(백킹 6.61, 백킹+반주 15.72) / BS Roformer(@anvuew) 10.22 / BS Roformer(@frazer & becruily) 10.10 / MelBand(gabox + aufr33/viperx 퓨즈) 9.85 / MelBand(gabox) 9.67 / MelBand(becruily) 9.61 / SCNet XL IHF(becruily) 9.53 / MelBand(aufr33 & viperx) 9.45 / MDX-B Karaoke 8.28 / UVR karokee_4band_v2_sn 6.72 / UVR HP-KAROKEE-MSB2 6.42. — [MVSep algorithms](https://mvsep.com/en/algorithms)
- 카라오케 체크포인트 파일명 예: `mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt`. UVR5_UI(HF Space) 모델 목록에 gabox·becruily 카라오케 모델도 있다. — [HF UVR5_UI discussion](https://huggingface.co/spaces/TheStinger/UVR5_UI/discussions/18/files)
- python-audio-separator에는 `UVR_MDXNET_KARA_2.onnx`와 `karaoke` 앙상블 프리셋(리드 제거)이 있다. — [GitHub audio-separator](https://github.com/nomadkaraoke/python-audio-separator)
- anvuew dereverb Mel-RoFormer(GPL-3.0, MSST용, Kim 모델에서 파인튜닝)는 세 가지이다.
  - sdr_19.1729: 리버브-보컬 정렬 버그가 있다. 잔여 악기(현악)나 비중앙 하모니를 지우는 능력이 남아 있다.
  - less_aggressive 18.8050: 스테레오나 레이어 보컬용이다.
  - mono 20.4029: 버그를 고쳐 디리버브가 강하지만, 잔여물과 하모니 제거는 약하다.
  - 학습 dry 보컬이 모노·단일 가수라서 출력이 모노 쪽으로 치우친다.
  — [HF anvuew/dereverb_mel_band_roformer](https://huggingface.co/anvuew/dereverb_mel_band_roformer)
- anvuew는 `deverb_bs_roformer`도 공개했다. — [HF anvuew activity](https://huggingface.co/anvuew/activity/all)
- UVR VR 아키텍처 세트에 리버브 제거 모델이 있지만 SDR은 공개되지 않았다. — [MVSep algorithms](https://mvsep.com/en/algorithms)
- 다중 가수 분리는 Medley Vox(Cyru5 가중치, 퍼블릭 도메인)를 쓴다. — [MVSep algorithms](https://mvsep.com/en/algorithms)

### Inferences
- 곡 분석 파이프라인 예시: 원곡 → [보컬 RoFormer] → 보컬 / 반주. 보컬은 → [카라오케 BS-RoFormer(anvuew 또는 becruily)] → 리드 / 백킹으로, 리드는 → [anvuew dereverb] → 드라이 리드로 처리한다. 반주는 → [BS-RoFormer SW 6-stem] → 드럼 / 베이스 / 기타 / 피아노 / 기타(other)로 나눈다.
- 디에코(딜레이) 전용 RoFormer 모델의 정량 비교 자료는 없다. UVR-De-Echo(VR) 계열이 여전히 쓰이는 것으로 보인다(미검증).

### Gaps
- 디에코 전용 모델(UVR-DeEcho-DeReverb 등)의 SDR이나 비교 자료를 찾지 못했다.
- 카라오케 공개 가중치(anvuew·becruily·gabox)의 라이선스는 미확인이다.
- SDX(Sound Demixing Challenge) 2025/2026 개최 여부와 결과는 이번 조사에서 확인하지 못했다.
