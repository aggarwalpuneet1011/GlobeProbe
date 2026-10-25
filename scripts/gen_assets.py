"""
Offline asset generator for GlobeProbe.
Outputs into ./assets :
  sounds/*.ogg                    12 synthesised sound effects
  textures/earth_2k.jpg           2048x1024 equirectangular, flat colours from Natural Earth land (Plan B)
  maps/map_equalearth.png         2048x~1000 Equal Earth projection, same colours (Plan C globe)
  textures/landform_256.png       256x256 greyscale heightmap (reference copy; the app builds the same
                                  grid at run time from src/three/heightmap.ts, because React Native cannot decode PNG pixels)
Run:  python3 scripts/gen_assets.py <land.geojson>
"""
import sys, os, json, math, subprocess, tempfile, wave
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = os.path.join(ROOT, "assets")
OCEAN = (0x1E, 0x88, 0xC7); LAND = (0x3F, 0xAE, 0x5A); ICE = (0xF4, 0xF8, 0xFB); CREAM = (0xFF, 0xF8, 0xEC)

# ------------------------------------------------------------------ land drawing
def load_polys(path):
    gj = json.load(open(path))
    polys = []  # list of (exterior, [holes]) each a list of (lon, lat)
    feats = gj["features"] if gj["type"] == "FeatureCollection" else [gj]
    for f in feats:
        g = f["geometry"]
        mp = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for rings in mp:
            polys.append((rings[0], rings[1:]))
    return polys

def is_ice(ext):
    lats = [p[1] for p in ext]; lons = [p[0] for p in ext]
    mlat = sum(lats) / len(lats); mlon = sum(lons) / len(lons)
    if mlat < -60: return True                       # Antarctica
    if mlat > 60 and -75 < mlon < -10 and len(ext) > 200: return True   # Greenland
    return False

def unwrap(ring):
    """Make longitudes continuous across the antimeridian. Pole-enclosing rings (Antarctica) are left alone."""
    out = [list(ring[0])]
    for lon, lat in ring[1:]:
        prev = out[-1][0]
        while lon - prev > 180: lon -= 360
        while lon - prev < -180: lon += 360
        out.append([lon, lat])
    if abs(out[-1][0] - out[0][0]) > 180:   # does not close: encloses a pole
        return [list(p) for p in ring], False
    return out, True

def wrapped_copies(ring):
    r, shifted = unwrap(ring)
    if not shifted: return [r]
    return [[[lo + k * 360, la] for lo, la in r] for k in (-1, 0, 1)]

def draw_equirect(polys, W, H):
    im = Image.new("RGB", (W, H), OCEAN); d = ImageDraw.Draw(im)
    px = lambda lon, lat: ((lon + 180) / 360 * W, (90 - lat) / 180 * H)
    for ext, holes in polys:
        col = ICE if is_ice(ext) else LAND
        for ring in wrapped_copies(ext): d.polygon([px(*p) for p in ring], fill=col)
        for h in holes:
            for ring in wrapped_copies(h): d.polygon([px(*p) for p in ring], fill=OCEAN)
    return im

# ------------------------------------------------------------------ Equal Earth
A1, A2, A3, A4 = 1.340264, -0.081106, 0.000893, 0.003796
def equal_earth(lon_deg, lat_deg):
    lam = math.radians(lon_deg); phi = math.radians(lat_deg)
    th = math.asin(math.sqrt(3) / 2 * math.sin(phi))
    t2 = th * th; t6 = t2 ** 3
    x = 2 * math.sqrt(3) * lam * math.cos(th) / (3 * (9 * A4 * t6 * t2 + 7 * A3 * t6 + 3 * A2 * t2 + A1))
    y = th * (A4 * t6 * t2 + A3 * t6 + A2 * t2 + A1)   # standard Equal Earth: theta (A1 + A2 t^2 + A3 t^6 + A4 t^8)
    return x, y
XMAX = equal_earth(180, 0)[0]; YMAX = equal_earth(0, 90)[1]

def draw_equal_earth(polys, W):
    H = round(W * YMAX / XMAX)
    im = Image.new("RGBA", (W, H), CREAM + (0,)); d = ImageDraw.Draw(im)
    def px(lon, lat):
        x, y = equal_earth(lon, lat); return ((x / XMAX + 1) / 2 * W, (1 - y / YMAX) / 2 * H)
    outline = [px(-180, l) for l in range(90, -91, -3)] + [px(180, l) for l in range(-90, 91, 3)]
    outline = [px(-180, l) for l in range(90, -91, -2)] + [px(lo, -90) for lo in range(-180, 181, 6)] \
            + [px(180, l) for l in range(-90, 91, 2)] + [px(lo, 90) for lo in range(180, -181, -6)]
    d.polygon(outline, fill=OCEAN + (255,))
    for ext, holes in polys:
        col = ICE if is_ice(ext) else LAND
        for ring in wrapped_copies(ext):
            if all(-180 <= p[0] <= 180 for p in ring) or True:
                d.polygon([px(max(-180, min(180, p[0])), p[1]) for p in ring], fill=col + (255,))
        for h in holes:
            for ring in wrapped_copies(h): d.polygon([px(max(-180, min(180, p[0])), p[1]) for p in ring], fill=OCEAN + (255,))
    d.line(outline + [outline[0]], fill=(0x1F, 0x2A, 0x37, 255), width=3, joint="curve")
    return im

# ------------------------------------------------------------------ sounds
SR = 22050
rng = np.random.default_rng(7)
def t(sec): return np.arange(int(SR * sec)) / SR
def env_exp(x, tau): return np.exp(-x / tau)
def fade(sig, a=0.004, b=0.02):
    n = len(sig); na = int(SR * a); nb = int(SR * b)
    sig = sig.copy(); sig[:na] *= np.linspace(0, 1, na); sig[-nb:] *= np.linspace(1, 0, nb); return sig
def lowpass(x, fc):
    from scipy.signal import butter, lfilter
    b, a = butter(2, fc / (SR / 2), btype="low"); return lfilter(b, a, x)
def highpass(x, fc):
    from scipy.signal import butter, lfilter
    b, a = butter(2, fc / (SR / 2), btype="high"); return lfilter(b, a, x)
def bandpass(x, lo, hi):
    from scipy.signal import butter, lfilter
    b, a = butter(2, [lo / (SR / 2), hi / (SR / 2)], btype="band"); return lfilter(b, a, x)
def bell(f, sec, tau, harm=(1, 2.0, 3.0), amp=(1, 0.35, 0.12)):
    x = t(sec); s = sum(a * np.sin(2 * math.pi * f * h * x) for h, a in zip(harm, amp))
    return s * env_exp(x, tau)
def mix(*parts, total=None):
    n = total or max(o + len(p) for o, p in parts); out = np.zeros(n)
    for o, p in parts: out[o:o + len(p)] += p
    return out
def loopify(x, xf=0.6):
    n = int(SR * xf); head = x[:n] * np.linspace(0, 1, n); tail = x[-n:] * np.linspace(1, 0, n)
    y = x[:-n].copy(); y[-n:] += head * 0 ; y[:n] = y[:n] * 0 + x[:n] * np.linspace(0, 1, n) + x[-n:] * np.linspace(1, 0, n)
    return y
def norm(x, peak=0.7):
    m = np.max(np.abs(x)) or 1; return x / m * peak

def snd_tap():
    x = t(0.09); f = 420 * np.exp(-x * 18) + 220
    return fade(norm(np.sin(2 * math.pi * np.cumsum(f) / SR) * env_exp(x, 0.02) + 0.3 * rng.standard_normal(len(x)) * env_exp(x, 0.004), 0.35))
def snd_pop():
    x = t(0.14); f = 480 + 520 * (x / 0.14)
    return fade(norm(np.sin(2 * math.pi * np.cumsum(f) / SR) * env_exp(x, 0.05), 0.55))
def snd_correct():
    a = bell(659.3, 0.55, 0.18); b = bell(880.0, 0.7, 0.22)
    return fade(norm(mix((0, a), (int(SR * 0.16), b)), 0.6), 0.004, 0.08)
def snd_notquite():
    x = t(0.7); s = np.sin(2 * math.pi * 196 * x) + 0.5 * np.sin(2 * math.pi * 196 * 4 * x) * env_exp(x, 0.08) + 0.2 * np.sin(2 * math.pi * 196 * 10 * x) * env_exp(x, 0.03)
    return fade(norm(s * env_exp(x, 0.22), 0.5), 0.004, 0.1)
def snd_stamp():
    x = t(0.3); f = 120 * np.exp(-x * 14) + 45
    body = np.sin(2 * math.pi * np.cumsum(f) / SR) * env_exp(x, 0.07)
    thud = lowpass(rng.standard_normal(len(x)), 900) * env_exp(x, 0.02)
    return fade(norm(body + 0.6 * thud, 0.8))
def snd_rank_up():
    notes = [523.3, 659.3, 784.0, 1046.5, 1318.5]; parts = []
    for i, f in enumerate(notes): parts.append((int(SR * 0.16 * i), bell(f, 1.1, 0.35)))
    return fade(norm(mix(*parts, total=int(SR * 2.0)), 0.6), 0.004, 0.25)
def drops_layer(sec, rate, tau, f0, f1, amp):
    n = int(SR * sec); out = np.zeros(n)
    for _ in range(int(rate * sec)):
        o = int(rng.uniform(0, n - 600)); x = t(0.025); f = rng.uniform(f0, f1)
        out[o:o + len(x)] += amp * rng.uniform(0.4, 1.0) * np.sin(2 * math.pi * f * x) * env_exp(x, tau)
    return out
def snd_rain(kind):
    sec = 20; n = int(SR * sec); white = rng.standard_normal(n)
    if kind == "drizzle":
        base = 0.10 * bandpass(white, 3500, 9000); d = drops_layer(sec, 30, 0.004, 2500, 5000, 0.10)
    elif kind == "steady":
        base = 0.35 * bandpass(white, 1500, 8000); d = drops_layer(sec, 120, 0.006, 1200, 3500, 0.12)
    else:
        base = 0.7 * bandpass(white, 400, 7000) + 0.25 * lowpass(white, 250); d = drops_layer(sec, 260, 0.008, 700, 2500, 0.16)
    return norm(loopify(base + d), 0.5)
def snd_waves():
    sec = 20; n = int(SR * sec); white = rng.standard_normal(n); x = np.arange(n) / SR
    swell = 0.55 + 0.45 * np.sin(2 * math.pi * 0.11 * x) ** 2
    return norm(loopify(lowpass(white, 1800) * swell), 0.5)
def snd_wind_soft():
    sec = 20; n = int(SR * sec); white = rng.standard_normal(n); x = np.arange(n) / SR
    gust = 0.5 + 0.5 * np.sin(2 * math.pi * 0.09 * x + 1) * np.sin(2 * math.pi * 0.23 * x)
    return norm(loopify(bandpass(white, 250, 1400) * gust), 0.45)
def snd_thunder():
    sec = 4.5; n = int(SR * sec); x = np.arange(n) / SR; white = rng.standard_normal(n)
    rumble = lowpass(white, 220) * (np.exp(-x / 1.4) * (0.6 + 0.4 * np.sin(2 * math.pi * 3.1 * x)))
    return fade(norm(rumble, 0.7), 0.05, 0.4)

SOUNDS = {"tap": snd_tap, "pop": snd_pop, "correct": snd_correct, "notquite": snd_notquite, "stamp": snd_stamp,
          "rank_up": snd_rank_up, "rain_drizzle": lambda: snd_rain("drizzle"), "rain_steady": lambda: snd_rain("steady"),
          "rain_heavy": lambda: snd_rain("heavy"), "waves": snd_waves, "wind_soft": snd_wind_soft, "thunder_far": snd_thunder}

def write_ogg(name, sig):
    wav = os.path.join(tempfile.gettempdir(), f"gp_{name}.wav")
    with wave.open(wav, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(sig, -1, 1) * 32767).astype("<i2").tobytes())
    out = os.path.join(A, "sounds", f"{name}.ogg")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-c:a", "libvorbis", "-q:a", "2", out], check=True)
    os.remove(wav); return os.path.getsize(out)

# ------------------------------------------------------------------ landform reference PNG (same maths as src/three/heightmap.ts)
def landform_png(path):
    # Written by scripts/dump_heightmap.mjs from the TypeScript implementation so both stay identical.
    pass

if __name__ == "__main__":
    geo = sys.argv[1]
    polys = load_polys(geo)
    os.makedirs(os.path.join(A, "textures"), exist_ok=True); os.makedirs(os.path.join(A, "maps"), exist_ok=True); os.makedirs(os.path.join(A, "sounds"), exist_ok=True)
    draw_equirect(polys, 2048, 1024).save(os.path.join(A, "textures", "earth_2k.jpg"), quality=88)
    ee = draw_equal_earth(polys, 2048); ee.save(os.path.join(A, "maps", "map_equalearth.png"), optimize=True)
    print("equal earth size", ee.size, "XMAX", XMAX, "YMAX", YMAX)
    for k, fn in SOUNDS.items(): print("sound", k, write_ogg(k, fn()), "bytes")
