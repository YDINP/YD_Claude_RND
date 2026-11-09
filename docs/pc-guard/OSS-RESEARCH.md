# pc-guard 활용 가능 오픈소스 조사 (2026-11-09)

GitHub API·crates.io·Microsoft Learn 직접 조회 기준. 확인 못 한 것은 "미확인".

## 요약 — Phase별 1순위
| Phase | 추천 | 방식 |
|---|---|---|
| P1 비밀값 지도 | **gitleaks** `config/gitleaks.toml` (MIT) | 규칙만 가져오기 (TOML: id/regex/keywords/entropy/allowlists). Go RE2 ↔ Rust regex 호환은 전수 확인 필요 |
| P2 점검·재발급 | **HardeningKitty** 점검 목록 (MIT) + MS Security Baseline | 항목만 참고, Rust로 직접 구현 |
| P3 미끼 | **자체 구현**: SACL + 보안 이벤트 4663을 windows-rs `EvtSubscribe`로 구독 | Sysmon엔 파일 *읽기* 이벤트가 없어 P3에 쓸 수 없음 |
| P4 변경 감시 | `autorunsc` CSV 외부 호출(비OSS, 사용자 설치본) + 직접 열거, 규칙은 **SigmaHQ**(DRL 1.1) | Hayabusa(AGPL)·Chainsaw(GPL)는 링크 말고 호출만 |
| P5 보관소 | windows-rs `CryptProtectData`(사용자 범위 DPAPI) + 백업용 **age 크레이트**(MIT/Apache) | DPAPI는 PC 종속이라 복구 키는 age로 |

## 1. 비밀값 탐지 규칙
| 이름 | 저장소 | 라이선스 | 언어 | 최근 | 활용 | 주의 |
|---|---|---|---|---|---|---|
| gitleaks | github.com/gitleaks/gitleaks | MIT | Go | v8.30.1 (2026-03) | P1 규칙 가져오기 | RE2↔Rust regex 호환 미확인 |
| trufflehog | github.com/trufflesecurity/trufflehog | AGPL-3.0 | Go | v3.99.8 (2026-11) | 참고만 | 디텍터가 Go 코드, 외부 API 라이브 검증이 기본 |
| detect-secrets | github.com/Yelp/detect-secrets | Apache-2.0 | Python | v1.5.0 (2024-05) | 참고만 | 정체 |
| ripsecrets | github.com/sirwart/ripsecrets | MIT | Rust | v0.1.11 (2025-05) | "무작위일 확률" 판정 아이디어 참고 | 라이브러리 API 미확인 |
| Kingfisher | github.com/mongodb/kingfisher | Apache-2.0 | Rust | v2.17.0 (2026-11) | 규칙 포맷 참고, `kingfisher-scanner` 임베드 후보 | 라이브 검증 기본 → `--no-validate` |
| Titus | github.com/praetorian-inc/titus | Apache-2.0 | Go | 미확인 | 규칙 487개 참고 | 신생 |
| Nosey Parker | github.com/praetorian-inc/noseyparker | Apache-2.0 | Rust | 2026-04 아카이브 | 비추천 | Titus로 대체 |

## 2. Windows 지속성(시작 항목)
| 이름 | 저장소 | 라이선스 | 활용 | 주의 |
|---|---|---|---|---|
| Autoruns/autorunsc | Sysinternals | 비OSS | P4 외부 호출 `autorunsc -a * -c -h -s -m -t` (CSV·해시·서명·UTC) | 재배포 EULA 미확인 → 사용자 설치본 호출. `-v`(VirusTotal 전송) 쓰지 말 것 |
| PersistenceSniper | github.com/last-byte/PersistenceSniper | Commons Clause MIT | 60개 기법 목록 참고 | 코드 복사 금지 |
| osquery | github.com/osquery/osquery | 미확인 | 선택적 외부 도구 | 데몬 설치 필요 |
| Velociraptor | github.com/Velocidex/velociraptor | 미확인 | 참고만 | 개인 PC엔 과함 |

## 3. 카나리아
| 이름 | 라이선스 | 활용 | 주의 |
|---|---|---|---|
| Canarytokens (thinkst/canarytokens) | 미확인 | canarytokens.org 무료 토큰 사용, 자체 호스팅은 참고만 | 자체 호스팅엔 Docker·SMTP 필요 |
| OpenCanary | BSD-3 | 참고만 | 네트워크 허니팟이라 목적이 다름 |

SACL 읽기 감사엔 `SE_SECURITY_NAME` 권한(=관리자)이 필요하고 기록은 Security 로그로 간다.

## 4. 이벤트 로그 / Sysmon / Sigma
| 이름 | 라이선스 | 언어 | 최근 | 활용 | 주의 |
|---|---|---|---|---|---|
| windows-rs | Apache-2.0 (MIT 병기 미확인) | Rust | 2026-11 | P3·P4·P5 의존성 | `EvtSubscribe` feature 플래그 미확인 |
| evtx | MIT/Apache | Rust | 0.15.1 (2026-11) | 오프라인 .evtx 파서 | 실시간 구독 아님 |
| sigma-rust | MIT/Apache | Rust | 0.7.0 (2025-11) | Sigma 평가 후보 | 1.0 미만 |
| Chainsaw | GPL-3.0 | Rust | v2.17.1 (2026-10) | 외부 호출 | 링크 금지 |
| Hayabusa | AGPL-3.0 (룰 DRL) | Rust | v4.3.1 (2026-10) | 외부 호출, 이 PC 실시간 분석 가능 | 링크 금지 |
| Sysmon | 비OSS | — | 2026-09 | P4 선택(이벤트 3 네트워크, 11/29 파일 생성, 12·13 레지스트리) | 파일 읽기 이벤트 없음, 드라이버 설치 |
| sysmon-modular | MIT | XML | 2026-10 | Sysmon 도입 시 설정 1순위 | |
| SwiftOnSecurity/sysmon-config | 라이선스 없음 | XML | 2024-07 | 참고만 | 복사 금지 |
| SigmaHQ/sigma | DRL 1.1 | YAML | r2026-07-01 | P4 규칙 가져오기 | 배포 시 저자·링크·라이선스 표기 필수 |

SigmaHQ에서 브라우저 자격증명(Login Data/Cookies) 접근 탐지 룰은 찾지 못함 → **4663 기반으로 직접 작성**해야 할 가능성이 큼 (pc-guard의 차별점).

## 5. 네트워크 감시
| 이름 | 라이선스 | 활용 |
|---|---|---|
| Portmaster | GPL-3.0 | 참고만 (커널·DNS 가로채기 설치형) |
| simplewall | GPL-3.0 | 사용자가 따로 쓰는 방화벽으로 두고, pc-guard는 읽기 전용 요약만 |
| 자체 구현 | — | 프로세스별 TCP 연결 주기 폴링 + 이미지 경로·서명 → 일일 요약 (짧은 연결은 놓칠 수 있음) |

## 6. 인포스틸러 규칙
| 이름 | 라이선스 | 활용 |
|---|---|---|
| Neo23x0/signature-base | DRL 1.1 | YARA 규칙 가져오기 후보 (인포스틸러 전용 파일 미확인) |
| Yara-Rules/rules | GPL-2.0 | 비추천 (정체) |

## 7. DPAPI·비밀값 주입
| 이름 | 라이선스 | 활용 | 주의 |
|---|---|---|---|
| windows-rs `CryptProtectData` | Apache | P5 1순위 (사용자 범위) | |
| windows-dpapi 크레이트 | MIT/Apache | 후보 | 머신 범위 위주 |
| age / rage (`age` 크레이트 0.12.1) | MIT/Apache | P5 백업·이식 포맷 | |
| sops | MPL-2.0 | 값만 암호화 구조 참고 | |
| dotenvx | BSD-3 | `run --` 주입 UX 참고 | 키를 `.env.keys` 평문으로 둠 → 목표와 다름 |

## 8. 하드닝 점검
| 이름 | 라이선스 | 활용 |
|---|---|---|
| HardeningKitty | MIT | P2 점검 목록 참고 |
| MS Security Baselines | MS | 기준값 참고 (기업용이라 일부만) |
| Hardentools | GPL-3.0 | 참고만 (설정을 바꾸는 도구) |

## 라이선스 정리
- 자유롭게 사용(MIT/Apache/BSD): gitleaks, ripsecrets, Kingfisher, windows-rs, evtx, sigma-rust, age, HardeningKitty, sysmon-modular
- 표기 필수(DRL 1.1): SigmaHQ, signature-base
- 호출만(GPL/AGPL): Chainsaw, Hayabusa, Portmaster, simplewall, trufflehog
- 아이디어만: sysmon-config(라이선스 없음), PersistenceSniper(Commons Clause)

## 미확인
gitleaks 정규식 Rust 호환성 · Autoruns/Sysmon 재배포 EULA · 4663 필드·감사 정책 절차 · windows-rs EvtSubscribe feature · Hayabusa/Chainsaw 실시간 분석 명령
