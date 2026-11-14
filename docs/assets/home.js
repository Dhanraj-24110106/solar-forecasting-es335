// Results table, day explorer and two data plots. All numbers come from data/*.json (written by src/summary.ipynb).

const COLORS = {
  "Persistence": "#6b7280",
  "7-day average": "#a3a3a3",
  "MLR": "#1f77b4",
  "Ridge": "#17becf",
  "Lasso": "#2ca02c",
  "Elastic Net": "#9467bd",
  "Random Forest": "#d62728",
  "AdaBoost": "#ff7f0e",
};
const BASELINES = ["Persistence", "7-day average"];
const PLAIN = { responsive: true, displayModeBar: false };
const state = { resCase: "Case 2", resSplit: "test", rank: "nRMSE", dayCase: "Case 2", daySplit: "val", dayIndex: 0 };

const CASE_NOTES = {
  "Case 1": "<b>Case 1</b> — inputs: power at the same 15-minute block yesterday. Nothing else.",
  "Case 2": "<b>Case 2</b> — inputs: yesterday's power plus yesterday's weather (sunlight, module and air temperature, wind). The realistic case.",
  "Case 3": "<b>Case 3</b> — inputs: Case 2 plus tomorrow's measured weather. Like having a perfect weather forecast, so it is an upper bound, not a real forecast.",
};
const SPLIT_NOTES = {
  train: "Train (15 Oct – 14 Jan, 91 scored days): the models were fitted on these days, so their errors here are optimistic. Compare with validation and test to see which models overfit.",
  val: "Validation (15 Jan – 7 Feb, 24 days): used to choose every model's settings and to compare models.",
  test: "Test (8 – 14 Feb, 7 days): never used for any choice; scored once at the end. Only 7 calm days, so intervals are wide.",
};
const SPLIT_NAMES = { train: "train", val: "validation", test: "test" };
let results, days;

const fmt = (x, d = 2) => (x == null ? "—" : x.toFixed(d));
const signed = (x) => (x == null ? "—" : (x > 0 ? "+" : "") + x.toFixed(1));
const key = (m, c) => `${m}|${BASELINES.includes(m) ? "—" : c}`;

function setSeg(id, value) {
  document.querySelectorAll(`#${id} button`).forEach((b) => b.classList.toggle("on", b.dataset.v === value));
}

function segmented(id, field, onChange) {
  const el = document.getElementById(id);
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    el.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    state[field] = b.dataset.v;
    onChange();
  });
}

// ---------- Results table ----------
function drawResults() {
  const rows = results.rows.filter((r) => r.split === state.resSplit);
  const higherIsBetter = state.rank === "r2";
  const models = rows.filter((r) => r.case === state.resCase)
    .sort((a, b) => (higherIsBetter ? b.r2 - a.r2 : a[state.rank] - b[state.rank]));
  const refs = BASELINES.map((m) => rows.find((r) => r.model === m));

  const th = (k, label) => `<th class="${state.rank === k ? "key" : ""}">${label}</th>`;
  const row = (r, rank, cls) => {
    const sk = r.skill;
    const ci = r.model === "Persistence" ? "" : ` <span class="ci">[${signed(r.skill_lo)}, ${signed(r.skill_hi)}]</span>`;
    return `<tr class="${cls}"><td class="rank">${rank}</td>
      <td><span style="color:${COLORS[r.model]}">■</span> ${r.model}</td>
      <td>${fmt(r.nMAE)}</td><td>${fmt(r.nRMSE)}</td><td>${fmt(r.r2, 1)}</td><td>${fmt(r.within_band, 1)}</td>
      <td><span class="${sk > 0.05 ? "pos" : sk < -0.05 ? "neg" : ""}">${r.model === "Persistence" ? "0 (reference)" : signed(sk)}</span>${ci}</td></tr>`;
  };
  document.getElementById("res-table").innerHTML =
    `<tr><th>#</th><th>Model</th>${th("nMAE", "MAE %")}${th("nRMSE", "RMSE %")}${th("r2", "R² %")}<th>Within ±7%</th>
     <th>Skill vs persistence % [90% interval]</th></tr>` +
    models.map((r, i) => row(r, i + 1, i === 0 ? "best" : "")).join("") +
    refs.map((r) => row(r, "–", "ref")).join("");

  document.getElementById("res-case-note").innerHTML = CASE_NOTES[state.resCase];
  document.getElementById("res-split-note").textContent = SPLIT_NOTES[state.resSplit];
  const beat = models.filter((r) => r.skill_lo > 0).map((r) => r.model);
  const split = SPLIT_NAMES[state.resSplit];
  document.getElementById("res-note").innerHTML =
    `<b>${state.resCase}, ${split}:</b> best by ${{ nRMSE: "RMSE", nMAE: "MAE", r2: "R²" }[state.rank]} is <b>${models[0].model}</b>. ` +
    (beat.length
      ? `Clearly better than persistence (whole interval above 0): ${beat.join(", ")}.`
      : `No model is clearly better than persistence: every interval includes 0 or lies below it.`);
  drawSkillCharts();
}

// ---------- Skill charts ----------
const LEARNING = ["MLR", "Ridge", "Lasso", "Elastic Net", "Random Forest", "AdaBoost"];
const CASE_COLORS = { "Case 1": "#94a3b8", "Case 2": "#0f766e", "Case 3": "#d97706" };
const SPLIT_COLORS = { train: "#94a3b8", val: "#0f766e", test: "#7c3aed" };

function skillBars(rows, name, color) {
  return {
    type: "bar", name, x: rows.map((r) => r.model), y: rows.map((r) => r.skill), marker: { color },
    error_y: { type: "data", symmetric: false, array: rows.map((r) => r.skill_hi - r.skill),
      arrayminus: rows.map((r) => r.skill - r.skill_lo), thickness: 1, width: 3, color: "#555" },
    hovertemplate: `%{x} · ${name}<br>skill %{y:.1f}%<extra></extra>`,
  };
}

function drawSkillCharts() {
  const pick = (c, s) => LEARNING.map((m) => results.rows.find((r) => r.model === m && r.case === c && r.split === s));
  const layout = (title) => ({
    margin: { t: 30, r: 10, b: 60, l: 55 }, barmode: "group", title: { text: title, font: { size: 13 } },
    yaxis: { title: "Skill vs persistence (%)", zeroline: true, zerolinewidth: 2 }, legend: { orientation: "h", y: -0.25 },
  });
  Plotly.react("skill-chart", ["Case 1", "Case 2", "Case 3"].map((c) => skillBars(pick(c, state.resSplit), c, CASE_COLORS[c])),
    layout(`All cases · ${SPLIT_NAMES[state.resSplit]}`), PLAIN);
  Plotly.react("split-chart", ["train", "val", "test"].map((s) => skillBars(pick(state.resCase, s), SPLIT_NAMES[s], SPLIT_COLORS[s])),
    layout(`${state.resCase} · train vs validation vs test`), PLAIN);
}

// ---------- Best / worst day ----------
// A day's difficulty = the learning models' average daily MAE for the chosen case.
function rankDays(split, c) {
  return days.days.map((d, i) => {
    const s = LEARNING.map((m) => d.scores[`${m}|${c}`]).filter(Boolean);
    return { i, mae: s.reduce((a, x) => a + x.nMAE, 0) / s.length };
  }).filter((r) => days.days[r.i].split === split).sort((a, b) => a.mae - b.mae);
}

function jumpTo(kind, split, c, scroll) {
  const ranked = rankDays(split, c);
  state.daySplit = split;
  state.dayCase = c;
  state.dayIndex = (kind === "best" ? ranked[0] : ranked[ranked.length - 1]).i;
  setSeg("day-split", split);
  setSeg("day-case", c);
  fillDaySelect();
  drawDay();
  if (scroll) document.getElementById("explorer").scrollIntoView({ behavior: "smooth" });
}

// ---------- Day explorer ----------
function drawDay() {
  const d = days.days[state.dayIndex];
  const x = days.hours;
  const actual = d.actual.map((v) => 100 * v);
  const traces = [
    { x, y: actual.map((v) => v + 7), mode: "lines", line: { width: 0 }, hoverinfo: "skip", showlegend: false },
    { x, y: actual.map((v) => v - 7), mode: "lines", line: { width: 0 }, fill: "tonexty",
      fillcolor: "rgba(15,118,110,0.12)", name: "±7% band", hoverinfo: "skip" },
    { x, y: actual, mode: "lines", line: { color: "#111", width: 2.5 }, name: "Actual" },
  ];
  for (const m of results.models) {
    const f = d.forecasts[key(m, state.dayCase)];
    if (f) traces.push({ x, y: f.map((v) => 100 * v), mode: "lines", name: m,
      line: { color: COLORS[m], width: 1.8, dash: BASELINES.includes(m) ? "dot" : "dash" } });
  }
  Plotly.react("day-chart", traces, {
    margin: { t: 10, r: 10, b: 45, l: 55 },
    xaxis: { title: "Hour of day", dtick: 1 }, yaxis: { title: "Power (% of capacity)", rangemode: "tozero" },
    legend: { orientation: "h", y: -0.2 }, hovermode: "x unified",
  }, PLAIN);

  const scored = results.models.map((m) => ({ m, s: d.scores[key(m, state.dayCase)] })).filter((r) => r.s)
    .sort((a, b) => a.s.nMAE - b.s.nMAE);
  document.getElementById("day-table").innerHTML =
    `<tr><th>#</th><th>Model (${d.date}, ${SPLIT_NAMES[d.split]})</th><th>MAE %</th><th>RMSE %</th><th>Within ±7%</th><th>Skill %</th></tr>` +
    scored.map(({ m, s }, i) => `<tr class="${BASELINES.includes(m) ? "ref" : ""}"><td class="rank">${i + 1}</td>
      <td><span style="color:${COLORS[m]}">■</span> ${m}</td><td>${fmt(s.nMAE)}</td><td>${fmt(s.nRMSE)}</td>
      <td>${fmt(s.within_band, 0)}</td><td class="${s.skill > 0.05 ? "pos" : s.skill < -0.05 ? "neg" : ""}">${signed(s.skill)}</td></tr>`).join("");
  document.getElementById("day-select").value = String(state.dayIndex);
}

// Days of the selected split, as indices into days.days.
const splitDays = () => days.days.map((d, i) => i).filter((i) => days.days[i].split === state.daySplit);

function fillDaySelect() {
  const sel = document.getElementById("day-select");
  sel.innerHTML = splitDays().map((i) => `<option value="${i}">${days.days[i].date}</option>`).join("");
  document.getElementById("day-split-note").textContent = SPLIT_NOTES[state.daySplit];
}

function setupDays() {
  const sel = document.getElementById("day-select");
  sel.addEventListener("change", () => { state.dayIndex = +sel.value; drawDay(); });
  const step = (k) => {
    const list = splitDays();
    const at = list.indexOf(state.dayIndex);
    state.dayIndex = list[(at + k + list.length) % list.length];
    drawDay();
  };
  document.getElementById("day-prev").addEventListener("click", () => step(-1));
  document.getElementById("day-next").addEventListener("click", () => step(1));
  segmented("day-split", "daySplit", () => { fillDaySelect(); state.dayIndex = splitDays()[0]; drawDay(); });
  document.getElementById("day-best").addEventListener("click", () => jumpTo("best", state.daySplit, state.dayCase, false));
  document.getElementById("day-worst").addEventListener("click", () => jumpTo("worst", state.daySplit, state.dayCase, false));
  document.querySelectorAll("[data-jump]").forEach((b) =>
    b.addEventListener("click", () => jumpTo(b.dataset.jump, state.resSplit, state.resCase, true)));
  fillDaySelect();
  state.dayIndex = days.days.findIndex((d) => d.date === "2026-01-26");
}

// ---------- Data plots ----------
function drawData(data) {
  const colors = { train: "#0f766e", val: "#d97706", test: "#7c3aed" };
  const names = { train: "Train", val: "Validation", test: "Test" };
  const e = data.energy;
  Plotly.newPlot("data-energy", ["train", "val", "test"].map((s) => ({
    type: "bar", name: names[s], marker: { color: colors[s] },
    x: e.date.filter((_, i) => e.split[i] === s), y: e.capacity_hours.filter((_, i) => e.split[i] === s),
    hovertemplate: "%{x}<br>%{y:.2f} capacity-hours<extra></extra>",
  })), { margin: { t: 10, r: 10, b: 40, l: 55 }, bargap: 0.1, yaxis: { title: "Energy (capacity-hours)" },
    legend: { orientation: "h", y: 1.15 } }, PLAIN);

  const sc = data.scatter;
  Plotly.newPlot("data-scatter", [{
    x: sc.ghi_next, y: sc.power.map((v) => 100 * v), mode: "markers", type: "scattergl",
    marker: { size: 4, color: "#0f766e", opacity: 0.35 }, hovertemplate: "GHI %{x:.0f} W/m²<br>power %{y:.1f}%<extra></extra>",
  }], { margin: { t: 10, r: 10, b: 45, l: 55 }, xaxis: { title: "Sunlight (GHI, W/m²)" },
    yaxis: { title: "Power (% of capacity)" } }, PLAIN);
}

function drawImportance(rf) {
  const names = Object.keys(rf["Case 3"].importance);
  const label = (n) => n.replace("_D+1", " (tomorrow)").replace("_D", " (yesterday)")
    .replace("power", "Power").replace("ghi", "Sunlight").replace("modt", "Module temp").replace("ambt", "Air temp")
    .replace("wspd", "Wind speed").replace("wdir", "Wind direction");
  Plotly.newPlot("imp-chart", ["Case 2", "Case 3"].map((c) => ({
    type: "bar", orientation: "h", name: c, y: names.map(label), x: names.map((n) => rf[c].importance[n] ?? null),
    marker: { color: CASE_COLORS[c] }, hovertemplate: `${c}: +%{x:.2f}%<extra></extra>`,
  })), { margin: { t: 10, r: 10, b: 45, l: 10 }, barmode: "group", yaxis: { autorange: "reversed", automargin: true },
    xaxis: { title: "Rise in validation RMSE when shuffled (% of capacity)" }, legend: { orientation: "h", y: 1.1 } }, PLAIN);
}

// ---------- Start ----------
fetch("data/data.json").then((r) => r.json()).then(drawData);
fetch("data/random_forest.json").then((r) => r.json()).then(drawImportance);

Promise.all([
  fetch("data/results.json").then((r) => r.json()),
  fetch("data/days.json").then((r) => r.json()),
]).then(([res, dy]) => {
  results = res;
  days = dy;
  segmented("res-case", "resCase", drawResults);
  segmented("res-split", "resSplit", drawResults);
  segmented("res-rank", "rank", drawResults);
  segmented("day-case", "dayCase", drawDay);
  setupDays();
  drawResults();
  drawDay();
});
