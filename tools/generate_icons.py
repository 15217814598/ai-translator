# -*- coding: utf-8 -*-
"""生成译流插件的印章式图标（16/32/48/128）。"""
import os
from PIL import Image, ImageDraw, ImageFont

SEAL = (194, 59, 34)      # 印章红 #C23B22
SEAL_EDGE = (168, 46, 25) # 稍深描边
WHITE = (255, 255, 255)
OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')

FONT_CANDIDATES = [
    ('C:/Windows/Fonts/simhei.ttf', None),
    ('C:/Windows/Fonts/msyh.ttc', 1),
    ('C:/Windows/Fonts/msyhbd.ttc', 1),
    ('C:/Windows/Fonts/simsun.ttc', None),
]


def load_font(px):
    for path, idx in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, px, index=idx if idx is not None else 0)
            except Exception:
                continue
    return ImageFont.load_default()


def draw_icon(size):
    # 4x 超采样后缩放，保证边缘平滑
    s = size * 4
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    r = max(4, s // 5)
    # 主体：圆角方形印章
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=r, fill=SEAL, outline=SEAL_EDGE, width=max(1, s // 32))
    # 内框：传统印章的双线边
    inset = max(2, s // 12)
    d.rounded_rectangle([inset, inset, s - 1 - inset, s - 1 - inset],
                        radius=max(2, r - inset // 2), outline=WHITE, width=max(1, s // 42))

    # 居中「译」字
    font = load_font(int(s * 0.56))
    text = '译'
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((s - tw) / 2 - bbox[0], (s - th) / 2 - bbox[1]), text, font=font, fill=WHITE)

    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    for size in (16, 32, 48, 128):
        img = draw_icon(size)
        path = os.path.join(OUT, f'icon{size}.png')
        img.save(path)
        print('saved', path)


if __name__ == '__main__':
    main()
