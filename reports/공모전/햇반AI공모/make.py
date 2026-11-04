"""햇반 AI공모전 응모작 생성/합성 스크립트 (표준 라이브러리 + Pillow)

사용:
  python make.py prep   # workflows/cutN.json 생성 (ComfyUI 불필요)
  python make.py run    # ComfyUI(기본 8188)가 살아 있을 때만 컷당 1회 생성 -> 합성
  python make.py comp   # raw/ 의 이미지에 공식 로고+문구 합성만 다시 수행
환경변수 COMFY=http://127.0.0.1:8189 로 포트 변경. 이 스크립트는 ComfyUI를 띄우거나 종료하지 않는다.
"""
import json, os, sys, time, datetime, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
COMFY = os.environ.get("COMFY", "http://127.0.0.1:8188")
W, H = 1088, 1360  # 16의 배수. 합성 단계에서 1080x1350 으로 중앙 크롭

STYLE = ("photorealistic editorial photograph, warm cinematic lighting, shallow depth of field, "
         "fine detail, natural skin, 35mm lens, soft rising steam. "
         "The rice container is a generic plain white microwaveable instant-rice bowl with a plain "
         "matte red film lid, absolutely no text, no logo, no label, no brand marks anywhere. "
         "Leave the top-left corner and the bottom third of the frame relatively empty and calm.")

CUTS = [
    dict(n=1, seed=3010101, title="온기 통화", sub="김 한 줄기로 이어지는 안부",
         ko="새벽, 불 꺼진 좁은 서울 원룸. 청년이 갓 데운 즉석밥 용기 뚜껑을 열자 김이 피어오르고, 그 김 속에 시골 부엌의 따뜻한 풍경이 홀로그램처럼 비친다.",
         en="A young Korean man sits at a small table in a dim studio apartment at dawn, opening the lid of a plain white instant rice bowl; "
            "the rising steam glows amber and forms a soft holographic window showing a warm countryside kitchen in miniature."),
    dict(n=2, seed=3010202, title="온기 통화", sub="같은 시각, 시골 부엌",
         ko="시골집 부엌. 어르신이 같은 모양의 용기를 열자 김 속에 도시 원룸의 청년이 작게 보인다. 두 김이 창가에서 하나로 이어진다.",
         en="A warm old Korean farmhouse kitchen in morning light; an elderly woman opens a plain white instant rice bowl, "
            "its steam curls and merges with a thin glowing thread of steam traveling out the window toward a distant city skyline."),
    dict(n=3, seed=3010303, title="온기 통화", sub="지구 밖에서도",
         ko="우주정거장 창가. 우주인이 용기를 열자 김이 무중력 속에서 둥글게 떠올라 창밖 지구와 고향의 불빛을 감싼다.",
         en="Inside a clean near-future space station cupola, an astronaut opens a plain white instant rice bowl; steam floats in "
            "zero gravity as a luminous soft cloud, framing planet Earth and city lights through the window."),
    dict(n=4, seed=3010404, title="온기 통화", sub="30년, 아직 따뜻한 안부",
         ko="마무리 컷. 어두운 하늘 위 도시·시골·바다·우주 곳곳의 창문에서 올라온 따뜻한 김 줄기들이 하나의 큰 곡선으로 이어진다.",
         en="Wide dreamy night scene: many tiny lit windows of a city, a village, a ship and a space station each release a thin ribbon "
            "of warm steam that rises and weaves together into one large glowing golden curve across a deep blue sky, no text."),
]
NEG_NOTE = "Z-Image Turbo(cfg=1)는 네거티브 프롬프트를 쓰지 않음(ConditioningZeroOut). 금지 요소는 긍정 프롬프트 문장으로 지시."


def workflow(cut):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "z_image_turbo_bf16.safetensors", "weight_dtype": "fp8_e4m3fn"}},
        "3": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3}},
        "4": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_4b_fp8_mixed.safetensors", "type": "lumina2"}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["4", 0], "text": cut["en"] + " " + STYLE}},
        "6": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["5", 0]}},
        "7": {"class_type": "EmptySD3LatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}},
        "8": {"class_type": "KSampler", "inputs": {"model": ["3", 0], "positive": ["5", 0], "negative": ["6", 0],
              "latent_image": ["7", 0], "seed": cut["seed"], "steps": 4, "cfg": 1,
              "sampler_name": "res_multistep", "scheduler": "simple", "denoise": 1}},
        "9": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "10": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["9", 0]}},
        "11": {"class_type": "SaveImage", "inputs": {"images": ["10", 0], "filename_prefix": "hetbahn30/cut%d" % cut["n"]}},
    }


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)


def prep():
    for c in CUTS:
        write(os.path.join(HERE, "workflows", "cut%d.json" % c["n"]), json.dumps(workflow(c), ensure_ascii=False, indent=2) + "\n")
    write(os.path.join(HERE, "prompts.json"), json.dumps(dict(width=W, height=H, style=STYLE, cuts=CUTS), ensure_ascii=False, indent=2) + "\n")
    print("workflows/ , prompts.json 생성 완료")


def http(path, data=None, raw=False):
    req = urllib.request.Request(COMFY + path, data=json.dumps(data).encode() if data is not None else None,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        b = r.read()
    return b if raw else json.loads(b)


def run():
    try:
        st = http("/system_stats")
    except Exception as e:
        print("ComfyUI 응답 없음 -> 생성하지 않음:", e)
        return
    os.makedirs(os.path.join(HERE, "raw"), exist_ok=True)
    log = []
    for c in CUTS:
        t0 = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
        wf = workflow(c)
        pid = http("/prompt", {"prompt": wf})["prompt_id"]
        while True:
            time.sleep(3)
            h = http("/history/" + pid)
            if pid in h and h[pid].get("outputs"):
                break
        im = h[pid]["outputs"]["11"]["images"][0]
        q = urllib.parse.urlencode(dict(filename=im["filename"], subfolder=im["subfolder"], type=im["type"]))
        data = http("/view?" + q, raw=True)
        open(os.path.join(HERE, "raw", "cut%d_raw.png" % c["n"]), "wb").write(data)
        log.append(dict(cut=c["n"], seed=c["seed"], prompt_id=pid, started=t0,
                        finished=datetime.datetime.now().astimezone().isoformat(timespec="seconds"), comfy=COMFY,
                        saved_by_comfy=im))
        print("cut", c["n"], "done")
    write(os.path.join(HERE, "생성기록.json"), json.dumps(dict(system_stats=st, runs=log), ensure_ascii=False, indent=2) + "\n")
    comp()


def comp():
    from PIL import Image, ImageDraw, ImageFont
    logo = Image.open(os.path.join(HERE, "logo", "logo_4x5_red-white.png")).convert("RGBA")  # 공식 로고 오버레이(1080x1350)
    font_path = "C:/Windows/Fonts/malgunbd.ttf"
    os.makedirs(os.path.join(HERE, "final"), exist_ok=True)
    for c in CUTS:
        p = os.path.join(HERE, "raw", "cut%d_raw.png" % c["n"])
        if not os.path.exists(p):
            print("없음:", p); continue
        im = Image.open(p).convert("RGB")
        k = max(1080 / im.width, 1350 / im.height)  # 크기가 달라도(ComfyUI 1088x1360, GPT 1024x1536) 꽉 채워 중앙 크롭
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        l, t = (im.width - 1080) // 2, (im.height - 1350) // 2
        im = im.crop((l, t, l + 1080, t + 1350)).convert("RGBA")
        # 하단 그라데이션 + 문구
        g = Image.new("RGBA", im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(g)
        for y in range(900, 1350):
            d.line([(0, y), (1080, y)], fill=(0, 0, 0, int(170 * (y - 900) / 450)))
        im = Image.alpha_composite(im, g)
        d = ImageDraw.Draw(im)
        d.text((70, 1150), c["title"], font=ImageFont.truetype(font_path, 84), fill="white")
        d.text((72, 1255), c["sub"], font=ImageFont.truetype(font_path, 44), fill=(255, 235, 200))
        im = Image.alpha_composite(im, logo)
        im.convert("RGB").save(os.path.join(HERE, "final", "hetbahn30_%02d.png" % c["n"]))
        print("합성:", c["n"])


if __name__ == "__main__":
    {"prep": prep, "run": run, "comp": comp}[sys.argv[1] if len(sys.argv) > 1 else "prep"]()
