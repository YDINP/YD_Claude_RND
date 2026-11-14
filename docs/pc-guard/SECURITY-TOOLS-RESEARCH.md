# pc-guard 주변 보안 도구 리서치 (2026-11-14)

`OSS-RESEARCH.md`에 이미 있는 것(gitleaks 규칙, HardeningKitty, autorunsc, SigmaHQ, Sysmon, Hayabusa, Chainsaw, windows-rs, evtx, sigma-rust, age, DPAPI)은 뺐다.
확인 못 한 사실은 "미확인"으로 적었다. 블로그 한두 곳에서만 본 내용은 "신뢰도 낮음"으로 표시했다.

## 요약: 범주별 1순위

| 범주 | 1순위 | 비고 |
|---|---|---|
| JS 공급망 | npm·pnpm 설치 스크립트 차단 (`.npmrc`의 `ignore-scripts=true`) | 버전별 기본값은 미확인 |
| Rust 공급망 | cargo-deny + cargo-vet | pc-guard 자체 CI에 바로 적용 가능 |
| Python 공급망 | pip-audit + uv `UV_MALWARE_CHECK=1` | uv 쪽은 preview 기능 |
| 비밀값 커밋 차단 | (gitleaks 있음) + ggshield 교차 검사 | ggshield는 클라우드 API 호출 |
| .env 대체 | sops + age | 1인 사용자에겐 P5 DPAPI 단독이 더 간단할 수 있음 |
| MCP 보안 | mcp-scan (Invariant Labs) | 도구 설명을 수집한다는 조항 있음 |
| Claude Code 권한 | 공식 샌드박스 + settings.json 거부 규칙 | 실제로 막히는지 직접 시험 필요 |
| Windows | 네이티브 Sysmon (KB5077241) 검토 | 활성화 절차·정식 배포 여부 미확인 |
| P4 크레이트 | windows-registry / schannel / notify | 지금은 PowerShell 수집으로 충분 |
| P5 | 새로 쓸 크레이트 없음 | 기존 계획(DPAPI + age 백업) 유지 |

## 1. 공급망 방어

### JS/Node
| 이름 | 라이선스 | 용도 | 우리 쓰임 | 주의 |
|---|---|---|---|---|
| 설치 스크립트 차단 (`ignore-scripts`, `pnpm approve-builds`) | npm/pnpm 자체 | `postinstall` 자동 실행 차단. 최근 npm 웜 사건의 주 통로 | 전역 `.npmrc`에 넣고, 꼭 필요한 패키지만 수동 승인 | 우회 사례 보고("PackageGate") 있음, 상세 미확인 |
| Socket Firewall (`sfw`) — socket.dev | PolyForm Shield 1.0.0 (OSI 오픈소스 아님) | 설치 순간 악성 패키지를 프록시에서 차단. npm 외 Python·Rust 지원 설명 있음 | 설치 명령을 `sfw` 경유로 | 무료 범위 미확인, AI 판정이라 오탐·누락 가능 |
| pkgxray / safeinstall-cli | 미확인 | 설치 전 1회 위험 스캔 | 보조용 | 신뢰도 낮음 |

### Rust
| 이름 | 용도 | 우리 쓰임 | 주의 |
|---|---|---|---|
| cargo-deny (EmbarkStudios) | 라이선스·보안 공지·금지 크레이트·허용 출처 검사 | pc-guard에 `cargo deny check` | `deny.toml` 작성 필요. 라이선스·버전 미확인 |
| cargo-vet (Mozilla) | 의존성을 사람이 검토했는지 기록, Mozilla·Google 감사 가져오기 | 새 의존성 추가 때 | 1인 프로젝트엔 부담 |
| cargo-auditable (v0.7.5, 2026-05) | 바이너리에 의존성 목록을 심어 배포 후 스캔 | 릴리스 빌드에 | 공격 자체는 못 막음(공식 문서) |

### Python
| 이름 | 라이선스 | 용도 | 주의 |
|---|---|---|---|
| pip-audit (PyPA) | Apache-2.0 | 알려진 취약점(CVE) 검사 | 새 악성 패키지는 못 잡음 |
| uv `UV_MALWARE_CHECK=1` | MIT/Apache | 설치 시 악성 공지 조회 후 중단 | preview 기능, 공식 문서 대조 필요(신뢰도 낮음) |

## 2. 비밀값 관리
| 이름 | 라이선스 | 용도 | 우리 쓰임 | 주의 |
|---|---|---|---|---|
| ggshield (GitGuardian) | 미확인, CLI 무료 등급 | 커밋 전 훅 + CI 비밀값 검사 | gitleaks와 다른 규칙으로 교차 확인 | 클라우드 API로 보냄 → 민감하면 gitleaks 우선 |
| SOPS | MPL-2.0, CNCF Sandbox | `.env`를 암호화해 커밋 가능하게 | P5의 age 백업 형식 참고 | 팀용 기능이라 1인에겐 과함 |
| sopsy (Rust) | 미확인 | sops/age 감싼 CLI | 참고만 | 외부 바이너리 필요 |
| 1Password CLI (`op run`) | 유료 | 실행 시 환경변수 주입 | 참고만 | 구독 필요 |
| Bitwarden CLI | GPL-3.0, 무료 개인 플랜 | 비밀값 보관 | 실행 시 주입 기능이 공식으로 없음 | P5가 더 맞음 |

## 3. AI 에이전트 · Claude Code · MCP
| 이름 | 용도 | 우리 쓰임 | 주의 |
|---|---|---|---|
| mcp-scan (Invariant Labs) | MCP 도구 설명 속 숨은 지시(tool poisoning), 몰래 바뀐 도구(rug-pull) 탐지 | 등록된 MCP 서버(playwright-b, context7, serena 등) 주기 점검 | README에 도구 설명·변경 이력을 연구용으로 수집한다고 적혀 있음. 외부 기여 중단 |
| agent-audit (npm) | 도구 설명의 지시 덮어쓰기, 폭 0 문자, 명령 주입, 하드코딩 비밀값 탐지 | mcp-scan 교차 확인 | 관리자 불명확, 신뢰도 낮음 |
| OWASP MCP Security Cheat Sheet | MCP 서버마다 서로 믿지 않는 영역으로 다루라는 원칙과 공격 분류 | MCP 구성 점검표 | 신뢰도 높음 |
| Claude Code 공식 샌드박스 (code.claude.com/docs/en/sandboxing) | Bash 쓰기 범위를 작업 폴더로, 네트워크는 허용 도메인만 | `sandbox.enabled` + `.env`·`secrets/**` 읽기 거부 규칙 | 거부 규칙에도 `.env`가 읽혔다는 커뮤니티 보고(미확인) → 직접 시험 |
| anthropics/claude-code-security-review | PR 단위 AI 보안 리뷰 GitHub Action (MIT) | — | README가 "믿을 수 없는 PR엔 쓰지 말라"고 경고 |

### Claude Code 권한 원칙
- 권한 규칙은 거부 → 확인 → 허용 순으로 평가된다. 좁은 거부가 넓은 허용보다 먼저다.
- Bash 샌드박스와 Read/Write 도구의 파일 규칙은 별개다. 한쪽만 막으면 다른 쪽으로 읽힐 수 있다는 지적이 있다(미확인). 둘 다 적어야 한다.
- PreToolUse 훅으로 `.env` 읽기·`sudo`·`npx`/`uvx` 실행을 막는 방식이 여러 곳에서 쓰인다. 남이 만든 훅은 그대로 설치하지 말고 직접 쓴다. (이 PC는 이미 저장소 시크릿 가드 훅을 쓰고 있음)

## 4. Windows
| 이름 | 용도 | 우리 쓰임 | 주의 |
|---|---|---|---|
| 네이티브 Sysmon (KB5077241, 2026-02 Preview, Win11 24H2/25H2) | 드라이버를 따로 설치하지 않고 OS 내장 Sysmon을 켬 | 프로세스 생성·네트워크 이벤트를 P4에 더할 수 있는지 재검토 | 기본 꺼짐, 정식 배포·활성화 절차 미확인. 기존 Sysmon과 같이 쓰지 말 것 |
| Windows-Optimize-Harden-Debloat (MIT) | 자동 하드닝·불필요 기능 제거 스크립트 | `pcg check` 개선 항목 참고 | 되돌리기 어려운 항목 있음. 코드 말고 항목만 참고 |
| 인포스틸러 탐지 글 (Decryption Digest, Security Arsenal) | 브라우저가 아닌 프로세스가 Chrome `Login Data`/`Cookies`를 여는 것 = ATT&CK T1555.003 | P3 미끼 감시를 실제 브라우저 자격증명 파일로 넓히는 근거 | 백신·동기화 프로그램 등 오경보 많을 것 → 허용 목록 필요 |

## 5. P4/P5용 Rust 크레이트
| 이름 | 라이선스 | 용도 |
|---|---|---|
| windows-registry 0.6.1 | MIT/Apache | windows-rs 공식 레지스트리 크레이트. Run 키·프록시 읽기 |
| winreg 0.56 | MIT | 레지스트리 대안 |
| planif 1.0.0 | 미확인 | 작업 스케줄러 API 감싸기. 유지보수 미확인 |
| query-wmi | 미확인 | WMI로 예약 작업·서비스 조회 |
| schannel 0.1 | MIT | 인증서 저장소(ROOT) 열람 |
| notify 8.x | 미확인 | 파일 변경 이벤트. hosts는 교체 방식으로 쓰이면 이벤트가 다르게 올 수 있음 |

P4는 지금 PowerShell 한 번 호출로 수집한다(약 7초, 5분마다). 수집이 느려지거나 PowerShell 의존을 없애고 싶을 때 위 크레이트로 바꾼다.

## pc-guard에 반영할 후보
1. **브라우저 자격증명 파일 감시** (P3 확장): Chrome·Edge `Login Data`/`Cookies`에 SACL을 걸고, 브라우저 자신·백신이 아닌 프로세스가 열면 알림. 미끼보다 직접적이다. 오경보 허용 목록이 관건.
2. **`pcg check`에 공급망 항목 추가**: 전역 `.npmrc`의 `ignore-scripts`, uv 악성 검사 설정 여부를 점수에 넣기.
3. **MCP 서버 점검**: mcp-scan을 가끔 수동 실행(수집 조항 확인 후).
4. **pc-guard 자체 CI**: cargo-deny.

## 미확인 목록
- Socket Firewall 무료 범위, cargo-deny·cargo-vet 라이선스와 최신 버전
- Claude Code 거부 규칙이 `.env` 읽기를 실제로 막는지
- 네이티브 Sysmon 정식 배포 여부와 활성화 절차
- notify의 hosts 변경 감지 동작
- planif, query-wmi, agent-audit 유지보수 상태
