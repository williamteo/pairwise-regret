"use strict";
// Display only: F, F1, F2, F3 and G come from data.json (computed in analyze.py).
(() => {
  const el = (id) => document.getElementById(id);
  const ROBOT_COLORS = ["#ff0000", "#7b3f00", "#00008b", "#006400"];
  const PLAN_COLORS = {best: "#1f5fa8", picked: "#b5482a"};
  const NAMES = {F: "F", F1: "F₁", F2: "F₂", F3: "F₃", G: "G"};
  // Subset sizes each score reads; G is fitted to every nonempty subset.
  const USES = {F: [4], F1: [1], F2: [1, 2], F3: [1, 2, 3], G: [1, 2, 3, 4]};
  const EXPLAIN = {
    F: "F is the delivered coverage of the full team, the top box. This is the exact objective.",
    F1: "F₁ adds up the four single-robot values. It ignores any overlap or cooperation between robots.",
    F2: "F₂ starts from F₁ and adds a correction for each pair: the pair's value minus its two single-robot values. The correction is negative when a pair delivers less than the two robots alone and positive when it delivers more. Groups of three or four are left out.",
    F3: "F₃ also adds a correction for each group of three. Only the four-robot term is left out.",
    G: "G fits one value per robot and one per pair so that their sums match all 15 subset values as closely as possible (least squares), then adds them up for the full team.",
  };
  // Möbius term orders each score keeps; F keeps all, G fits singles and pairs.
  const KEEPS = {F: [1, 2, 3, 4], F1: [1], F2: [1, 2], F3: [1, 2, 3], G: [1, 2]};
  const LEVEL_NAMES = {1: "Single robots", 2: "Pairs", 3: "Triples", 4: "All four"};
  const BOX = {w: 84, h: 54};
  const LEVEL_Y = {4: 4, 3: 84, 2: 164, 1: 244};
  const CENTER = 425;
  const SPACING = 94;
  const signed = (v) => Math.abs(v) < 0.005 ? "0.00" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;
  let plans, state = {score: "F2", plan: "best"};

  const size = (mask) => [0, 1, 2, 3].filter(r => mask & (1 << r)).length;
  const masksOfSize = (k) => Array.from({length: 16}, (_, m) => m).filter(m => size(m) === k);
  function position(mask) {
    const level = masksOfSize(size(mask));
    const i = level.indexOf(mask);
    return {x: CENTER + (i - (level.length - 1) / 2) * SPACING - BOX.w / 2, y: LEVEL_Y[size(mask)]};
  }
  function svgNode(tag, attrs, text) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function edges(g) {
    for (let mask = 1; mask < 16; mask++) {
      for (let r = 0; r < 4; r++) {
        if (mask & (1 << r) || size(mask) === 4) continue;
        const [a, b] = [position(mask), position(mask | (1 << r))];
        g.append(svgNode("line", {x1: a.x + BOX.w / 2, y1: a.y, x2: b.x + BOX.w / 2, y2: b.y + BOX.h, stroke: "#eee"}));
      }
    }
  }

  function rowLabel(g, level, plan, kept, color) {
    const y = LEVEL_Y[level];
    const fitted = state.score === "G";
    const status = fitted ? (kept ? "refitted" : "not in model") : kept ? "kept" : "left out";
    const text = fitted ? status : `${signed(plan.orders[level - 1])} ${status}`;
    g.append(svgNode("text", {x: 0, y: y + 20, class: "strong", fill: kept ? "#222" : "#666"}, LEVEL_NAMES[level]));
    g.append(svgNode("text", {x: 0, y: y + 38, fill: kept ? color : "#666", class: kept ? "strong" : ""}, text));
  }

  function box(g, mask, value, term, used, kept, color) {
    const {x, y} = position(mask);
    g.append(svgNode("rect", {x, y, width: BOX.w, height: BOX.h, rx: 4, fill: used ? color : "#fff",
      "fill-opacity": used ? 0.12 : 1, stroke: used ? color : "#888", "stroke-width": used ? 2 : 1,
      "stroke-dasharray": kept ? "none" : "4 3"}));
    // G refits its own terms, so the exact Möbius terms are not shown in its view.
    if (state.score !== "G") {
      const termColor = kept ? color : "#666";
      g.append(svgNode("text", {x: x + BOX.w / 2, y: y + 48, "text-anchor": "middle", class: "axis",
        fill: termColor, style: `fill:${termColor}`}, `term ${signed(term)}`));
    }
    const robots = [0, 1, 2, 3].filter(r => mask & (1 << r));
    robots.forEach((r, i) => g.append(svgNode("circle", {cx: x + BOX.w / 2 + (i - (robots.length - 1) / 2) * 12, cy: y + 12, r: 4,
      fill: ROBOT_COLORS[r], "fill-opacity": used ? 1 : 0.6})));
    g.append(svgNode("text", {x: x + BOX.w / 2, y: y + 31, "text-anchor": "middle", fill: used ? "#222" : "#555",
      class: used ? "strong" : ""}, `${(100 * value).toFixed(1)}%`));
  }

  function render() {
    const plan = plans[state.plan], color = PLAN_COLORS[state.plan];
    const g = svgNode("g", {});
    edges(g);
    const keeps = KEEPS[state.score];
    for (let level = 1; level <= 4; level++) rowLabel(g, level, plan, keeps.includes(level), color);
    for (let mask = 1; mask < 16; mask++) {
      box(g, mask, plan.subsets[mask], plan.terms[mask], USES[state.score].includes(size(mask)), keeps.includes(size(mask)), color);
    }
    el("lattice").replaceChildren(g);
    const estimate = plan[state.score];
    el("score-explain").replaceChildren(EXPLAIN[state.score], " ",
      Object.assign(document.createElement("strong"), {textContent: `${NAMES[state.score]} = ${estimate.toFixed(2).replace("-", "−")}`}),
      state.score === "F" ? "." : `, against a true F of ${plan.F.toFixed(2)}.`);
    document.querySelectorAll("#subset-figure [data-score]").forEach(b => b.setAttribute("aria-pressed", b.dataset.score === state.score));
    document.querySelectorAll("#subset-figure [data-plan]").forEach(b => b.setAttribute("aria-pressed", b.dataset.plan === state.plan));
  }

  async function init() {
    try {
      const response = await fetch("data.json?v=10");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const cell = (await response.json()).cells.find(c => c.family === "nearest-frontier" && c.map === "env1" && c.condition === "15");
      const byId = (id) => cell.candidates.find(c => c.id === id);
      plans = {best: byId(cell.selectors.F.top[0]), picked: byId(cell.selectors.F2.top[0])};
      document.querySelectorAll("#subset-figure [data-score]").forEach(b => b.addEventListener("click", () => { state.score = b.dataset.score; render(); }));
      document.querySelectorAll("#subset-figure [data-plan]").forEach(b => b.addEventListener("click", () => { state.plan = b.dataset.plan; render(); }));
      render();
    } catch (error) {
      el("score-explain").textContent = `Could not load data.json (${error.message}).`;
    }
  }
  init();
})();
