#!/usr/bin/env python
"""
postprocess-assets.py — 생성 원본 → public/assets 후처리 파이프라인 (T-02 선행)

무엇을 하는가
  asset-spec.json 의 postProcess 문자열을 해석해 각 카테고리에 맞는 처리를 하고
  public/ 아래 targetPath 에 저장한다. 동시에 tools/art/asset-manifest.json 을
  굽는다 — PreloadScene.loadPhase0_Assets() 는 이 manifest 만 읽는다.

카테고리별 처리
  background   : art/gen/assets_bg2/<id>[_v2].png 를 소스로 upscale x1.30(Lanczos) +
                 블러 페어(gaussian 24px, 밝기 -15%) 를 굽는다. 알파 없음.
                 저장 포맷은 WebP q80(전송량 예산 초과로 PNG에서 전환, ASSET_USAGE_MAP §11-6).
                 bg_main/bg_login 만 eager(manifest.textures), 나머지 12종은 lazy
                 (manifest.lazyTextures) — BackgroundFactory.createSceneBg() 가 씬 진입
                 시점에 동적 로드한다.
  banner       : banner_pickup_* 는 art/gen/assets/ 소스를 680x560 크롭 + 하단
                 그라데이션 페이드(PNG 유지). fx_summon_circle 은 알파 필요 자산인데
                 현재 소스가 RGB(알파 없음)라 스킵하고 regen-list.json 에 기록한다.
  frame/button : art/gen/assets/<id>.png 소스. 알파 채널 존재를 확인한 뒤(없으면
                 스킵) 목표 크기로 다운스케일 후 WebP q85(알파 유지)로 저장.
                 9-slice 코너값은 스케일 비율만큼 줄여 manifest 에 기록한다
                 (코드의 SSOT 는 NineSliceFrame.js). panel_header_ornament 는
                 소스 종횡비(3:1)가 목표(8:1)와 맞지 않아 왜곡되므로 예외적으로
                 처리하지 않고 regen-list.json 에 기록한다(EXCLUDED_IDS).
  logo         : art/gen/assets/<id>.png 소스, PNG 유지(변경 없음).
  icon         : PNG 유지. 다운스케일 후 콘텐츠 바운딩 박스 + 8px 패딩으로 트림.
  fullbody-extra(enemy_*) : art/gen/assets/<id>.png 소스(현재 없음. 생기면 자동 처리).
                 알파 확인 → trim → 높이 512 로 다운스케일. PNG 유지.

전신 히어로(별도 트랙, 스펙 밖)
  art/gen/fullbody/hero_XXX.png(RGBA) 를 글롭으로 찾아 긴 변 1024 WebP q85 로
  public/assets/characters/fullbody/hero_XXX.webp 에 굽는다. 원본은 그대로 둔다.
  asset-spec.json 의 fullbody_hero_001~004 항목은 실제 소스가 없는 구버전 스텁이라
  건너뛴다(경고 없이 무시. 별도 트랙 산출물이 이 스크립트의 대상이 아님).

적 유닛(별도 트랙, 스펙 밖. asset-spec.json 의 enemy_* 10종은 소스가 없는 구버전
크로마키 스텁이라 이 트랙과 무관하게 계속 skipped_missing_source 로 잡힌다)
  art/gen/enemies/<id>.png(1024 RGBA, 알파 있음) 를 글롭으로 찾아 긴 변 512 WebP q85 로
  public/assets/characters/enemies/<id>.webp 에 굽는다(업스케일 없음). manifest.enemies 에
  등록한다 — idleBattleLayout.resolveEnemyArt() 와 BattleScene 이 이 버킷을 최우선으로 찾는다.
  src/data/enemies.json 의 전체 id 중 소스가 없는 항목은 regen-list.json 에 사유와 함께
  기록한다(실루엣 폴백 유지, 재생성되면 다음 실행에서 자동 편입).

치비 시트(별도 트랙, 스펙 밖)
  art/gen/chibi_sheet/<hero>_sheet.png(cell 256 x 4프레임, RGBA) 를 chibi-manifest.json 의
  규격으로 검증한 뒤 무손실 WebP 로 public/assets/characters/chibi/<hero>_sheet.webp 에
  굽고 manifest.chibi 에 등록한다(지연 로드 버킷. cell/frames/footY 동봉).
  손실 압축을 쓰지 않는 이유는 프레임 경계에서 이웃 프레임 색이 번지기 때문이다.

멱등성
  대상 파일이 이미 존재하고 소스보다 최신이면 재처리하지 않는다(--force 로 무시).
  존재하는 원본만 처리한다. 없는 원본은 조용히 건너뛰고 manifest.missing 에 기록한다.

실행
  python tools/art/postprocess-assets.py [--force] [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

try:
    from PIL import Image, ImageFilter, ImageEnhance, ImageOps
except ImportError:  # pragma: no cover
    sys.exit("Pillow 가 필요합니다: pip install Pillow")

ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = ROOT / "tools" / "art" / "asset-spec.json"
MANIFEST_PATH = ROOT / "tools" / "art" / "asset-manifest.json"
REGEN_LIST_PATH = ROOT / "tools" / "art" / "regen-list.json"
PUBLIC_DIR = ROOT / "public"

BG_SOURCE_DIR = ROOT / "art" / "gen" / "assets_bg2"
UI_SOURCE_DIR = ROOT / "art" / "gen" / "assets"
FULLBODY_SOURCE_DIR = ROOT / "art" / "gen" / "fullbody"
FULLBODY_TARGET_DIR = PUBLIC_DIR / "assets" / "characters" / "fullbody"

ENEMY_UNIT_SOURCE_DIR = ROOT / "art" / "gen" / "enemies"
ENEMY_UNIT_TARGET_DIR = PUBLIC_DIR / "assets" / "characters" / "enemies"
ENEMY_DATA_PATH = ROOT / "src" / "data" / "enemies.json"

CHIBI_SOURCE_DIR = ROOT / "art" / "gen" / "chibi_sheet"
CHIBI_TARGET_DIR = PUBLIC_DIR / "assets" / "characters" / "chibi"
CHIBI_SPEC_PATH = CHIBI_SOURCE_DIR / "chibi-manifest.json"
# 텍스처 키 접두사. 영웅 id 가 그대로 붙는다(chibi_base_iris). MeditationView 가 이 규칙으로 조회한다.
CHIBI_KEY_PREFIX = "chibi_"

# 배경 중 v2(2차 생성본)를 채택한 항목. 나머지는 전부 v1.
# bg_chapter_2: v1은 도리이 문에 문자 흔적이 남아 있어 v2를 채택.
BG_V2_OVERRIDE = {"bg_chapter_2"}

# 부팅 경로에서 씬 진입 즉시 필요한 배경만 eager. 나머지는 lazyTextures로
# BackgroundFactory.createSceneBg() 가 씬 진입 시점에 동적 로드한다(전송량 예산, §11-6).
EAGER_BACKGROUND_IDS = {"bg_main", "bg_login"}

# 소스 결함으로 이번 배치에서 처리하지 않고 재생성이 필요한 항목.
# manifest 에서 완전히 제외하고 regen-list.json 에 사유를 남긴다.
EXCLUDED_IDS = {
    "panel_header_ornament": "소스 종횡비 3:1(2172x724)이 목표 8:1(512x64)과 맞지 않아 심하게 눌림. 1024x128(8:1)로 재생성 필요.",
}

NINE_SLICE_RE = re.compile(r"9-slice\s+([\d,]+)")
DOWNSCALE_RE = re.compile(r"downscale\s+(\d+)(?:x(\d+))?")

# 이번 실행에서 스킵/제외된 항목을 규격화해 모아두는 리스트. main() 끝에서 regen-list.json 으로 저장.
_REGEN_ENTRIES: list[dict] = []


def note_regen(asset_id: str, reason: str, target_path: str) -> None:
    _REGEN_ENTRIES.append({"id": asset_id, "reason": reason, "targetPath": to_public_rel(target_path)})


def log(msg: str) -> None:
    print(msg)


def human(n: int) -> str:
    return f"{n / 1024:.0f} KB" if n < 1024 * 1024 else f"{n / 1024 / 1024:.2f} MB"


def is_stale(target: Path, source: Path, force: bool) -> bool:
    """target 이 없거나 force 거나 source 보다 오래됐으면 재처리 대상."""
    if force or not target.exists():
        return True
    return source.stat().st_mtime > target.stat().st_mtime


def has_real_alpha(im: Image.Image) -> bool:
    """알파 채널이 존재하고 실제로 불투명 영역을 갖는지 확인한다(전부 255면 사실상 알파 없음과 동일)."""
    if "A" not in im.getbands():
        return False
    alpha = im.getchannel("A")
    extrema = alpha.getextrema()
    return extrema[0] < 255


def parse_nine_slice(post_process: list[str]) -> dict | None:
    for line in post_process:
        if "9-slice" not in line:
            continue
        if "미사용" in line:
            return None
        m = NINE_SLICE_RE.search(line)
        if not m:
            return None
        parts = [int(x) for x in m.group(1).split(",")]
        if len(parts) != 4:
            return None
        left, right, top, bottom = parts
        return {"left": left, "right": right, "top": top, "bottom": bottom}
    return None


def scale_nine_slice(ns: dict | None, scale: float) -> dict | None:
    if ns is None:
        return None
    return {k: round(v * scale) for k, v in ns.items()}


def to_public_rel(target_path: str) -> str:
    """asset-spec 의 targetPath('public/assets/...')를 로드 경로('assets/...')로 변환."""
    p = target_path
    if p.startswith("public/"):
        p = p[len("public/"):]
    return p.replace("\\", "/")


class Report:
    def __init__(self):
        self.processed: list[str] = []
        self.skipped_missing_source: list[str] = []
        self.skipped_no_alpha: list[str] = []
        self.up_to_date: list[str] = []
        self.excluded: list[str] = []
        self.errors: list[str] = []


def process_background(asset: dict, report: Report, force: bool, dry_run: bool, manifest: dict) -> None:
    aid = asset["id"]
    src_name = f"{aid}_v2.png" if aid in BG_V2_OVERRIDE else f"{aid}.png"
    src = BG_SOURCE_DIR / src_name
    if not src.exists():
        # v2 지정됐는데 없으면 v1 로 폴백
        alt = BG_SOURCE_DIR / f"{aid}.png"
        if aid in BG_V2_OVERRIDE and alt.exists():
            src = alt
        else:
            report.skipped_missing_source.append(aid)
            return

    bucket = "textures" if aid in EAGER_BACKGROUND_IDS else "lazyTextures"

    target_rel = to_public_rel(asset["targetPath"])  # 이제 .webp (SSOT: _build-asset-spec.mjs)
    target = PUBLIC_DIR / target_rel
    blur_target = target.with_name(target.stem + "_blur" + target.suffix)

    # 예전 PNG 산출물이 남아 있으면(포맷 전환 전 실행분) 정리한다.
    for stale_ext_target in (target.with_suffix(".png"), blur_target.with_suffix(".png")):
        if stale_ext_target.exists():
            stale_ext_target.unlink()

    blur_rel = target_rel.rsplit("/", 1)[0] + "/" + blur_target.name

    if not is_stale(target, src, force) and not is_stale(blur_target, src, force):
        report.up_to_date.append(aid)
        w, h = Image.open(target).size if target.exists() else (asset["width"], asset["height"])
        manifest[bucket][aid] = {
            "path": target_rel, "width": w, "height": h,
            "category": "background", "priority": asset["priority"], "nineSlice": None,
        }
        manifest[bucket][f"{aid}_blur"] = {
            "path": blur_rel,
            "width": w, "height": h, "category": "background", "priority": asset["priority"], "nineSlice": None,
        }
        return

    if dry_run:
        report.processed.append(f"{aid} (dry-run)")
        return

    with Image.open(src) as im:
        im = im.convert("RGB")
        w, h = im.size
        new_w, new_h = round(w * 1.30), round(h * 1.30)
        upscaled = im.resize((new_w, new_h), Image.LANCZOS)

        target.parent.mkdir(parents=True, exist_ok=True)
        upscaled.save(target, "WEBP", quality=80, method=6)

        # 블러 페어: gaussian 24px + 밝기 -15%
        blurred = upscaled.filter(ImageFilter.GaussianBlur(24))
        blurred = ImageEnhance.Brightness(blurred).enhance(0.85)
        blurred.save(blur_target, "WEBP", quality=80, method=6)

    manifest[bucket][aid] = {
        "path": target_rel, "width": new_w, "height": new_h,
        "category": "background", "priority": asset["priority"], "nineSlice": None,
    }
    manifest[bucket][f"{aid}_blur"] = {
        "path": blur_rel, "width": new_w, "height": new_h,
        "category": "background", "priority": asset["priority"], "nineSlice": None,
    }
    report.processed.append(aid)
    log(f"  [background:{bucket}] {aid}: {w}x{h} -> {new_w}x{new_h} webp q80 (+blur)  src={src.name}")


def process_banner_pickup(asset: dict, report: Report, force: bool, dry_run: bool, manifest: dict) -> None:
    aid = asset["id"]
    src = UI_SOURCE_DIR / f"{aid}.png"
    if not src.exists():
        report.skipped_missing_source.append(aid)
        return

    target_rel = to_public_rel(asset["targetPath"])
    target = PUBLIC_DIR / target_rel

    if not is_stale(target, src, force):
        report.up_to_date.append(aid)
        w, h = Image.open(target).size if target.exists() else (680, 560)
        manifest["lazyTextures"][aid] = {
            "path": target_rel, "width": w, "height": h,
            "category": "banner", "priority": asset["priority"], "nineSlice": None,
        }
        return

    if dry_run:
        report.processed.append(f"{aid} (dry-run)")
        return

    with Image.open(src) as im:
        im = im.convert("RGB")
        w, h = im.size
        # 680x560 표시 영역으로 크롭. 캐릭터를 상단 70% 안에 유지하도록 중앙-상단 기준.
        crop_w, crop_h = 680, 560
        scale = max(crop_w / w, crop_h / h)
        scaled = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
        sw, sh = scaled.size
        left = (sw - crop_w) // 2
        top = max(0, round((sh - crop_h) * 0.25))  # 상단에 약간 치우치게
        top = min(top, sh - crop_h)
        cropped = scaled.crop((left, top, left + crop_w, top + crop_h))

        # 하단 20% 그라데이션 페이드 -> #0D0F1A
        fade_h = round(crop_h * 0.20)
        fade = Image.new("L", (crop_w, fade_h), 0)
        for y in range(fade_h):
            alpha = round(255 * (y / max(1, fade_h - 1)))
            for x in range(crop_w):
                fade.putpixel((x, y), alpha)
        overlay = Image.new("RGB", (crop_w, fade_h), (0x0D, 0x0F, 0x1A))
        region = cropped.crop((0, crop_h - fade_h, crop_w, crop_h))
        blended = Image.composite(overlay, region, fade)
        cropped.paste(blended, (0, crop_h - fade_h))

        target.parent.mkdir(parents=True, exist_ok=True)
        cropped.save(target, "PNG")

    manifest["lazyTextures"][aid] = {
        "path": target_rel, "width": crop_w, "height": crop_h,
        "category": "banner", "priority": asset["priority"], "nineSlice": None,
    }
    report.processed.append(aid)
    log(f"  [banner] {aid}: {w}x{h} -> {crop_w}x{crop_h} (crop+fade)  src={src.name}")


def process_alpha_ui(
    asset: dict, report: Report, force: bool, dry_run: bool, manifest: dict, is_icon: bool, bucket: str = "textures"
) -> None:
    """frame/button/logo/icon(eager, bucket='textures')와 fx_summon_circle 류
    배너 이펙트(lazy, bucket='lazyTextures')를 함께 처리한다.
    frame/button 은 targetPath 가 .webp(알파 유지 q85), logo/icon 은 .png 그대로다
    (SSOT: tools/art/_build-asset-spec.mjs)."""
    aid = asset["id"]

    if aid in EXCLUDED_IDS:
        report.excluded.append(aid)
        note_regen(aid, EXCLUDED_IDS[aid], asset["targetPath"])
        log(f"  [excluded] {aid}: {EXCLUDED_IDS[aid]}")
        return

    src = UI_SOURCE_DIR / f"{aid}.png"
    if not src.exists():
        report.skipped_missing_source.append(aid)
        return

    with Image.open(src) as probe:
        probe_mode = probe.mode
        probe = probe.convert("RGBA") if probe.mode != "RGBA" else probe
        if not has_real_alpha(probe):
            report.skipped_no_alpha.append(aid)
            note_regen(aid, f"소스에 유효 알파 채널 없음({probe_mode}). 크로마키 배경으로 재생성 필요.", asset["targetPath"])
            log(f"  [skip-no-alpha] {aid}: 소스에 유효 알파 채널 없음 ({src.name}, mode={probe_mode})")
            return

    target_rel = to_public_rel(asset["targetPath"])
    target = PUBLIC_DIR / target_rel
    is_webp = target.suffix.lower() == ".webp"

    # frame/button 이 PNG -> WebP 로 전환된 경우 예전 PNG 산출물 정리
    if is_webp:
        stale_png = target.with_suffix(".png")
        if stale_png.exists():
            stale_png.unlink()

    if not is_stale(target, src, force):
        report.up_to_date.append(aid)
        if target.exists():
            w, h = Image.open(target).size
        else:
            w, h = asset["width"], asset["height"]
        ns = parse_nine_slice(asset.get("postProcess", []))
        manifest[bucket][aid] = {
            "path": target_rel, "width": w, "height": h,
            "category": asset["category"], "priority": asset["priority"],
            "nineSlice": ns,
        }
        return

    if dry_run:
        report.processed.append(f"{aid} (dry-run)")
        return

    with Image.open(src) as im:
        im = im.convert("RGBA")
        orig_w, orig_h = im.size

        m = None
        for line in asset.get("postProcess", []):
            m2 = DOWNSCALE_RE.search(line)
            if m2:
                m = m2
                break

        if m:
            tw = int(m.group(1))
            th = int(m.group(2)) if m.group(2) else round(orig_h * (tw / orig_w))
        else:
            tw, th = orig_w, orig_h

        scale = tw / orig_w
        resized = im.resize((tw, th), Image.LANCZOS)

        if is_icon:
            # 콘텐츠 바운딩 박스 + 8px 패딩으로 트림
            bbox = resized.getchannel("A").getbbox()
            if bbox:
                pad = 8
                l, t, r, b = bbox
                l = max(0, l - pad)
                t = max(0, t - pad)
                r = min(resized.width, r + pad)
                b = min(resized.height, b + pad)
                resized = resized.crop((l, t, r, b))

        target.parent.mkdir(parents=True, exist_ok=True)
        if is_webp:
            resized.save(target, "WEBP", quality=85, method=6)
        else:
            resized.save(target, "PNG")
        final_w, final_h = resized.size

    ns = scale_nine_slice(parse_nine_slice(asset.get("postProcess", [])), scale)
    manifest[bucket][aid] = {
        "path": target_rel, "width": final_w, "height": final_h,
        "category": asset["category"], "priority": asset["priority"],
        "nineSlice": ns,
    }
    report.processed.append(aid)
    fmt = "webp q85" if is_webp else "png"
    log(f"  [{asset['category']}] {aid}: {orig_w}x{orig_h} -> {final_w}x{final_h} {fmt}  src={src.name}")


def process_enemy(asset: dict, report: Report, force: bool, dry_run: bool, manifest: dict) -> None:
    aid = asset["id"]
    src = UI_SOURCE_DIR / f"{aid}.png"
    if not src.exists():
        report.skipped_missing_source.append(aid)
        return

    with Image.open(src) as probe:
        probe = probe.convert("RGBA") if probe.mode != "RGBA" else probe
        if not has_real_alpha(probe):
            report.skipped_no_alpha.append(aid)
            return

    target_rel = to_public_rel(asset["targetPath"])
    target = PUBLIC_DIR / target_rel

    if not is_stale(target, src, force):
        report.up_to_date.append(aid)
        if target.exists():
            w, h = Image.open(target).size
        else:
            w, h = asset["width"], asset["height"]
        manifest["lazyTextures"][aid] = {
            "path": target_rel, "width": w, "height": h,
            "category": "fullbody-extra", "priority": asset["priority"], "nineSlice": None,
        }
        return

    if dry_run:
        report.processed.append(f"{aid} (dry-run)")
        return

    with Image.open(src) as im:
        im = im.convert("RGBA")
        bbox = im.getchannel("A").getbbox()
        trimmed = im.crop(bbox) if bbox else im
        w, h = trimmed.size
        scale = 512 / h
        resized = trimmed.resize((round(w * scale), 512), Image.LANCZOS)

        target.parent.mkdir(parents=True, exist_ok=True)
        resized.save(target, "PNG")
        final_w, final_h = resized.size

    manifest["lazyTextures"][aid] = {
        "path": target_rel, "width": final_w, "height": final_h,
        "category": "fullbody-extra", "priority": asset["priority"], "nineSlice": None,
    }
    report.processed.append(aid)
    log(f"  [enemy] {aid}: {trimmed.size} -> {final_w}x{final_h}  src={src.name}")


def process_fullbody_heroes(report: Report, force: bool, dry_run: bool, manifest: dict) -> None:
    sources = sorted(FULLBODY_SOURCE_DIR.glob("hero_*.png"))
    manifest.setdefault("fullbody", {})
    for src in sources:
        hero_id = src.stem  # hero_005
        key = f"fb_{hero_id}"
        target = FULLBODY_TARGET_DIR / f"{hero_id}.webp"

        if not is_stale(target, src, force):
            report.up_to_date.append(hero_id)
            if target.exists():
                with Image.open(target) as t:
                    w, h = t.size
            else:
                w, h = 0, 0
            manifest["fullbody"][key] = {
                "path": to_public_rel(str(target.relative_to(PUBLIC_DIR).as_posix())),
                "width": w, "height": h,
            }
            continue

        if dry_run:
            report.processed.append(f"{hero_id} (dry-run)")
            continue

        with Image.open(src) as im:
            im = im.convert("RGBA")
            w, h = im.size
            longest = max(w, h)
            if longest > 1024:
                scale = 1024 / longest
                size = (max(1, round(w * scale)), max(1, round(h * scale)))
                resized = im.resize(size, Image.LANCZOS)
            else:
                resized = im.copy()
                size = (w, h)

            target.parent.mkdir(parents=True, exist_ok=True)
            resized.save(target, "WEBP", quality=85, method=6)

        manifest["fullbody"][key] = {
            "path": to_public_rel(str(target.relative_to(PUBLIC_DIR).as_posix())),
            "width": size[0], "height": size[1],
        }
        report.processed.append(hero_id)
        log(f"  [fullbody] {hero_id}: {w}x{h} -> {size[0]}x{size[1]} webp q85  src={src.name}")


def process_enemy_units(report: Report, force: bool, dry_run: bool, manifest: dict) -> None:
    """art/gen/enemies/<id>.png(1024 RGBA) -> public/assets/characters/enemies/<id>.webp.

    긴 변 512 로 다운스케일(업스케일 없음), 알파 유지 WebP q85. manifest.enemies 에 등록해
    idleBattleLayout.resolveEnemyArt() / BattleScene 이 최우선으로 조회하게 한다.
    소스가 없는 나머지 id는 regen-list.json 에 기록만 하고 실루엣 폴백을 유지한다.
    """
    manifest.setdefault("enemies", {})
    sources = sorted(ENEMY_UNIT_SOURCE_DIR.glob("enemy_*.png"))
    generated_ids = set()

    for src in sources:
        enemy_id = src.stem
        generated_ids.add(enemy_id)
        target = ENEMY_UNIT_TARGET_DIR / f"{enemy_id}.webp"

        if not is_stale(target, src, force):
            report.up_to_date.append(enemy_id)
            if target.exists():
                with Image.open(target) as t:
                    w, h = t.size
            else:
                w, h = 0, 0
            manifest["enemies"][enemy_id] = {
                "path": to_public_rel(str(target.relative_to(PUBLIC_DIR).as_posix())),
                "width": w, "height": h, "category": "enemy", "priority": "P3", "nineSlice": None,
            }
            continue

        if dry_run:
            report.processed.append(f"{enemy_id} (dry-run)")
            continue

        with Image.open(src) as im:
            im = im.convert("RGBA")
            if not has_real_alpha(im):
                report.skipped_no_alpha.append(enemy_id)
                note_regen(enemy_id, "소스에 유효 알파 채널 없음. 재생성 필요.",
                           f"public/{ENEMY_UNIT_TARGET_DIR.relative_to(PUBLIC_DIR).as_posix()}/{enemy_id}.webp")
                continue

            w, h = im.size
            longest = max(w, h)
            if longest > 512:
                scale = 512 / longest
                size = (max(1, round(w * scale)), max(1, round(h * scale)))
                resized = im.resize(size, Image.LANCZOS)
            else:
                resized = im.copy()
                size = (w, h)

            target.parent.mkdir(parents=True, exist_ok=True)
            resized.save(target, "WEBP", quality=85, method=6)

        manifest["enemies"][enemy_id] = {
            "path": to_public_rel(str(target.relative_to(PUBLIC_DIR).as_posix())),
            "width": size[0], "height": size[1], "category": "enemy", "priority": "P3", "nineSlice": None,
        }
        report.processed.append(enemy_id)
        log(f"  [enemy-unit] {enemy_id}: {w}x{h} -> {size[0]}x{size[1]} webp q85  src={src.name}")

    # 데이터에는 있지만 아직 생성되지 않은 적 — 실루엣 폴백 유지, regen-list 에만 기록.
    if not dry_run and ENEMY_DATA_PATH.exists():
        try:
            enemy_data = json.loads(ENEMY_DATA_PATH.read_text(encoding="utf-8"))
            all_enemy_ids = sorted({e["id"] for e in enemy_data.get("enemies", [])})
        except Exception as e:  # pragma: no cover
            log(f"  경고: {ENEMY_DATA_PATH.name} 파싱 실패({e}), 미생성 목록 계산 스킵")
            all_enemy_ids = []

        pending = sorted(set(all_enemy_ids) - generated_ids)
        for enemy_id in pending:
            note_regen(enemy_id, "미생성 — art/gen/enemies/ 에 소스가 없다. 실루엣 폴백 유지.",
                       f"public/{ENEMY_UNIT_TARGET_DIR.relative_to(PUBLIC_DIR).as_posix()}/{enemy_id}.webp")
        log(f"  미생성(폴백 유지): {len(pending)}종")


def process_chibi_sheets(report: Report, force: bool, dry_run: bool, manifest: dict) -> None:
    """art/gen/chibi_sheet/<hero>_sheet.png -> public/assets/characters/chibi/<hero>_sheet.webp.

    치비 시트는 프레임 경계가 픽셀 단위로 정확해야 한다(Phaser 가 cell 크기로 잘라 쓴다).
    그래서 **무손실 WebP** 로 굽는다 — q90 손실 압축은 프레임 경계에서 이웃 프레임 색이
    번져 들어와 가장자리에 유령이 생긴다. 크기 이득보다 정확성이 우선이고, 어차피
    manifest.chibi 는 지연 로드 버킷이라 초기 전송량 예산에 들어가지 않는다.

    규격(cell/frames/footY)은 art/gen/chibi_sheet/chibi-manifest.json 이 SSOT 다.
    여기서는 그 값을 검증(시트 크기 = cell x 프레임수)한 뒤 그대로 런타임 매니페스트로 옮긴다.
    시트가 규격과 어긋나면 등록하지 않고 regen-list.json 에 남긴다 — 잘못된 cell 로 로드하면
    프레임이 어긋난 채 화면에 서기 때문이다.
    """
    manifest.setdefault("chibi", {})
    if not CHIBI_SPEC_PATH.exists():
        log("  치비 규격 파일 없음 — 스킵 (art/gen/chibi_sheet/chibi-manifest.json)")
        return

    try:
        spec = json.loads(CHIBI_SPEC_PATH.read_text(encoding="utf-8"))
    except Exception as e:  # pragma: no cover
        log(f"  경고: chibi-manifest.json 파싱 실패({e}), 치비 스킵")
        return

    default_cell = int(spec.get("cell", 256))
    default_foot = int(spec.get("footY", 240))
    default_frames = list(spec.get("frameOrder", []))
    heroes = spec.get("heroes", {})

    for hero_id, hero_spec in sorted(heroes.items()):
        cell = int(hero_spec.get("cell", default_cell))
        frames = list(hero_spec.get("frames") or default_frames)
        foot_y = int(hero_spec.get("footY", default_foot))
        sheet_name = hero_spec.get("sheet") or f"{hero_id}_sheet.png"
        src = CHIBI_SOURCE_DIR / sheet_name
        key = f"{CHIBI_KEY_PREFIX}{hero_id}"
        target = CHIBI_TARGET_DIR / f"{hero_id}_sheet.webp"
        rel_target = f"public/{CHIBI_TARGET_DIR.relative_to(PUBLIC_DIR).as_posix()}/{hero_id}_sheet.webp"

        if not src.exists():
            report.skipped_missing_source.append(key)
            note_regen(key, "치비 시트 소스 없음 — tools/art/build-chibi-sheet.py 로 생성 필요.", rel_target)
            continue

        with Image.open(src) as probe:
            sw, sh = probe.size
        if sh != cell or sw != cell * len(frames):
            note_regen(key, f"시트 크기 {sw}x{sh} 가 규격(cell {cell} x {len(frames)}프레임)과 불일치. 재생성 필요.", rel_target)
            log(f"  [chibi] {hero_id}: 규격 불일치 {sw}x{sh} — 등록 스킵")
            continue

        entry = {
            "key": key,
            "path": to_public_rel(str(target.relative_to(PUBLIC_DIR).as_posix())),
            "width": sw, "height": sh,
            "cell": cell,
            "frames": frames,
            "footY": foot_y,
            "heroId": hero_id,
        }

        if not is_stale(target, src, force):
            report.up_to_date.append(key)
            manifest["chibi"][key] = entry
            continue

        if dry_run:
            report.processed.append(f"{key} (dry-run)")
            continue

        with Image.open(src) as im:
            im = im.convert("RGBA")
            if not has_real_alpha(im):
                report.skipped_no_alpha.append(key)
                note_regen(key, "치비 시트에 유효 알파 채널 없음(크로마키 제거 실패). 재생성 필요.", rel_target)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            im.save(target, "WEBP", lossless=True, method=6)

        manifest["chibi"][key] = entry
        report.processed.append(key)
        log(f"  [chibi] {hero_id}: {sw}x{sh} cell={cell} frames={','.join(frames)} -> webp lossless "
            f"({human(target.stat().st_size)})")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="최신이어도 강제 재처리")
    parser.add_argument("--dry-run", action="store_true", help="파일을 쓰지 않고 계획만 출력")
    args = parser.parse_args()

    spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    report = Report()
    manifest = {
        "$schema": "internal://arcanecollectors/asset-manifest/v1",
        "generatedBy": "tools/art/postprocess-assets.py",
        "generatedAt": None,  # 아래서 채움
        # textures: PreloadScene.loadPhase0_Assets() 가 일괄(eager) 로드하는 항목
        #   (background/frame/button/icon/logo). ASSET_USAGE_MAP.md §0 로드 규칙 1.
        "textures": {},
        # lazyTextures: 배너·적 유닛처럼 사용 시점에 개별 지연 로드하는 항목
        #   (banner/fullbody-extra 의 enemy_*). ASSET_USAGE_MAP.md §0 로드 규칙 2.
        #   PreloadScene 은 이 버킷을 읽지 않는다.
        "lazyTextures": {},
        # fullbody: 전신 히어로 웹, HeroDetailScene 이 조회 시점에 지연 로드(W2).
        "fullbody": {},
        # enemies: 적 유닛 아트(512 WebP, 알파 유지). resolveEnemyArt() 최우선 조회 버킷.
        # PreloadScene 은 이 버킷을 읽지 않는다 — BattleScene/MeditationView 가 전투 진입 시 지연 로드.
        "enemies": {},
        # chibi: 명상 로비용 치비 스프라이트 시트(무손실 WebP, 알파 유지).
        # PreloadScene 은 이 버킷을 읽지 않는다 — MeditationView 가 파티 슬롯 조회 시점에 지연 로드한다.
        # 값에 cell/frames/footY 가 함께 들어 있어 씬이 규격을 하드코딩하지 않는다.
        "chibi": {},
        # memoryBudget: tests/e2e/memory-smoke.mjs 의 통과 기준(팀 리드 결정, 2026-09-03).
        # 5회 순환(main→herolist→herodetail→gacha→stageselect→battle→result→main) 중
        # 1회차 대비 5회차 힙/텍스처 증가율을 이 값과 비교한다.
        "memoryBudget": {
            "cycles": 5,
            "heapGrowthMaxPercent": 15,
            "textureCountGrowthMax": 10,
            "route": ["MainMenuScene", "HeroListScene", "HeroDetailScene", "GachaScene", "StageSelectScene", "BattleScene", "BattleResultScene", "MainMenuScene"],
        },
    }

    log("=== 배경 (background) ===")
    for asset in spec["assets"]:
        if asset["category"] == "background":
            process_background(asset, report, args.force, args.dry_run, manifest)

    log("=== 배너 (banner_pickup_*) ===")
    for asset in spec["assets"]:
        if asset["category"] == "banner" and asset["id"].startswith("banner_pickup"):
            process_banner_pickup(asset, report, args.force, args.dry_run, manifest)

    log("=== 배너 (fx_summon_circle 등 알파 필요 이펙트) ===")
    for asset in spec["assets"]:
        if asset["category"] == "banner" and not asset["id"].startswith("banner_pickup"):
            process_alpha_ui(asset, report, args.force, args.dry_run, manifest, is_icon=False, bucket="lazyTextures")

    log("=== 프레임 · 버튼 · 로고 (frame/button/logo) ===")
    for asset in spec["assets"]:
        if asset["category"] in ("frame", "button", "logo"):
            process_alpha_ui(asset, report, args.force, args.dry_run, manifest, is_icon=False)

    log("=== 아이콘 (icon) ===")
    for asset in spec["assets"]:
        if asset["category"] == "icon":
            process_alpha_ui(asset, report, args.force, args.dry_run, manifest, is_icon=True)

    log("=== 적 유닛 (enemy_*) ===")
    for asset in spec["assets"]:
        if asset["category"] == "fullbody-extra" and asset["id"].startswith("enemy_"):
            process_enemy(asset, report, args.force, args.dry_run, manifest)

    log("=== 전신 히어로 (art/gen/fullbody/hero_XXX.png, 스펙 밖 별도 트랙) ===")
    process_fullbody_heroes(report, args.force, args.dry_run, manifest)

    log("=== 적 유닛 아트 (art/gen/enemies/enemy_*.png, 스펙 밖 별도 트랙) ===")
    process_enemy_units(report, args.force, args.dry_run, manifest)

    log("=== 치비 시트 (art/gen/chibi_sheet/<hero>_sheet.png, 스펙 밖 별도 트랙) ===")
    process_chibi_sheets(report, args.force, args.dry_run, manifest)

    from datetime import datetime, timezone
    manifest["generatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # 스펙에는 있으나 이번 실행에서 처리도 스킵도 제외도 안 된 항목(소스 없음) 전부 missing 으로 집계.
    # EXCLUDED_IDS 는 의도적 제외라 missing 이 아니라 regen-list.json 쪽에서 추적한다.
    all_ui_ids = {a["id"] for a in spec["assets"]}
    handled = (
        set(manifest["textures"].keys())
        | set(manifest["lazyTextures"].keys())
        | set(report.skipped_no_alpha)
        | set(EXCLUDED_IDS.keys())
    )
    missing = sorted(all_ui_ids - handled)
    manifest["missing"] = missing
    manifest["skippedNoAlpha"] = sorted(set(report.skipped_no_alpha))
    manifest["excluded"] = sorted(set(report.excluded))

    if not args.dry_run:
        MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        regen_doc = {
            "$schema": "internal://arcanecollectors/regen-list/v1",
            "generatedBy": "tools/art/postprocess-assets.py",
            "generatedAt": manifest["generatedAt"],
            "note": "manifest 에서 제외된 항목. 원인을 해결해 art/gen/assets/ 에 재생성하면 다음 실행에서 자동 포함된다.",
            "items": _REGEN_ENTRIES,
        }
        REGEN_LIST_PATH.write_text(json.dumps(regen_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    log("\n=== 요약 ===")
    log(f"처리됨       : {len(report.processed)}  {report.processed}")
    log(f"최신(스킵)   : {len(report.up_to_date)}")
    log(f"소스 없음    : {len(report.skipped_missing_source)}  {report.skipped_missing_source}")
    log(f"알파 없음    : {len(report.skipped_no_alpha)}  {report.skipped_no_alpha}")
    log(f"제외됨       : {len(report.excluded)}  {report.excluded}")
    log(f"manifest 텍스처 키 수(eager) : {len(manifest['textures'])}")
    log(f"manifest 텍스처 키 수(lazy)  : {len(manifest['lazyTextures'])}")
    log(f"manifest 전신 키 수          : {len(manifest['fullbody'])}")
    log(f"manifest 적 유닛 키 수       : {len(manifest['enemies'])}")
    log(f"manifest 치비 시트 키 수     : {len(manifest['chibi'])}")
    if not args.dry_run:
        log(f"manifest 저장: {MANIFEST_PATH.relative_to(ROOT)}")
        log(f"regen-list 저장: {REGEN_LIST_PATH.relative_to(ROOT)} ({len(_REGEN_ENTRIES)}건)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
