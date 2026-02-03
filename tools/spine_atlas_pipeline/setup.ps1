# Spine Atlas Pipeline Setup Script
# PowerShell 스크립트 - Windows 환경용

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Spine Atlas Pipeline Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 기본 경로 설정
$AI_DIR = "D:\AI"
$COMFYUI_DIR = "$AI_DIR\ComfyUI"
$ATLAS_OUTPUT_DIR = "$AI_DIR\SpineAtlas"
$PIPELINE_DIR = "D:\park\YD_Claude_RND\tools\spine_atlas_pipeline"

# 폴더 생성
Write-Host "[1/6] Creating directories..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $AI_DIR | Out-Null
New-Item -ItemType Directory -Force -Path $ATLAS_OUTPUT_DIR | Out-Null
New-Item -ItemType Directory -Force -Path "$ATLAS_OUTPUT_DIR\characters" | Out-Null
New-Item -ItemType Directory -Force -Path "$ATLAS_OUTPUT_DIR\atlas" | Out-Null

# Python 버전 확인
Write-Host "[2/6] Checking Python..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version
    Write-Host "  Python found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "  Python not found! Please install Python 3.10+" -ForegroundColor Red
    exit 1
}

# Python 의존성 설치
Write-Host "[3/6] Installing Python dependencies..." -ForegroundColor Yellow
pip install pillow rectpack requests --quiet
Write-Host "  Dependencies installed" -ForegroundColor Green

# ComfyUI 설치 확인
Write-Host "[4/6] Checking ComfyUI..." -ForegroundColor Yellow
if (Test-Path $COMFYUI_DIR) {
    Write-Host "  ComfyUI already exists at $COMFYUI_DIR" -ForegroundColor Green
} else {
    Write-Host "  ComfyUI not found. Installing..." -ForegroundColor Yellow

    Set-Location $AI_DIR
    git clone https://github.com/comfyanonymous/ComfyUI.git

    Set-Location $COMFYUI_DIR
    python -m venv venv
    .\venv\Scripts\Activate.ps1

    Write-Host "  Installing PyTorch (CUDA 12.1)..." -ForegroundColor Yellow
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

    pip install -r requirements.txt

    Write-Host "  ComfyUI installed!" -ForegroundColor Green
}

# ComfyUI Custom Nodes 설치
Write-Host "[5/6] Installing ComfyUI custom nodes..." -ForegroundColor Yellow
$customNodesDir = "$COMFYUI_DIR\custom_nodes"

# ComfyUI Manager
if (-not (Test-Path "$customNodesDir\ComfyUI-Manager")) {
    Write-Host "  Installing ComfyUI Manager..." -ForegroundColor Yellow
    Set-Location $customNodesDir
    git clone https://github.com/ltdrdata/ComfyUI-Manager.git
}

# Segment Anything
if (-not (Test-Path "$customNodesDir\comfyui_segment_anything")) {
    Write-Host "  Installing Segment Anything node..." -ForegroundColor Yellow
    Set-Location $customNodesDir
    git clone https://github.com/storyicon/comfyui_segment_anything.git
    Set-Location "comfyui_segment_anything"
    pip install -r requirements.txt
}

# Rembg (Background Removal)
if (-not (Test-Path "$customNodesDir\rembg-comfyui-node")) {
    Write-Host "  Installing Rembg node..." -ForegroundColor Yellow
    Set-Location $customNodesDir
    git clone https://github.com/Jcd1230/rembg-comfyui-node.git
    pip install rembg[gpu]
}

Write-Host "  Custom nodes installed!" -ForegroundColor Green

# 모델 다운로드 안내
Write-Host "[6/6] Model download instructions..." -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Manual Steps Required:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Download Pony Diffusion V6 XL from Civitai:" -ForegroundColor White
Write-Host "   https://civitai.com/models/257749/pony-diffusion-v6-xl" -ForegroundColor Blue
Write-Host "   -> Save to: $COMFYUI_DIR\models\checkpoints\" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Download SAM model:" -ForegroundColor White
Write-Host "   https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth" -ForegroundColor Blue
Write-Host "   -> Save to: $COMFYUI_DIR\models\sam\" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Download GroundingDINO model:" -ForegroundColor White
Write-Host "   https://github.com/IDEA-Research/GroundingDINO/releases" -ForegroundColor Blue
Write-Host "   -> groundingdino_swint_ogc.pth" -ForegroundColor Gray
Write-Host "   -> Save to: $COMFYUI_DIR\models\grounding-dino\" -ForegroundColor Gray
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start ComfyUI:" -ForegroundColor White
Write-Host "  cd $COMFYUI_DIR" -ForegroundColor Yellow
Write-Host "  .\venv\Scripts\Activate.ps1" -ForegroundColor Yellow
Write-Host "  python main.py --listen --port 8188" -ForegroundColor Yellow
Write-Host ""
Write-Host "Then access: http://localhost:8188" -ForegroundColor Blue
Write-Host ""

# 환경 변수 파일 생성
$envContent = @"
# Spine Atlas Pipeline Environment
COMFYUI_HOST=http://localhost:8188
OUTPUT_DIR=$COMFYUI_DIR\output
ATLAS_DIR=$ATLAS_OUTPUT_DIR
PIPELINE_DIR=$PIPELINE_DIR
"@

Set-Content -Path "$PIPELINE_DIR\.env" -Value $envContent
Write-Host "Environment file created: $PIPELINE_DIR\.env" -ForegroundColor Green

Set-Location $PIPELINE_DIR
