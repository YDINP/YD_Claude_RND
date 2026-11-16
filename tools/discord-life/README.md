# 페이퍼닥 디스코드 「생활」 카테고리 게시

- 서버: 페이퍼닥 · 봇: PaperDocBoard (그랜트보드 봇, 관리자 권한)
- 채널: 생활 > `#핫딜`, `#유용정보` — 팀원은 읽기·반응만, 글은 봇만 (`setup.mjs`)
- 토큰: `grantboard/.dev.vars` 에서 읽음. 출력·커밋 금지
- `state.json`: 채널 ID, 올린 글 ID(중복 방지), 고정 목차 메시지 ID

## 매일
```bash
node tools/discord-life/post-hotdeal.mjs            # 상위 30개: 채널엔 TOP5 요약, 스레드에 분류별 카드 4장
node tools/discord-life/post-info.mjs --n 5          # info.json 에서 아직 안 올린 것 5개 + 목차 갱신
node tools/discord-life/post-info.mjs --remind       # 마감 3일 전 항목 한 번 알림
node tools/discord-life/post-info.mjs --edit         # 이미 올린 카드를 현재 형식으로 다시 그림
```
`--dry-run` 으로 먼저 확인 가능. 텔레그램 b_s 봇 TOP50 전송은 그대로 유지.

## 유용정보 규칙
- 지역 상관없이 누구나 해당되는 것만 (경기패스·하남 시민안전보험·하머니·손목닥터 등 지역 혜택 제외)
- 한 글에 하나, 이득·대상·할 일·기한·출처. 미확인 수치는 "안내 글 기준"으로 표시
- 새 항목은 `info.json` 끝에 추가. 공고 대기: 근로자 휴가지원 2027, 숙박세일페스타 겨울편, 자동차세 연납(1월 초)

## 자동 실행 (세션 cron)
- 매일 09:37쯤 Claude 세션 cron 이 `DAILY_ROUTINE.md` 를 실행 → 수집·검수 후 10시 전후 게시
- 세션이 켜져 있어야 돎. 7일마다 루틴이 스스로 cron 을 다시 등록
- `check.mjs`: 게시 전 자동 검수 (펨코 등 봇 차단 링크는 WebFetch 눈 검수)
