# ArcaneCollectors - 코드베이스 구조

## 프로젝트 루트
```
ArcaneCollectors/
├── index.html          # HTML 진입점
├── package.json        # npm 패키지 설정
├── vite.config.js      # Vite 빌드 설정 (port 3000)
├── .env / .env.example # 환경 변수
├── dist/               # 빌드 출력
├── public/             # 정적 자산
├── docs/               # 문서 (dev-logs, workers 가이드)
├── n8n/                # n8n 이미지 생성 워크플로우 JSON
├── supabase/           # Supabase 마이그레이션 SQL
└── src/                # 소스 코드
```

## src/ 구조
```
src/
├── main.js              # 진입점 - Phaser.Game 초기화
├── api/                 # 외부 API 클라이언트
│   ├── supabaseClient.js   # Supabase 연결 (오프라인 폴백 지원)
│   └── pexelsClient.js     # Pexels 이미지 API
├── config/              # 게임 설정
│   ├── gameConfig.js       # Phaser 설정, 색상, 상수, 등급, 교단 등
│   └── layoutConfig.js     # UI 레이아웃 수치
├── data/                # JSON 게임 데이터
│   ├── index.js            # 데이터 접근 함수 모듈 (barrel export)
│   ├── characters.json     # 영웅 데이터 (39개)
│   ├── skills.json         # 스킬 데이터
│   ├── stages.json         # 스테이지/챕터 데이터
│   ├── enemies.json        # 적 데이터
│   ├── equipment.json      # 장비 데이터
│   ├── items.json          # 아이템 데이터
│   ├── banners.json        # 가챠 배너 데이터
│   ├── quests.json         # 퀘스트 데이터
│   ├── synergies.json      # 시너지 데이터
│   ├── tower.json          # 무한의 탑 데이터
│   ├── cults.json          # 교단 데이터
│   └── personalities.json  # 성격 데이터
├── scenes/              # Phaser Scene 클래스들
│   ├── BootScene.js        # 초기화, 세이브 로드
│   ├── PreloadScene.js     # 에셋 프리로드
│   ├── MainMenuScene.js    # 메인 메뉴
│   ├── GachaScene.js       # 가챠(소환) 화면
│   ├── HeroListScene.js    # 영웅 목록
│   ├── HeroDetailScene.js  # 영웅 상세
│   ├── StageSelectScene.js # 스테이지 선택
│   └── BattleScene.js      # 전투 화면
├── systems/             # 게임 로직 시스템 (클래스 기반)
│   ├── index.js            # 시스템 barrel export (싱글톤 인스턴스)
│   ├── EventBus.js         # 커스텀 이벤트 시스템
│   ├── SaveManager.js      # 저장/로드 (LocalStorage)
│   ├── GachaSystem.js      # 가챠 로직 (천장/픽업)
│   ├── BattleSystem.js     # 전투 로직
│   ├── PersonalitySystem.js# 성격 상성 시스템
│   ├── SynergySystem.js    # 시너지 보너스
│   ├── EquipmentSystem.js  # 장비 관리
│   ├── EnergySystem.js     # 에너지 시스템
│   ├── SweepSystem.js      # 소탕 시스템
│   ├── TowerSystem.js      # 무한의 탑
│   ├── EvolutionSystem.js  # 진화/성급 시스템
│   ├── ProgressionSystem.js# 레벨/경험치
│   ├── QuestSystem.js      # 퀘스트
│   ├── CouponSystem.js     # 쿠폰 코드
│   ├── PartyManager.js     # 파티 편성
│   └── DebugManager.js     # 디버그 도구
├── services/            # Supabase 연동 서비스 (함수 기반)
│   ├── AuthService.js      # 인증
│   ├── PlayerService.js    # 플레이어 데이터
│   ├── HeroService.js      # 영웅 CRUD
│   ├── GachaService.js     # 가챠 API
│   ├── StageService.js     # 스테이지
│   ├── PartyService.js     # 파티
│   └── InventoryService.js # 인벤토리
├── components/          # UI 컴포넌트 (Phaser GameObjects 기반)
│   ├── index.js            # barrel export
│   ├── Button.js           # 커스텀 버튼
│   ├── Panel.js            # 패널
│   ├── TopBar.js           # 상단 바 (재화 표시)
│   ├── BottomNav.js        # 하단 네비게이션
│   ├── HeroCard.js         # 영웅 카드
│   ├── ProgressBar.js      # 진행 바
│   ├── StarRating.js       # 별점
│   ├── Modal.js            # 모달 다이얼로그
│   ├── StatBar.js          # 스탯 바
│   ├── EnergyBar.js        # 에너지 바
│   ├── Toast.js            # 토스트 알림
│   └── battle/             # 전투 전용 UI 컴포넌트
│       ├── index.js
│       ├── SkillCard.js
│       ├── SynergyDisplay.js
│       └── TurnOrderBar.js
└── utils/               # 유틸리티
    ├── constants.js        # 게임 상수 (LAYOUT, BATTLE, GACHA 등)
    ├── helpers.js          # 헬퍼 함수
    ├── animations.js       # 애니메이션 유틸
    ├── drawUtils.js        # 그래픽 유틸
    └── textStyles.js       # 텍스트 스타일 프리셋
```

## 주요 아키텍처 패턴
- **Scene 기반**: Phaser.Scene을 상속한 각 화면
- **Systems**: 게임 로직을 독립적 시스템 클래스로 분리
- **Services**: Supabase와 통신하는 서비스 레이어 (함수 기반 export)
- **Components**: Phaser.GameObjects.Container를 상속한 재사용 UI 컴포넌트
- **Data**: JSON 파일 + index.js 접근 함수
- **EventBus**: 커스텀 Pub/Sub 이벤트 시스템으로 시스템간 통신
