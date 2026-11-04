# AI 제작 증빙 (햇반 30주년 갓 지은 AI디어)

- 응모자: 박용진 (개인)
- 생성: 2026-10-28, `gen_gpt.py` 1회 실행으로 4컷 생성. 실제 시각·세션 ID는 `생성기록.json`, 전체 세션 로그는 `raw/codex_session.jsonl`.

## 사용 AI 서비스 (폼 "AI 서비스 명칭"에 그대로 입력)
`ChatGPT 이미지 생성 (OpenAI)` — ChatGPT 계정으로 로그인한 Codex CLI의 내장 image_gen 도구로 실행(별도 API 키·건별 과금 없음, 사용자 본인 ChatGPT 요금제).
- OpenAI 이용약관상 생성물의 권리는 사용자에게 귀속되며 상업적 이용 가능(약관 "Content" 조항). 제출 전 한 번 확인 권장.
- 글자·로고는 AI 생성이 아닌 Pillow 후처리(맑은 고딕 Bold) + 주최 제공 정식 로고 PNG(`logo/logo_4x5_red-white.png`) 오버레이.
- 원본 1024x1536 → 1080x1350(4:5)로 꽉 채워 중앙 크롭.

## 컷별 기록
| 컷 | 원본 | 최종 |
|---|---|---|
| 1 | raw/cut1_raw.png | final/hetbahn30_01.png |
| 2 | raw/cut2_raw.png | final/hetbahn30_02.png |
| 3 | raw/cut3_raw.png | final/hetbahn30_03.png |
| 4 | raw/cut4_raw.png | final/hetbahn30_04.png |

## 공통 스타일 문구 (모든 컷 프롬프트 뒤에 붙음)
photorealistic editorial photograph, warm cinematic lighting, shallow depth of field, fine detail, natural skin, 35mm lens, soft rising steam. The rice container is a generic plain white microwaveable instant-rice bowl with a plain matte red film lid, absolutely no text, no logo, no label, no brand marks anywhere. Leave the top-left corner and the bottom third of the frame relatively empty and calm.

## 컷별 프롬프트 (한/영)
**컷1**
- 한: 새벽, 불 꺼진 좁은 서울 원룸. 청년이 갓 데운 즉석밥 용기 뚜껑을 열자 김이 피어오르고, 그 김 속에 시골 부엌의 따뜻한 풍경이 홀로그램처럼 비친다.
- EN: A young Korean man sits at a small table in a dim studio apartment at dawn, opening the lid of a plain white instant rice bowl; the rising steam glows amber and forms a soft holographic window showing a warm countryside kitchen in miniature.

**컷2**
- 한: 시골집 부엌. 어르신이 같은 모양의 용기를 열자 김 속에 도시 원룸의 청년이 작게 보인다. 두 김이 창가에서 하나로 이어진다.
- EN: A warm old Korean farmhouse kitchen in morning light; an elderly woman opens a plain white instant rice bowl, its steam curls and merges with a thin glowing thread of steam traveling out the window toward a distant city skyline.

**컷3**
- 한: 우주정거장 창가. 우주인이 용기를 열자 김이 무중력 속에서 둥글게 떠올라 창밖 지구와 고향의 불빛을 감싼다.
- EN: Inside a clean near-future space station cupola, an astronaut opens a plain white instant rice bowl; steam floats in zero gravity as a luminous soft cloud, framing planet Earth and city lights through the window.

**컷4**
- 한: 마무리 컷. 어두운 하늘 위 도시·시골·바다·우주 곳곳의 창문에서 올라온 따뜻한 김 줄기들이 하나의 큰 곡선으로 이어진다.
- EN: Wide dreamy night scene: many tiny lit windows of a city, a village, a ship and a space station each release a thin ribbon of warm steam that rises and weaves together into one large glowing golden curve across a deep blue sky, no text.

(정본은 `prompts.json`, 위 내용과 동일)

## 증빙 캡처 (사용자 작업 — 필수 제출물)
요강은 "AI 서비스 내 제작 과정/히스토리 캡처본"을 요구함.
1. **가장 안전한 방법:** chatgpt.com에 로그인해 컷 1개라도 위 프롬프트로 다시 생성하고 그 대화 화면을 캡처(서비스 화면이 그대로 보임). 다시 만든 결과가 더 좋으면 그걸 써도 됨.
2. 함께 첨부: `생성기록.json`, `raw/codex_session.jsonl`(Codex 실행 로그), `prompts.json`, `raw/` 원본.

(이전 ComfyUI 경로 `workflows/`, `make.py run`은 예비용으로 남겨 둠 — 실제 제출본은 GPT 생성)
