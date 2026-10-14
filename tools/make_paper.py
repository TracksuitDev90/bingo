# Generates assets/img/paper.jpg: a seamless 512px paper grain (FFT noise
# is periodic, fibres are drawn on a 3x3 tile and cropped).
# Run from the repo root: python3 tools/make_paper.py  (needs numpy + Pillow)
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

rng = np.random.default_rng(3)
N = 512


def fftnoise(beta):
    kx = np.fft.fftfreq(N)[None, :]
    ky = np.fft.fftfreq(N)[:, None]
    k = np.sqrt(kx**2 + ky**2)
    k[0, 0] = 1
    spec = (rng.normal(size=(N, N)) + 1j * rng.normal(size=(N, N))) / k**beta
    spec[0, 0] = 0
    n = np.real(np.fft.ifft2(spec))
    return (n - n.mean()) / n.std()


grain = fftnoise(0.25)
mottle = fftnoise(1.7)
cloud = fftnoise(1.2)

big = Image.new("L", (N * 3, N * 3), 0)
d = ImageDraw.Draw(big)
for _ in range(900):
    x, y = rng.uniform(N, 2 * N), rng.uniform(N, 2 * N)
    ang = rng.uniform(0, np.pi)
    L = rng.uniform(6, 28)
    pts = []
    for _ in range(6):
        ang += rng.normal(0, 0.25)
        pts.append((x, y))
        x += np.cos(ang) * L / 5
        y += np.sin(ang) * L / 5
    v = int(rng.integers(40, 140))
    for ox in (-N, 0, N):
        for oy in (-N, 0, N):
            d.line([(px + ox, py + oy) for px, py in pts], fill=v, width=1)
fib = np.asarray(big.filter(ImageFilter.GaussianBlur(0.45)).crop((N, N, 2 * N, 2 * N)), np.float32) / 255

paper = 1.0 - 0.022 * np.abs(grain) - 0.05 * (mottle * 0.5 + 0.5) - 0.03 * (cloud * 0.5 + 0.5) - 0.1 * fib

# Dust specks and foxing (the little brown age spots on old paper), drawn
# wrapped so the tile stays seamless.
spots = Image.new("L", (N * 3, N * 3), 0)
d = ImageDraw.Draw(spots)
for _ in range(110):
    x, y, r = rng.uniform(N, 2 * N), rng.uniform(N, 2 * N), rng.uniform(0.4, 1.1)
    v = int(rng.integers(120, 255))
    for ox in (-N, 0, N):
        for oy in (-N, 0, N):
            d.ellipse([x + ox - r, y + oy - r, x + ox + r, y + oy + r], fill=v)
fox = Image.new("L", (N * 3, N * 3), 0)
d = ImageDraw.Draw(fox)
for _ in range(16):
    x, y = rng.uniform(N, 2 * N), rng.uniform(N, 2 * N)
    for _ in range(int(rng.integers(3, 8))):
        px, py, r = x + rng.normal(0, 3), y + rng.normal(0, 3), rng.uniform(1.5, 4.5)
        for ox in (-N, 0, N):
            for oy in (-N, 0, N):
                d.ellipse([px + ox - r, py + oy - r, px + ox + r, py + oy + r], fill=int(rng.integers(50, 110)))
sp = np.asarray(spots.filter(ImageFilter.GaussianBlur(0.5)).crop((N, N, 2 * N, 2 * N)), np.float32) / 255
fx = np.asarray(fox.filter(ImageFilter.GaussianBlur(2.2)).crop((N, N, 2 * N, 2 * N)), np.float32) / 255
paper -= 0.3 * sp + 0.32 * fx
Image.fromarray((np.clip(paper, 0, 1) * 255).astype(np.uint8)).save("assets/img/paper.jpg", quality=86, optimize=True)
