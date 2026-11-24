"""Evaluate assisted two-choice reading tasks. See benchmark/task-reading/protocol.md.
Default: reproduce the benchmark. --image FILE --task FILE: assess another two-choice task.
"""
import argparse
import csv
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from skimage.color import deltaE_ciede2000, rgb2lab

ROOT = Path(__file__).resolve().parents[1]
BANK = ROOT / "benchmark"
STUDY = BANK / "task-reading"
# Some PRISM workspaces keep Colorspacious in a local validation directory.
sys.path.append(str(ROOT / ".validation-python"))
from colorspacious.cvd import machado_et_al_2009_matrix

MODES = ("original", "protan", "deutan", "tritan")
PALETTES = {
    "protan": ((190, 50, 50), (60, 93, 45)),
    "deutan": ((189, 75, 69), (112, 136, 73)),
    "tritan": ((88, 188, 192), (93, 197, 130)),
}


def simulate(image, mode):
    if mode == "original":
        return image
    encoded = np.asarray(image, dtype=float) / 255
    linear = np.where(
        encoded <= 0.04045, encoded / 12.92, ((encoded + 0.055) / 1.055) ** 2.4
    )
    matrix = machado_et_al_2009_matrix(
        {"protan": "protanomaly", "deutan": "deuteranomaly", "tritan": "tritanomaly"}[
            mode
        ],
        100,
    )
    out = np.clip(linear @ matrix.T, 0, 1)
    rgb = np.where(out <= 0.0031308, 12.92 * out, 1.055 * out ** (1 / 2.4) - 0.055)
    return Image.fromarray(np.uint8(np.clip(rgb * 255 + 1e-8, 0, 255)))


def samples(image, coords, scale):
    colors = []
    for pos in coords:
        x, y = [round(v * s) for v, s in zip(pos, scale)]
        if not (1 <= x < image.width - 1 and 1 <= y < image.height - 1):
            raise ValueError(f"Sample outside the measurable interior: {pos}")
        patch = image.crop((x - 1, y - 1, x + 2, y + 2))
        colors.append(np.median(np.asarray(patch), axis=(0, 1)))
    return rgb2lab(np.asarray(colors).reshape(1, 2, 3) / 255)[0]


def measure(image, task, temp):
    rgba = image.convert("RGBA")
    rgb = Image.new("RGB", image.size, "white")
    rgb.paste(rgba, mask=rgba.getchannel("A"))
    rgb.thumbnail((700, 700), Image.Resampling.LANCZOS)
    scale = (rgb.width / image.width, rgb.height / image.height)
    evidence = []
    for mode in MODES:
        view = simulate(rgb, mode)
        key = samples(view, task["key"], scale)
        marks = samples(view, task["marks"], scale)
        margins = [
            deltaE_ciede2000(marks[i], key[1 - i]) - deltaE_ciede2000(marks[i], key[i])
            for i in range(2)
        ]
        files = []
        for box in task["windows"]:
            rect = tuple(round(v * scale[i % 2]) for i, v in enumerate(box))
            if not (
                0 <= rect[0] < rect[2] <= view.width
                and 0 <= rect[1] < rect[3] <= view.height
            ):
                raise ValueError(f"Invalid label window: {box}")
            crop = view.crop(rect)
            digest = (
                hashlib.sha256(str(crop.size).encode() + crop.tobytes()).hexdigest()
                + ".png"
            )
            if not (temp / digest).exists():
                crop.save(temp / digest)
            files.append(digest)
        evidence.append((mode, float(min(margins)), files))
    return evidence


def normalize(text):
    return re.findall(r"[A-Z0-9]+|\+", text.upper())


def contains(tokens, phrase):
    pattern = normalize(phrase)
    return bool(pattern) and any(
        tokens[i : i + len(pattern)] == pattern for i in range(len(tokens))
    )


def grade(margin):
    return 2 if margin < 6 else 1 if margin < 12 else 0


def assess(task, evidence, ocr):
    rows = []
    original = evidence[0][1]
    for mode, margin, files in evidence:
        words = [ocr[f] for f in files]
        cue = "OCR unavailable"
        if all(w is not None for w in words):
            tokens = [
                [
                    token
                    for w in window
                    for token in (
                        normalize(w["text"]) if w["confidence"] >= 75 else ["?"]
                    )
                ]
                for window in words
            ]
            if contains(tokens[1], task["names"][0]) or contains(
                tokens[0], task["names"][1]
            ):
                cue = "contradiction"
            elif contains(tokens[0], task["names"][0]):
                cue = "target label"
            else:
                cue = "no verified target label"
        color = grade(margin)
        task_grade = (
            None
            if cue in ("contradiction", "OCR unavailable")
            else 0
            if cue == "target label"
            else color
        )
        rows.append(
            dict(
                profile=mode,
                original_margin=round(original, 2),
                margin=round(margin, 2),
                original_color_review=original < 12,
                color_grade=color,
                task_grade=task_grade,
                cue=cue,
                target_confidences=" ".join(
                    str(w["confidence"]) for w in (words[0] or [])
                ),
                other_confidences=" ".join(
                    str(w["confidence"]) for w in (words[1] or [])
                ),
                target_text=" ".join(w["text"] for w in (words[0] or [])),
                other_text=" ".join(w["text"] for w in (words[1] or [])),
            )
        )
    return rows


def control(profile, target_side, condition):
    im = Image.new("RGB", (580, 300), "white")
    d = ImageDraw.Draw(im)
    font = ImageFont.truetype(
        str(ROOT / "node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf"),
        20,
    )
    xs = [145, 435] if target_side == "left" else [435, 145]
    names = ["CEDAR", "MAPLE"]
    for i, (x, color) in enumerate(zip(xs, PALETTES[profile])):
        d.ellipse((x - 28, 80, x + 28, 136), fill=color)
        kx = 85 + i * 275
        d.rectangle((kx - 10, 228, kx + 10, 248), fill=color)
        d.text((kx + 22, 224), names[i], font=font, fill="black")
        if condition in ("correct", "swapped"):
            d.text(
                (x - 50, 145),
                names[i if condition == "correct" else 1 - i],
                font=font,
                fill="black",
            )
        if condition == "decorative":
            d.text((x - 50, 12), names[i], font=font, fill="black")
    task = dict(
        names=names,
        key=[[85, 238], [360, 238]],
        marks=[[x, 108] for x in xs],
        windows=[[x - 55, 139, x + 65, 175] for x in xs],
    )
    return im, task


def run(image_path=None, task_path=None):
    tasks = json.loads((STUDY / "tasks.json").read_text())
    jobs = []
    with tempfile.TemporaryDirectory() as directory:
        temp = Path(directory)

        def add(group, case, variant, im, task, target_profiles):
            jobs.append(
                (group, case, variant, task, target_profiles, measure(im, task, temp))
            )

        if image_path:
            add(
                "custom",
                image_path.stem,
                "input",
                Image.open(image_path),
                json.loads(task_path.read_text()),
                MODES[1:],
            )
        else:
            for item in json.loads((BANK / "manifest.json").read_text(encoding="utf8"))[
                "items"
            ]:
                family = item["pair_id"]
                if family in tasks:
                    add(
                        "educational",
                        family,
                        item["id"].split("-")[-1],
                        Image.open(BANK / item["file"]),
                        tasks[family],
                        item["cvd_modes"],
                    )
            for profile in PALETTES:
                for side in ("left", "right"):
                    for cue in ("absent", "correct", "swapped", "decorative"):
                        im, task = control(profile, side, cue)
                        add("control", profile + "-" + side, cue, im, task, [profile])
        output = temp / "text.json"
        subprocess.run(
            ["node", str(ROOT / "scripts/read-task-labels.mjs"), temp, output],
            cwd=ROOT,
            check=True,
        )
        ocr = json.loads(output.read_text(encoding="utf8"))
        rows = [
            dict(
                group=group,
                family=case,
                variant=variant,
                designated=r["profile"] in profiles,
                **r,
            )
            for group, case, variant, task, profiles, evidence in jobs
            for r in assess(task, evidence, ocr)
        ]
    if image_path:
        print(json.dumps(rows, indent=2))
    else:
        with (STUDY / "observations.csv").open(
            "w", newline="", encoding="utf8"
        ) as stream:
            writer = csv.DictWriter(stream, fieldnames=rows[0])
            writer.writeheader()
            writer.writerows(rows)
        summarize(rows)


def summarize(rows):
    original = {
        r["id"]: int(r["score"])
        for r in csv.DictReader((BANK / "score-baseline.csv").open())
    }
    for family in json.loads((STUDY / "tasks.json").read_text()):
        print(
            family,
            "original:",
            original[family + "-bad"],
            "->",
            original[family + "-good"],
        )
        relevant = [
            r
            for r in rows
            if r["group"] == "educational" and r["family"] == family and r["designated"]
        ]
        for profile in dict.fromkeys(r["profile"] for r in relevant):
            pair = [r for r in relevant if r["profile"] == profile]
            print(
                " ",
                profile,
                [
                    (r["variant"], r["color_grade"], r["task_grade"], r["cue"])
                    for r in pair
                ],
            )
    controls = [r for r in rows if r["group"] == "control" and r["designated"]]
    expected = {"absent": 2, "correct": 0, "swapped": None, "decorative": 2}
    print(
        "Controlled predictions",
        sum(
            r["task_grade"] == expected[r["variant"]]
            and (r["variant"] != "swapped" or r["cue"] == "contradiction")
            for r in controls
        ),
        "/",
        len(controls),
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", type=Path)
    parser.add_argument("--task", type=Path)
    args = parser.parse_args()
    if bool(args.image) != bool(args.task):
        parser.error("--image and --task must be supplied together")
    run(args.image, args.task)
