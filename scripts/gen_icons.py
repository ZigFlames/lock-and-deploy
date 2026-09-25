"""Generate PWA icons: gold lock on black. Requires Pillow (pip install pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
OUT.mkdir(exist_ok=True)
BG = (10, 10, 11, 255)
GOLD_TOP, GOLD_BOT = (233, 205, 108), (184, 146, 42)

def gradient(size):
    g = Image.new("RGBA", (size, size))
    d = ImageDraw.Draw(g)
    for y in range(size):
        t = y / (size - 1)
        c = tuple(int(GOLD_TOP[i] + (GOLD_BOT[i] - GOLD_TOP[i]) * t) for i in range(3)) + (255,)
        d.line([(0, y), (size, y)], fill=c)
    return g

def draw_lock(size, scale):
    """Lock drawn on a 120x140 design grid, centered, occupying `scale` of the canvas height."""
    S = 4  # supersample
    W = size * S
    img = Image.new("RGBA", (W, W), BG)
    mask = Image.new("L", (W, W), 0)
    m = ImageDraw.Draw(mask)
    h = W * scale
    u = h / 140.0
    ox = (W - 120 * u) / 2
    oy = (W - 140 * u) / 2 + 4 * u
    P = lambda x, y: (ox + x * u, oy + y * u)
    sw = 11 * u
    # shackle: arc + legs
    cx, cy, r = 60, 44, 24
    x0, y0 = P(cx - r - 5.5, cy - r - 5.5); x1, y1 = P(cx + r + 5.5, cy + r + 5.5)
    m.arc([x0, y0, x1, y1], 180, 360, fill=255, width=int(sw))
    for lx in (36, 84):
        a = P(lx - 5.5, 44); b = P(lx + 5.5, 70)
        m.rectangle([a, b], fill=255)
    # body
    m.rounded_rectangle([P(16, 60), P(104, 132)], radius=16 * u, fill=255)
    # keyhole (cut out)
    m.ellipse([P(50.5, 80.5), P(69.5, 99.5)], fill=0)
    m.rounded_rectangle([P(55.5, 92), P(64.5, 112)], radius=4.5 * u, fill=0)
    img.paste(gradient(W), (0, 0), mask)
    return img.resize((size, size), Image.LANCZOS)

def save(img, name):
    img.convert("RGB").save(OUT / name, optimize=True)
    print("wrote", OUT / name)

save(draw_lock(192, 0.70), "icon-192.png")
save(draw_lock(512, 0.70), "icon-512.png")
# maskable: keep the lock inside the central 80% safe zone
save(draw_lock(192, 0.52), "maskable-192.png")
save(draw_lock(512, 0.52), "maskable-512.png")
save(draw_lock(180, 0.62), "apple-touch-icon.png")
save(draw_lock(32, 0.86), "favicon-32.png")

(OUT / "icon.svg").write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9CD6C"/><stop offset="1" stop-color="#B8922A"/></linearGradient></defs><rect width="140" height="140" rx="28" fill="#0A0A0B"/><g transform="translate(10 4)"><path d="M36 66 V44 a24 24 0 0 1 48 0 V66" fill="none" stroke="url(#g)" stroke-width="11" stroke-linecap="round"/><rect x="16" y="60" width="88" height="72" rx="16" fill="url(#g)"/><circle cx="60" cy="90" r="9.5" fill="#0A0A0B"/><rect x="55.5" y="92" width="9" height="20" rx="4.5" fill="#0A0A0B"/></g></svg>''')
print("wrote icon.svg")
