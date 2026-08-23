#!/usr/bin/env node
// PreToolUse 가드: 자격증명 파일이 외부 모델로 전송되는 것을 차단.
// .claudeignore는 Claude Code가 읽지 않으므로(2026-08-23 바이너리 검증) 이 훅이 실질 방어선이다.
// ---- 게이트: 외부/프록시 프로바이더로 실행 중일 때만 작동 ----
// 정상 claude.ai / api.anthropic.com 세션은 ANTHROPIC_BASE_URL 이 없거나 anthropic.com 호스트.
// fcc-claude(Ox Alpha 등)는 로컬 프록시(127.0.0.1:8082)로 ANTHROPIC_BASE_URL 을 반드시 설정한다.
// 명시적 오버라이드: GUARD_SECRETS=on(강제 작동) / off(강제 통과).
function shouldEnforce() {
  const ov = (process.env.GUARD_SECRETS || "").toLowerCase();
  if (ov === "on" || ov === "1" || ov === "true") return true;
  if (ov === "off" || ov === "0" || ov === "false") return false;
  const base = process.env.ANTHROPIC_BASE_URL || "";
  if (!base) return false;                 // 정상 세션 → 통과
  try {
    const host = new URL(base).hostname.toLowerCase();
    if (host === "anthropic.com" || host.endsWith(".anthropic.com")) return false; // 공식 API
  } catch { /* 파싱 실패 시 아래로 → 외부로 간주해 작동 */ }
  return true;                             // 외부/프록시(FCC 등) → 작동
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  if (!shouldEnforce()) process.exit(0);
  let ev;
  try { ev = JSON.parse(raw); } catch { process.exit(0); }

  // 역슬래시를 슬래시로 정규화해 Windows 경로도 동일 규칙으로 검사
  const hay = JSON.stringify(ev.tool_input || {}).split("\\").join("/");

  const ALLOW = [
    /\.env\.example/i,
    /\.env\.sample/i,
    /\.env\.template/i,
  ];
  if (ALLOW.some((p) => p.test(hay)) && !/\.env["'\s/]/i.test(hay.replace(/\.env\.(example|sample|template)/gi, ""))) {
    process.exit(0);
  }

  const DENY = [
    /(^|[/."'\s=])\.env($|[."'\s/])/i,
    /n8n[-_](workflow|patch|verify)/i,
    /cookie\.txt/i,
    /credentials?\.(json|ya?ml|txt)/i,
    /service-account[^"]*\.json/i,
    /\.(pem|p12|pfx)($|["'\s])/i,
    /id_(rsa|ed25519)/i,
    /\.claude\/\.credentials/i,
    /\.fcc\/\.env/i,
    /\/\.(aws|ssh)\//i,
  ];

  const hit = DENY.find((p) => p.test(hay));
  if (!hit) process.exit(0);

  console.error(
    "[guard-secrets] 자격증명 접근 차단 (패턴 " + hit + ").\n" +
    "이 저장소는 외부 프로바이더 모델로 실행 중일 수 있어 비밀 파일 접근을 금지합니다.\n" +
    "필요하면 .claude/hooks/guard-secrets.js 를 수정하거나 훅을 일시 해제하세요."
  );
  process.exit(2);
});
