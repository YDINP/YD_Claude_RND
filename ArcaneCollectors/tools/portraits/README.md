# ArcaneCollectors Portrait Generator

ComfyUI API로 캐릭터 포트레이트(hero_005 ~ hero_038, 총 38장)를 일괄 생성하는 파이프라인.

## 사용법

```powershell
# 전체 38장
node generate-portraits.mjs

# 번호 범위
node generate-portraits.mjs --from 15 --to 24

# 개별 재생성 (예: 특정 캐릭터 마음에 안 들 때)
node generate-portraits.mjs --only 5
node generate-portraits.mjs --only 17,33
```

출력: `../../public/assets/characters/portraits/hero_XXX.png` (덮어쓰기)

## 서버 / 모델

| 항목 | 값 |
|---|---|
| ComfyUI 서버 | `http://127.0.0.1:8189` (D:\AI\ComfyUI2 — 로그인 플러그인 없음) |
| 비고 | 8188(D:\AI\ComfyUI)은 ComfyUI-Login 플러그인 때문에 API 인증 필요 → 8189 사용 |
| 모델 | `novaAnimeXL_ilV190.safetensors` (표준 SDXL 애니) |
| GPU | RTX 4070 Ti 12GB — 768x768 @ 25steps 약 4.5초/장 |

서버/모델 변경: `COMFY_SERVER` 환경변수 또는 `--server`, `--model` 플래그.
기타 플래그: `--width`, `--height`, `--steps`, `--cfg` (기본 768x768, 25, 6.0).

## 생성 설정

- 해상도 768x768, steps 25, CFG 6.0, sampler `dpmpp_2m` / scheduler `karras`, denoise 1.0
- Negative: `lowres, bad anatomy, bad hands, extra fingers, text, watermark, ...`
- 프롬프트 구성: 공통 스타일 prefix + 성별/클래스 + 무드 키웨드 + 외모 + 무기 + 교단별 복장/배경 + 등급(SSR/SR/R) 키워드
  - 무드/교단 키워드는 `docs/character_prompts.md` 가이드 기반
- 실패 시 alt seed로 1회 재시도, 그래도 실패하면 건너뛰고 로그에 기록

## 시드 (재현성)

시드는 캐릭터 id 문자열의 FNV-1a 해시로 고정. 같은 id는 항상 같은 시드.
재시도 시에는 `(hash + 77777) % 2147483647`.

| 파일 | 캐릭터 | seed |
|---|---|---|
| hero_005 | base_iris | 93840998 |
| hero_006 | base_sera | 1706649148 |
| hero_007 | base_luca | 205262866 |
| hero_008 | base_kai | 895027560 |
| hero_009 | base_lin | 115335496 |
| hero_010 | base_omar | 693509314 |
| hero_011 | base_sol | 1526201503 |
| hero_012 | base_hana | 1599666753 |
| hero_013 | base_leon | 510874403 |
| hero_014 | base_paolo | 804088654 |
| hero_015 | asc_iris_olympus | 1025197028 |
| hero_016 | asc_iris_valhalla | 1845502526 |
| hero_017 | asc_iris_chaos | 965684913 |
| hero_018 | asc_sera_avalon | 802970896 |
| hero_019 | asc_sera_kunlun | 374270014 |
| hero_020 | asc_sera_nature | 1009201048 |
| hero_021 | asc_luca_asgard | 1548053425 |
| hero_022 | asc_luca_tartarus | 1997218375 |
| hero_023 | asc_kai_yomi | 172941803 |
| hero_024 | asc_kai_helheim | 1456107433 |
| hero_025 | asc_lin_takamagahara | 1952467084 |
| hero_026 | asc_lin_balance | 1291902221 |
| hero_027 | asc_omar_valhalla | 663358730 |
| hero_028 | asc_omar_avalon | 1020768998 |
| hero_029 | asc_sol_nature | 1828187035 |
| hero_030 | asc_sol_kunlun | 1575106533 |
| hero_031 | asc_hana_yomi | 1400624880 |
| hero_032 | asc_hana_helheim | 1156527410 |
| hero_033 | asc_hana_chaos | 1277305050 |
| hero_034 | asc_leon_asgard | 1208903540 |
| hero_035 | asc_leon_olympus | 582502317 |
| hero_036 | asc_paolo_tartarus | 1786343189 |
| hero_037 | asc_paolo_chaos | 1331064449 |
| hero_038 | asc_paolo_balance | 1210599851 |

hero_001~004 (레거시 char_1~4)는 이 파이프라인 범위 밖 (선택 과제).

## 주의

- 8188 포트의 ComfyUI를 쓰려면 ComfyUI-Login 비밀번호가 필요 (미확인 — 8189 권장)
- `NoobAI-XL-Vpred-v1.0` 은 v-prediction 모델이라 이 워크플로우로 쓰면 안 됨
- VRAM 부족 시: `--width 512 --height 512 --steps 20`
