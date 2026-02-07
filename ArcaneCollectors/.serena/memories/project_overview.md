# ArcaneCollectors - 프로젝트 개요

## 목적
서브컬처 스타일의 방치형(Idle) 수집 RPG 웹 게임.
각 신화(발할라, 타카마가하라, 올림푸스, 아스가르드, 요미)의 영웅을 가챠로 수집하고,
파티를 편성하여 스테이지 전투, 무한의 탑 등을 진행하는 게임.

## 기술 스택
- **언어**: JavaScript (ES Modules, `.js`)
- **게임 엔진**: Phaser 3 (v3.80.1)
- **빌드 도구**: Vite 5
- **백엔드/DB**: Supabase (PostgreSQL + Auth + Realtime)
- **이미지 API**: Pexels API (캐릭터 이미지 생성용, 선택사항)
- **이미지 생성 워크플로우**: n8n (Huggingface, Fooocus API 등)
- **패키지 관리**: npm

## 게임 해상도
- 720 x 1280 (세로 모바일 비율 9:16)
- Phaser.Scale.FIT + CENTER_BOTH

## 환경 변수 (.env)
- `VITE_SUPABASE_URL` - Supabase URL
- `VITE_SUPABASE_ANON_KEY` - Supabase Anonymous Key
- `VITE_PEXELS_API_KEY` - Pexels API Key (선택)

## 현재 버전
- v5 통합 완료 (2025-02-04 기준)
- 빌드 성공 상태
- 영웅 39/81개 구현, 나머지 콘텐츠 진행 중

## 개발 팀 구성 (docs/TEAM_COMPOSITION.md)
- 8팀, 63개 TASK (P0:16, P1:27, P2:15, P3:5)
- TEAM A: 전투 통합 (8), B: 신규 씬 (7), C: 데이터/백엔드 (7)
- TEAM D: QA (5), E: 캐릭터 데이터 (8), F: 씬/패널 검증 (10)
- TEAM G: 치트 API (10), H: 디자인/에셋 (8)

## 주요 이슈
- systems/index.js: 17개 중 4개만 export
- DebugManager: require() 사용 (ES Module 호환 불가)
- data/index.js: Element 함수 잔존, Personality 함수 없음
- getSummonRates(): SSR 3% (PRD 기준 1.5%)
- StageSelectScene: 3x10 하드코딩 (stages.json 5x5 무시)
- BattleScene: 별점 3 하드코딩, PersonalitySystem 미연결

## 핵심 게임 시스템
- **가챠 시스템**: 천장(90회 SSR보장)/픽업 배너, N/R/SR/SSR 등급
- **성격 시스템**: brave/cunning/calm/wild/mystic (속성 대체)
- **교단(Cult) 시스템**: 5개 신화 진영
- **전투 시스템**: 턴제 자동 전투, 스킬 차지, 상성
- **에너지 시스템**: 5분당 1 회복, 스테이지 입장 비용
- **소탕(Sweep) 시스템**: 3성 클리어 스테이지 자동 반복
- **무한의 탑**: 층별 전투, 보상, 시즌
- **장비 시스템**: weapon/armor/accessory/relic
- **시너지 시스템**: 교단/성격 조합 보너스
- **퀘스트 시스템**: 일일/주간/업적
- **저장 시스템**: LocalStorage 기반 (Supabase 온라인 동기화 가능)
