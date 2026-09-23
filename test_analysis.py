"""Portable contract checks: run python -m unittest discover -s ."""

import json
import math
import unittest
from pathlib import Path

from analyze import SIZES, analyze_cell, candidate_scores, load_data, plan_label, selection


class AnalysisChecks(unittest.TestCase):
    def test_distinct_interaction_orders_and_projection(self):
        # A known nonzero share at every nonempty mask; includes orders 1..4.
        shares = [m / 1000 for m in range(16)]
        values = [sum(shares[t] for t in range(16) if t & s == t) for s in range(16)]
        result = candidate_scores(values)
        expected_orders = [sum(shares[m] for m in range(16) if SIZES[m] == k)
                           for k in range(1, 5)]
        for actual, expected in zip(result["orders"], expected_orders):
            self.assertAlmostEqual(actual, expected)
        for key, expected in {"F": .12, "F1": .015, "F2": .06,
                              "F3": .105, "F4": .12}.items():
            self.assertAlmostEqual(result[key], expected)
        self.assertGreater(result["E2"], 0)
        omitted = sum(shares[t] for s in range(1, 16) for t in range(16)
                      if t & s == t and SIZES[t] > 2)
        self.assertAlmostEqual(result["E2"], omitted / sum(values))
        # The projection lies in column(X) and X^T w = x_N. Thus it is the
        # full-team OLS prediction for arbitrary y, not an approximate fit.
        weights = [(-5*k + 8*math.comb(k, 2))/44 for k in SIZES]
        for term in [m for m in range(1, 16) if SIZES[m] <= 2]:
            self.assertAlmostEqual(sum(weights[s] for s in range(16) if s & term == term), 1)
        self.assertAlmostEqual(result["G"], sum(w*v for w, v in zip(weights, values)))
        for mask, share in enumerate(shares):
            self.assertAlmostEqual(result["terms"][mask], share)

    def test_validation_and_ties(self):
        for invalid in ([0]*15, [1]*16, [0]+[float("nan")]*15, [0]+[1.1]*15,
                        [0]+[True]*15):
            with self.assertRaises(ValueError):
                candidate_scores(invalid)
        candidates = [{"id": "a", "F": .8, "F2": -.2},
                      {"id": "b", "F": .5, "F2": -.2 + 5e-13}]
        self.assertEqual(selection(candidates, "F2"),
                         {"top": ["a", "b"], "regret": 0, "changed": False})
        candidates[1]["F2"] = -.1
        result = selection(candidates, "F2")
        self.assertEqual(result["top"], ["b"])
        self.assertAlmostEqual(result["regret"], .3)
        self.assertTrue(result["changed"])
        self.assertEqual(candidate_scores([0]*16)["E2"], 0)

    def test_paper_counts_and_headline(self):
        data, _ = load_data()
        cells = [analyze_cell(c) for c in data["cells"]]
        self.assertEqual(len(cells), 49)
        for family, counts in (("nearest-frontier", (1, 6, 3)),
                               ("random-frontier", (3, 6, 3))):
            rows = [c for c in cells if c["family"] == family and c["condition"] == "15"]
            self.assertEqual(len(rows), 7)
            for selector, count in zip(("F1", "F2", "G"), counts):
                self.assertEqual(sum(c["selectors"][selector]["changed"] for c in rows), count)
        hero = next(c for c in cells if (c["family"], c["map"], c["condition"])
                    == ("nearest-frontier", "env1", "15"))
        self.assertEqual(hero["selectors"]["F"]["top"], ["cand-p300-t1-cdef"])
        self.assertEqual(hero["selectors"]["F2"]["top"], ["cand-p100-t1-cdef"])
        self.assertAlmostEqual(hero["selectors"]["F2"]["regret"], .33742631200575124)
        self.assertAlmostEqual(hero["selectors"]["G"]["regret"], .07099209202012946)
        self.assertAlmostEqual(hero["random_regret"], .24852174694464413)
        for cell in cells:
            for c in cell["candidates"]:
                self.assertAlmostEqual(c["F4"], c["F"], places=12)

    def test_plan_labels(self):
        self.assertEqual(plan_label("cand-p300-t1-cdef"), "Relay 300 · handoff on · crowding on")
        self.assertEqual(plan_label("cand-p100-t0-coff"), "Relay 100 · handoff off · crowding off")
        self.assertEqual(plan_label("cand-rf-p100-t1-s0"), "Relay 100 · handoff on · seed 0")
        with self.assertRaises(ValueError):
            plan_label("cand-x")
        data, _ = load_data()
        for cell in map(analyze_cell, data["cells"]):
            self.assertEqual(len({c["label"] for c in cell["candidates"]}), 8)

    def test_replay_matches_recorded_scores(self):
        # The page replay shows the env1/15 m F and F2 winners; each recorded
        # per-step coverage must end exactly at that plan's full-team F(N).
        replay = json.loads((Path(__file__).parent / "docs/replay.json").read_text())
        data, _ = load_data()
        cell = analyze_cell(next(c for c in data["cells"] if (c["family"], c["map"],
                                 c["condition"]) == ("nearest-frontier", "env1", "15")))
        final = {c["id"]: c["F"] for c in cell["candidates"]}
        self.assertEqual([(p["selected_by"], [p["id"]]) for p in replay["plans"]],
                         [(key, cell["selectors"][key]["top"]) for key in ("F", "F2")])
        for plan in replay["plans"]:
            coverage = plan["coverage"]
            self.assertEqual(len(coverage), 1000)
            self.assertEqual(len(plan["poses"]), 1000)
            self.assertEqual(coverage[-1], final[plan["id"]])
            self.assertTrue(all(0 <= a <= b <= 1 for a, b in zip(coverage, coverage[1:])))
            self.assertTrue(all(0 <= y < replay["height"] and 0 <= x < replay["width"]
                                for step in plan["poses"] for y, x in step))


if __name__ == "__main__":
    unittest.main()
