#!/usr/bin/env python3
"""くろのす（Qronos）のアイコン・ロゴ・OGP を作る。

名前は「くろのす」。ギリシャ神話の時の神クロノス（Chronos）から。英字は Qronos（おくるん＝OQRN・キロっく＝kiloQ と同じ作り方で、「く」を Q にする）。
アイコンはおくるんと同じ角の丸い四角に、ページと同じむらさき（style.css の --accent #6c47ff）。
Q は C と組み合わせた形（Chronos の C）：右に口の開いた C の輪に、欠けたところをふさぐ砂時計をはめて「時を測る」。
Q のしっぽは右下のクラッカーで、口を真ん中に向けて輪の中へ紙吹雪がはじける（その日が待ち遠しい）。まわりの飾りは置かず、すっきりさせる。

  icon.svg・icon-32.png・apple-touch-icon.png・icon-512.png・icon-maskable-512.png … アイコン
  logo.svg … 横長のロゴ「Qronos」（Q はアイコンと同じ形、r・o・n・o・s は Jua）
  ogp.png  … 共有したときの画像（1200×630）

使い方: python3 tools/icon.py（となりの line-share/tools/brandkit.py を使う）
"""
from pathlib import Path

import brandkit_path  # noqa: F401（となりの line-share/tools/brandkit.py を読めるようにする）
from brandkit import Brand, centered, arc, polar, star

ROOT = Path(__file__).resolve().parent.parent
BRAND = Brand(light=(170, 140, 255), dark=(108, 71, 255))  # style.css の --accent #6c47ff

# ページと同じポップな色（紙吹雪）
YELLOW, PINK, SKY, MINT = (255, 210, 63), (255, 111, 168), (76, 201, 240), (6, 214, 160)

C = (44, 46)  # 輪の中心
R, RING_W = 23, 10  # 輪の半径（線の真ん中）・太さ
# Q は C と組み合わせた形（Chronos の C ＋ Qronos の Q）：輪は右に口の開いた C。
# C の欠けたところ（右）に砂時計をはめて輪を閉じる（時を測る）。
# Q のしっぽは右下のクラッカー：とがった方を外に、口を真ん中に向けて、輪の中へ紙吹雪がはじける（その日が待ち遠しい）
GAP = 64  # 右の口の広さ（度）
ARC_START, ARC_END = GAP / 2, 360 - GAP / 2  # C の弧（右下 → 下 → 左 → 上 → 右上）
GLASS = polar(C, 0, R)  # 砂時計の真ん中（C の口）
POPPER_DIR = 45
POPPER_TIP = polar(C, POPPER_DIR, 42)  # クラッカーのとがった方（外）
POPPER_MOUTH = polar(C, POPPER_DIR, R - 4)  # 口（真ん中に向く）


def hourglass():
    """C の口にはめる砂時計：上下のふち（太い白）と、ガラスの線（白）、上から下へ落ちていく砂（黄色）"""
    x, y = GLASS
    w = RING_W / 2 + 2.5  # 横幅の半分（輪の太さより少し広い）
    h = R * 0.5 + 1.5  # 高さの半分（口をふさぐ）
    top, bottom = y - h, y + h
    neck = 1.3
    return [
        {"t": "poly", "p": [(x - w + 2.4, top + 3), (x + w - 2.4, top + 3), (x, y - 1.2)], "fill": YELLOW},
        {"t": "poly", "p": [(x, bottom - 6.5), (x + w - 1.8, bottom - 1.6), (x - w + 1.8, bottom - 1.6)], "fill": YELLOW},
        {"t": "line", "p": [(x, y), (x, bottom - 6)], "w": 1.2, "fill": YELLOW},
        {"t": "line", "p": [(x - w + 0.5, top + 1), (x - neck, y), (x - w + 0.5, bottom - 1)], "w": 2.4},
        {"t": "line", "p": [(x + w - 0.5, top + 1), (x + neck, y), (x + w - 0.5, bottom - 1)], "w": 2.4},
        {"t": "line", "p": [(x - w - 1.5, top), (x + w + 1.5, top)], "w": 3.6},
        {"t": "line", "p": [(x - w - 1.5, bottom), (x + w + 1.5, bottom)], "w": 3.6},
    ]


def popper():
    """クラッカー（とがった方が外、口が真ん中）と、口から輪の中へはじける紙吹雪"""
    side = lambda p, d: [polar(p, POPPER_DIR - 90, d), polar(p, POPPER_DIR + 90, d)]  # noqa: E731
    tip_l, tip_r = side(POPPER_TIP, 1.6)
    mouth_l, mouth_r = side(POPPER_MOUTH, 8)
    gap_tip_l, gap_tip_r = side(polar(POPPER_TIP, POPPER_DIR, 2), 3.8)
    gap_mouth_l, gap_mouth_r = side(polar(POPPER_MOUTH, POPPER_DIR + 180, 2), 10.4)
    band = polar(C, POPPER_DIR, 33)
    inward = POPPER_DIR + 180  # 真ん中への向き
    burst = lambda a, d: polar(POPPER_MOUTH, inward + a, d)  # noqa: E731
    return [
        {"t": "poly", "p": [gap_tip_l, gap_mouth_l, gap_mouth_r, gap_tip_r], "fill": "bg"},  # まわりを背景の色で削る
        {"t": "poly", "p": [tip_l, mouth_l, mouth_r, tip_r]},
        {"t": "line", "p": side(band, 4.4), "w": 2.4, "fill": PINK},
        # 輪の中へはじける紙吹雪
        {"t": "circle", "c": burst(-38, 9), "r": 2.2, "fill": YELLOW},
        {"t": "rect", "box": (*burst(0, 11), *[v + 3.6 for v in burst(0, 11)]), "rx": 1, "fill": SKY},
        {"t": "circle", "c": burst(36, 9.5), "r": 2.1, "fill": PINK},
        {"t": "poly", "p": star(burst(-12, 19), 3.8, 1.6), "fill": YELLOW},
        {"t": "circle", "c": burst(18, 18), "r": 1.8, "fill": MINT},
        {"t": "line", "p": [burst(-30, 16), burst(-24, 20)], "w": 1.8, "fill": PINK},
        {"t": "line", "p": [burst(32, 15), burst(40, 18.5)], "w": 1.8, "fill": SKY},
    ]


SHAPES = [
    {"t": "circle", "c": C, "r": R, "alpha": 0.16},  # 輪の内側（うっすら）
    {"t": "line", "p": arc(C, R, ARC_START, ARC_END), "w": RING_W},  # C
    *hourglass(),
    *popper(),
]
# 外形（しっぽを含む）の真ん中をアイコンの真ん中にそろえ、Q の重心が片寄って見えないようにする（ロゴも同じ形を使う）
SHAPES, (_DX, _DY) = centered(SHAPES)
C = (C[0] + _DX, C[1] + _DY)
RING_OUTER = R + RING_W / 2


def main():
    BRAND.write_icons(ROOT, SHAPES)
    logo, ratio = BRAND.logo_svg("Qronos", SHAPES, C, RING_OUTER, "Qronos（くろのす）")
    (ROOT / "logo.svg").write_text(logo, encoding="utf-8")
    BRAND.write_ogp(ROOT / "ogp.png", SHAPES, "くろのす", "Qronos", ["記念日まで「あと何日？」", "今日で何日目？を LINE で送れる"])
    print(f"アイコン・logo.svg（高さ 28px なら幅 {28 * ratio:.0f}px）・ogp.png を書き出しました")


if __name__ == "__main__":
    main()
