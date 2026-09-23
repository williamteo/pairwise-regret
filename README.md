# Pairwise Approximation Can Select the Wrong Multi-Robot Plan

Code and data for the IROS 2026 Intelligent Information Gathering workshop
paper by William Teo. Project page: https://www.william-teo.com/pairwise-regret/

`analyze.py` recomputes the paper's scores and plan selections from the
recorded subset values in `scores.json`. It needs Python 3.10 or later and
uses only the standard library. It does not rerun the simulator or
regenerate the trajectories and map figures.

## Reproduce

From the repository root:

```sh
python -m unittest discover -s .
python analyze.py --output docs/data.json
python -m http.server 8000 --directory docs --bind 127.0.0.1
```

Open http://127.0.0.1:8000. The analysis prints the 15 m results table in
percentage points of map coverage and writes the values shown on the project
page. The data cover 49 cells (map, candidate family and communication
range), each with eight candidate plans and all 16 subset values per plan.
The nearest-frontier family has the full range sweep. The random-frontier
family has 15 m only.

At 15 m, the expected results are that F₂ changes the selection on 6 of 7
maps in each family and G on 3 of 7. F₁ changes it on 1 of 7 nearest-frontier
and 3 of 7 random-frontier maps. The env1 nearest-frontier F₂ regret is
0.33742631200575124. G is fitted to all 15 nonempty subsets of each plan,
including the full team, so it is an in-sample comparison.
Read [METHODS.md](METHODS.md) for equations, ties, and limitations.

## Files and provenance

- `scores.json`: compact recorded F(S) values; SHA-256 in `provenance.json`.
- `analyze.py`: four-robot Möbius decomposition, scores and selection.
- `test_analysis.py`: analytic controls, ties, validation, and paper checks.
- `docs/`: static project page; `data.json` is derived from `scores.json`.
- `docs/replay.json`, `docs/floorplan.png`, `docs/layers-*.png`: recorded env1
  trajectories, per-step delivered coverage and the explored/delivered map
  saved every 5 steps for the two plans in Figure 1, and the benchmark floor
  plan. The page checks the decoded maps against the recorded coverage. These were exported from the simulator logs and cannot be
  regenerated here. A test checks that each plan's final coverage equals its
  recorded full-team score.
- `METHODS.md`: exact scope and the dependency-free G(N) projection derivation.

`provenance.json` records SHA-256 hashes of the unpublished research records
the scores were extracted from, and of `scores.json` itself. `analyze.py`
refuses to run if `scores.json` does not match its recorded hash.

The original observations came from the
[BYU FROST Lab indoor exploration benchmark](https://github.com/BYU-FROST-Lab/indoor-exploration-competition),
pinned to `2a2c7519253b0d1f454f20b0865e3a6c17eb45b9`.
No benchmark code or trajectory banks are included. `docs/floorplan.png`
and `docs/layers-*.png` are derived from the benchmark's env1 map and from
simulations on it.

## Site

GitHub Pages serves `docs/` from the default branch. All browser paths are
relative. After changing `scores.json` or `analyze.py`, rerun the analysis
and commit the regenerated `docs/data.json`; CI fails if it is stale.

## License

Code (`analyze.py`, `test_analysis.py`, `docs/*.js`, `docs/style.css`):
MIT, see [LICENSE](LICENSE). Data (`scores.json`, `docs/data.json`,
`docs/replay.json`) and written content (`METHODS.md`, `docs/index.html`):
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
`docs/floorplan.png` and `docs/layers-*.png` show the benchmark's env1 map,
which is not covered by these licenses. They are included with attribution
to the BYU FROST Lab, whose benchmark states no license of its own.
