from PIL import Image, ImageDraw, ImageFont

FONT = r"C:\Windows\Fonts\segoeuib.ttf"
BG   = (0x23, 0x21, 0x1c, 255)
RED  = (0xd9, 0x2d, 0x20, 255)
BLUE = (0x25, 0x63, 0xeb, 255)

def card(size, ss, xywh, radius, fill, svg_angle, centre):
    """One rotated card on its own transparent layer (PIL rotates CCW; SVG CW)."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x, y, w, h = [v * ss for v in xywh]
    d.rounded_rectangle([x, y, x + w, y + h], radius=radius * ss, fill=fill)
    return layer.rotate(-svg_angle, resample=Image.BICUBIC,
                        center=(centre[0] * ss, centre[1] * ss))

def build(px):
    SUP = 4                      # supersample, then downscale for antialiasing
    size = px * SUP
    ss = size / 100.0            # SVG viewBox is 0..100
    img = Image.new("RGBA", (size, size), BG)   # full bleed: iOS/Android mask corners
    img.alpha_composite(card(size, ss, (18, 24, 34, 48), 6, RED,  -8, (35, 48)))
    img.alpha_composite(card(size, ss, (46, 26, 34, 48), 6, BLUE,  7, (63, 50)))
    d = ImageDraw.Draw(img)
    d.text((50 * ss, 63 * ss), "1", font=ImageFont.truetype(FONT, int(30 * ss)),
           fill=(255, 255, 255, 255), anchor="ms")
    return img.resize((px, px), Image.LANCZOS).convert("RGB")

for px in (180, 512):
    out = f"public/icon-{px}.png"
    build(px).save(out, "PNG", optimize=True)
    print(f"wrote {out}")
