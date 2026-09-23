"use strict";
// Display only: replay.json and layers-*.png hold recorded trajectories,
// per-step coverage and the explored/delivered masks saved every 5 steps.
(() => {
  const el = (id) => document.getElementById(id);
  const SCALE = 2;
  const LAST = 999;
  const NAMES = {F: "F", F2: "F₂"};
  const PLAN_COLORS = {F: "#1f5fa8", F2: "#b5482a"};
  // Upstream benchmark identity colors, as in the paper's Figure 1.
  const ROBOT_COLORS = ["#ff0000", "#7b3f00", "#00008b", "#006400"];
  const CELL = {wall: [0, 0, 0], delivered: [255, 255, 255], explored: [227, 168, 124], unknown: [216, 216, 216]};
  let replay, walls, snapshot, playing = false;

  const loadImage = async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    return image;
  };

  function pixels(image) {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, image.width, image.height).data;
  }

  // Cumulative share of cells first seen at or before each snapshot.
  function cumulativeShare(firstSeen) {
    const counts = new Array(replay.snapshot_steps.length + 1).fill(0);
    for (const index of firstSeen) counts[index]++;
    let total = 0;
    return counts.slice(1).map((count) => (total += count) / firstSeen.length);
  }

  function decodeLayers(plan, rgba) {
    const cells = rgba.length / 4;
    plan.explored = new Uint8Array(cells);
    plan.delivered = new Uint8Array(cells);
    for (let i = 0; i < cells; i++) {
      plan.explored[i] = rgba[4 * i];
      plan.delivered[i] = rgba[4 * i + 1];
    }
    plan.exploredShare = cumulativeShare(plan.explored);
    const delivered = cumulativeShare(plan.delivered);
    const mismatch = replay.snapshot_steps.findIndex((step, k) => delivered[k] !== plan.coverage[step]);
    if (mismatch >= 0) throw new Error(`${plan.id} masks disagree with recorded coverage at step ${replay.snapshot_steps[mismatch]}`);
  }

  function knowledgeImage(plan, k) {
    const image = new ImageData(replay.width, replay.height);
    const data = image.data;
    const limit = k + 1;
    for (let i = 0; i < plan.explored.length; i++) {
      const d = plan.delivered[i], e = plan.explored[i];
      const color = walls[4 * i] === 0 ? CELL.wall
        : d > 0 && d <= limit ? CELL.delivered
        : e > 0 && e <= limit ? CELL.explored : CELL.unknown;
      data[4 * i] = color[0];
      data[4 * i + 1] = color[1];
      data[4 * i + 2] = color[2];
      data[4 * i + 3] = 255;
    }
    return image;
  }

  function drawPaths(ctx, plan, step) {
    ctx.lineCap = ctx.lineJoin = "round";
    for (const [width, colorOf] of [[3.2, () => "#fff"], [1.6, (robot) => ROBOT_COLORS[robot]]]) {
      for (let robot = 0; robot < 4; robot++) {
        ctx.beginPath();
        for (let t = 0; t <= step; t++) {
          const [y, x] = plan.poses[t][robot];
          ctx[t === 0 ? "moveTo" : "lineTo"](x + .5, y + .5);
        }
        ctx.lineWidth = width;
        ctx.strokeStyle = colorOf(robot);
        ctx.stroke();
      }
    }
    plan.poses[step].forEach(([y, x], robot) => {
      ctx.beginPath();
      ctx.arc(x + .5, y + .5, 4, 0, 2 * Math.PI);
      ctx.fillStyle = ROBOT_COLORS[robot];
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "#000";
      ctx.stroke();
    });
  }

  function drawBase(ctx) {
    const [y, x] = replay.base;
    ctx.beginPath();
    ctx.moveTo(x + .5, y - 5);
    ctx.lineTo(x + 6, y + 5);
    ctx.lineTo(x - 5, y + 5);
    ctx.closePath();
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#fff";
    ctx.stroke();
  }

  function drawMap(canvas, plan, k) {
    const step = replay.snapshot_steps[k];
    const layer = document.createElement("canvas");
    layer.width = replay.width;
    layer.height = replay.height;
    layer.getContext("2d").putImageData(knowledgeImage(plan, k), 0, 0);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.drawImage(layer, 0, 0);
    drawPaths(ctx, plan, step);
    drawBase(ctx);
  }

  function svgNode(tag, attrs, text) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function coverageChart() {
    const svg = el("replay-chart");
    const x = (t) => 50 + t / LAST * 540;
    const y = (v) => 125 - v * 110;
    for (const v of [0, .5, 1]) {
      svg.append(svgNode("line", {x1: 50, x2: 590, y1: y(v), y2: y(v), stroke: "#e5e5e5"}));
      svg.append(svgNode("text", {x: 42, y: y(v) + 4, "text-anchor": "end", class: "axis"}, `${v * 100}%`));
    }
    for (const plan of replay.plans) {
      const points = plan.coverage.map((v, t) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
      const color = PLAN_COLORS[plan.selected_by];
      svg.append(svgNode("polyline", {points, fill: "none", stroke: color, "stroke-width": 2}));
      svg.append(svgNode("text", {x: 596, y: y(plan.coverage[LAST]) + 4, class: "axis", fill: color, style: `fill:${color}`}, `${NAMES[plan.selected_by]}'s pick`));
    }
    svg.append(svgNode("text", {x: 320, y: 146, "text-anchor": "middle", class: "axis"}, "Step"));
    svg.append(svgNode("line", {id: "replay-cursor", y1: 10, y2: 125, stroke: "#222", "stroke-dasharray": "3 3"}));
    return (t) => {
      el("replay-cursor").setAttribute("x1", x(t));
      el("replay-cursor").setAttribute("x2", x(t));
    };
  }

  const percent = (value) => `${(100 * value).toFixed(1)}%`;
  let moveCursor;
  function render() {
    const step = replay.snapshot_steps[snapshot];
    replay.plans.forEach((plan, i) => {
      drawMap(el(`replay-map-${i}`), plan, snapshot);
      el(`replay-value-${i}`).textContent = percent(plan.coverage[step]);
      el(`replay-explored-${i}`).textContent = percent(plan.exploredShare[snapshot]);
    });
    el("replay-step").value = snapshot;
    el("replay-step-label").textContent = `Step ${step + 1} of ${LAST + 1}`;
    moveCursor(step);
  }

  let lastFrame = 0;
  function tick(time) {
    if (!playing) return;
    if (time - lastFrame > 40) {
      lastFrame = time;
      snapshot = Math.min(replay.snapshot_steps.length - 1, snapshot + 1);
      render();
    }
    if (snapshot === replay.snapshot_steps.length - 1) setPlaying(false);
    else requestAnimationFrame(tick);
  }

  function setPlaying(value) {
    playing = value;
    el("replay-play").textContent = playing ? "Pause" : "Play";
    if (!playing) return;
    if (snapshot === replay.snapshot_steps.length - 1) snapshot = 0;
    requestAnimationFrame(tick);
  }

  function setup() {
    replay.plans.forEach((plan, i) => {
      const canvas = el(`replay-map-${i}`);
      canvas.width = replay.width * SCALE;
      canvas.height = replay.height * SCALE;
      const title = el(`replay-title-${i}`);
      title.replaceChildren(`Picked by ${NAMES[plan.selected_by]}: `, Object.assign(document.createElement("span"), {textContent: plan.label}));
      title.style.borderColor = PLAN_COLORS[plan.selected_by];
      canvas.setAttribute("aria-label", `Env1 map of the plan picked by ${NAMES[plan.selected_by]} (${plan.label}), which delivers ${(100 * plan.coverage[LAST]).toFixed(1)}% of the map`);
    });
    moveCursor = coverageChart();
    const slider = el("replay-step");
    slider.max = replay.snapshot_steps.length - 1;
    slider.addEventListener("input", () => {
      setPlaying(false);
      snapshot = Number(slider.value);
      render();
    });
    el("replay-play").addEventListener("click", () => setPlaying(!playing));
    el("replay-play").disabled = false;
    snapshot = replay.snapshot_steps.length - 1;
    render();
  }

  async function init() {
    try {
      const response = await fetch("replay.json?v=11");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      replay = await response.json();
      walls = pixels(await loadImage("floorplan.png?v=11"));
      for (const plan of replay.plans) decodeLayers(plan, pixels(await loadImage(`${plan.layers}?v=11`)));
      setup();
    } catch (error) {
      el("replay-step-label").textContent = `Could not load the replay (${error.message}).`;
    }
  }
  init();
})();
