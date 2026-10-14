# Generates assets/img/wood.jpg: procedural walnut planks (flat-sawn grain
# from a tilted log-axis model, fibres, pores, bevels and wear).
# Run from the repo root: python3 tools/make_wood.py  (needs numpy + Pillow)
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
rng = np.random.default_rng(11)
W, H = 2400, 1600

def noise(h, w, cy, cx, octaves=1, persist=0.5):
    out = np.zeros((h, w), np.float32); amp = 1.0; tot = 0
    for o in range(octaves):
        gy, gx = max(2, int(cy * 2**o)), max(2, int(cx * 2**o))
        g = rng.random((gy, gx)).astype(np.float32)
        img = Image.fromarray(g, mode="F").resize((w, h), Image.BICUBIC)
        out += amp * np.asarray(img, np.float32); tot += amp; amp *= persist
    return out / tot

def board(h, w):
    y = np.arange(h, dtype=np.float32)[:, None]
    x = np.arange(w, dtype=np.float32)[None, :]
    # log axis model: plane cut at depth d(x) from a slightly tilted pith
    d0 = rng.uniform(40, 260)
    slope = rng.uniform(-0.12, 0.12)
    yc = rng.uniform(-0.4, 1.4) * h
    wob = (noise(1, w, 1, 5, octaves=3)[0] - 0.5) * 120
    warp = (noise(h, w, 3, 7, octaves=3, persist=0.45) - 0.5)
    d = d0 + slope * (x - w / 2) + wob[None, :]
    r = np.sqrt(d ** 2 + ((y - yc) * 1.0) ** 2)
    ring_w = rng.uniform(7.5, 11.0)
    t = r / ring_w + warp * 1.7
    t += (noise(h, w, 2, 6, octaves=2) - 0.5) * 2.0       # ring width variation
    f = t - np.floor(t)
    # early wood light, late wood a darker band ending in a crisp edge
    late = np.clip((f - 0.55) / 0.45, 0, 1) ** 2.2
    edge = np.exp(-((f - 0.985) / 0.03) ** 2) * 0.6
    grain = np.clip(late * 0.75 + edge, 0, 1)
    grain *= 0.6 + 0.4 * noise(h, w, 6, 40, octaves=2)
    # long fibres
    fib = noise(h, w, h / 1.6, w / 90, octaves=3, persist=0.55)
    fib = (fib - fib.mean()) * 2.2
    # pores / ticks
    p = noise(h, w, h / 1.3, w / 7, octaves=1)
    pores = np.clip((p - 0.8) / 0.2, 0, 1)
    tone = noise(h, w, 2, 3, octaves=2)
    return grain, fib, pores, tone

light = np.array([0.58, 0.375, 0.22])
dark = np.array([0.27, 0.15, 0.075])
deep = np.array([0.16, 0.085, 0.04])
img = np.zeros((H, W, 3), np.float32)
ys = [0]
while ys[-1] < H:
    ys.append(ys[-1] + int(rng.integers(270, 340)))
for i in range(len(ys) - 1):
    y0, y1 = ys[i], min(ys[i + 1], H); h = y1 - y0
    # each board may be made of 1-2 pieces joined end to end
    joints = sorted(rng.integers(500, W - 500, size=rng.integers(0, 2)).tolist())
    segs = [0] + joints + [W]
    for a, b in zip(segs[:-1], segs[1:]):
        w = b - a
        grain, fib, pores, tone = board(h, w)
        shade = rng.uniform(0.85, 1.08)
        tint = np.array([1.0, rng.uniform(0.96, 1.03), rng.uniform(0.9, 1.05)])
        base = light * (0.82 + 0.28 * tone)[..., None]
        col = base * (1 - 0.62 * grain[..., None]) + dark * 0.62 * grain[..., None]
        col *= (1 + 0.10 * fib[..., None])
        col = col * (1 - 0.45 * pores[..., None]) + deep * 0.45 * pores[..., None]
        col *= shade * tint
        if a > 0:
            col[:, :2] *= 0.3; col[:, 2:4] *= 1.08
        img[y0:y1, a:b] = col
    k = np.arange(h, dtype=np.float32)
    bevel = 1 - 0.6 * np.exp(-k / 2.0) - 0.45 * np.exp(-(h - 1 - k) / 2.5) + 0.08 * np.exp(-((k - 4) / 2.0) ** 2)
    img[y0:y1] *= bevel[:, None, None]

# wear and use
s_img = Image.new("L", (W, H), 0); dr = ImageDraw.Draw(s_img)
for _ in range(320):
    x0, y0 = rng.integers(0, W), rng.integers(0, H)
    ln = rng.integers(15, 160); ang = rng.normal(0, 0.35)
    dr.line([x0, y0, x0 + ln * np.cos(ang), y0 + ln * np.sin(ang)], fill=int(rng.integers(15, 60)), width=1)
s = np.asarray(s_img.filter(ImageFilter.GaussianBlur(0.5)), np.float32) / 255
img *= (1 + 0.45 * s[..., None])
img *= (0.93 + 0.12 * noise(H, W, 5, 8, octaves=3)[..., None])
img += (rng.random((H, W, 1)).astype(np.float32) - 0.5) * 0.02
img = np.clip(img, 0, 1)
out = Image.fromarray((img * 255).astype(np.uint8))
out.save("assets/img/wood.jpg", quality=78, optimize=True, progressive=True)
