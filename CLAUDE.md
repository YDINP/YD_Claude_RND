# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language Preference

- Respond in Korean (한국어로 응답할 것)

## Project Overview

This is the YD_Claude_RND repository. Project details and architecture will be documented here as the codebase develops.

### Current Project: SubwayMate
- **Description**: 수도권 지하철 실시간 위치 기반 도착 알림 서비스
- **Platform**: Android (Kotlin + Jetpack Compose)
- **Docs**: `docs/PRD.md`, `docs/tasks.json`
- **Source**: `SubwayMate/` (Android 프로젝트)

## Build and Development Commands

```bash
# Android 빌드 (SubwayMate 폴더에서)
./gradlew assembleDebug
./gradlew assembleRelease

# 테스트 실행
./gradlew test
./gradlew connectedAndroidTest

# Lint 검사
./gradlew lint
./gradlew ktlintCheck
```

## Architecture

- **Architecture Pattern**: MVVM + Clean Architecture
- **DI**: Hilt
- **UI**: Jetpack Compose
- **Network**: Retrofit2 + OkHttp
- **Local DB**: Room
- **Async**: Kotlin Coroutines + Flow
