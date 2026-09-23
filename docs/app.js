"use strict";
// Display only: scientific calculations live in analyze.py and are tested there.
const el = (id) => document.getElementById(id);
const NAMES = {F: "F", F1: "F₁", F2: "F₂", F3: "F₃", G: "G"};
const COLORS = {best: "#1f5fa8", picked: "#b5482a", muted: "#c8c8c8", text: "#555"};
const FAMILIES = [["nearest-frontier", "Nearest-frontier plans"], ["random-frontier", "Random-frontier plans"]];
const OVERVIEW_SCORES = ["F1", "F2", "G"];
const TRUNCATION = {F1: 1, F2: 2, F3: 3};
const pct = (value) => `${(100 * value).toFixed(1)}%`;
const points = (value) => (100 * value).toFixed(1);
let cells = [];

function node(tag, attrs = {}, ...children) {
  const element = Object.assign(document.createElement(tag), attrs);
  element.append(...children);
  return element;
}
function svgNode(tag, attrs, text) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
}
function options(id, values, preferred) {
  el(id).replaceChildren(...values.map(([value, label]) => new Option(label, value)));
  el(id).value = values.some(([value]) => value === preferred) ? preferred : values[0][0];
}
const findCell = (family, map, condition) =>
  cells.find(c => c.family === family && c.map === map && c.condition === condition);

// Figure 2: loss for every map and score at 15 m, with random choice as a reference tick.
function overview() {
  const scale = (v) => `${Math.min(100, v / 0.4 * 100)}%`;
  const rows = Array.from({length: 7}, (_, i) => `env${i + 1}`).map(map => {
    const tds = FAMILIES.flatMap(([family]) => {
      const cell = findCell(family, map, "15");
      return OVERVIEW_SCORES.map(score => {
        const loss = cell.selectors[score].regret;
        const fill = node("span", {className: "fill"});
        fill.style.cssText = `width:${scale(loss)};background:${score === "F2" ? COLORS.picked : "#8a8a8a"}`;
        const tick = node("span", {className: "tick", title: `Random choice loses ${points(cell.random_regret)} points on average`});
        tick.style.left = scale(cell.random_regret);
        const label = node("span", {className: loss > 0 ? "value" : "value zero"}, loss > 0 ? points(loss) : "0");
        const button = node("button", {type: "button", className: "cell", title: `Show ${map}, ${family}, ${NAMES[score]}`},
          node("span", {className: "track"}, fill, tick), label);
        button.addEventListener("click", () => showCase(family, map, score));
        return node("td", {className: score === OVERVIEW_SCORES[0] ? "family-start" : ""}, button);
      });
    });
    return node("tr", {}, node("th", {scope: "row"}, map), ...tds);
  });
  el("overview-body").replaceChildren(...rows);
}

function showCase(family, map, score) {
  el("family").value = family;
  updateConditions();
  el("map").value = map;
  el("condition").value = "15";
  el("score").value = score;
  render();
  el("detail").scrollIntoView({behavior: "smooth", block: "start"});
}

function roles(cell, score) {
  const best = cell.selectors.F.top, picked = cell.selectors[score].top;
  return (c) => ({best: best.includes(c.id), picked: picked.includes(c.id)});
}
const colorOf = ({best, picked}) => picked && !best ? COLORS.picked : best ? COLORS.best : COLORS.muted;

function summary(cell, score) {
  const where = cell.condition === "idealized" ? "with idealized communication" : `at ${cell.condition} m`;
  const picked = cell.candidates.filter(c => cell.selectors[score].top.includes(c.id));
  const chosen = picked.reduce((a, b) => a.F >= b.F ? a : b);
  const best = Math.max(...cell.candidates.map(c => c.F));
  const lead = `On ${cell.map} ${where}, `;
  const tie = picked.length > 1 ? `${NAMES[score]} gives ${picked.length} plans the same top score, and the best of them` : `${NAMES[score]} picks a plan that`;
  const parts = cell.selectors[score].regret > 0
    ? [lead, `${tie} delivers `, node("strong", {id: "selected", style: `color:${COLORS.picked}`}, pct(chosen.F)),
       " of the map. The best of the eight plans delivers ", node("strong", {id: "best", style: `color:${COLORS.best}`}, pct(best)),
       `, so picking by ${NAMES[score]} loses `, node("strong", {id: "regret"}, points(cell.selectors[score].regret)), " percentage points."]
    : [lead, `${NAMES[score]} picks the best of the eight plans, which delivers `,
       node("strong", {id: "best", style: `color:${COLORS.best}`}, pct(best)), "."];
  const cut = TRUNCATION[score];
  const leftOut = (c) => c.orders.slice(cut).reduce((a, b) => a + b, 0);
  const signed = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}`;
  const bestPlan = cell.candidates.find(c => cell.selectors.F.top.includes(c.id));
  if (cut && chosen !== bestPlan) {
    parts.push(` The terms ${NAMES[score]} leaves out add up to `,
      node("strong", {style: `color:${COLORS.best}`}, signed(leftOut(bestPlan))), " for the best plan and ",
      node("strong", {style: `color:${COLORS.picked}`}, signed(leftOut(chosen))), " for the plan it picks.");
  }
  el("summary").replaceChildren(...parts);
  el("generated-note").textContent = cell.condition === "15" ? "" : "These plans were generated at 15 m and replayed under this condition.";
}

// Figure 5: slopegraph of the two orderings, settings as aligned columns.
const narrow = window.matchMedia("(max-width: 640px)");
const SLOPE_LAYOUT = {
  wide: {width: 720, cols: [70, 150, 235], pct: 345, left: 365, right: 565, note: 577},
  narrow: {width: 440, cols: [20, 72, 128], pct: 198, left: 212, right: 330, note: 340, short: true},
};
function settings(label) {
  const [relay, handoff, last] = label.split(" · ").map(part => part.split(" ").pop());
  const mark = (value) => value === "on" ? "✓" : value === "off" ? "–" : value;
  return [relay, mark(handoff), mark(last)];
}
function slopegraph(cell, score) {
  const svg = el("slope");
  const L = narrow.matches ? SLOPE_LAYOUT.narrow : SLOPE_LAYOUT.wide;
  const top = 46, gap = 26;
  svg.setAttribute("viewBox", `0 0 ${L.width} ${top + gap * 8}`);
  const byF = [...cell.candidates].sort((a, b) => b.F - a.F);
  const byScore = [...cell.candidates].sort((a, b) => b[score] - a[score]);
  const y = (list, c) => top + gap * list.indexOf(c);
  const role = roles(cell, score);
  const g = svgNode("g", {});
  const lastName = cell.family === "random-frontier" ? "Seed" : L.short ? "Crowd" : "Crowding";
  ["Relay", "Handoff", lastName].forEach((name, i) => g.append(svgNode("text", {x: L.cols[i], y: 20, "text-anchor": "middle", class: "head"}, name)));
  g.append(svgNode("text", {x: L.pct, y: 20, "text-anchor": "end", class: "head"}, L.short ? "Cov." : "Coverage"));
  g.append(svgNode("text", {x: L.right, y: 20, "text-anchor": "middle", class: "head"}, `By ${NAMES[score]}`));
  g.append(svgNode("line", {x1: 0, x2: L.width, y1: 30, y2: 30, stroke: "#e5e5e5"}));
  const highlighted = (c) => colorOf(role(c)) !== COLORS.muted;
  for (const c of [...byF].sort((a, b) => highlighted(a) - highlighted(b))) {
    const r = role(c), color = colorOf(r), strong = highlighted(c);
    const [y1, y2] = [y(byF, c), y(byScore, c)];
    const textAttrs = {fill: strong ? color : COLORS.text, class: strong ? "strong" : ""};
    settings(c.label).forEach((value, i) => g.append(svgNode("text", {x: L.cols[i], y: y1 + 4, "text-anchor": "middle", ...textAttrs}, value)));
    g.append(svgNode("text", {x: L.pct, y: y1 + 4, "text-anchor": "end", ...textAttrs}, pct(c.F)));
    g.append(svgNode("line", {x1: L.left, x2: L.right, y1, y2, stroke: color, "stroke-width": strong ? 2.5 : 1.2}));
    g.append(svgNode("circle", {cx: L.left, cy: y1, r: strong ? 4 : 3, fill: color}));
    g.append(svgNode("circle", {cx: L.right, cy: y2, r: strong ? 4 : 3, fill: color}));
    const note = [r.best && "best", r.picked && "picked"].filter(Boolean).join(", ");
    if (note) g.append(svgNode("text", {x: L.note, y: y2 + 4, fill: color, class: "strong"}, note));
  }
  svg.replaceChildren(g);
}

function render() {
  const cell = findCell(el("family").value, el("map").value, el("condition").value);
  const score = el("score").value;
  summary(cell, score);
  slopegraph(cell, score);
}
function updateConditions() {
  const ranges = el("family").value === "nearest-frontier" ? ["3", "6", "9", "15", "30", "idealized"] : ["15"];
  options("condition", ranges.map(r => [r, r === "idealized" ? "Idealized" : `${r} m`]), el("condition").value || "15");
  render();
}
async function init() {
  try {
    const response = await fetch("data.json?v=11");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    cells = data.cells;
    el("provenance").textContent = JSON.stringify(data.provenance, null, 2);
    options("map", Array.from({length: 7}, (_, i) => [`env${i + 1}`, `env${i + 1}`]), "env1");
    el("family").addEventListener("change", updateConditions);
    for (const id of ["map", "condition", "score"]) el(id).addEventListener("change", render);
    overview();
    updateConditions();
    narrow.addEventListener("change", render);
  } catch (error) {
    el("summary").textContent = `Could not load data.json (${error.message}). Serve this folder over HTTP with the command under Reproduce.`;
    for (const select of document.querySelectorAll("select")) select.disabled = true;
  }
}
init();
