"""아트 스타일 톤 정렬 — 카테고리별 목표 명도/채도로 색보정.
캐릭터(Codex 계열)를 기준 톤으로 삼고 나머지를 거기에 맞춘다.
알파는 보존, 색상(Hue)은 유지하고 채도·명도·대비만 조정."""
import numpy as np
from PIL import Image
import colorsys, os, glob, sys, json

# 기준: 캐릭터 전신/초상화 실측 평균
TARGET = {"value": 110.0, "sat": 36.0}

def measure(img):
    a = np.asarray(img.convert("RGBA"))
    m = a[..., 3] > 128
    px = a[..., :3][m] if m.any() else a[..., :3].reshape(-1, 3)
    if px.size == 0:
        return 0.0, 0.0
    return float(px.mean()), float((px.max(1).astype(int) - px.min(1).astype(int)).mean())

def harmonize(img, target=TARGET, sat_strength=0.75, val_strength=0.6):
    """HSV에서 S·V만 목표로 끌어당긴다(과보정 방지 위해 강도 계수 적용)."""
    rgba = np.asarray(img.convert("RGBA")).astype(np.float32)
    rgb = rgba[..., :3] / 255.0
    alpha = rgba[..., 3:]
    mx = rgb.max(2); mn = rgb.min(2); v = mx
    d = mx - mn
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    cur_v, cur_s = measure(img)
    if cur_v <= 0:
        return img
    # 배율 계산 후 강도로 완화
    v_ratio = 1.0 + (target["value"] / max(cur_v, 1e-3) - 1.0) * val_strength
    s_ratio = 1.0 + (target["sat"] / max(cur_s, 1e-3) - 1.0) * sat_strength
    v_ratio = float(np.clip(v_ratio, 0.75, 1.6))
    s_ratio = float(np.clip(s_ratio, 0.55, 1.5))
    v2 = np.clip(v * v_ratio, 0, 1)
    s2 = np.clip(s * s_ratio, 0, 1)
    # HSV → RGB (H 유지: 원본 채널 비율 재구성)
    c = v2 * s2
    mn2 = v2 - c
    scale = np.where(d > 1e-6, c / np.maximum(d, 1e-6), 0)[..., None]
    out = (rgb - mn[..., None]) * scale + mn2[..., None]
    out = np.clip(out * 255.0, 0, 255)
    return Image.fromarray(np.concatenate([out, alpha], axis=2).astype(np.uint8), "RGBA")

if __name__ == "__main__":
    src_glob = sys.argv[1]
    dst_dir = sys.argv[2]
    os.makedirs(dst_dir, exist_ok=True)
    rows = []
    for f in sorted(glob.glob(src_glob)):
        im = Image.open(f)
        before = measure(im)
        out = harmonize(im)
        after = measure(out)
        out.save(os.path.join(dst_dir, os.path.basename(f)))
        rows.append((os.path.basename(f), before, after))
    print(f"harmonized {len(rows)} → {dst_dir}")
    for n, b, a in rows[:5]:
        print(f"  {n:32s} 명도 {b[0]:.0f}→{a[0]:.0f}  채도 {b[1]:.0f}→{a[1]:.0f}")
