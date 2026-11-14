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

// ================= Experiments =================
let exps;
const exp = { feLevel: 0, feSplit: "val", leaves: 1, scheme: "chronological" };

// ---- 1. Forecast error ----
function breakEven(levels, skill) {
  // first sunlight error at which skill crosses zero (linear interpolation); null if it never does
  for (let i = 1; i < levels.length; i++) {
    if (skill[i - 1] > 0 && skill[i] <= 0) return levels[i - 1] + (levels[i] - levels[i - 1]) * (skill[i - 1] / (skill[i - 1] - skill[i]));
  }
  return skill[0] <= 0 ? 0 : null;
}

function drawForecastError() {
  const fe = exps.forecast_error, L = fe.levels, sigma = L[exp.feLevel];
  const shown = ["MLR", "Random Forest", "AdaBoost"]; // Ridge, Lasso and Elastic Net sit on top of MLR here
  const traces = shown.map((m) => ({
    x: L, y: fe.skill[m][exp.feSplit], mode: "lines", name: m, line: { color: STYLE[m].color, width: 2.6 },
    hovertemplate: `${m}<br>error %{x}%: skill %{y:.1f}%<extra></extra>`,
  }));
  traces.push({ x: shown.map(() => sigma), y: shown.map((m) => fe.skill[m][exp.feSplit][exp.feLevel]), mode: "markers",
    marker: { size: 13, color: shown.map((m) => STYLE[m].color), line: { color: SALT, width: 2 } }, hoverinfo: "skip" });
  const label = { MLR: "linear models" };
  Plotly.react("fe-chart", traces, base({
    margin: { t: 16, r: 16, b: 46, l: 56 },
    xaxis: axis({ title: { text: "Sunlight forecast error (standard deviation, %)" }, range: [-1, 51], showgrid: false }),
    yaxis: axis({ title: { text: "Skill vs persistence, %" }, range: [-60, 60], zeroline: true, zerolinewidth: 2 }),
    shapes: [
      { type: "line", xref: "x", yref: "paper", x0: sigma, x1: sigma, y0: 0, y1: 1, line: { color: INK, width: 1.5, dash: "dot" } },
      { type: "rect", xref: "paper", yref: "y", x0: 0, x1: 1, y0: -60, y1: 0, fillcolor: "rgba(178,58,106,0.07)", line: { width: 0 }, layer: "below" },
    ],
    annotations: [
      ...shown.map((m) => ({ x: 0, y: fe.skill[m][exp.feSplit][0], xanchor: "left", xshift: 8, yshift: m === "AdaBoost" ? -13 : 12, showarrow: false,
        text: label[m] || m, font: { size: 12, color: STYLE[m].color } })),
      { xref: "paper", yref: "y", x: 1, y: -55, xanchor: "right", showarrow: false, text: "worse than “tomorrow = today”", font: { size: 12, color: "#b23a6a" } },
    ],
  }), CONFIG);

  document.getElementById("fe-out").textContent = sigma === 0 ? "0% (perfect)" : `±${sigma}%`;
  const still = LEARNING.filter((m) => fe.skill[m][exp.feSplit][exp.feLevel] > 0);
  const be = (m) => { const b = breakEven(L, fe.skill[m][exp.feSplit]); return b == null ? "more than 50%" : `about ${Math.round(b)}%`; };
  document.getElementById("fe-result").innerHTML =
    `With a sunlight error of ${sigma}%, <b>${still.length} of 6</b> models still beat <q>tomorrow = today</q> on ${SPLIT_NAME[exp.feSplit]} days` +
    (still.length ? ` (best: ${still.sort((a, b) => fe.skill[b][exp.feSplit][exp.feLevel] - fe.skill[a][exp.feSplit][exp.feLevel])[0]}, ${signed(fe.skill[still[0]][exp.feSplit][exp.feLevel])}%).` : ".") +
    ` Random Forest breaks even at ${be("Random Forest")} error, the linear models at ${be("MLR")}.`;
}

// ---- 2. Line against tree ----
const tree = {};
function setupTree() {
  const xs = data.scatter.ghi_next, ys = data.scatter.power.map((v) => 100 * v);
  const N_FIT = 1000;
  const order = xs.slice(0, N_FIT).map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  tree.fx = order.map((i) => xs[i]); tree.fy = order.map((i) => ys[i]);          // fitting blocks, sorted by sunlight
  tree.hx = xs.slice(N_FIT); tree.hy = ys.slice(N_FIT);                             // held-out blocks
  // least-squares line on the fitting blocks
  const n = tree.fx.length, mx = tree.fx.reduce((a, v) => a + v, 0) / n, my = tree.fy.reduce((a, v) => a + v, 0) / n;
  tree.slope = tree.fx.reduce((a, v, i) => a + (v - mx) * (tree.fy[i] - my), 0) / tree.fx.reduce((a, v) => a + (v - mx) ** 2, 0);
  tree.icpt = my - tree.slope * mx;
  // prefix sums for fast squared-error of any range [a, b)
  const s1 = [0], s2 = [0];
  tree.fy.forEach((v) => { s1.push(s1[s1.length - 1] + v); s2.push(s2[s2.length - 1] + v * v); });
  const sse = (a, b) => (s2[b] - s2[a]) - (s1[b] - s1[a]) ** 2 / (b - a);
  const MIN = 5;
  const bestSplit = (a, b) => {
    let best = null;
    for (let k = a + MIN; k <= b - MIN; k++) {
      if (tree.fx[k - 1] === tree.fx[k]) continue;
      const gain = sse(a, b) - sse(a, k) - sse(k, b);
      if (!best || gain > best.gain) best = { k, gain };
    }
    return best;
  };
  // grow best-first: always split the leaf whose best question removes the most squared error
  let leaves = [{ a: 0, b: n, split: bestSplit(0, n) }];
  tree.cuts = []; // cut positions in the order the tree adds them
  while (leaves.length < 60) {
    const pick = leaves.filter((l) => l.split).sort((p, q) => q.split.gain - p.split.gain)[0];
    if (!pick) break;
    leaves = leaves.filter((l) => l !== pick);
    leaves.push({ a: pick.a, b: pick.split.k, split: bestSplit(pick.a, pick.split.k) }, { a: pick.split.k, b: pick.b, split: bestSplit(pick.split.k, pick.b) });
    tree.cuts.push(pick.split.k);
  }
  tree.model = (k) => {
    const edges = [0, ...tree.cuts.slice(0, k - 1).sort((p, q) => p - q), n];
    const segs = edges.slice(0, -1).map((a, i) => ({ lo: i === 0 ? -Infinity : (tree.fx[a - 1] + tree.fx[a]) / 2, mean: (s1[edges[i + 1]] - s1[a]) / (edges[i + 1] - a) }));
    return (x) => { let m = segs[0].mean; for (const s of segs) { if (x > s.lo) m = s.mean; else break; } return m; };
  };
  const rmse = (f, X, Y) => Math.sqrt(X.reduce((a, x, i) => a + (f(x) - Y[i]) ** 2, 0) / X.length);
  tree.line = (x) => tree.icpt + tree.slope * x;
  tree.lineFit = rmse(tree.line, tree.fx, tree.fy); tree.lineHeld = rmse(tree.line, tree.hx, tree.hy);
  tree.ks = Array.from({ length: tree.cuts.length + 1 }, (_, i) => i + 1);
  tree.fitErr = tree.ks.map((k) => rmse(tree.model(k), tree.fx, tree.fy));
  tree.heldErr = tree.ks.map((k) => rmse(tree.model(k), tree.hx, tree.hy));
  tree.bestK = tree.ks[tree.heldErr.indexOf(Math.min(...tree.heldErr))];
  document.getElementById("tree-leaves").max = tree.ks.length;
}

function drawTree() {
  const k = exp.leaves, f = tree.model(k);
  const grid = Array.from({ length: 476 }, (_, i) => i * 2);
  Plotly.react("tree-chart", [
    { x: tree.fx, y: tree.fy, mode: "markers", type: "scattergl", marker: { size: 4, color: "#4b2c6b", opacity: 0.2 }, hoverinfo: "skip" },
    { x: [0, 950], y: [tree.line(0), tree.line(950)], mode: "lines", line: { color: "#2b4c8c", width: 2.5, dash: "dash" }, hoverinfo: "skip" },
    { x: grid, y: grid.map(f), mode: "lines", line: { color: "#f08a24", width: 3.5, shape: "hv" }, hovertemplate: "GHI %{x}: tree says %{y:.0f}%<extra></extra>" },
  ], base({
    margin: { t: 10, r: 16, b: 44, l: 56 },
    xaxis: axis({ title: { text: "Sunlight at that block, GHI in W/m²" }, range: [0, 950] }),
    yaxis: axis({ title: { text: "Power, % of capacity" }, range: [0, 100] }),
    annotations: [
      { x: 930, y: Math.min(98, tree.line(930)), text: "straight line", showarrow: false, xanchor: "right", yshift: 12, font: { color: "#2b4c8c" } },
      { x: 930, y: f(930), text: `tree, ${k} ${k === 1 ? "leaf" : "leaves"}`, showarrow: false, xanchor: "right", yshift: -14, font: { color: "#c26a12" } },
    ],
  }), CONFIG);
  Plotly.react("tree-curve", [
    { x: tree.ks, y: tree.fitErr, mode: "lines", line: { color: "#8a93a5", width: 2 }, hovertemplate: "%{x} leaves, blocks it learned from: %{y:.2f}<extra></extra>" },
    { x: tree.ks, y: tree.heldErr, mode: "lines", line: { color: "#f08a24", width: 2.6 }, hovertemplate: "%{x} leaves, unseen blocks: %{y:.2f}<extra></extra>" },
    { x: [k], y: [tree.heldErr[k - 1]], mode: "markers", marker: { size: 12, color: "#f08a24", line: { color: SALT, width: 2 } }, hoverinfo: "skip" },
  ], base({
    margin: { t: 8, r: 16, b: 40, l: 56 },
    xaxis: axis({ title: { text: "Leaves" }, showgrid: false }),
    yaxis: axis({ title: { text: "RMSE, % of capacity" } }),
    shapes: [{ type: "line", xref: "paper", yref: "y", x0: 0, x1: 1, y0: tree.lineHeld, y1: tree.lineHeld, line: { color: "#2b4c8c", width: 1.5, dash: "dash" } }],
    annotations: [
      { xref: "paper", x: 1, y: tree.lineHeld, text: "straight line", showarrow: false, xanchor: "right", yshift: 9, font: { size: 12, color: "#2b4c8c" } },
      { x: tree.ks[tree.ks.length - 1], y: tree.fitErr[tree.ks.length - 1], text: "blocks it learned from", showarrow: false, xanchor: "right", yshift: -10, font: { size: 12, color: "#8a93a5" } },
      { x: tree.ks[tree.ks.length - 1], y: tree.heldErr[tree.ks.length - 1], text: "unseen blocks", showarrow: false, xanchor: "right", yshift: 10, font: { size: 12, color: "#c26a12" } },
    ],
  }), CONFIG);
  document.getElementById("tree-out").textContent = k;
  const held = tree.heldErr[k - 1], gap = held - tree.fitErr[k - 1];
  const verdict = k === 1 ? "With one leaf the tree predicts the same value everywhere: far worse than the line."
    : held > tree.lineHeld ? "Too few leaves to follow the curve: the tree still loses to the line."
    : k > tree.bestK + 8 ? `Past about ${tree.bestK} leaves the error on unseen blocks stops falling while the fit keeps improving: the extra leaves are fitting noise.`
    : "The staircase now bends with the plateau and beats the line on blocks it has never seen.";
  document.getElementById("tree-result").innerHTML =
    `Error on unseen blocks: tree <b>${held.toFixed(2)}%</b>, straight line <b>${tree.lineHeld.toFixed(2)}%</b>. ${verdict}` +
    (gap >= 0.05 ? ` It does ${gap.toFixed(2)} points better on the blocks it learned from than on unseen ones.` : "");
}

// ---- 3. Break the evaluation ----
function drawLeakage() {
  const rowsOf = (scheme) => LEARNING.map((m) => exps.leakage.find((r) => r.model === m && r.case === state.case && r.scheme === scheme));
  const honest = rowsOf("chronological"), now = rowsOf(exp.scheme);
  const all = exps.leakage.filter((r) => r.case === state.case).map((r) => r.skill);
  const traces = [
    { type: "scatter", mode: "markers", y: LEARNING, x: honest.map((r) => r.skill), marker: { size: 13, color: SALT, line: { color: INK, width: 2 } },
      hovertemplate: "%{y}, split by date: %{x:.1f}%<extra></extra>" },
  ];
  const shapes = [];
  if (exp.scheme !== "chronological") {
    traces.push({ type: "scatter", mode: "markers+text", y: LEARNING, x: now.map((r) => r.skill),
      marker: { size: 15, color: LEARNING.map((m) => STYLE[m].color) }, text: now.map((r) => signed(r.skill)), textposition: "middle right",
      textfont: { size: 13, color: INK }, cliponaxis: false, hovertemplate: `%{y}, ${exp.scheme}: %{x:.1f}%<extra></extra>` });
    LEARNING.forEach((m, i) => shapes.push({ type: "line", xref: "x", yref: "y", x0: honest[i].skill, x1: now[i].skill, y0: m, y1: m,
      line: { color: STYLE[m].color, width: 3 }, layer: "below" }));
  }
  Plotly.react("leak-chart", traces, base({
    margin: { t: 30, r: 56, b: 46, l: 110 },
    xaxis: axis({ title: { text: `Skill vs persistence, % (${state.case.toLowerCase()} inputs)` }, zeroline: true, zerolinewidth: 2,
      range: [Math.min(...all, 0) - 6, Math.max(...all, 0) + 12] }),
    yaxis: axis({ autorange: "reversed", showgrid: false }),
    shapes,
    annotations: [{ xref: "paper", yref: "paper", x: 0, y: 1.08, xanchor: "left", showarrow: false,
      text: exp.scheme === "chronological" ? "open circles: split by date, the honest score" : `open circles: split by date. filled: ${exp.scheme}`,
      font: { size: 12, color: SOFT } }],
  }), CONFIG);

  const rfH = honest[LEARNING.indexOf("Random Forest")].skill, rfN = now[LEARNING.indexOf("Random Forest")].skill;
  const days_ = rowsOf("shuffled days")[LEARNING.indexOf("Random Forest")].skill, blocks_ = rowsOf("shuffled blocks")[LEARNING.indexOf("Random Forest")].skill;
  const text = {
    "chronological": `Split by date, Random Forest scores <b>${signed(rfH)}%</b> against <q>tomorrow = today</q>. This is the only score that matches real use: train on the past, forecast the future.`,
    "shuffled days": `Shuffle whole days and Random Forest jumps from ${signed(rfH)}% to <b>${signed(rfN)}%</b>. Its test days are now scattered through the winter, with training days on both sides of each one.`,
    "shuffled blocks": `Shuffle individual blocks and Random Forest reaches <b>${signed(rfN)}%</b>. Going from shuffled days (${signed(days_)}%) to shuffled blocks (${signed(blocks_)}%) is pure leakage: the model has trained on other blocks of the very day it is tested on.`,
  };
  document.getElementById("leak-result").innerHTML = text[exp.scheme];
}

function setupExperiments() {
  setupTree();
  const fe = document.getElementById("fe-level");
  fe.addEventListener("input", () => { exp.feLevel = +fe.value; drawForecastError(); });
  switchGroup("fe-split", exp.feSplit, (v) => { exp.feSplit = v; drawForecastError(); });
  const tl = document.getElementById("tree-leaves");
  tl.addEventListener("input", () => { exp.leaves = +tl.value; drawTree(); });
  switchGroup("leak-scheme", exp.scheme, (v) => { exp.scheme = v; drawLeakage(); });
  drawForecastError();
  drawTree();
  drawLeakage();
}

// ---------- Inputs kept or dropped ----------
let learnData;
const prettyInput = (n) => n.replace("power_D", "Power, yesterday").replace(/_D\+1$/, ", tomorrow").replace(/_D$/, ", yesterday")
  .replace(/^ghi/, "Sunlight").replace(/^modt/, "Module temp.").replace(/^ambt/, "Air temp.").replace(/^wspd/, "Wind speed").replace(/^wdir/, "Wind direction");

function drawFeatures() {
  const f = learnData.features[state.case];
  const linear = ["MLR", "Ridge", "Lasso", "Elastic Net"], trees = ["Random Forest", "AdaBoost"];
  const head = `<tr><th></th><th class="grp" colspan="4">Coefficient, % of capacity per typical change</th><th class="grp" colspan="2">Rise in error when shuffled</th></tr>
    <tr><th>Input (${state.case.toLowerCase()})</th>${[...linear, ...trees].map((m) => `<th>${m}</th>`).join("")}</tr>`;
  const body = f.inputs.map((name, k) => `<tr><td>${prettyInput(name)}</td>` +
    linear.map((m) => { const v = f.coef[m][k]; return v === 0 ? `<td class="dropped">dropped</td>` : `<td>${signed(v, 2)}</td>`; }).join("") +
    trees.map((m) => { const v = f.importance[m][k]; return `<td class="${Math.abs(v) < 0.05 ? "zero" : ""}">${Math.abs(v) < 0.05 ? "about 0" : "+" + v.toFixed(2)}</td>`; }).join("") +
    "</tr>").join("");
  const count = (m) => f.coef[m].filter((v) => v !== 0).length;
  const foot = `<tr><td>Inputs in use</td>${linear.map((m) => `<td>${count(m)} of ${f.inputs.length}</td>`).join("")}<td>all</td><td>all</td></tr>`;
  document.getElementById("feat-table").innerHTML = head + body + foot;
}

// ---------- Wiring ----------
function redrawForControls() {
  controlNote();
  drawDay();
  drawRanking();
  drawSlopes();
  drawErrorMap();
  if (exps) drawLeakage();
  if (learnData) drawFeatures();
}

Promise.all(["results", "days", "data", "random_forest", "experiments", "learning"].map((n) => fetch(`data/${n}.json`).then((r) => r.json())))
  .then(([res, dy, dt, forest, ex, ln]) => {
    results = res; days = dy; data = dt; rf = forest; exps = ex;
    state.day = days.days.findIndex((d) => d.date === "2026-01-26");
    document.getElementById("f1").textContent = `${pct(row("Persistence", "Case 1", "test").nMAE)}%`;
    document.getElementById("f3").textContent = `${signed(row("Random Forest", "Case 3", "test").skill)}%`;

    switchGroup("case-switch", state.case, (v) => { state.case = v; redrawForControls(); });
    switchGroup("split-switch", state.split, (v) => { state.split = v; redrawForControls(); });
    switchGroup("rank-switch", state.rank, (v) => { state.rank = v; drawRanking(); });
    drawChips();
    setupDayNav();
    drawSplitStrip();
    redrawForControls();
    setupExperiments();
    learnData = ln;
    drawFeatures();
    document.getElementById("calendar").on("plotly_click", (ev) => {
      const i = days.days.findIndex((d) => d.date === String(ev.points[0].x).slice(0, 10));
      if (i >= 0) setDay(i, true);
    });
  });
