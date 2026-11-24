"""Apply the task-reading margin to original pictures without printed color keys."""
import csv
import json

import numpy as np
from PIL import Image
from skimage.color import deltaE_ciede2000, rgb2lab

from task_reading import BANK, STUDY, MODES, simulate


def probe_margins(view, classes, frame):
    colors = []
    for points in classes:
        medians = []
        for x, y in points:
            px, py = round(x * view.width / frame[0]), round(y * view.height / frame[1])
            patch = np.asarray(view.crop((px - 1, py - 1, px + 2, py + 2)))
            medians.append(np.median(patch, axis=(0, 1)))
        colors.append(rgb2lab(np.array(medians).reshape(1, -1, 3) / 255)[0])
    colors = np.array(colors)
    margins = []
    for index in range(colors.shape[1]):
        prototypes = np.median(np.delete(colors, index, axis=1), axis=1)
        for c in (0, 1):
            sample = colors[c, index]
            margins.append(
                deltaE_ciede2000(sample, prototypes[1 - c])
                - deltaE_ciede2000(sample, prototypes[c])
            )
    return np.array(margins)


def main():
    rows = []
    specs = json.loads((STUDY / "picture-probes.json").read_text())
    for name, spec in specs.items():
        image = Image.open(BANK / "images" / (name + ".png")).convert("RGB")
        image.thumbnail((700, 700), Image.Resampling.LANCZOS)
        margins = {
            m: probe_margins(simulate(image, m), spec["points"], spec["frame"])
            for m in MODES
        }
        clear = margins["original"] >= 12
        for mode in MODES[1:]:
            weak = clear & (margins[mode] < 6)
            rows.append(
                dict(
                    image=name,
                    profile=mode,
                    probes=len(clear),
                    original_clear=int(clear.sum()),
                    newly_weak=int(weak.sum()),
                    median_margin=round(float(np.median(margins[mode])), 2),
                )
            )
    with (STUDY / "picture-observations.csv").open(
        "w", newline="", encoding="utf8"
    ) as stream:
        writer = csv.DictWriter(stream, fieldnames=rows[0])
        writer.writeheader()
        writer.writerows(rows)
    for r in rows:
        print(
            r["image"],
            r["profile"],
            str(r["newly_weak"]) + "/" + str(r["original_clear"]),
        )


if __name__ == "__main__":
    main()
