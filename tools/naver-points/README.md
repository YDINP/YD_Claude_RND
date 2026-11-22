# 네이버페이 포인트 스크립트

에이전트 Chrome(CDP 9301, 프로필 contest)에서 `tools/agent-browser/cdp-run.mjs`로 실행한다. 결과는 `reports/공모전/네이버포인트_허가대기목록.md`에 날짜별 한 줄로 적는다.

| 파일 | 용도 | 실행 |
|---|---|---|
| `daily_log.mjs` | 아침 루틴: 다모앙 오늘 글 링크 + 미션 클릭. 10분 넘게 걸려 백그라운드로 | `cd tools/naver-points && DLOG=dlog_MMDD.txt timeout 1700 node ../agent-browser/cdp-run.mjs 9301 daily_log.mjs > dl_MMDD.out` |
| `live4.mjs` | 저녁 쇼핑라이브 1원 카드 (방송 뒤, 21시 무렵) | `cd tools/naver-points && timeout 1500 node ../agent-browser/cdp-run.mjs 9301 live4.mjs > live_MMDD.out` |
| `daily.mjs` | daily_log 의 옛판. live4 앞부분(공용 함수)의 원본 | — |

- 출력 파일(`*.out`, `dlog_*.txt`)은 커밋하지 않는다.
- 끝나고 남은 탭은 CDP `/json/close/<id>`로만 닫는다. Chrome 을 이미지 이름으로 종료하지 않는다.
- 2026-11-22 임시 폴더가 정리되어 스크립트가 사라진 일이 있어 이곳(D: 저장소)으로 옮겼다.
