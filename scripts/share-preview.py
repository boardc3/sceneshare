#!/usr/bin/env python3
"""Builds the homepage link previews from the landing demo pair:
  public/media/share-home.gif  animated wipe, as photographed -> proposed (og:image)
  public/media/og-home.jpg     a still split frame (fallback)
Run after replacing public/media/demo-before.jpg / demo-after.jpg:
  python3 scripts/share-preview.py      (needs Pillow and ffmpeg)
"""
import os, subprocess, sys, tempfile
from PIL import Image, ImageDraw

W, H = 1200, 630
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
media = os.path.join(root, 'public', 'media')

def cover(path):
    im = Image.open(path).convert('RGB')
    s = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    l, t = (im.width - W) // 2, (im.height - H) // 2
    return im.crop((l, t, l + W, t + H))

before, after = cover(os.path.join(media, 'demo-before.jpg')), cover(os.path.join(media, 'demo-after.jpg'))

def frame(x):
    """Proposal on the right of x, photograph on the left, with the slider handle."""
    f = after.copy()
    if x > 0:
        f.paste(before.crop((0, 0, x, H)), (0, 0))
    if 0 < x < W:
        d = ImageDraw.Draw(f)
        d.rectangle((x - 2, 0, x + 2, H), fill=(248, 249, 247))
        d.ellipse((x - 26, H // 2 - 26, x + 26, H // 2 + 26), fill=(232, 165, 72), outline=(22, 33, 43), width=3)
        for sgn in (-1, 1):
            d.line([(x + sgn * 9, H // 2 - 8), (x + sgn * 17, H // 2), (x + sgn * 9, H // 2 + 8)], fill=(22, 33, 43), width=3)
    return f

def ease(t):
    return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2

# (image, seconds): hold the photograph, wipe across, hold the proposal, wipe back a little, rest.
seq = [(frame(W), 1.1)]
n = 16
seq += [(frame(round(W * (1 - ease(i / n)))), 0.07) for i in range(1, n)]
seq += [(after, 1.8)]
seq += [(frame(round(W * 0.5 * ease(i / 8))), 0.07) for i in range(1, 9)]
seq += [(frame(W // 2), 1.6)]

with tempfile.TemporaryDirectory() as tmp:
    lines = []
    for i, (im, dur) in enumerate(seq):
        p = os.path.join(tmp, f'f{i:03d}.png')
        im.save(p)
        lines += [f"file '{p}'", f'duration {dur}']
    lines.append(f"file '{os.path.join(tmp, f'f{len(seq) - 1:03d}.png')}'")
    listfile = os.path.join(tmp, 'list.txt')
    open(listfile, 'w').write('\n'.join(lines) + '\n')
    pal = os.path.join(tmp, 'pal.png')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listfile, '-vf', 'palettegen=max_colors=192:stats_mode=full', pal], check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listfile, '-i', pal, '-lavfi',
                    'paletteuse=dither=sierra2_4a:diff_mode=rectangle', '-loop', '0', os.path.join(media, 'share-home.gif')], check=True)

frame(W // 2).save(os.path.join(media, 'og-home.jpg'), quality=84, optimize=True, progressive=True)
for f in ('share-home.gif', 'og-home.jpg'):
    print(f, os.path.getsize(os.path.join(media, f)) // 1024, 'KB')
