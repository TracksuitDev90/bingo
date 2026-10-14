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

paper = 1.0 - 0.018 * np.abs(grain) - 0.03 * (mottle * 0.5 + 0.5) - 0.02 * (cloud * 0.5 + 0.5) - 0.07 * fib
speck = (rng.random((N, N)) > 0.9993).astype(np.float32)
speck = np.asarray(Image.fromarray((speck * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)), np.float32) / 255
paper -= 0.5 * speck
Image.fromarray((np.clip(paper, 0, 1) * 255).astype(np.uint8)).save("assets/img/paper.jpg", quality=86, optimize=True)
