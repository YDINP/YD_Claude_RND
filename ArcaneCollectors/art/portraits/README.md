# 포트레이트 아트 관리 폴더

라이브 에셋(`public/assets/characters/portraits/hero_XXX.png`)과 분리해 후보·선정본·컨택트 시트를 관리한다.
루트 .gitignore가 `ArcaneCollectors/`를 무시하므로 이 폴더의 PNG는 git에 올라가지 않는다(의도된 동작 — 대용량 후보는 로컬 보관).

| 폴더 | 용도 |
|---|---|
| `candidates/<날짜>_<모델해상도>/` | 생성 스크립트(`tools/portraits/generate-portraits.mjs --out ... --variants N`) 출력. `hero_XXX_vN.png` |
| `sheets/` | 후보 비교용 컨택트 시트 |
| `selected/` | 채택본(라이브 반영 전 원본 1024px 보관). 라이브 반영은 여기서 `public/.../portraits/hero_XXX.png`로 복사 |

## 배치 이력
- 2026-09-02 `candidates/2026-09-02_nova1024`: novaAnimeXL_ilV190, 1024×1024, 28 steps, cfg 6.0, 34캐릭터 × 2시드. 프롬프트에서 "gacha game card art"/프레임 유도 키워드 제거(기존 768px본의 카드 프레임·깨진 글자 문제 해결).
- 2026-09-03 `gen/portraits_crop`(hero_005~038, 34장, 512×512): 사용자 피드백("아이리스 초상화랑 전체샷이 다르다")에 대응. 별도 생성한 초상화가 아니라 전신 시트에서 얼굴을 크롭 + 교단색 배경을 합성해 정체성을 100% 일치시켰다. 기존 채택본(2026-09-02)은 `selected/`에 그대로 보존. 라이브 반영은 `portraits@2x/`에 크롭본을 덮어쓰고 `build-runtime-portraits.py`로 512 WebP를 재굽는 방식.
