# ArcaneCollectors Git Worktree Setup Script
# PowerShell Script for Windows

param(
    [switch]$Create,
    [switch]$Remove,
    [switch]$List,
    [switch]$Help
)

$RepoRoot = "D:\park\YD_Claude_RND"
$ParentDir = "D:\park"

# Worker 정의
$Workers = @(
    @{ Name = "w1"; Branch = "arcane/w1-backend"; Desc = "백엔드/Supabase" },
    @{ Name = "w2"; Branch = "arcane/w2-data"; Desc = "게임 데이터" },
    @{ Name = "w3"; Branch = "arcane/w3-ui"; Desc = "UI/화면" },
    @{ Name = "w4"; Branch = "arcane/w4-system"; Desc = "게임 시스템" },
    @{ Name = "w5"; Branch = "arcane/w5-config"; Desc = "설정/문서" },
    @{ Name = "integration"; Branch = "arcane/integration"; Desc = "통합 테스트" },
    @{ Name = "experiment"; Branch = "arcane/experiment"; Desc = "실험용" }
)

function Show-Help {
    Write-Host @"

ArcaneCollectors Git Worktree Setup Script
==========================================

Usage:
    .\setup-arcane-worktrees.ps1 -Create    # 모든 worktree 생성
    .\setup-arcane-worktrees.ps1 -Remove    # 모든 worktree 제거
    .\setup-arcane-worktrees.ps1 -List      # 현재 worktree 목록
    .\setup-arcane-worktrees.ps1 -Help      # 도움말

Worktrees:
"@
    foreach ($w in $Workers) {
        Write-Host "  - YD_Claude_RND-$($w.Name): $($w.Desc)"
    }
}

function Create-Worktrees {
    Write-Host "`n[1/3] 브랜치 생성 중..." -ForegroundColor Cyan

    Push-Location $RepoRoot

    foreach ($w in $Workers) {
        $branchExists = git branch --list $w.Branch
        if (-not $branchExists) {
            Write-Host "  Creating branch: $($w.Branch)"
            git branch $w.Branch
        } else {
            Write-Host "  Branch exists: $($w.Branch)" -ForegroundColor Yellow
        }
    }

    Write-Host "`n[2/3] Worktree 생성 중..." -ForegroundColor Cyan

    foreach ($w in $Workers) {
        $wtPath = Join-Path $ParentDir "YD_Claude_RND-$($w.Name)"

        if (Test-Path $wtPath) {
            Write-Host "  Worktree exists: $wtPath" -ForegroundColor Yellow
        } else {
            Write-Host "  Creating worktree: $wtPath"
            git worktree add $wtPath $w.Branch
        }
    }

    Write-Host "`n[3/3] 완료!" -ForegroundColor Green
    Write-Host "`nWorktree 목록:"
    git worktree list

    Pop-Location
}

function Remove-Worktrees {
    Write-Host "`n[1/2] Worktree 제거 중..." -ForegroundColor Cyan

    Push-Location $RepoRoot

    foreach ($w in $Workers) {
        $wtPath = Join-Path $ParentDir "YD_Claude_RND-$($w.Name)"

        if (Test-Path $wtPath) {
            Write-Host "  Removing worktree: $wtPath"
            git worktree remove $wtPath --force
        }
    }

    Write-Host "`n[2/2] Worktree prune..." -ForegroundColor Cyan
    git worktree prune

    Write-Host "`n완료!" -ForegroundColor Green

    Pop-Location
}

function List-Worktrees {
    Push-Location $RepoRoot
    Write-Host "`n현재 Worktree 목록:" -ForegroundColor Cyan
    git worktree list
    Pop-Location
}

# Main
if ($Help -or (-not $Create -and -not $Remove -and -not $List)) {
    Show-Help
}
elseif ($Create) {
    Create-Worktrees
}
elseif ($Remove) {
    Remove-Worktrees
}
elseif ($List) {
    List-Worktrees
}
