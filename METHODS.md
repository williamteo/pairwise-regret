# Score definitions and release scope

This implementation follows William Teo, *Pairwise Approximation Can Select
the Wrong Multi-Robot Plan* (IROS 2026 Workshop on Intelligent Information
Gathering): Section II (selection and ties), Section III-B (Möbius
decomposition, truncation, least-squares fit, E2), and Section V-A
(comparison across maps and candidate families). No simulator code is
copied into this implementation.

Each candidate contains 16 delivered-coverage fractions F(S). Index S is a
bit mask: bits 0, 1, 2, 3 correspond to robots 1, 2, 3, 4; index 0 is the
empty team and index 15 is the full team. F(empty) = 0. Subset replays held
remaining trajectories fixed; robots did not replan when teammates were removed.

The fast subset transform computes
m(T) = sum over U subset T of (-1)^|T minus U| F(U).
Fk(N) sums m(T) for |T| <= k. F1 is the singleton sum; for four robots,
F2(N) = sum of the six pair values minus twice the four singleton values.
F4(N) = F(N). F2 is not clipped to [0,1]. Negative approximate scores do
not mean negative physical coverage. `orders` contains signed sums of
shares of sizes 1, 2, 3 and 4, in that order. `terms` lists the 16 values
m(S) by mask; `terms[0]` is 0, and the terms of each size sum to the
matching entry of `orders`.

E2 = sum over nonempty S of |F(S) - F2(S)| / sum over nonempty S of F(S).
We use the displayed manuscript equation without the historical code's
1e-12 denominator regularizer. For the all-zero function we define E2 = 0.
This convention does not affect the recorded nonzero-denominator cases or
rounded paper comparisons. E2 measures reconstruction, not selection loss.

G is the full-team prediction from an equal-weight, no-intercept,
unregularized least-squares fit to all 15 nonempty subsets, including the
full-team outcome. It is an in-sample diagnostic, not a predictor trained
only on singleton and pair measurements. No fit coefficients or G values
for individual subsets are claimed by this release.

For four robots the full-team LS prediction has a simple exact projection.
Let X have one column per singleton/pair, with X[S,T] = 1 when T is a
subset of S. The vector x_N has ten ones. The unique vector w in column(X)
with X^T w = x_N gives G(N) = w^T F. By symmetry, write
w(S) = a |S| + b choose(|S|,2). A singleton column gives 20a + 18b = 1;
a pair column gives 12a + 13b = 1. Thus a = -5/44, b = 8/44, and weights
for sizes 1..4 are (-5, -2, 9, 28)/44. The code uses these weights instead
of a numerical linear-algebra dependency. The standalone test checks the
normal-equation identities, and a check against the original numerical fits
matched every exported G(N).

Candidate IDs encode the generation settings, and `label` spells them out.
Nearest-frontier IDs `cand-p{period}-t{0|1}-c{def|off}` give the relay
period in steps, relay handoff off or on, and the frontier-crowding penalty
at its default or off. Random-frontier IDs `cand-rf-p{period}-t{0|1}-s{seed}`
give the relay period, relay handoff and generator seed. These settings are
the benchmark's `relay_period`, `relay_transfer` and crowding thresholds
(`other_traj_threshold`, `other_intent_threshold` at 5 and 10, or 0 and 0).

For each selector, the top set includes every candidate within 1e-12 of
its maximum. Regret is max F minus the largest F among that top set
(optimistic tie handling). A selection change means disjoint exact and
approximate top sets, or regret > 1e-12. Uniform random-pick expected
regret is the mean of max F minus each candidate's F. Fractions become
percentage points by multiplying by 100, not by dividing by the winner.

The data comprise 42 nearest-frontier cells (seven maps, six conditions)
and seven random-frontier cells at 15 m, eight candidates per cell.
The random-frontier env1 off-generation sweep is not included. Candidates
were generated at 15 m; all other ranges and idealized communication are
counterfactual frozen replays. Conditions on a map reuse trajectories and
are not independent replications. The families are reported separately.
The F1 and uniform random comparisons were added post hoc to recorded data.

The replay on the project page (`docs/replay.json`, `docs/floorplan.png`,
`docs/layers-*.png`) covers the two env1 nearest-frontier plans at 15 m that
F and F2 rank first. It holds each plan's recorded full-team robot positions
and delivered coverage at every step, and the explored and delivered
knowledge masks the paper's Figure 1 pipeline saved every 5 steps (steps
5, 10, ..., 1000, counting from 1). Each layer PNG stores, per map cell, the
1-based index of the snapshot at which the cell was first explored (red
channel) or delivered (green channel), with 0 meaning never. The encoding
is lossless because the exporter checks that no mask ever loses a cell. The
exporter also checks the trajectory digests, that every plan's final
coverage equals its recorded F(N), that the masks' delivered fraction
equals the recorded coverage at every snapshot, and the pinned map hash.
The page repeats the delivered-fraction check after decoding. The
simulator logs these files come from are not included, so they cannot be
regenerated from this repository. `test_analysis.py` checks that the
replay's plans are the F and F2 winners and that each final coverage
equals F(N) in `scores.json`.

This release reproduces score arithmetic and selections from recorded
observations. It does not regenerate candidate trajectories, sensing,
communication or coverage masks, and it does not rebuild the manuscript's
map figures. The replay files above are recorded outputs, not
regenerated ones. A result
explorer is not a robotics simulator. Evidence is limited to one benchmark,
four robots, fixed starts, and two eight-plan families; it does not establish
that pairwise planners generally fail or that communication causes all
higher-order structure.
