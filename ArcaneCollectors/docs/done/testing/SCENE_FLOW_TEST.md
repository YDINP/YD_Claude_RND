# D-1: 씬 전환 흐름 테스트 결과

> 검증일: 2026-02-07

## 결과: PASS (15/15 씬 전환 유효)

## 씬 플로우 다이어그램

```
BootScene (2.4s splash)
  ├─ 세션 O → PreloadScene → MainMenuScene
  └─ 세션 X → LoginScene → PreloadScene → MainMenuScene

MainMenuScene (BottomNav 허브)
  ├─ ⚔️ 모험 → StageSelectScene
  │   ├─ 스테이지 선택 → BattleScene {stage, party}
  │   │   └─ 전투 종료 → BattleResultScene {victory, stars, rewards}
  │   │       ├─ 메인 → MainMenuScene
  │   │       ├─ 재시도 → BattleScene
  │   │       └─ 다음 → StageSelectScene
  │   └─ ⚡소탕 → 소탕 모달 (in-scene)
  ├─ 🎲 소환 → GachaScene
  ├─ 📦 가방 → InventoryScene
  └─ ≡ 더보기 → SettingsScene
      ├─ 퀘스트 → QuestScene
      ├─ 무한의 탑 → TowerScene → BattleScene {mode: 'tower'}
      ├─ 영웅 목록 → HeroListScene → HeroDetailScene {heroId}
      ├─ 파티 편성 → PartyEditScene
      └─ 쿠폰/사운드/리셋 (in-scene 모달)
```

## 검증 항목

| 항목 | 결과 |
|------|------|
| 깨진 링크 (미등록 씬 참조) | 0건 |
| 데이터 전달 누락 | 0건 |
| 방어 처리 (데이터 없는 씬 진입) | HeroDetailScene에서 처리됨 |
| BottomNav 일관성 | 5개 주요 씬 전부 적용 |
