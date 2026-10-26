"""
Builds the satellite Earth assets used by the 3D globe and the flat Equal Earth fallback.

Source: the `three-globe` npm package (MIT), folder example/img and example/clouds.
  npm pack three-globe && tar -xzf three-globe-*.tgz package/example
Imagery is NASA Blue Marble (public domain) with bathymetry, night lights, cloud layer and a topography map.

Run:  python3 scripts/gen_earth_assets.py <path-to>/package/example
Writes into ./assets/textures and ./assets/maps (JPEG, sizes chosen for a modern phone GPU).
"""
import os, sys, math
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(ROOT, "assets", "textures")
MAPS = os.path.join(ROOT, "assets", "maps")
SPACE = (0x07, 0x0D, 0x22)  # background around the Equal Earth ellipse

# Same constants as src/three/globeMath.ts
A1, A2, A3, A4 = 1.340264, -0.081106, 0.000893, 0.003796


def ee_forward(lon, lat):
    th = np.arcsin((math.sqrt(3) / 2) * np.sin(lat))
    t2 = th * th; t6 = t2 ** 3
    x = (2 * math.sqrt(3) * lon * np.cos(th)) / (3 * (9 * A4 * t6 * t2 + 7 * A3 * t6 + 3 * A2 * t2 + A1))
    y = th * (A4 * t6 * t2 + A3 * t6 + A2 * t2 + A1)
    return x, y


def main(src):
    img = lambda *p: os.path.join(src, *p)
    os.makedirs(TEX, exist_ok=True); os.makedirs(MAPS, exist_ok=True)

    day = Image.open(img("img", "earth-blue-marble.jpg")).convert("RGB")           # 4096 x 2048
    day.save(os.path.join(TEX, "earth_day_4k.jpg"), quality=92, subsampling=0)

    Image.open(img("img", "earth-night.jpg")).convert("RGB").save(os.path.join(TEX, "earth_night_4k.jpg"), quality=90)

    # Cloud cover is stored as the alpha channel of a palette PNG. Keep it as a greyscale alphaMap.
    clouds = np.array(Image.open(img("clouds", "clouds.png")).convert("RGBA"))[..., 3]
    Image.fromarray(clouds, "L").save(os.path.join(TEX, "earth_clouds_4k.jpg"), quality=90)

    # White = ocean (shiny), black = land.
    Image.open(img("img", "earth-water.png")).convert("L").resize((2048, 1024), Image.LANCZOS).save(os.path.join(TEX, "earth_spec_2k.jpg"), quality=90)
    # Bright = high ground.
    Image.open(img("img", "earth-topology.png")).convert("L").save(os.path.join(TEX, "earth_bump_2k.jpg"), quality=92)

    # ---- Equal Earth reprojection of the day map (flat fallback). Bounds match equalEarthUV in globeMath.ts.
    xmax, _ = ee_forward(np.array(math.pi), np.array(0.0))
    _, ymax = ee_forward(np.array(0.0), np.array(math.pi / 2))
    W = 4096; H = int(round(W * ymax / xmax))
    px = (np.arange(W) + 0.5) / W; py = (np.arange(H) + 0.5) / H
    X = (px * 2 - 1)[None, :] * xmax * np.ones((H, 1)); Y = (1 - py * 2)[:, None] * ymax * np.ones((1, W))
    th = Y / A1
    for _ in range(12):  # Newton on y = th (A1 + A2 th^2 + A3 th^6 + A4 th^8)
        t2 = th * th; t6 = t2 ** 3
        f = th * (A4 * t6 * t2 + A3 * t6 + A2 * t2 + A1) - Y
        df = A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)
        th = th - f / df
    t2 = th * th; t6 = t2 ** 3
    lat = np.arcsin(np.clip(2 * np.sin(th) / math.sqrt(3), -1, 1))
    lon = 3 * X * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)) / (2 * math.sqrt(3) * np.cos(th))
    inside = np.abs(lon) <= math.pi
    sw, sh = day.size; src_arr = np.asarray(day).astype(np.float32)
    fx = (lon / (2 * math.pi) + 0.5) * sw - 0.5; fy = (0.5 - lat / math.pi) * sh - 0.5
    x0 = np.clip(np.floor(fx).astype(int), 0, sw - 1); y0 = np.clip(np.floor(fy).astype(int), 0, sh - 1)
    x1 = np.clip(x0 + 1, 0, sw - 1); y1 = np.clip(y0 + 1, 0, sh - 1)
    wx = (fx - x0)[..., None]; wy = (fy - y0)[..., None]
    out = (src_arr[y0, x0] * (1 - wx) * (1 - wy) + src_arr[y0, x1] * wx * (1 - wy) + src_arr[y1, x0] * (1 - wx) * wy + src_arr[y1, x1] * wx * wy)
    out[~inside] = SPACE
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(os.path.join(MAPS, "map_equalearth_4k.jpg"), quality=90)
    print("flat map", W, "x", H)


if __name__ == "__main__":
    if len(sys.argv) != 2: sys.exit(__doc__)
    main(sys.argv[1])
