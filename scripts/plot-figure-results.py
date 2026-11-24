"""Render the science fair comparison from the two recorded CSVs (Matplotlib)."""
import csv
from pathlib import Path

import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1] / "benchmark"


def load(split):
    with (ROOT / f"comparison-{split}.csv").open(encoding="utf8", newline="") as stream:
        return list(csv.DictReader(stream))


def total(rows, field):
    return sum(int(r[field] or 0) for r in rows)


def main():
    dev, fresh = load("development"), load("fresh")
    panels = [
        ("Challenge plates", [r for r in dev if r["family"] == "ishihara"]),
        ("Educational figures", [r for r in dev if r["family"] not in ("ishihara", "reverse plate", "nature")]),
        ("Fresh charts", fresh),
    ]
    fig, (left, right) = plt.subplots(1, 2, figsize=(10.4, 4.5), gridspec_kw={"width_ratios": [1.65, 1]})
    fig.subplots_adjust(left=.07, right=.98, bottom=.21, top=.74, wspace=.28)
    colors = ("#506177", "#005ac9", "#a54e19")
    for i, (method, label) in enumerate(zip("ABC", ("A · Original", "B · K-means", "C · SLIC"))):
        for j, (_, rows) in enumerate(panels):
            graded = [r for r in rows if r["method"] == method]
            hits, losses = total(graded, "hits"), total(graded, "losses")
            x = j + .27*(i-1)
            left.bar(x, hits/losses, width=.24, color=colors[i], label=label if j == 0 else None)
            left.text(x, hits/losses + .035, f"{hits}/{losses}", ha="center", fontsize=8)
        graded = [r for r in fresh if r["method"] == method and r["extra"] != ""]
        mean = total(graded, "extra") / len({r["item"] for r in graded})
        right.bar(i, mean, width=.60, color=colors[i])
        right.text(i, mean + .07, f"{mean:.3f}".rstrip("0").rstrip("."), ha="center", fontsize=10)
    left.set(xticks=range(3), xticklabels=[p[0] for p in panels], ylim=(0, 1.18),
             yticks=[0,.25,.5,.75,1], yticklabels=["0%","25%","50%","75%","100%"])
    right.set(xticks=range(3), xticklabels=["A","B","C"], ylim=(0,3.6), yticks=[0,1,2,3])
    left.set_title("Annotated losses found", loc="left", fontsize=13)
    right.set_title("Unmatched warnings / chart", loc="left", fontsize=13)
    for ax in (left, right):
        ax.spines[["top","right"]].set_visible(False)
        ax.grid(axis="y", alpha=.18)
        ax.set_axisbelow(True)
    fig.suptitle("Can the first three warnings locate the marked color pair?", x=.06,
                 y=.96, ha="left", fontsize=17, fontweight="bold")
    fig.legend(*left.get_legend_handles_labels(), loc="lower left", bbox_to_anchor=(.06,.04), ncol=3, frameon=False)
    fig.text(.07,.02,"Two of the eight fresh charts had an annotated loss. Both losses were in the deuteranopia simulation.",fontsize=9)
    fig.savefig(ROOT / "figure-results.png", dpi=160, facecolor="white")
    plt.close(fig)


if __name__ == "__main__":
    main()

