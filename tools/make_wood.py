# Generates assets/img/wood.jpg: an old walnut tabletop seen from above.
#
# A table, not a floor: three wide glued-up boards running the full length
# (no butt joints), a mix of flat-sawn "cathedral" grain and straight rift
# grain, a couple of knots the grain swirls around, and the marks of years
# of use: scratches going every which way, small dents, and mug rings.
#
# Run from the repo root: python3 tools/make_wood.py  (needs numpy + Pillow)
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

rng = np.random.default_rng(1971)
W, H = 2400, 1600


def noise(h, w, cy, cx, octaves=1, persist=0.5):
    """Smooth value noise: random grids bicubic-upsampled to (h, w)."""
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        gy, gx = max(2, int(cy * 2**o)), max(2, int(cx * 2**o))
        g = rng.random((gy, gx)).astype(np.float32)
        out += amp * np.asarray(Image.fromarray(g, mode="F").resize((w, h), Image.BICUBIC), np.float32)
        tot += amp
        amp *= persist
    return out / tot


def board(h, w, kind):
    y = np.arange(h, dtype=np.float32)[:, None]
    x = np.arange(w, dtype=np.float32)[None, :]
    warp = noise(h, w, 3, 6, octaves=3, persist=0.45) - 0.5
    wob = (noise(1, w, 1, 5, octaves=3)[0] - 0.5) * 140
    if kind == "flat":
        # Plane cut at depth d(x) from a slightly tilted log axis -> cathedral arches.
        d0 = rng.uniform(60, 240)
        slope = rng.uniform(-0.1, 0.1)
        yc = rng.uniform(0.15, 0.85) * h
        d = d0 + slope * (x - w / 2) + wob[None, :]
        r = np.sqrt(d**2 + (y - yc) ** 2)
    else:
        # Rift / quarter sawn: near-parallel lines with a gentle wander.
        bend = (noise(h, w, 2, 4, octaves=2) - 0.5) * 60
        r = y * rng.uniform(0.9, 1.1) + wob[None, :] * 0.8 + bend + 400
    ring_w = rng.uniform(9.0, 13.0)
    t = r / ring_w + warp * 2.2 + (noise(h, w, 2, 5, octaves=2) - 0.5) * 2.6

    # Knots: the grain bends around them.
    knots = []
    for _ in range(1 if rng.random() < (0.5 if kind == "flat" else 0.25) else 0):
        kx, ky = rng.uniform(0.1, 0.9) * w, rng.uniform(0.25, 0.75) * h
        ks = rng.uniform(14, 26)
        dd = np.sqrt(((x - kx) / 2.6) ** 2 + (y - ky) ** 2)
        t += 5 * np.exp(-((dd / (ks * 3.6)) ** 2))
        knots.append((kx, ky, ks))

    f = t - np.floor(t)
    late = np.clip((f - 0.55) / 0.45, 0, 1) ** 2.0
    edge = np.exp(-(((f - 0.98) / 0.035) ** 2)) * 0.55
    grain = np.clip(late * 0.85 + edge, 0, 1) * (0.6 + 0.4 * noise(h, w, 5, 30, octaves=2))
    # Long mineral streaks running with the grain.
    streak = np.clip((noise(h, w, 14, 2, octaves=2) - 0.58) / 0.3, 0, 1)
    fib = noise(h, w, h / 1.5, w / 100, octaves=3, persist=0.55)
    fib = (fib - fib.mean()) * 2.4
    pores = np.clip((noise(h, w, h / 1.2, w / 8) - 0.8) / 0.2, 0, 1)
    tone = noise(h, w, 2, 3, octaves=2)
    return grain, fib, pores, tone, knots, streak


light = np.array([0.56, 0.33, 0.165])
dark = np.array([0.22, 0.1, 0.04])
deep = np.array([0.13, 0.06, 0.025])
img = np.zeros((H, W, 3), np.float32)

edges = [-160]
while edges[-1] < H:
    edges.append(edges[-1] + int(rng.integers(520, 610)))
kinds = ["flat", "rift", "flat", "rift", "flat"]
for i in range(len(edges) - 1):
    y0, y1 = max(0, edges[i]), min(H, edges[i + 1])
    full = edges[i + 1] - edges[i]
    grain, fib, pores, tone, knots, streak = board(full, W, kinds[i % len(kinds)])
    off = y0 - edges[i]
    sl = slice(off, off + (y1 - y0))
    grain, fib, pores, tone, streak = grain[sl], fib[sl], pores[sl], tone[sl], streak[sl]
    shade = rng.uniform(0.9, 1.08)
    tint = np.array([1.0, rng.uniform(0.96, 1.03), rng.uniform(0.9, 1.04)])
    col = light * (0.8 + 0.3 * tone)[..., None]
    col = col * (1 - 0.68 * grain[..., None]) + dark * 0.68 * grain[..., None]
    col *= 1 - 0.15 * streak[..., None]
    col *= 1 + 0.09 * fib[..., None]
    col = col * (1 - 0.45 * pores[..., None]) + deep * 0.45 * pores[..., None]
    col *= shade * tint
    # Knot cores.
    yy = np.arange(y1 - y0, dtype=np.float32)[:, None] + off
    xx = np.arange(W, dtype=np.float32)[None, :]
    for kx, ky, ks in knots:
        dd = np.sqrt(((xx - kx) / 1.4) ** 2 + (yy - ky) ** 2)
        core = np.exp(-((dd / ks) ** 2))
        rim = np.exp(-(((dd - ks * 1.1) / (ks * 0.25)) ** 2))
        col = col * (1 - 0.75 * core[..., None]) + deep * 0.75 * core[..., None]
        col *= 1 - 0.3 * rim[..., None]
    img[y0:y1] = col

# Tight glue seams between boards.
for e in edges[1:-1]:
    if 0 < e < H:
        img[e - 1 : e + 1] *= 0.42
        img[e + 1 : e + 2] *= 1.05

# Years of use ---------------------------------------------------------------------
scr = Image.new("L", (W, H), 0)
d = ImageDraw.Draw(scr)
for _ in range(700):
    x0, y0 = rng.uniform(0, W), rng.uniform(0, H)
    ln = rng.uniform(8, 140)
    ang = rng.uniform(0, np.pi)
    pts = [(x0, y0)]
    for _ in range(4):
        ang += rng.normal(0, 0.08)
        x0 += np.cos(ang) * ln / 4
        y0 += np.sin(ang) * ln / 4
        pts.append((x0, y0))
    d.line(pts, fill=int(rng.integers(12, 55)), width=1)
s = np.asarray(scr.filter(ImageFilter.GaussianBlur(0.5)), np.float32) / 255
img *= 1 + 0.55 * s[..., None]

dents = Image.new("L", (W, H), 0)
d = ImageDraw.Draw(dents)
for _ in range(90):
    x0, y0, rr = rng.uniform(0, W), rng.uniform(0, H), rng.uniform(1.5, 4)
    d.ellipse([x0 - rr, y0 - rr * 0.7, x0 + rr, y0 + rr * 0.7], fill=int(rng.integers(40, 110)))
dn = np.asarray(dents.filter(ImageFilter.GaussianBlur(1.0)), np.float32) / 255
img *= 1 - 0.35 * dn[..., None]

# Mug rings: a darker, uneven ring where a wet mug once sat.
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
for cx, cy, R, a0, span in [(0.83, 0.2, 92, 0.6, 5.2), (0.12, 0.84, 84, 2.4, 4.4), (0.9, 0.82, 70, 4.0, 3.0)]:
    cx, cy = cx * W, cy * H
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    ang = (np.arctan2(yy - cy, xx - cx) - a0) % (2 * np.pi)
    arc = np.clip((span - ang) / 0.4, 0, 1) * np.clip(ang / 0.4, 0, 1)
    wob = (noise(H, W, 6, 9) - 0.5) * 5
    ring = np.exp(-(((dist - R + wob) / 3.2) ** 2)) * arc
    inner = np.clip(1 - dist / R, 0, 1) ** 0.3 * (dist < R) * 0.25
    stain = np.clip(ring * 0.5 + inner * 0.25, 0, 1)
    img *= 1 - 0.32 * stain[..., None]

img *= 0.93 + 0.12 * noise(H, W, 4, 6, octaves=3)[..., None]
img += (rng.random((H, W, 1)).astype(np.float32) - 0.5) * 0.018
img = np.clip(img, 0, 1)
Image.fromarray((img * 255).astype(np.uint8)).save("assets/img/wood.jpg", quality=80, optimize=True, progressive=True)
print("wrote assets/img/wood.jpg")
