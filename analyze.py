"""Reproduce recorded-score comparisons; Python standard library only.

Source: METHODS.md; the paper, Sections II, III-B
(Mobius decomposition, order truncation, equal-weight no-intercept LS), V-A.
This is fresh score-analysis code, not a reimplementation of the simulator.
"""

import argparse
import hashlib
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TOLERANCE = 1e-12
SIZES = [mask.bit_count() for mask in range(16)]


def candidate_scores(values):
    """All 16 values use bit masks: bit 0 is robot 1, bit 3 is robot 4."""
    if not isinstance(values, list) or len(values) != 16:
        raise ValueError("Expected exactly 16 subset scores")
    if any(type(v) not in (int, float) or not math.isfinite(v) or not 0 <= v <= 1
           for v in values):
        raise ValueError("Subset scores must be finite coverage fractions in [0, 1]")
    if values[0] != 0:
        raise ValueError("Empty coalition must score zero")
    shares = values.copy()
    for bit in (1, 2, 4, 8):
        for mask in range(16):
            if mask & bit:
                shares[mask] -= shares[mask ^ bit]
    orders = [math.fsum(shares[m] for m in range(16) if SIZES[m] == k)
              for k in range(1, 5)]
    f2_subsets = [math.fsum(shares[t] for t in range(16)
                           if t & s == t and SIZES[t] <= 2) for s in range(16)]
    denominator = math.fsum(values)
    # Four-robot full-team LS projection, derived in METHODS.md.
    weights = (0, -5 / 44, -2 / 44, 9 / 44, 28 / 44)
    return {
        "F": values[15],
        "F1": orders[0],
        "F2": math.fsum(orders[:2]),
        "F3": math.fsum(orders[:3]),
        "F4": math.fsum(orders),
        "G": math.fsum(weights[SIZES[m]] * values[m] for m in range(16)),
        "E2": math.fsum(abs(a - b) for a, b in zip(values, f2_subsets)) / denominator
        if denominator else 0.0,
        "orders": orders,
        "terms": shares,
    }


def selection(candidates, score):
    if not candidates:
        raise ValueError("Candidate pool is empty")
    best_score = max(c[score] for c in candidates)
    top = [c for c in candidates if c[score] >= best_score - TOLERANCE]
    best_exact = max(c["F"] for c in candidates)
    exact_top = {c["id"] for c in candidates if c["F"] >= best_exact - TOLERANCE}
    regret = best_exact - max(c["F"] for c in top)
    ids = sorted(c["id"] for c in top)
    return {"top": ids, "regret": regret,
            "changed": exact_top.isdisjoint(ids) or regret > TOLERANCE}


def plan_label(candidate_id):
    """Readable name for the generation settings encoded in a candidate ID."""
    on_off = {"1": "on", "0": "off", "def": "on", "off": "off"}
    nearest = re.fullmatch(r"cand-p(\d+)-t([01])-c(def|off)", candidate_id)
    if nearest:
        period, handoff, crowding = nearest.groups()
        return (f"Relay {int(period)} · handoff {on_off[handoff]}"
                f" · crowding {on_off[crowding]}")
    random = re.fullmatch(r"cand-rf-p(\d+)-t([01])-s(\d+)", candidate_id)
    if random:
        period, handoff, seed = random.groups()
        return f"Relay {int(period)} · handoff {on_off[handoff]} · seed {seed}"
    raise ValueError(f"Unrecognized candidate ID: {candidate_id}")


def analyze_cell(cell):
    candidates = [{"id": c["id"], "label": plan_label(c["id"]), "subsets": c["subsets"],
                   **candidate_scores(c["subsets"])} for c in cell["candidates"]]
    best = max(c["F"] for c in candidates)
    return {
        "family": cell["family"], "map": cell["map"], "condition": cell["condition"],
        "candidates": candidates,
        "selectors": {key: selection(candidates, key) for key in ("F", "F1", "F2", "F3", "G")},
        "random_regret": math.fsum(best - c["F"] for c in candidates) / len(candidates),
        "mean_E2": math.fsum(c["E2"] for c in candidates) / len(candidates),
    }


def load_data():
    provenance = json.loads((ROOT / "provenance.json").read_text())
    raw = (ROOT / "scores.json").read_bytes()
    if hashlib.sha256(raw).hexdigest() != provenance["scores_sha256"]:
        raise ValueError("scores.json differs from its recorded SHA-256")
    data = json.loads(raw)
    if data["schema_version"] != 1:
        raise ValueError("Unsupported data schema")
    expected = {(f, f"env{i}", r) for f, ranges in
                (("nearest-frontier", ("3", "6", "9", "15", "30", "idealized")),
                 ("random-frontier", ("15",))) for i in range(1, 8) for r in ranges}
    actual = [(c["family"], c["map"], c["condition"]) for c in data["cells"]]
    if set(actual) != expected or len(actual) != len(expected):
        raise ValueError("Expected exactly 49 distinct map/family/condition cells")
    for cell in data["cells"]:
        ids = [c["id"] for c in cell["candidates"]]
        if len(ids) != 8 or len(set(ids)) != 8 or any(not isinstance(i, str) for i in ids):
            raise ValueError("Expected eight distinct candidate IDs per cell")
    return data, provenance


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Write the viewer's derived JSON")
    args = parser.parse_args()
    data, provenance = load_data()
    cells = [analyze_cell(cell) for cell in data["cells"]]
    print("Recorded-score replication; no simulation. Regret in coverage percentage points.")
    print("family,map,F1,F2,G,random")
    for cell in cells:
        if cell["condition"] != "15":
            continue
        vals = [cell["selectors"][k]["regret"] for k in ("F1", "F2", "G")]
        vals.append(cell["random_regret"])
        print(f"{cell['family']},{cell['map']}," + ",".join(f"{100*v:.6f}" for v in vals))
    if args.output:
        output = {"schema_version": 1, "provenance": provenance, "cells": cells}
        args.output.write_text(json.dumps(output, indent=2, allow_nan=False) + "\n")


if __name__ == "__main__":
    main()
