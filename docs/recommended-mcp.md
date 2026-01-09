# 추천 MCP 서버 목록

SubwayMate Android 앱 개발에 도움이 될 MCP 서버들을 정리했습니다.

---

## 1. 필수 추천 (High Priority)

### Kotlin Android MCP Server
Android/Kotlin 개발에 특화된 31개 이상의 도구 제공

**주요 기능:**
- Gradle 빌드 및 테스트 관리
- ktlint 포맷팅
- Android Lint 분석
- Room 데이터베이스 설정
- Retrofit API 설정
- MVVM 스캐폴딩
- Jetpack Compose 생성

**설치:**
```json
{
  "mcpServers": {
    "kotlin-android": {
      "command": "npx",
      "args": ["-y", "kotlin-mcp-server"]
    }
  }
}
```

**GitHub:** https://github.com/normaltusker/kotlin-mcp-server

---

### GitHub MCP Server
PR 관리, CI/CD, 코드 리뷰 자동화

**주요 기능:**
- GitHub REST API 100개+ 도구
- 저장소 관리
- 이슈 및 PR 관리
- 코드 분석
- 워크플로우 자동화

**설치:**
```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your_token_here"
      }
    }
  }
}
```

---

### SQLite MCP Server
Room DB 개발 시 SQLite 직접 조작/테스트

**주요 기능:**
- SQLite 데이터베이스 CRUD
- 스키마 조회
- 쿼리 실행 및 결과 분석

**설치:**
```json
{
  "mcpServers": {
    "sqlite": {
      "command": "uvx",
      "args": ["mcp-server-sqlite", "--db-path", "./SubwayMate/app/databases/app.db"]
    }
  }
}
```

---

## 2. 권장 (Medium Priority)

### Context7 (이미 설치됨)
최신 라이브러리 문서 기반 정확한 코드 생성

**용도:** Jetpack Compose, Hilt, Retrofit 등 최신 버전 문서 참조

---

### Filesystem MCP Server
로컬 파일 시스템 접근 (이미 Claude Code에 내장)

**용도:** 프로젝트 파일 읽기/쓰기/편집

---

### Git MCP Server
Git 작업 자동화

**설치:**
```json
{
  "mcpServers": {
    "git": {
      "command": "uvx",
      "args": ["mcp-server-git", "--repository", "./SubwayMate"]
    }
  }
}
```

---

### Apidog MCP Server
API 문서화 및 테스트

**용도:** 서울 열린데이터광장 API 테스트 및 문서화

**설치:**
```json
{
  "mcpServers": {
    "apidog": {
      "command": "npx",
      "args": ["-y", "apidog-mcp-server"]
    }
  }
}
```

---

## 3. 선택적 (Optional)

### Playwright MCP Server
UI 테스트 자동화 (웹뷰 테스트 시)

### Semgrep MCP Server
정적 코드 분석, 보안 취약점 검사

### Figma MCP Server
디자인 협업 (디자이너와 협업 시)

---

## 4. 현재 .mcp.json 업데이트 제안

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    },
    "taskmaster-ai": {
      "command": "npx",
      "args": ["-y", "task-master-ai"],
      "env": {
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"
      }
    },
    "kotlin-android": {
      "command": "npx",
      "args": ["-y", "kotlin-mcp-server"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "sqlite": {
      "command": "uvx",
      "args": ["mcp-server-sqlite", "--db-path", "./SubwayMate/app/databases/app.db"]
    }
  }
}
```

---

## 5. MCP 없이도 가능한 대안

| 기능 | MCP 사용 | 대안 |
|------|----------|------|
| Kotlin 코드 생성 | kotlin-android MCP | Claude Code 직접 작성 |
| Git 작업 | git MCP | Bash 도구로 git 명령 실행 |
| DB 조회 | sqlite MCP | Android Studio DB Inspector |
| API 테스트 | apidog MCP | Postman, curl |

---

## 6. 설치 우선순위

1. **지금 바로**: Context7 (이미 있음), GitHub MCP
2. **프로젝트 시작 시**: Kotlin Android MCP
3. **DB 작업 시**: SQLite MCP
4. **필요 시**: Apidog, Playwright

---

## 참고 링크

- [MCP 공식 서버 목록](https://github.com/modelcontextprotocol/servers)
- [Kotlin MCP Server](https://github.com/normaltusker/kotlin-mcp-server)
- [GitHub MCP Server](https://github.com/github/github-mcp-server)
- [Awesome MCP Servers](https://github.com/punkpeye/awesome-mcp-servers)
