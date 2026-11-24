"""Freeze reference locations and expectations before running any candidate detector.
Optional key rebuild: Python, Pillow, numpy, scikit-image and colorspacious.
Points in the output use original image pixels. Gallery labels are an independent
simulation reference, while plate/teaching labels are hypotheses from design.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from colorspacious.cvd import machado_et_al_2009_matrix
from skimage.color import deltaE_ciede2000, rgb2lab

ROOT = Path(__file__).resolve().parents[1] / "benchmark"
MODES = ("protan", "deutan", "tritan")
RG = dict.fromkeys(MODES[:2], "loss")
TR = {"tritan": "loss"}
# Positions on 400x400 plate previews and on the original educational figures.
PLATES = {
    "01": ((153, 146), (143, 156), dict.fromkeys(MODES[:2], "retain")),
    "09": ((169, 109), (171, 93), RG),
    "11": ((180, 130), (170, 124), RG),
}
FIGURES = {
    "textbook-transport": ((470, 465), (478, 479), RG),
    "textbook-map": ((418, 301), (435, 301), RG),
    "science-chart": ((193, 546), (193, 565), RG),
    "science-cells": ((214, 327), (202, 327), TR),
    "humanities-timeline": ((155, 355), (155, 475), RG),
    "humanities-map": ((220, 479), (228, 465), TR),
}
# Positions on 300x245 previews of eight distinct gallery documents.
GALLERY = {
    "bar_stacked": ((72, 131), (72, 139), "lines_bars_and_markers"),
    "stackplot_demo": ((208, 77), (208, 83), "lines_bars_and_markers"),
    "horizontal_barchart_distribution": ((128, 47), (145, 47), "lines_bars_and_markers"),
    "bar_label_demo": ((63, 125), (63, 134), "lines_bars_and_markers"),
    "pie_features": ((191, 147), (185, 153), "pie_and_polar_charts"),
    "grouped_barplot": ((66, 151), (77, 151), "seaborn"),
    "horizontal_boxplot": ((174, 16), (174, 36), "seaborn"),
    "scatterplot_categorical": ((119, 62), (120.7, 63), "seaborn"),
}


def reference(colors):
    rgb = np.array(colors) / 255
    def distance(srgb):
        a, b = rgb2lab(srgb.reshape(1, 2, 3))[0]
        return float(deltaE_ciede2000(a, b))
    original = distance(rgb)
    linear = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
    expected = {}
    for mode, name in zip(MODES, ("protanomaly", "deuteranomaly", "tritanomaly")):
        transformed = np.clip(linear @ machado_et_al_2009_matrix(name, 100).T, 0, 1)
        srgb = np.where(transformed <= .0031308, 12.92 * transformed, 1.055 * transformed ** (1/2.4) - .055)
        d = distance(srgb)
        if original >= 12 and d < 12 and d / original < .6:
            expected[mode] = "loss"
        elif original >= 12 and (d >= 20 or d >= original * .85):
            expected[mode] = "retain"
    return expected


def entry(file, split, family, source, coords=None, expectations=None, preview=None):
    path = ROOT / file
    im = Image.open(path).convert("RGB")
    refs = []
    if coords:
        scale = preview or im.size
        points = [[round(x * im.width / scale[0]), round(y * im.height / scale[1])] for x, y in coords]
        colors = [im.getpixel(tuple(p)) for p in points]
        refs = [dict(points=points, radius=2, colors=colors,
                     expected=reference(colors) if expectations is None else expectations)]
    return dict(id=path.stem, file=file, split=split, family=family, source=source,
                width=im.width, height=im.height, sha256=hashlib.sha256(path.read_bytes()).hexdigest(), refs=refs)


def main():
    items = []
    for row in json.loads((ROOT / "manifest.json").read_text(encoding="utf8"))["items"]:
        ident = row["id"]
        coords = expected = preview = None
        if ident.startswith("ishihara-") and ident[-2:] in PLATES:
            a, b, expected = PLATES[ident[-2:]]
            coords, preview = (a, b), (400, 400)
        elif row["pair_id"] in FIGURES:
            a, b, expected = FIGURES[row["pair_id"]]
            coords = (a, b)
        family = "reverse plate" if ident == "ishihara-19" else row["category"]
        items.append(entry(row["file"], "development", family, row["source_page"] or row["pair_id"], coords, expected, preview))
    for name, (a, b, gallery) in GALLERY.items():
        url = ("https://seaborn.pydata.org/examples/" + name + ".html" if gallery == "seaborn"
               else f"https://matplotlib.org/stable/gallery/{gallery}/{name}.html")
        items.append(entry(f"fresh/{name}.png", "fresh", "gallery", url, (a,b), preview=(300,245)))
    (ROOT / "figure-key.json").write_text(json.dumps(items, indent=2) + "\n", encoding="utf8")


if __name__ == "__main__":
    main()

