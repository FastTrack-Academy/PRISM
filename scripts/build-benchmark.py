"""Build PRISM's small, task-based CVD benchmark image bank.

Requires Pillow and requests. Source images are fetched from Wikimedia Commons
after checking their current license metadata. Generated examples are original.
"""

from __future__ import annotations

import hashlib
import csv
import html
import json
import math
import re
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "benchmark"
IMAGES = OUT / "images"
SOURCES = OUT / "sources"
API = "https://commons.wikimedia.org/w/api.php"
HEADERS = {"User-Agent": "PRISM-CVD-benchmark/0.1 (research dataset; local build)"}
RED = "#bd4b45"
GREEN = "#708849"
BLUE = "#276795"
TRITAN_A = "#58bcc0"
TRITAN_B = "#5dc582"
INK = "#1c2940"
MUTED = "#516077"
PALE = "#f3f5f5"

EXTERNAL = [
    ("ishihara-01", "File:Ishihara 1.svg", "ishihara", "good", "Read the numeral", "12", "plate_answer", "protan,deutan"),
    ("ishihara-09", "File:Ishihara 9.svg", "ishihara", "bad", "Read the numeral", "74 normally; often 21 with red-green CVD", "plate_answer", "protan,deutan"),
    ("ishihara-11", "File:Ishihara 11.PNG", "ishihara", "bad", "Read the numeral", "6 normally; may be unreadable with red-green CVD", "plate_answer", "protan,deutan"),
    ("ishihara-19", "File:Ishihara 19.PNG", "ishihara", "bad", "Report whether a numeral is present", "No numeral normally; 2 may appear with red-green CVD", "plate_answer", "protan,deutan"),
]
NATURE = [
    ("nature-leaf", "File:Red and Green (55619730005).jpg", "Locate a red leaf cluster"),
    ("nature-sumac", "File:Sumac and Beauty Berry (172b20e9-1dfb-47f8-89d1-ee9174131b8b).JPG", "Locate one purple berry cluster"),
]


def font(size: int, bold: bool = False):
    path = Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf")
    if not path.exists():
        path = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    return ImageFont.truetype(str(path), size)


def commons(title: str, width: int = 1280):
    response = requests.get(API, params={"action": "query", "titles": title, "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": width, "format": "json"}, headers=HEADERS, timeout=30)
    response.raise_for_status()
    page = next(iter(response.json()["query"]["pages"].values()))
    info = page["imageinfo"][0]
    license_name = info["extmetadata"]["LicenseShortName"]["value"]
    creator_html = info["extmetadata"].get("Artist", {}).get("value", "")
    creator = html.unescape(re.sub(r"<[^>]+>", "", creator_html)).strip()
    if license_name != "Public domain":
        raise RuntimeError(f"License changed for {title}: {license_name}")
    return info.get("thumburl", info["url"]), f"https://commons.wikimedia.org/wiki/{title.replace(' ', '_')}", license_name, creator


def fetch(title: str, local_name: str):
    url, page, license_name, creator = commons(title)
    target = SOURCES / local_name
    if not target.exists():
        response = requests.get(url, headers=HEADERS, timeout=60)
        response.raise_for_status()
        target.write_bytes(response.content)
    return Image.open(target).convert("RGB"), page, license_name, creator


def save(image: Image.Image, id_: str):
    target = IMAGES / f"{id_}.png"
    image.save(target, optimize=True)
    return str(target.relative_to(OUT)).replace("\\", "/"), hashlib.sha256(target.read_bytes()).hexdigest(), image.width, image.height


def base(kicker: str, title: str, prompt: str, height: int = 980, footer: str = "PRISM  •  original benchmark fixture"):
    image = Image.new("RGB", (1000, height), "#ffffff")
    d = ImageDraw.Draw(image)
    d.rectangle((0, 0, 1000, 14), fill=BLUE)
    d.text((62, 42), kicker.upper(), font=font(19, True), fill=BLUE)
    d.text((62, 78), title, font=font(43, True), fill=INK)
    d.text((62, 144), prompt, font=font(22), fill=MUTED)
    d.line((62, 192, 938, 192), fill="#d6dce4", width=2)
    d.text((62, height - 47), footer, font=font(16), fill=MUTED)
    return image, d


def label(d, xy, text, size=23, color=INK, bold=False):
    d.text(xy, text, font=font(size, bold), fill=color)


def dash_line(d, points, fill, width=8, period=28):
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        length = math.hypot(x2 - x1, y2 - y1)
        n = max(1, int(length / period))
        for i in range(0, n, 2):
            t0, t1 = i / n, min(1, (i + 1) / n)
            d.line((x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0, x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1), fill=fill, width=width)


def textbook_transport(good: bool):
    im, d = base("Biology textbook · figure 4.2", "Transport across a cell membrane", "Which path carries sodium into the cell?")
    d.rectangle((75, 260, 925, 722), fill="#f7f8f5", outline="#dce2e4", width=2)
    for x in range(100, 910, 35):
        d.ellipse((x, 440, x + 15, 455), fill="#799a95")
        d.ellipse((x, 505, x + 15, 520), fill="#799a95")
    d.rectangle((440, 409, 540, 548), fill="#b6bec9", outline=INK, width=3)
    label(d, (85, 283), "Outside the cell", 21)
    label(d, (85, 660), "Inside the cell", 21)
    red = [(160, 345), (350, 345), (475, 470), (610, 595), (830, 595)]
    green = [(160, 610), (350, 610), (475, 480), (610, 355), (830, 355)]
    d.line(red, fill=RED, width=11, joint="curve")
    if good:
        dash_line(d, green, GREEN, 11)
        label(d, (600, 604), "SODIUM  ↓", 24, INK, True)
        label(d, (600, 315), "POTASSIUM  ↑", 24, INK, True)
    else:
        d.line(green, fill=GREEN, width=11, joint="curve")
    d.ellipse((812, 578, 846, 612), fill=RED)
    d.ellipse((812, 338, 846, 372), fill=GREEN)
    d.rectangle((75, 762, 925, 876), fill=PALE)
    label(d, (100, 778), "KEY", 18, BLUE, True)
    d.line((102, 838, 153, 838), fill=RED, width=9)
    label(d, (170, 824), "Sodium", 22)
    if good:
        dash_line(d, [(505, 838), (558, 838)], GREEN, 9, 13)
    else:
        d.line((505, 838, 558, 838), fill=GREEN, width=9)
    label(d, (575, 824), "Potassium", 22)
    return im


def textbook_map(good: bool):
    im, d = base("Geography textbook · map 2.3", "Land use in the river basin", "Which regions are protected wetlands?")
    d.rectangle((96, 240, 904, 744), fill="#e9edf0", outline="#8597a4", width=3)
    polygons = [([(97, 242), (440, 242), (390, 430), (95, 535)], RED), ([(445, 242), (903, 242), (903, 400), (620, 505), (395, 430)], GREEN), ([(96, 537), (392, 431), (620, 507), (905, 405), (905, 745), (97, 745)], RED)]
    for pts, color in polygons:
        d.polygon(pts, fill=color, outline="#ffffff", width=3)
    d.line([(140, 660), (300, 580), (480, 565), (630, 635), (850, 600)], fill="#c5e2ef", width=22, joint="curve")
    if good:
        for x, y in [(150, 305), (580, 285), (250, 630), (690, 610)]:
            label(d, (x, y), "WETLAND" if x < 400 or y > 500 else "FARMLAND", 22, "#ffffff", True)
        # White wave marks add a non-color cue to the protected areas.
        for x, y in [(170, 385), (250, 460), (160, 610), (550, 685), (755, 690)]:
            d.arc((x, y, x + 48, y + 28), 180, 360, fill="#ffffff", width=5)
    d.rectangle((96, 781, 904, 875), fill=PALE)
    label(d, (123, 792), "MAP KEY", 18, BLUE, True)
    d.rectangle((290, 821, 330, 849), fill=RED)
    label(d, (344, 819), "Protected wetland", 20)
    d.rectangle((632, 821, 672, 849), fill=GREEN)
    label(d, (685, 819), "Farmland", 20)
    return im


def science_chart(good: bool):
    im, d = base("Research poster · ecology", "Two habitats, six survey years", "Which habitat has 64 species in year 6?", 1120)
    d.rectangle((70, 234, 930, 863), fill="#fbfcfb", outline="#dce2e4", width=2)
    d.line((145, 760, 865, 760), fill=INK, width=3)
    d.line((145, 305, 145, 760), fill=INK, width=3)
    forest = [35, 41, 45, 52, 56, 64]
    meadow = [33, 37, 42, 48, 53, 59]
    red_points = [(193 + i * 125, 760 - n * 6) for i, n in enumerate(forest)]
    green_points = [(193 + i * 125, 760 - n * 6) for i, n in enumerate(meadow)]
    d.line(red_points, fill=RED, width=9, joint="curve")
    if good:
        dash_line(d, green_points, GREEN, 9, 25)
    else:
        d.line(green_points, fill=GREEN, width=9, joint="curve")
    for i, ((rx, ry), (gx, gy)) in enumerate(zip(red_points, green_points)):
        d.ellipse((rx - 10, ry - 10, rx + 10, ry + 10), fill=RED)
        if good:
            d.rectangle((gx - 10, gy - 10, gx + 10, gy + 10), fill=GREEN)
        else:
            d.ellipse((gx - 10, gy - 10, gx + 10, gy + 10), fill=GREEN)
        label(d, (rx - 5, 774), str(i + 1), 20)
    label(d, (395, 813), "Survey year", 21)
    label(d, (760, 760 - 64 * 6 - 45), "64", 22, INK, True)
    label(d, (760, 760 - 59 * 6 + 16), "59", 22, INK, True)
    if good:
        label(d, (680, 760 - 64 * 6 - 83), "FOREST", 19, INK, True)
        label(d, (680, 760 - 59 * 6 + 48), "MEADOW", 19, INK, True)
    d.rectangle((70, 896, 930, 1007), fill=PALE)
    label(d, (93, 911), "LEGEND", 17, BLUE, True)
    d.ellipse((278, 948, 310, 976), fill=RED)
    label(d, (327, 945), "Forest", 20)
    if good:
        d.rectangle((594, 948, 626, 976), fill=GREEN)
    else:
        d.ellipse((594, 948, 626, 976), fill=GREEN)
    label(d, (643, 945), "Meadow", 20)
    return im


def science_cells(good: bool):
    im, d = base("Research poster · microscopy", "Protein markers in tissue", "List the numbered cells that show both A and B.", 1120)
    d.rectangle((80, 240, 920, 843), fill="#152332")
    centers = [(190 + (i % 5) * 153 + (i % 3) * 9, 327 + (i // 5) * 152) for i in range(15)]
    for i, (x, y) in enumerate(centers):
        d.ellipse((x - 44, y - 44, x + 44, y + 44), outline="#546777", width=3)
        if i % 3 != 1:
            d.ellipse((x - 31, y - 31, x + 31, y + 31), fill=TRITAN_A)
        if i % 4 != 1:
            d.ellipse((x - 17, y - 17, x + 17, y + 17), fill=TRITAN_B)
        if good and i % 3 != 1 and i % 4 != 1:
            d.ellipse((x - 49, y - 49, x + 49, y + 49), outline="#ffffff", width=5)
            label(d, (x + 36, y - 47), "A+B", 18, "#ffffff", True)
        label(d, (x - 8, y + 53), str(i + 1), 18, "#ffffff", True)
    d.rectangle((80, 879, 920, 1010), fill=PALE)
    label(d, (108, 898), "KEY", 17, BLUE, True)
    d.ellipse((220, 949, 250, 979), fill=TRITAN_A)
    label(d, (268, 948), "Marker A", 21)
    d.ellipse((490, 949, 520, 979), fill=TRITAN_B)
    label(d, (538, 948), "Marker B", 21)
    if good:
        label(d, (108, 1040), "White rings and A+B tags identify the overlap.", 18, MUTED)
    return im


def humanities_timeline(good: bool):
    im, d = base("History exhibition poster", "A city shaped by migration", "Which milestones describe arrivals rather than departures?", 1120)
    d.line((155, 304, 155, 860), fill=INK, width=5)
    events = [(1905, 355, "Railway workers arrive"), (1927, 475, "Families leave during floods"), (1952, 595, "New residents arrive"), (1981, 715, "Factory closure prompts departures"), (2008, 835, "Refugees settle in the city")]
    for i, (year, y, title) in enumerate(events):
        arrival = i in (0, 2, 4)
        color = RED if arrival else GREEN
        d.line((155, y, 240, y), fill="#8d9aa7", width=3)
        if good and arrival:
            d.rectangle((139, y - 17, 173, y + 17), fill=color)
        elif good:
            d.polygon([(156, y - 20), (177, y + 16), (135, y + 16)], fill=color)
        else:
            d.ellipse((136, y - 19, 174, y + 19), fill=color)
        label(d, (254, y - 25), str(year), 25, INK, True)
        label(d, (380, y - 23), title if good else title.replace("arrive", "move").replace("leave", "move").replace("departures", "moves").replace("settle", "move"), 21)
        if good:
            label(d, (760, y - 22), "ARRIVAL" if arrival else "DEPARTURE", 17, BLUE, True)
    d.rectangle((80, 912, 920, 1020), fill=PALE)
    label(d, (108, 931), "KEY", 18, BLUE, True)
    d.ellipse((245, 962, 275, 992), fill=RED)
    label(d, (292, 957), "Arrival", 21)
    d.ellipse((508, 962, 538, 992), fill=GREEN)
    label(d, (555, 957), "Departure", 21)
    return im


def humanities_map(good: bool):
    im, d = base("Museum visitor poster", "Routes through the collection", "Which route leads to the oral history gallery?", 1120)
    d.rectangle((93, 241, 907, 843), fill="#f8f7f3", outline="#bac3ca", width=3)
    for x in (300, 530, 740):
        d.line((x, 290, x, 770), fill="#c9d1d5", width=7)
    for y in (410, 610):
        d.line((140, y, 850, y), fill="#c9d1d5", width=7)
    for x, y, t in [(170, 320, "ENTRY"), (560, 330, "ARCHIVE"), (570, 680, "ORAL HISTORY"), (166, 680, "GALLERY")]:
        label(d, (x, y), t, 19, INK, True)
    red = [(220, 385), (220, 555), (630, 555), (630, 680)]
    green = [(220, 385), (220, 465), (800, 465), (800, 700)]
    d.line(red, fill=TRITAN_A, width=12, joint="curve")
    if good:
        dash_line(d, green, TRITAN_B, 12)
        for x, y, n in [(220, 385, "1"), (630, 555, "2"), (630, 680, "3")]:
            d.ellipse((x - 20, y - 20, x + 20, y + 20), fill="#ffffff", outline=INK, width=3)
            label(d, (x - 7, y - 13), n, 23, INK, True)
        label(d, (435, 575), "ORAL HISTORY ROUTE", 18, INK, True)
    else:
        d.line(green, fill=TRITAN_B, width=12, joint="curve")
    d.rectangle((93, 885, 907, 1007), fill=PALE)
    label(d, (120, 902), "ROUTE KEY", 18, BLUE, True)
    d.line((250, 960, 305, 960), fill=TRITAN_A, width=10)
    label(d, (320, 947), "Oral history", 21)
    if good:
        dash_line(d, [(590, 960), (645, 960)], TRITAN_B, 10, 14)
    else:
        d.line((590, 960, 645, 960), fill=TRITAN_B, width=10)
    label(d, (660, 947), "Archives", 21)
    return im


def nature_card(source: Image.Image, title: str, prompt: str, good: bool, id_: str):
    card, d = base("Nature photograph · identification task", title, prompt, 1120, "PRISM  •  source photo credited in manifest")
    photo = source.copy()
    photo.thumbnail((850, 760), Image.Resampling.LANCZOS)
    x = (1000 - photo.width) // 2
    y = 230 + (760 - photo.height) // 2
    card.paste(photo, (x, y))
    d = ImageDraw.Draw(card)
    d.rectangle((x, y, x + photo.width, y + photo.height), outline="#cad2d8", width=3)
    if good:
        target = (330, 510) if id_ == "nature-leaf" else (270, 500)
        d.ellipse((target[0] - 28, target[1] - 28, target[0] + 28, target[1] + 28), outline="#ffffff", width=8)
        d.ellipse((target[0] - 28, target[1] - 28, target[0] + 28, target[1] + 28), outline=INK, width=3)
        d.line((target[0] + 30, target[1] - 25, target[0] + 110, target[1] - 90), fill="#ffffff", width=9)
        d.line((target[0] + 30, target[1] - 25, target[0] + 110, target[1] - 90), fill=INK, width=4)
        d.rectangle((75, 993, 925, 1055), fill="#e7f0f6")
        description = "A red leaf cluster is circled in the left tree canopy." if id_ == "nature-leaf" else "A small berry cluster is circled on the left side."
        label(d, (95, 1010), description, 21, INK, True)
    return card


def main():
    IMAGES.mkdir(parents=True, exist_ok=True)
    SOURCES.mkdir(parents=True, exist_ok=True)
    manifest = []

    def add(id_, category, expected, task, answer, basis, modes, image, source_page=None, license_name="PRISM original", pair=None, note="", creator="PRISM"):
        path, sha, width, height = save(image, id_)
        manifest.append({"id": id_, "category": category, "file": path, "sha256": sha, "width": width, "height": height, "expected_label": expected, "label_basis": basis, "task": task, "answer_key": answer, "cvd_modes": modes.split(","), "pair_id": pair, "source_page": source_page, "license": license_name, "creator": creator, "note": note})

    for id_, title, category, expected, task, answer, basis, modes in EXTERNAL:
        image, page, license_name, creator = fetch(title, id_ + ".img")
        image.thumbnail((1000, 1000), Image.Resampling.LANCZOS)
        add(id_, category, expected, task, answer, basis, modes, image, page, license_name, note="Plate stress case; digital reproduction is not a diagnostic test.", creator=creator)

    for id_, title, task in NATURE:
        image, page, license_name, creator = fetch(title, id_ + ".img")
        pretty = "Autumn leaves" if id_ == "nature-leaf" else "Sumac and beautyberry"
        for good in (False, True):
            variant = "described" if good else "color-only"
            add(f"{id_}-{variant}", "nature", "good" if good else "bad", task,
                "One cluster is circled and described" if good else "Find one cluster using color alone",
                "design_intent", "protan,deutan", nature_card(image, pretty, task, good, id_), page, license_name, id_,
                "Described variant adds a circle and a textual location cue. Provisional label requires CVD review.", creator=creator)

    examples = [
        ("textbook-transport", "textbook", textbook_transport, "Which path carries sodium into the cell?", "Sodium path enters the cell", "protan,deutan"),
        ("textbook-map", "textbook", textbook_map, "Which regions are protected wetlands?", "Red map regions are wetlands", "protan,deutan"),
        ("science-chart", "scientific_poster", science_chart, "Which habitat has 64 species in year 6?", "Forest", "protan,deutan"),
        ("science-cells", "scientific_poster", science_cells, "List the numbered cells that show both A and B.", "1, 3, 4, 7, 9, 12, 13, 15", "tritan"),
        ("humanities-timeline", "humanities_poster", humanities_timeline, "Which milestones describe arrivals?", "1905, 1952, 2008", "protan,deutan"),
        ("humanities-map", "humanities_poster", humanities_map, "Which route leads to oral history?", "Solid route to oral history gallery", "tritan"),
    ]
    for id_, category, generator, task, answer, modes in examples:
        for good in (False, True):
            add(f"{id_}-{'good' if good else 'bad'}", category, "good" if good else "bad", task, answer,
                "design_intent", modes, generator(good), pair=id_,
                note="Controlled pair; same task and content, with explicit non-color cues added in good variant.")

    (OUT / "manifest.json").write_text(json.dumps({"version": "0.1.0", "created": "2026-11-02", "items": manifest}, indent=2) + "\n", encoding="utf-8")
    with (OUT / "ratings-template.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(["participant_id", "item_id", "cvd_type", "cvd_severity", "task_response", "response_correct", "difficulty_1_to_5", "time_seconds", "color_needed_yes_no", "notes"])
        for item in manifest:
            writer.writerow(["", item["id"], "", "", "", "", "", "", "", ""])
    sheet = Image.new("RGB", (1200, 1280), "#ffffff")
    draw = ImageDraw.Draw(sheet)
    for i, item in enumerate(sorted(manifest, key=lambda row: row["id"])):
        thumb = Image.open(OUT / item["file"]).convert("RGB")
        thumb.thumbnail((220, 270), Image.Resampling.LANCZOS)
        x, y = (i % 5) * 240, (i // 5) * 320
        sheet.paste(thumb, (x + (240 - thumb.width) // 2, y + 30))
        draw.text((x + 5, y + 5), item["id"], font=font(14), fill=INK)
    sheet.save(OUT / "contact-sheet.jpg", quality=90)
    print(f"Built {len(manifest)} images in {IMAGES}")


if __name__ == "__main__":
    main()
