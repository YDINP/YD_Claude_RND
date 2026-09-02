# @tgslot/game-sdk

게임 팩과 허브 사이의 계약. 타입과 manifest 스키마만 있고 실행 코드는 없다.

| export | 하는 일 |
|---|---|
| `GameManifestSchema` / `parseGameManifest` | `games/<id>/manifest.json` 검증 |
| `toGameSummary(manifest)` | 로비 카드용 요약(`@tgslot/shared`의 `GameSummary`)으로 변환 |
| `GameContext` | 허브가 게임에 주입하는 실행 컨텍스트 (지갑 읽기, spin API, 오디오, 햅틱, i18n, 트래킹) |
| `GameClient` | 게임 팩의 선택적 `client.ts`가 default export 하는 인터페이스 |
| `Signal<T>` | 프레임워크 중립 구독 값. React 의존 없음 |

게임은 **지갑을 직접 만지지 않는다**. 잔액은 읽기 전용이고 스핀 결과는 서버가 준 것만 쓴다.

`loadGamePack(dir)`은 Phase 2에서 추가한다.
