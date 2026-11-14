// Every chart on the page, driven by two global switches (inputs case, data split).
// All numbers are read from data/*.json, written by src/summary.ipynb.

const MODELS = ["Persistence", "7-day average", "MLR", "Ridge", "Lasso", "Elastic Net", "Random Forest", "AdaBoost"];
const LEARNING = MODELS.slice(2);
const BASELINES = MODELS.slice(0, 2);
const STYLE = {
  "Persistence": { color: "#5a6478", dash: "dash" },
  "7-day average": { color: "#8a93a5", dash: "dot" },
  "MLR": { color: "#2b4c8c", dash: "solid" },
  "Ridge": { color: "#4f7dc9", dash: "solid" },
  "Lasso": { color: "#7ba7d9", dash: "solid" },
  "Elastic Net": { color: "#6c5ba8", dash: "solid" },
  "Random Forest": { color: "#b23a6a", dash: "solid" },
  "AdaBoost": { color: "#f08a24", dash: "solid" },
};
const INK = "#17223b", SOFT = "#4a5570", RULE = "#c9d2cd", SALT = "#eef2ef";
const SUN = [[0, "#141b33"], [0.18, "#4b2c6b"], [0.42, "#b23a6a"], [0.68, "#f08a24"], [1, "#ffe08a"]];
const SPLIT_COLOR = { train: "#4a5570", val: "#b23a6a", test: "#f08a24" };
const SPLIT_NAME = { train: "train", val: "validation", test: "test" };
const CASE_TEXT = {
  "Case 1": "Inputs: <b>power at the same block yesterday</b>, nothing else.",
  "Case 2": "Inputs: <b>yesterday's power plus yesterday's weather</b>. The realistic case.",
  "Case 3": "Inputs: <b>case 2 plus tomorrow's measured weather</b>, like a perfect weather forecast. An upper bound, not a real forecast.",
};
const SPLIT_TEXT = {
  train: "Scored on <b>training days</b>, which the models learned from, so these scores flatter them.",
  val: "Scored on <b>validation days</b>, used to choose every setting.",
  test: "Scored on <b>the test week</b>: seven calm days, scored once at the end.",
};

const state = { case: "Case 2", split: "test", rank: "skill", day: 0, visible: new Set(MODELS) };
let results, days, data, rf;

const pct = (x, d = 1) => (x == null ? "–" : x.toFixed(d));
const signed = (x, d = 1) => (x == null ? "–" : (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(d));
const key = (m, c) => `${m}|${BASELINES.includes(m) ? "—" : c}`;
const row = (m, c, s) => results.rows.find((r) => r.model === m && r.case === (BASELINES.includes(m) ? "—" : c) && r.split === s);
const CONFIG = { responsive: true, displayModeBar: false };

function base(extra = {}) {
  return {
    font: { family: "Archivo, Helvetica Neue, Arial, sans-serif", size: 13, color: INK },
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    margin: { t: 10, r: 16, b: 44, l: 56 },
    hoverlabel: { bgcolor: INK, bordercolor: INK, font: { color: SALT, family: "Archivo, sans-serif" } },
    showlegend: false,
    ...extra,
  };
}
const axis = (extra = {}) => ({ gridcolor: RULE, zerolinecolor: INK, linecolor: RULE, tickcolor: RULE, ...extra });

// ---------- Switches ----------
function switchGroup(id, current, onPick) {
  const el = document.getElementById(id);
  const sync = (v) => el.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.v === v)));
  sync(current);
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    sync(b.dataset.v);
    onPick(b.dataset.v);
  });
  return sync;
}

function controlNote() {
  document.getElementById("control-note").innerHTML = `${CASE_TEXT[state.case]} ${SPLIT_TEXT[state.split]}`;
}

// ---------- Sun calendar (hero) ----------
function drawCalendar() {
  const dates = days.days.map((d) => d.date);
  const z = days.blocks.map((_, b) => days.days.map((d) => 100 * d.actual[b]));
  const firstOf = (s) => days.days.find((d) => d.split === s).date;
  const lastOf = (s) => [...days.days].reverse().find((d) => d.split === s).date;
  const half = 12 * 3600 * 1000;
  const edge = (date, side) => new Date(new Date(date).getTime() + side * half).toISOString().slice(0, 13);
  const bands = ["train", "val", "test"].map((s) => ({
    type: "rect", xref: "x", yref: "paper", x0: edge(firstOf(s), -1), x1: edge(lastOf(s), 1), y0: -0.2, y1: -0.13,
    fillcolor: SPLIT_COLOR[s], line: { width: 0 },
  }));
  const labels = ["train", "val", "test"].map((s) => ({
    xref: "x", yref: "paper", x: edge(firstOf(s), -1), y: -0.21, yanchor: "top", xanchor: "left", showarrow: false,
    text: { train: "Train, 91 days", val: "Validation, 24", test: "Test, 7" }[s], font: { size: 12, color: SOFT },
  }));
  const sel = days.days[state.day].date;
  const pick = { type: "rect", xref: "x", yref: "paper", x0: edge(sel, -1), x1: edge(sel, 1), y0: 0, y1: 1,
    line: { color: INK, width: 2 }, fillcolor: "rgba(0,0,0,0)" };
  const notes = [
    { x: "2025-10-29", y: 17.6, text: "cloudy spell", ax: 30, ay: -26 },
    { x: "2026-01-26", y: 17.6, text: "26 Jan", ax: -26, ay: -26 },
  ].map((n) => ({ ...n, xref: "x", yref: "y", showarrow: true, arrowcolor: INK, arrowwidth: 1, arrowhead: 0,
    font: { size: 12, color: INK }, bgcolor: SALT }));
  Plotly.react("calendar", [{
    type: "heatmap", x: dates, y: days.hours, z, colorscale: SUN, zmin: 0, zmax: 85, xgap: 1,
    colorbar: { title: { text: "% of capacity", side: "right", font: { size: 12 } }, thickness: 10, len: 0.8, outlinewidth: 0, tickfont: { size: 11 } },
    hovertemplate: "%{x|%a %d %b}, %{y:.2f} h<br>%{z:.0f}% of capacity<extra></extra>",
  }], base({
    margin: { t: 26, r: 10, b: 66, l: 44 },
    xaxis: axis({ type: "date", showgrid: false, tickformat: "%b", dtick: "M1", ticklabelmode: "period" }),
    yaxis: axis({ showgrid: false, dtick: 2, title: { text: "Hour", font: { size: 12 } }, range: [6.9, 18.4] }),
    shapes: [...bands, pick], annotations: [...labels, ...notes],
  }), CONFIG);
}

// ---------- One day ----------
function drawChips() {
  const el = document.getElementById("model-chips");
  el.innerHTML = `<span class="chip fixed"><span class="mark" style="color:${INK};border-top-width:4px"></span>Actual</span>` + MODELS.map((m) => {
    const s = STYLE[m];
    const cls = s.dash === "dash" ? "dash" : s.dash === "dot" ? "dot" : "";
    return `<label class="chip ${state.visible.has(m) ? "" : "off"}" style="color:${s.color}">
      <input type="checkbox" data-m="${m}" ${state.visible.has(m) ? "checked" : ""}>
      <span class="mark ${cls}"></span><span style="color:${INK}">${m}</span></label>`;
  }).join("");
  el.querySelectorAll("input").forEach((cb) => cb.addEventListener("change", () => {
    cb.checked ? state.visible.add(cb.dataset.m) : state.visible.delete(cb.dataset.m);
    cb.closest(".chip").classList.toggle("off", !cb.checked);
    drawDay();
  }));
}

function drawDay() {
  const d = days.days[state.day];
  const x = days.hours;
  const actual = d.actual.map((v) => 100 * v);
  const traces = [
    { x, y: actual.map((v) => v + 7), mode: "lines", line: { width: 0 }, hoverinfo: "skip" },
    { x, y: actual.map((v) => v - 7), mode: "lines", line: { width: 0 }, fill: "tonexty", fillcolor: "rgba(240,138,36,0.16)", hoverinfo: "skip" },
  ];
  for (const m of MODELS) {
    const f = d.forecasts[key(m, state.case)];
    if (!f || !state.visible.has(m)) continue;
    traces.push({ x, y: f.map((v) => 100 * v), mode: "lines", name: m,
      line: { color: STYLE[m].color, width: BASELINES.includes(m) ? 1.8 : 2.2, dash: STYLE[m].dash },
      hovertemplate: `${m}: %{y:.0f}%<extra></extra>` });
  }
  traces.push({ x, y: actual, mode: "lines", name: "Actual", line: { color: INK, width: 3.4 }, hovertemplate: "Actual: %{y:.0f}%<extra></extra>" });
  Plotly.react("day-chart", traces, base({
    xaxis: axis({ title: { text: "Hour of day" }, dtick: 1, range: [6.9, 18.4], showgrid: false }),
    yaxis: axis({ title: { text: "Power, % of capacity" }, range: [0, 100] }),
    hovermode: "x unified",
    annotations: [
      { xref: "paper", yref: "paper", x: 0, y: 1, xanchor: "left", yanchor: "top", showarrow: false, align: "left",
        text: `<b>${new Date(d.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</b><br>${SPLIT_NAME[d.split]} day, ${state.case.toLowerCase()} inputs`,
        font: { size: 14, color: INK } },
    ],
  }), CONFIG);

  const scored = MODELS.filter((m) => d.scores[key(m, state.case)]).map((m) => ({ m, s: d.scores[key(m, state.case)] }))
    .sort((a, b) => a.s.nMAE - b.s.nMAE);
  document.getElementById("day-scores").innerHTML = scored.map(({ m, s }, i) => `
    <div class="score ${i === 0 ? "best" : ""}">
      <div class="name"><span style="color:${STYLE[m].color}">▬</span>${m}</div>
      <div class="val">${pct(s.nMAE)}%</div>
      <div class="sub">typical error<br>${pct(s.within_band, 0)}% of blocks in the band${m === "Persistence" ? "" : `<br>skill ${signed(s.skill)}%`}</div>
    </div>`).join("");
  document.getElementById("day-select").value = String(state.day);
  drawCalendar();
}

function setDay(i, scroll) {
  state.day = i;
  drawDay();
  if (scroll) document.getElementById("day").scrollIntoView({ behavior: "smooth" });
}

function rankedDays() {
  return days.days.map((d, i) => {
    const s = LEARNING.map((m) => d.scores[`${m}|${state.case}`]).filter(Boolean);
    return { i, mae: s.reduce((a, x) => a + x.nMAE, 0) / s.length };
  }).filter((r) => days.days[r.i].split === state.split).sort((a, b) => a.mae - b.mae);
}

function setupDayNav() {
  const sel = document.getElementById("day-select");
  sel.innerHTML = ["train", "val", "test"].map((s) => `<optgroup label="${SPLIT_NAME[s][0].toUpperCase() + SPLIT_NAME[s].slice(1)}">` +
    days.days.map((d, i) => (d.split === s ? `<option value="${i}">${new Date(d.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</option>` : "")).join("") +
    "</optgroup>").join("");
  sel.addEventListener("change", () => setDay(+sel.value));
  const n = days.days.length;
  document.getElementById("day-prev").addEventListener("click", () => setDay((state.day - 1 + n) % n));
  document.getElementById("day-next").addEventListener("click", () => setDay((state.day + 1) % n));
  document.getElementById("day-best").addEventListener("click", () => setDay(rankedDays()[0].i));
  document.getElementById("day-worst").addEventListener("click", () => { const r = rankedDays(); setDay(r[r.length - 1].i); });
}

// ---------- Ranking ----------
function drawRanking() {
  const rows = LEARNING.map((m) => row(m, state.case, state.split));
  const metric = state.rank;
  const higher = metric === "skill" || metric === "r2";
  rows.sort((a, b) => (higher ? b[metric] - a[metric] : a[metric] - b[metric]));
  const names = rows.map((r) => r.model);
  const p = row("Persistence", state.case, state.split);
  const w = row("7-day average", state.case, state.split);
  const label = { skill: "Skill vs persistence, %", nRMSE: "RMSE, % of capacity", nMAE: "MAE, % of capacity", r2: "R², %" }[metric];

  const dots = {
    type: "scatter", mode: "markers+text", y: names, x: rows.map((r) => r[metric]),
    marker: { size: 16, color: names.map((m) => STYLE[m].color), line: { color: SALT, width: 2 } },
    text: rows.map((r) => (metric === "skill" ? signed(r.skill) : pct(r[metric], metric === "r2" ? 1 : 2))),
    textposition: "middle right", textfont: { size: 13, color: INK }, cliponaxis: false,
    hovertemplate: "%{y}: %{x:.2f}<extra></extra>",
  };
  if (metric === "skill") dots.error_x = { type: "data", symmetric: false, array: rows.map((r) => r.skill_hi - r.skill),
    arrayminus: rows.map((r) => r.skill - r.skill_lo), thickness: 2, width: 0, color: "rgba(23,34,59,0.35)" };
  let refs = metric === "skill"
    ? [{ x: 0, text: "persistence" }, { x: w.skill, text: "7-day average" }]
    : [{ x: p[metric], text: "persistence" }, { x: w[metric], text: "7-day average" }];
  // Fit the axis to the models and persistence; a baseline far outside is flagged at the edge instead.
  const lo = Math.min(...rows.map((r) => (metric === "skill" ? r.skill_lo : r[metric])), refs[0].x);
  const hi = Math.max(...rows.map((r) => (metric === "skill" ? r.skill_hi : r[metric])), refs[0].x);
  const pad = (hi - lo) * 0.12 || 1;
  const range = [lo - pad, hi + pad * 1.6];
  const offScale = refs[1].x < range[0] || refs[1].x > range[1];
  if (offScale) refs = refs.slice(0, 1);
  const edgeNote = offScale ? [{ xref: "paper", yref: "paper", x: refs[0].x > range[0] ? 0 : 1, y: -0.16, xanchor: "left", showarrow: false,
    text: `7-day average is off the scale here: ${metric === "skill" ? signed(w.skill) : pct(w[metric], 2)}`, font: { size: 12, color: "#8a93a5" } }] : [];
  Plotly.react("rank-chart", [dots], base({
    margin: { t: 34, r: 60, b: 64, l: 110 },
    xaxis: axis({ title: { text: label }, zeroline: metric === "skill", range }),
    yaxis: axis({ autorange: "reversed", showgrid: false }),
    shapes: refs.map((r, i) => ({ type: "line", xref: "x", yref: "paper", x0: r.x, x1: r.x, y0: 0, y1: 1,
      line: { color: i ? "#8a93a5" : INK, width: 1.5, dash: i ? "dot" : "dash" } })),
    annotations: [...refs.map((r, i) => ({ xref: "x", yref: "paper", x: r.x, y: 1.02, yanchor: "bottom", showarrow: false,
      text: r.text, font: { size: 12, color: i ? "#8a93a5" : INK } })), ...edgeNote],
  }), CONFIG);

  const best = rows[0];
  const clear = rows.filter((r) => r.skill_lo > 0).map((r) => r.model);
  document.getElementById("rank-lead").innerHTML = clear.length
    ? `With ${state.case.toLowerCase()} inputs on ${SPLIT_NAME[state.split]} days, <b>${clear.join(", ")}</b> ${clear.length > 1 ? "beat" : "beats"} <q>tomorrow = today</q> with the whole 90% interval above zero. Best by ${label.split(",")[0]}: <b>${best.model}</b>.`
    : `With ${state.case.toLowerCase()} inputs on ${SPLIT_NAME[state.split]} days, <b>no model clearly beats</b> <q>tomorrow = today</q>: every interval reaches zero or below. Best by ${label.split(",")[0]}: ${best.model}.`;

  document.getElementById("rank-table").innerHTML =
    "<tr><th>Model</th><th>MAE %</th><th>RMSE %</th><th>R² %</th><th>In ±7% band</th><th>Skill %</th><th>90% interval</th></tr>" +
    [...rows, p, w].map((r) => `<tr><td>${r.model}${BASELINES.includes(r.model) ? " (baseline)" : ""}</td><td>${pct(r.nMAE, 2)}</td>
      <td>${pct(r.nRMSE, 2)}</td><td>${pct(r.r2)}</td><td>${pct(r.within_band)}%</td>
      <td class="${r.skill > 0.05 ? "pos" : r.skill < -0.05 ? "neg" : ""}">${r.model === "Persistence" ? "0" : signed(r.skill)}</td>
      <td>${r.model === "Persistence" ? "reference" : `${signed(r.skill_lo)} to ${signed(r.skill_hi)}`}</td></tr>`).join("");
}

function slopeChart(id, xs, xLabels, valueOf, highlight) {
  const traces = LEARNING.map((m) => {
    const y = xs.map((x) => valueOf(m, x));
    return { x: xLabels, y, mode: "lines+markers", name: m,
      line: { color: STYLE[m].color, width: 2.4 }, marker: { size: 7, color: STYLE[m].color },
      hovertemplate: `${m}<br>%{x}: %{y:.1f}%<extra></extra>` };
  });
  const last = LEARNING.map((m) => ({ m, y: valueOf(m, xs[xs.length - 1]) })).sort((a, b) => b.y - a.y);
  // stagger end labels so they do not overlap: at least 8% of the plotted range apart
  const all = LEARNING.flatMap((m) => xs.map((x) => valueOf(m, x)));
  const minGap = (Math.max(...all, 0) - Math.min(...all, 0)) * 0.08;
  for (let i = 1; i < last.length; i++) if (last[i - 1].y - last[i].y < minGap) last[i].y = last[i - 1].y - minGap;
  Plotly.react(id, traces, base({
    margin: { t: 16, r: 110, b: 40, l: 52 },
    xaxis: axis({ showgrid: false, type: "category" }),
    yaxis: axis({ title: { text: "Skill vs persistence, %" }, zeroline: true, zerolinewidth: 2 }),
    shapes: [{ type: "rect", xref: "x", yref: "paper", x0: highlight - 0.35, x1: highlight + 0.35, y0: 0, y1: 1,
      fillcolor: "rgba(240,138,36,0.12)", line: { width: 0 }, layer: "below" }],
    annotations: last.map((l) => ({ xref: "x", yref: "y", x: xLabels.length - 1, y: l.y, xanchor: "left", xshift: 10,
      showarrow: false, text: l.m, font: { size: 12, color: STYLE[l.m].color } })),
  }), CONFIG);
}

function drawSlopes() {
  const cases = ["Case 1", "Case 2", "Case 3"];
  slopeChart("ladder-chart", cases, ["Case 1", "Case 2", "Case 3"], (m, c) => row(m, c, state.split).skill, cases.indexOf(state.case));
  const splits = ["train", "val", "test"];
  slopeChart("overfit-chart", splits, ["Train", "Validation", "Test"], (m, s) => row(m, state.case, s).skill, splits.indexOf(state.split));
}

// ---------- Error map ----------
function drawErrorMap() {
  const idx = days.days.map((_, i) => i).filter((i) => days.days[i].split === state.split);
  const models = ["Persistence", ...LEARNING];
  const x = idx.map((i) => days.days[i].date);
  const z = models.map((m) => idx.map((i) => (days.days[i].scores[key(m, state.case)] || {}).nMAE ?? null));
  const el = document.getElementById("error-map");
  el.style.height = `${Math.max(260, 40 + models.length * 30)}px`;
  Plotly.react("error-map", [{
    type: "heatmap", x, y: models, z, zmin: 0, zmax: 15, xgap: 2, ygap: 2,
    colorscale: [[0, "#f7f4e8"], [0.3, "#f3c07a"], [0.6, "#b23a6a"], [1, "#2a1c47"]],
    colorbar: { title: { text: "Daily MAE, %", side: "right", font: { size: 12 } }, thickness: 10, outlinewidth: 0 },
    hovertemplate: "%{y}, %{x|%d %b}<br>typical error %{z:.1f}%<extra></extra>",
  }], base({
    margin: { t: 10, r: 10, b: 40, l: 110 },
    xaxis: axis({ type: "date", showgrid: false, tickformat: "%d %b" }),
    yaxis: axis({ autorange: "reversed", showgrid: false }),
  }), CONFIG);
  el.removeAllListeners?.("plotly_click");
  el.on("plotly_click", (ev) => {
    const i = days.days.findIndex((d) => d.date === String(ev.points[0].x).slice(0, 10));
    if (i >= 0) setDay(i, true);
  });
}

// ---------- Data charts ----------
function drawPlateau() {
  const xs = data.scatter.ghi_next, ys = data.scatter.power.map((v) => 100 * v);
  const n = xs.length, mx = xs.reduce((a, v) => a + v, 0) / n, my = ys.reduce((a, v) => a + v, 0) / n;
  const slope = xs.reduce((a, v, i) => a + (v - mx) * (ys[i] - my), 0) / xs.reduce((a, v) => a + (v - mx) ** 2, 0);
  const bins = [];
  for (let lo = 0; lo < 950; lo += 50) {
    const pts = ys.filter((_, i) => xs[i] >= lo && xs[i] < lo + 50);
    if (pts.length > 10) bins.push([lo + 25, pts.reduce((a, v) => a + v, 0) / pts.length]);
  }
  Plotly.react("plateau-chart", [
    { x: xs, y: ys, mode: "markers", type: "scattergl", marker: { size: 4, color: "#4b2c6b", opacity: 0.22 }, hoverinfo: "skip" },
    { x: [0, 950], y: [my - slope * mx, my + slope * (950 - mx)], mode: "lines", line: { color: "#2b4c8c", width: 2.5, dash: "dash" }, hoverinfo: "skip" },
    { x: bins.map((b) => b[0]), y: bins.map((b) => b[1]), mode: "lines", line: { color: "#f08a24", width: 4, shape: "spline" },
      hovertemplate: "GHI %{x:.0f}: average %{y:.0f}%<extra></extra>" },
  ], base({
    xaxis: axis({ title: { text: "Sunlight, GHI in W/m²" }, range: [0, 950] }),
    yaxis: axis({ title: { text: "Power, % of capacity" }, range: [0, 100] }),
    annotations: [
      { x: 900, y: my + slope * (900 - mx), text: "straight line", showarrow: false, yshift: 14, xanchor: "right", font: { color: "#2b4c8c" } },
      { x: bins[bins.length - 1][0], y: bins[bins.length - 1][1], text: "actual average", showarrow: false, yshift: -16, xanchor: "right", font: { color: "#c26a12" } },
    ],
  }), CONFIG);
}

function drawImportance() {
  const imp = rf[state.case].importance;
  const pretty = (n) => n.replace("power_D", "Power, yesterday").replace(/_D\+1$/, ", tomorrow").replace(/_D$/, ", yesterday")
    .replace(/^ghi/, "Sunlight").replace(/^modt/, "Module temp.").replace(/^ambt/, "Air temp.").replace(/^wspd/, "Wind speed").replace(/^wdir/, "Wind direction");
  const names = Object.keys(imp).sort((a, b) => imp[b] - imp[a]);
  Plotly.react("importance-chart", [{
    type: "bar", orientation: "h", y: names.map(pretty), x: names.map((n) => imp[n]),
    marker: { color: names.map((n) => (n.endsWith("D+1") ? "#f08a24" : "#4b2c6b")) },
    text: names.map((n) => `+${imp[n].toFixed(2)}`), textposition: "outside", cliponaxis: false, textfont: { size: 12 },
    hovertemplate: "%{y}: +%{x:.2f} points<extra></extra>",
  }], base({
    margin: { t: 10, r: 50, b: 44, l: 10 },
    xaxis: axis({ title: { text: `Rise in validation RMSE, % of capacity (${state.case.toLowerCase()})` } }),
    yaxis: axis({ autorange: "reversed", automargin: true, showgrid: false }),
  }), CONFIG);
}

function drawSplitStrip() {
  const e = data.energy;
  Plotly.react("split-strip", ["train", "val", "test"].map((s) => ({
    type: "bar", x: e.date.filter((_, i) => e.split[i] === s), y: e.capacity_hours.filter((_, i) => e.split[i] === s),
    marker: { color: SPLIT_COLOR[s] }, hovertemplate: `%{x|%d %b}, ${SPLIT_NAME[s]}<br>%{y:.1f} capacity-hours<extra></extra>`,
  })), base({
    margin: { t: 6, r: 6, b: 26, l: 6 }, bargap: 0.05,
    xaxis: axis({ type: "date", showgrid: false, tickformat: "%b" }), yaxis: { visible: false },
    annotations: [["2025-11-25", "train"], ["2026-01-26", "validation"], ["2026-02-11", "test"]].map(([x, t]) => ({
      x, y: 1, yref: "paper", text: t, showarrow: false, font: { size: 12, color: INK }, bgcolor: SALT })),
  }), CONFIG);
}

// ---------- Wiring ----------
function redrawForControls() {
  controlNote();
  drawDay();
  drawRanking();
  drawSlopes();
  drawErrorMap();
  drawImportance();
}

Promise.all(["results", "days", "data", "random_forest"].map((n) => fetch(`data/${n}.json`).then((r) => r.json())))
  .then(([res, dy, dt, forest]) => {
    results = res; days = dy; data = dt; rf = forest;
    state.day = days.days.findIndex((d) => d.date === "2026-01-26");
    document.getElementById("f1").textContent = `${pct(row("Persistence", "Case 1", "test").nMAE)}%`;
    document.getElementById("f3").textContent = `${signed(row("Random Forest", "Case 3", "test").skill)}%`;

    switchGroup("case-switch", state.case, (v) => { state.case = v; redrawForControls(); });
    switchGroup("split-switch", state.split, (v) => { state.split = v; redrawForControls(); });
    switchGroup("rank-switch", state.rank, (v) => { state.rank = v; drawRanking(); });
    drawChips();
    setupDayNav();
    drawPlateau();
    drawSplitStrip();
    redrawForControls();
    document.getElementById("calendar").on("plotly_click", (ev) => {
      const i = days.days.findIndex((d) => d.date === String(ev.points[0].x).slice(0, 10));
      if (i >= 0) setDay(i, true);
    });
  });
