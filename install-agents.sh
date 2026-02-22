#!/usr/bin/env bash
# =============================================================================
# install-agents.sh — YD_Claude_RND 커스텀 에이전트 시스템 설치 스크립트
#
# 사용법:
#   bash install-agents.sh [대상폴더경로] [옵션]
#   curl -fsSL https://raw.githubusercontent.com/YDINP/YD_Claude_RND/main/install-agents.sh | bash
#
# 옵션:
#   --force       기존 설치 강제 덮어쓰기
#   --copy        YD_Claude_RND 하위여도 복사 모드 강제 사용
#   --no-claude   CLAUDE.md 생성 스킵
#   --dry-run     실제 파일 변경 없이 수행 내용만 출력
#   --help        이 도움말 출력
# =============================================================================

set -euo pipefail

# ── 상수 ─────────────────────────────────────────────────────────────────────
REPO_URL="https://github.com/YDINP/YD_Claude_RND.git"
REPO_BRANCH="main"
INSTALL_DIRS=("agents" "commands")
REQUIRED_FILE=".claude/agents/_registry.json"
MIN_AGENT_COUNT=5

# ── 색상 출력 ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
step()    { echo -e "\n${BOLD}▶ $*${RESET}"; }

# ── 플래그 ────────────────────────────────────────────────────────────────────
OPT_FORCE=false
OPT_COPY=false
OPT_NO_CLAUDE=false
OPT_DRY_RUN=false
TARGET_DIR=""

# ── 임시 디렉토리 cleanup (trap) ──────────────────────────────────────────────
TEMP_DIR=""
cleanup() {
    if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
    fi
}
trap cleanup EXIT

# ── 도움말 ────────────────────────────────────────────────────────────────────
usage() {
    cat <<EOF
${BOLD}install-agents.sh${RESET} — YD_Claude_RND 커스텀 에이전트 시스템 설치

${BOLD}사용법:${RESET}
  bash install-agents.sh [대상폴더] [옵션]
  bash install-agents.sh --help

${BOLD}옵션:${RESET}
  --force       기존 .claude/agents|commands 강제 덮어쓰기
  --copy        복사 모드 강제 (Junction/Symlink 사용 안 함)
  --no-claude   CLAUDE.md 생성 스킵
  --dry-run     실제 변경 없이 수행 내용만 출력
  --help        이 도움말 출력

${BOLD}설치 방식:${RESET}
  [자동] YD_Claude_RND 하위 프로젝트 → Junction(Win)/Symlink(Mac·Linux) 생성
         (에이전트 업데이트가 즉시 반영됨)
  [자동] 외부 독립 프로젝트         → GitHub sparse clone 후 파일 복사

${BOLD}예시:${RESET}
  bash install-agents.sh                       # 현재 폴더에 설치
  bash install-agents.sh ~/projects/my-app     # 지정 폴더에 설치
  bash install-agents.sh . --force             # 강제 재설치
  bash install-agents.sh . --dry-run           # 미리보기
EOF
    exit 0
}

# ── 인자 파싱 ─────────────────────────────────────────────────────────────────
parse_args() {
    for arg in "$@"; do
        case "$arg" in
            --force)     OPT_FORCE=true ;;
            --copy)      OPT_COPY=true ;;
            --no-claude) OPT_NO_CLAUDE=true ;;
            --dry-run)   OPT_DRY_RUN=true ;;
            --help|-h)   usage ;;
            -*)          error "알 수 없는 옵션: $arg"; usage ;;
            *)
                if [[ -z "$TARGET_DIR" ]]; then
                    TARGET_DIR="$arg"
                else
                    error "대상 폴더는 하나만 지정할 수 있습니다."; exit 1
                fi
                ;;
        esac
    done
    TARGET_DIR="${TARGET_DIR:-.}"
}

# ── OS 감지 ───────────────────────────────────────────────────────────────────
detect_os() {
    case "${OSTYPE:-}" in
        msys*|cygwin*|mingw*) echo "windows" ;;
        darwin*)              echo "macos" ;;
        linux*)               echo "linux" ;;
        *)
            # OSTYPE 없을 때 uname 폴백
            local uname_out
            uname_out=$(uname -s 2>/dev/null || echo "unknown")
            case "$uname_out" in
                Darwin) echo "macos" ;;
                Linux)  echo "linux" ;;
                MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
                *) echo "linux" ;;  # 기본값
            esac
            ;;
    esac
}

# ── YD_Claude_RND 루트 탐색 ───────────────────────────────────────────────────
# 현재 위치 또는 대상 경로 상위를 순회하여 _registry.json 존재 여부 확인
find_yd_root() {
    local search_path
    search_path="$(realpath "$TARGET_DIR" 2>/dev/null || echo "$TARGET_DIR")"
    local current="$search_path"

    while [[ "$current" != "/" && "$current" != "." ]]; do
        if [[ -f "$current/.claude/agents/_registry.json" ]]; then
            echo "$current"
            return 0
        fi
        current="$(dirname "$current")"
    done
    # 스크립트 자신의 위치에서도 탐색 (로컬 실행 시)
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo "")"
    if [[ -n "$script_dir" && -f "$script_dir/.claude/agents/_registry.json" ]]; then
        echo "$script_dir"
        return 0
    fi
    return 1
}

# ── 사전 검증 ─────────────────────────────────────────────────────────────────
preflight_check() {
    step "사전 검증"

    # 대상 디렉토리 존재 확인
    if [[ ! -d "$TARGET_DIR" ]]; then
        error "대상 폴더가 존재하지 않습니다: $TARGET_DIR"
        exit 1
    fi

    local target_real
    target_real="$(realpath "$TARGET_DIR" 2>/dev/null || echo "$TARGET_DIR")"

    # 자기 자신에 설치 방지
    local yd_root
    if yd_root="$(find_yd_root)"; then
        local yd_real
        yd_real="$(realpath "$yd_root" 2>/dev/null || echo "$yd_root")"
        if [[ "$target_real" == "$yd_real" ]]; then
            error "YD_Claude_RND 루트 자체에는 설치할 수 없습니다."
            error "하위 프로젝트 폴더를 지정하세요."
            exit 1
        fi
    fi

    # 쓰기 권한 확인
    if ! touch "$TARGET_DIR/.write-test" 2>/dev/null; then
        error "대상 폴더에 쓰기 권한이 없습니다: $TARGET_DIR"
        exit 1
    fi
    rm -f "$TARGET_DIR/.write-test"

    success "사전 검증 통과"
}

# ── 기존 설치 확인 ────────────────────────────────────────────────────────────
check_existing() {
    local target_claude="$TARGET_DIR/.claude"
    local existing=false

    for d in "${INSTALL_DIRS[@]}"; do
        if [[ -e "$target_claude/$d" ]]; then
            existing=true
            break
        fi
    done

    if $existing && ! $OPT_FORCE; then
        warn "기존 설치가 감지되었습니다: $target_claude"
        warn "덮어쓰려면 --force 옵션을 사용하세요."
        echo ""
        read -r -p "  계속 진행하시겠습니까? (기존 항목 스킵) [y/N] " confirm
        if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
            echo "설치를 취소했습니다."
            exit 0
        fi
    fi
}

# ── Junction 생성 (Windows) ───────────────────────────────────────────────────
create_junction_windows() {
    local src="$1"
    local dst="$2"

    # Git Bash 경로 → Windows 경로 변환
    local win_src win_dst
    win_src="$(cygpath -w "$src" 2>/dev/null || echo "$src" | sed 's|/|\\|g' | sed 's|^\\\\([a-zA-Z]\\)\\|\\1:\\|')"
    win_dst="$(cygpath -w "$dst" 2>/dev/null || echo "$dst" | sed 's|/|\\|g' | sed 's|^\\\\([a-zA-Z]\\)\\|\\1:\\|')"

    if $OPT_DRY_RUN; then
        info "[dry-run] mklink /J \"$win_dst\" \"$win_src\""
        return 0
    fi

    # 기존 Junction/링크 제거
    if [[ -e "$dst" || -L "$dst" ]]; then
        if $OPT_FORCE; then
            cmd.exe /c "rmdir \"$win_dst\"" 2>/dev/null || rm -rf "$dst"
        else
            warn "이미 존재합니다 (스킵): $dst"
            return 0
        fi
    fi

    if cmd.exe /c "mklink /J \"$win_dst\" \"$win_src\"" > /dev/null 2>&1; then
        success "Junction 생성: $dst → $src"
    else
        warn "Junction 생성 실패, 복사 모드로 폴백: $dst"
        return 1
    fi
}

# ── Symlink 생성 (Mac/Linux) ──────────────────────────────────────────────────
create_symlink_unix() {
    local src="$1"
    local dst="$2"

    if $OPT_DRY_RUN; then
        info "[dry-run] ln -sfn \"$src\" \"$dst\""
        return 0
    fi

    # 기존 링크/폴더 처리
    if [[ -e "$dst" || -L "$dst" ]]; then
        if $OPT_FORCE; then
            rm -rf "$dst"
        else
            warn "이미 존재합니다 (스킵): $dst"
            return 0
        fi
    fi

    if ln -sfn "$src" "$dst"; then
        success "Symlink 생성: $dst → $src"
    else
        warn "Symlink 생성 실패, 복사 모드로 폴백: $dst"
        return 1
    fi
}

# ── 설치 방식 A: Junction/Symlink (하위 프로젝트) ────────────────────────────
install_via_link() {
    local yd_root="$1"
    local os="$2"
    local target_claude="$TARGET_DIR/.claude"
    local failed=false

    step "링크 방식으로 설치 (실시간 동기화)"
    info "소스: $yd_root/.claude"
    info "대상: $target_claude"

    mkdir -p "$target_claude"

    for d in "${INSTALL_DIRS[@]}"; do
        local src="$yd_root/.claude/$d"
        local dst="$target_claude/$d"

        if [[ ! -d "$src" ]]; then
            warn "소스 디렉토리 없음, 스킵: $src"
            continue
        fi

        if [[ "$os" == "windows" ]]; then
            create_junction_windows "$src" "$dst" || failed=true
        else
            create_symlink_unix "$src" "$dst" || failed=true
        fi
    done

    # 링크 실패 시 복사 모드 폴백
    if $failed; then
        warn "일부 링크 생성 실패 → 복사 모드로 폴백합니다."
        install_via_copy_from_local "$yd_root"
    fi
}

# ── 설치 방식 B-1: 로컬 복사 (하위 프로젝트 복사 강제) ──────────────────────
install_via_copy_from_local() {
    local yd_root="$1"
    local target_claude="$TARGET_DIR/.claude"

    step "로컬 복사 방식으로 설치"
    mkdir -p "$target_claude"

    for d in "${INSTALL_DIRS[@]}"; do
        local src="$yd_root/.claude/$d"
        local dst="$target_claude/$d"

        if [[ ! -d "$src" ]]; then
            warn "소스 없음, 스킵: $src"
            continue
        fi

        if $OPT_DRY_RUN; then
            info "[dry-run] cp -r \"$src\" \"$dst\""
            continue
        fi

        if [[ -e "$dst" ]]; then
            if $OPT_FORCE; then
                rm -rf "$dst"
            else
                warn "이미 존재합니다 (스킵): $dst"
                continue
            fi
        fi

        cp -r "$src" "$dst"
        success "복사 완료: $dst ($(find "$dst" -name "*.md" | wc -l | tr -d ' ')개 파일)"
    done
}

# ── 설치 방식 B-2: GitHub sparse clone (외부 프로젝트) ───────────────────────
install_via_github() {
    local target_claude="$TARGET_DIR/.claude"

    step "GitHub sparse clone 방식으로 설치"

    # git 설치 확인
    if ! command -v git &>/dev/null; then
        error "git이 설치되지 않았습니다. git을 설치한 후 재실행하세요."
        error "설치 가이드: https://git-scm.com/downloads"
        exit 1
    fi

    info "저장소: $REPO_URL"
    info "브랜치: $REPO_BRANCH"

    # 임시 디렉토리 생성
    TEMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t 'install-agents')"
    info "임시 디렉토리: $TEMP_DIR"

    if $OPT_DRY_RUN; then
        info "[dry-run] git clone --filter=blob:none --sparse $REPO_URL $TEMP_DIR"
        info "[dry-run] sparse-checkout set .claude/agents .claude/commands"
        return 0
    fi

    # sparse clone
    if ! git clone --filter=blob:none --sparse --branch "$REPO_BRANCH" \
         --quiet "$REPO_URL" "$TEMP_DIR" 2>&1; then
        error "GitHub clone 실패. 네트워크 연결 또는 저장소 접근 권한을 확인하세요."
        error "수동 설치: https://github.com/YDINP/YD_Claude_RND/.claude 참조"
        exit 1
    fi

    # sparse checkout 설정
    cd "$TEMP_DIR"
    git sparse-checkout set ".claude/agents" ".claude/commands"
    cd - > /dev/null

    # 파일 존재 검증
    local agent_count
    agent_count="$(find "$TEMP_DIR/.claude/agents" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')"
    if [[ "$agent_count" -lt "$MIN_AGENT_COUNT" ]]; then
        error "에이전트 파일이 너무 적습니다 (${agent_count}개). clone이 불완전할 수 있습니다."
        exit 1
    fi
    info "에이전트 ${agent_count}개 확인됨"

    # 복사
    mkdir -p "$target_claude"
    for d in "${INSTALL_DIRS[@]}"; do
        local src="$TEMP_DIR/.claude/$d"
        local dst="$target_claude/$d"

        if [[ ! -d "$src" ]]; then
            warn "클론된 소스 없음, 스킵: $src"
            continue
        fi

        if [[ -e "$dst" ]]; then
            if $OPT_FORCE; then
                rm -rf "$dst"
            else
                warn "이미 존재합니다 (스킵): $dst"
                continue
            fi
        fi

        cp -r "$src" "$dst"
        success "복사 완료: $dst"
    done
}

# ── CLAUDE.md 생성 ────────────────────────────────────────────────────────────
create_claude_md() {
    local claude_md="$TARGET_DIR/CLAUDE.md"

    if $OPT_NO_CLAUDE; then
        info "CLAUDE.md 생성 스킵 (--no-claude)"
        return 0
    fi

    step "CLAUDE.md 생성"

    if [[ -f "$claude_md" ]]; then
        warn "CLAUDE.md가 이미 존재합니다: $claude_md"
        read -r -p "  덮어쓰시겠습니까? [y/N] " confirm
        if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
            info "CLAUDE.md 생성 스킵"
            return 0
        fi
        cp "$claude_md" "${claude_md}.bak"
        info "기존 파일 백업: ${claude_md}.bak"
    fi

    # 프로젝트명 입력
    local default_name
    default_name="$(basename "$(realpath "$TARGET_DIR" 2>/dev/null || echo "$TARGET_DIR")")"
    read -r -p "  프로젝트명 [${default_name}]: " project_name
    project_name="${project_name:-$default_name}"

    read -r -p "  프로젝트 설명 (선택): " project_desc

    if $OPT_DRY_RUN; then
        info "[dry-run] CLAUDE.md 생성: 프로젝트=${project_name}"
        return 0
    fi

    cat > "$claude_md" <<EOF
# CLAUDE.md — ${project_name}

## Language Preference
- 한국어로 응답할 것

## Project Overview
- **Project**: ${project_name}
- **Description**: ${project_desc:-"(설명을 추가하세요)"}

## Build and Development Commands
\`\`\`bash
# 프로젝트에 맞게 수정하세요
\`\`\`

## Agent System
에이전트 가이드: \`.claude/agents/_registry.json\` 참조

### 주요 커맨드
\`\`\`
/pt "구현할 기능"     # 멀티 에이전트 팀 구성
\`\`\`
EOF

    success "CLAUDE.md 생성 완료: $claude_md"
}

# ── settings.local.json 생성 ─────────────────────────────────────────────────
create_settings_json() {
    local settings="$TARGET_DIR/.claude/settings.local.json"

    if [[ -f "$settings" ]]; then
        info "settings.local.json 이미 존재합니다 (스킵): $settings"
        return 0
    fi

    if $OPT_DRY_RUN; then
        info "[dry-run] settings.local.json 생성"
        return 0
    fi

    cat > "$settings" <<'EOF'
{
  "permissions": {
    "allow": [
      "WebSearch",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git push)"
    ]
  }
}
EOF
    success "settings.local.json 생성 완료"
}

# ── 설치 검증 ─────────────────────────────────────────────────────────────────
verify_installation() {
    step "설치 검증"

    local ok=true

    # _registry.json 존재 확인
    if [[ ! -f "$TARGET_DIR/.claude/agents/_registry.json" ]]; then
        error "_registry.json 없음: .claude/agents/_registry.json"
        ok=false
    else
        success "_registry.json 확인"
    fi

    # 에이전트 파일 수 확인
    local count
    count="$(find "$TARGET_DIR/.claude/agents" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')"
    if [[ "$count" -lt "$MIN_AGENT_COUNT" ]]; then
        error "에이전트 파일 수 부족: ${count}개 (최소 ${MIN_AGENT_COUNT}개 필요)"
        ok=false
    else
        success "에이전트 ${count}개 확인"
    fi

    # commands 확인
    if [[ ! -f "$TARGET_DIR/.claude/commands/pt.md" ]]; then
        warn "/pt 커맨드 없음: .claude/commands/pt.md"
    else
        success "/pt 커맨드 확인"
    fi

    if $ok; then
        echo ""
        echo -e "${GREEN}${BOLD}✓ 설치 완료!${RESET}"
    else
        echo ""
        error "설치 검증 실패. 위 오류를 확인하세요."
        exit 1
    fi
}

# ── 완료 안내 ─────────────────────────────────────────────────────────────────
print_summary() {
    local install_type="$1"
    echo ""
    echo -e "${BOLD}─────────────────────────────────────────${RESET}"
    echo -e "${BOLD} 설치 요약${RESET}"
    echo -e "${BOLD}─────────────────────────────────────────${RESET}"
    echo -e " 대상 폴더: ${CYAN}$(realpath "$TARGET_DIR" 2>/dev/null || echo "$TARGET_DIR")${RESET}"
    echo -e " 설치 방식: ${CYAN}${install_type}${RESET}"
    echo ""
    echo -e " ${BOLD}사용 방법:${RESET}"
    echo -e "   /pt \"구현할 기능\"      멀티 에이전트 팀 구성"
    if [[ -f "$TARGET_DIR/.claude/commands/create-card.md" ]]; then
        echo -e "   /create-card 주제 카테고리   단일 카드 생성"
        echo -e "   /card-batch N개 카테고리     대량 카드 생성"
    fi
    echo ""
    if [[ "$install_type" == "복사" ]]; then
        echo -e " ${YELLOW}※ 복사 방식은 에이전트 업데이트가 자동 반영되지 않습니다.${RESET}"
        echo -e " ${YELLOW}  업데이트 시 install-agents.sh --force를 재실행하세요.${RESET}"
    else
        echo -e " ${GREEN}※ 링크 방식: 에이전트 업데이트가 자동으로 반영됩니다.${RESET}"
    fi
    echo -e "${BOLD}─────────────────────────────────────────${RESET}"
}

# ── 메인 ──────────────────────────────────────────────────────────────────────
main() {
    echo -e "${BOLD}"
    echo "╔══════════════════════════════════════════╗"
    echo "║   YD_Claude_RND 에이전트 시스템 설치기    ║"
    echo "╚══════════════════════════════════════════╝"
    echo -e "${RESET}"

    parse_args "$@"

    local os
    os="$(detect_os)"
    info "OS: $os | 대상: $TARGET_DIR | dry-run: $OPT_DRY_RUN"

    preflight_check
    check_existing

    local install_type
    local yd_root=""

    # 설치 방식 결정
    if ! $OPT_COPY && yd_root="$(find_yd_root)"; then
        info "YD_Claude_RND 감지: $yd_root → 링크 방식 사용"
        install_via_link "$yd_root" "$os"
        install_type="Junction/Symlink (실시간 동기화)"
    else
        if $OPT_COPY; then
            info "--copy 플래그 → 복사 모드 강제"
        else
            info "YD_Claude_RND 외부 프로젝트 → GitHub clone 방식 사용"
        fi

        if [[ -n "$yd_root" ]] && $OPT_COPY; then
            install_via_copy_from_local "$yd_root"
            install_type="로컬 복사"
        else
            install_via_github
            install_type="복사"
        fi
    fi

    create_settings_json
    create_claude_md

    if ! $OPT_DRY_RUN; then
        verify_installation
    fi

    print_summary "$install_type"
}

main "$@"
